# Multi-Shop Architecture & 1-Click Print Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a multi-shop tenant architecture with role-based admin access (`SUPER_ADMIN` fleet-wide vs `SHOP_ADMIN` scoped), 1-click instant print dispatch ("⚡ Print Now") to the shop's default kiosk, dual real-time status updates, and kiosk mouse/keyboard input.

**Architecture:** Prisma schema extended with a `Shop` model linked to `Kiosk` (with `defaultKioskId`), `AdminUser` (with roles), and `PrintJob`. Express API provides authenticated role-based endpoints, shop management, and a 1-click dispatch endpoint that emits `kiosk_paired_print` over WebSockets. Next.js Kiosk enables cursor display and physical keyboard events (`0-9`, `Backspace`, `Enter`). Next.js Admin provides role-aware views and the "⚡ Print Now" action button.

**Tech Stack:** TypeScript, Node.js, Express, Prisma ORM, PostgreSQL (Neon), Socket.io, Next.js (App Router), Tailwind CSS, Framer Motion, Lucide Icons.

**Spec:** [Multi-Shop Architecture & 1-Click Print Design Specification](file:///c:/Users/ADMIN/Desktop/XPOS%20-%20Copy%20-%20Copy/docs/superpowers/specs/2026-10-29-multi-shop-and-1click-print-design.md)

## Global Constraints
- Customer upload, PhonePe payment flow, and manual kiosk code entry must remain completely untouched and fully functional.
- Existing database kiosks (`XPOS-001`, `XPOS-002`, `XPOS-003`) must automatically belong to a default shop to guarantee zero data loss.
- Dual flow: Customer manual kiosk code entry and Admin 1-Click print must both update customer, kiosk, and admin screens synchronously.
- Physical kiosk keyboard must support standard digits `0-9`, numeric keypad (`Numpad0`-`Numpad9`), `Backspace`, and `Enter`.

## Review Focus
- Attempting 1-Click print on an unpaid or already redeemed job: must return clear error and prevent double-printing.
- Shop Admin attempting to view or dispatch jobs belonging to another shop: API must enforce strict shop-scoping.
- Kiosk receiving 1-Click print dispatch while on the idle screen: must immediately wake up and transition to printing animation with document details.
- Typing digits on the kiosk idle screen: must automatically transition to `code-entry` and populate the first digit without dropping keys.
- Changing the default kiosk in shop admin: must immediately update subsequent 1-click prints to target the new default kiosk.

---

### Task 1: Database Schema & Migration for Multi-Shop Model

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Modify: `packages/database/prisma/seed.ts`

**Interfaces:**
- Consumes: Existing Prisma models (`Kiosk`, `AdminUser`, `PrintJob`, `PrintCode`).
- Produces: `Shop` model with `defaultKioskId`, relations on `Kiosk.shopId`, `AdminUser.shopId`, `AdminUser.role`, and `PrintJob.shopId`.

- [ ] **Step 1: Update Prisma schema with Shop model and relations**
  - Add `model Shop` with fields: `id`, `name`, `code` (@unique), `address`, `phone`, `status`, `defaultKioskId`, timestamps, relations `kiosks`, `adminUsers`, `printJobs`.
  - Add `shopId String?` and `shop Shop?` relation to `Kiosk`, `AdminUser`, and `PrintJob`.
  - Update `AdminUser.role` default to `"SHOP_ADMIN"`.

- [ ] **Step 2: Update seed script to seed default shop and roles**
  - In `seed.ts`, create default shop `SHOP-MAIN` ("Main Campus Print Hub").
  - Link existing kiosks (`XPOS-001`, `XPOS-002`, `XPOS-003`) to `SHOP-MAIN` with `defaultKioskId: kiosk1.id`.
  - Create `SUPER_ADMIN` user (`admin@xpos.app` / `admin123`, role: `SUPER_ADMIN`).
  - Create `SHOP_ADMIN` user (`shopadmin@xpos.app` / `shop123`, role: `SHOP_ADMIN`, shopId: `SHOP-MAIN`).

- [ ] **Step 3: Run prisma generate and push schema**
  - Run `npx prisma generate` in `packages/database`.
  - Run `npx prisma db push` (or `db:seed`) to sync schema.

---

### Task 2: Admin Authentication & Shop Scoping Endpoints

**Files:**
- Modify: `apps/api/src/routes/admin.ts`

**Interfaces:**
- Consumes: Prisma `shop`, `adminUser`, `kiosk`, `printJob`.
- Produces:
  - `POST /api/admin/login` -> `{ token, user: { id, email, name, role, shopId, shopName, defaultKioskId } }`
  - `GET /api/admin/me` -> current user context
  - `GET /api/admin/shops` -> list shops (SUPER_ADMIN)
  - `POST /api/admin/shops` -> create shop (SUPER_ADMIN)
  - `PUT /api/admin/shops/:id` -> update shop / defaultKioskId (SUPER_ADMIN or assigned SHOP_ADMIN)
  - `POST /api/admin/users` -> create admin account (SUPER_ADMIN)
  - `PATCH /api/admin/users/:id/password` -> reset admin password (SUPER_ADMIN)
  - Scoped `/api/admin/dashboard`, `/api/admin/jobs`, `/api/admin/kiosks` filtering by `shopId` when requested by `SHOP_ADMIN`.

- [ ] **Step 1: Implement authentication helper and token generator**
  - Support password validation with SHA-256 (matching seed) with JWT token or bearer authentication.
  - Support `authMiddleware` that parses bearer token or `x-admin-role` / `x-admin-shop-id` fallback for seamless development.

- [ ] **Step 2: Add Login and Shop Management endpoints**
  - Implement `POST /api/admin/login`.
  - Implement `GET /api/admin/shops`, `POST /api/admin/shops`, `PUT /api/admin/shops/:id`, `POST /api/admin/users`, `PATCH /api/admin/users/:id/password`.

- [ ] **Step 3: Apply Shop Scoping to Dashboard, Jobs, and Kiosks**
  - Update `GET /api/admin/dashboard` to filter stats by `shopId` when scoped.
  - Update `GET /api/admin/jobs` to filter by `shopId` or `kiosk.shopId`.
  - Update `GET /api/admin/kiosks` to return only the shop's kiosks when scoped.

---

### Task 3: 1-Click Print API Endpoint & Real-Time Socket Dispatch

**Files:**
- Modify: `apps/api/src/routes/admin.ts`

**Interfaces:**
- Consumes: WebSocket server `io`, `printJob`, `printCode`, `kiosk`, `shop`.
- Produces: `POST /api/admin/jobs/:id/print-now`.
- Emits:
  - `kiosk_paired_print` to destination kiosk room and global channel.
  - `job_update` to `session:${job.sessionId}` and `admin` room.

- [ ] **Step 1: Implement `POST /api/admin/jobs/:id/print-now`**
  - Query print job including `file`, `payment`, `printCode`, `kiosk`, `shop`.
  - Validate job status is `PAID` or `QUEUED`. If already `PRINTING` or `COMPLETED`, return 400 error.
  - Validate print code is `ACTIVE`.
  - Determine target kiosk:
    1. Body `kioskId` (if provided).
    2. Shop's `defaultKioskId`.
    3. Job's assigned `kioskId`.
    4. First active kiosk belonging to the shop.
  - Mark `PrintCode` status as `'USED'`, `usedAt: new Date()`, `redeemedByKioskId: targetKiosk.id`.
  - Update `PrintJob` status to `'PRINTING'`, set `kioskId: targetKiosk.id`.

- [ ] **Step 2: Emit Real-Time WebSockets**
  - Construct `printPayload` with `jobId`, `displayId`, `downloadUrl`, `totalPages`, `currentPage: 1`, `fileName`, `colorMode`, `copies`, `sides`, `paperSize`, `kioskId: targetKiosk.displayId`.
  - Emit `kiosk_paired_print` to `kiosk:${targetKiosk.id}`, `kiosk:${targetKiosk.displayId}`, and broadcast with `targetKioskId: targetKiosk.displayId`.
  - Emit `job_update` to customer `session:${job.sessionId}` and `admin`.

---

### Task 4: Kiosk Mouse Cursor & Physical Keyboard Input

**Files:**
- Modify: `apps/kiosk/src/app/globals.css`
- Modify: `apps/kiosk/src/app/page.tsx`

**Interfaces:**
- Consumes: Browser DOM keyboard events and CSS cursor.
- Produces: Mouse pointer visible everywhere; physical keyboard support for `0-9`, `Numpad0`-`Numpad9`, `Backspace`, `Enter`, `Escape`.

- [ ] **Step 1: Enable mouse cursor across Kiosk**
  - In `apps/kiosk/src/app/globals.css`, replace `cursor: none;` with `cursor: default;` and ensure buttons have `cursor: pointer;`.

- [ ] **Step 2: Add global keyboard event listener in Kiosk page**
  - In `apps/kiosk/src/app/page.tsx`, attach a `window.addEventListener('keydown', handleKeyDown)` inside a `useEffect`.
  - If key is `0`-`9` or `Numpad0`-`Numpad9`:
    - If `screen === 'idle'`: set `screen('code-entry')`, initialize code with `[key, '', '', '', '', '']`, play tap sound.
    - If `screen === 'code-entry'`: call `handleDigitPress(key)`.
  - If key is `Backspace`:
    - If `screen === 'code-entry'`: call `handleBackspace()`.
  - If key is `Enter`:
    - If `screen === 'code-entry'` and 6 digits filled: trigger `verifyAndPrintCode(fullCode)`.
  - If key is `Escape`:
    - If `screen === 'code-entry'` or `screen === 'qr'`: return to `screen('idle')`.
  - Return cleanup function `window.removeEventListener('keydown', handleKeyDown)`.

---

### Task 5: Admin Dashboard UI - Multi-Shop View & 1-Click Print

**Files:**
- Modify: `apps/admin/src/app/page.tsx`
- Modify: `apps/customer/src/app/admin/page.tsx`

**Interfaces:**
- Consumes: Admin API endpoints (`/login`, `/me`, `/shops`, `/jobs`, `/kiosks`, `/jobs/:id/print-now`).
- Produces:
  - Login modal / session manager.
  - Role badge (`SUPER_ADMIN` vs `SHOP_ADMIN`) and Shop Switcher / Default Kiosk selector.
  - "⚡ Print Now" action button on paid jobs in the print jobs table.
  - Super Admin "Shops" tab for provisioning shops and shop admins.

- [ ] **Step 1: Add Authentication state and Login Modal**
  - Check `localStorage.getItem('xpos_admin_token')` and `xpos_admin_user`.
  - If not authenticated, display a sleek login screen (email, password, demo quick-login buttons for Super Admin and Shop Admin).
  - Store token and user on successful login.

- [ ] **Step 2: Add Shop Switcher and Default Kiosk Selector**
  - For `SHOP_ADMIN`: Display shop name and a "Default Printer" badge with dropdown to switch default kiosk.
  - For `SUPER_ADMIN`: Add "All Shops" dropdown to filter or switch shop context, and a "Shops" management tab.

- [ ] **Step 3: Add "⚡ Print Now" Button to Jobs Table**
  - In the Jobs table, for jobs where `status === 'PAID'` or `status === 'QUEUED'` (with active code), display a high-visibility **"⚡ Print Now"** button.
  - Clicking calls `POST /api/admin/jobs/:id/print-now`.
  - Show loading spinner while in-flight, play success sound, and show toast notification.

---

### Task 6: Verification & End-to-End Testing

**Files:**
- Verify: All modified apps and packages.

- [ ] **Step 1: Typecheck and Build**
  - Run `npm run typecheck` or `npx turbo run build` across workspace.
- [ ] **Step 2: Test Multi-Shop Authentication and Scoping**
  - Verify `SUPER_ADMIN` sees all shops, all kiosks, and all print jobs.
  - Verify `SHOP_ADMIN` sees only their assigned shop's kiosks and jobs.
- [ ] **Step 3: Test 1-Click Print ("⚡ Print Now")**
  - Trigger 1-Click Print on a paid job.
  - Verify destination kiosk receives WebSocket event and enters printing screen.
  - Verify customer screen updates to `PRINTING`.
- [ ] **Step 4: Test Kiosk Cursor and Keyboard Input**
  - Verify cursor is visible.
  - Verify pressing `1`, `2`, `3`, `4`, `5`, `6` on idle screen opens code-entry and triggers verification.
  - Verify `Backspace` and `Enter` function as expected.
- [ ] **Step 5: Zero Breakage Check**
  - Verify manual 6-digit code entry still works.
  - Verify customer upload and PhonePe payment generation are untouched.
