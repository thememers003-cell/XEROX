# Multi-Shop Architecture & 1-Click Print Design Specification

**Date:** 2026-10-29  
**Status:** Draft for Review  
**Topic:** Multi-Shop Management, Scoped Shop Admins, 1-Click Dispatch, Dual Real-Time Flow & Kiosk Mouse/Keyboard Input  

---

## 1. Intent & Context
XPOS currently manages individual kiosks centrally without tenancy boundaries. As XPOS expands across different campus locations, commercial photocopy centers, and partner shops, shop owners require scoped management over their assigned stations, their print queue, and their earnings. Furthermore, shop operators need an ultra-fast **"⚡ Print Now"** button to dispatch customer jobs immediately without requiring customers or staff to manually enter 6-digit codes on the physical kiosk.

---

## 2. Goals & Non-Goals

### Goals
1. **Multi-Shop Tenant Entity**: Introduce `Shop` model in Prisma linked to `Kiosk` (1-to-many with default printer/kiosk designation) and `AdminUser` (scoped access).
2. **Role-Based Access Control**:
   - `SUPER_ADMIN`: Fleet-wide control across all shops, can provision shops, assign kiosks, and manage shop admin accounts and passwords.
   - `SHOP_ADMIN`: Scoped strictly to their shop, kiosks, and print jobs. Can select/change their default kiosk.
3. **1-Click Print Dispatch ("⚡ Print Now")**:
   - When a job is paid and has an active 6-digit code, the shop admin sees a prominent "⚡ Print Now" button.
   - 1-click dispatch automatically targets the shop's default kiosk (or selected kiosk), consumes the code, transitions the job to `PRINTING`, and sends a real-time WebSocket trigger to the kiosk.
4. **Dual Real-Time Flow**:
   - Flow A: Customer enters 6-digit code manually on kiosk (touchscreen or physical keyboard).
   - Flow B: Shop Admin clicks "⚡ Print Now" from admin dashboard.
   - Both flows immediately synchronize customer status, kiosk printing screen, and admin queue in real time.
5. **Kiosk Input & Mouse Usability**:
   - Enable mouse cursor everywhere on Kiosk (`cursor: default` / removing `cursor: none`).
   - Global keyboard handler for physical keyboards: digits `0-9` (and Numpad), `Backspace`, and `Enter`. Typing on the idle screen transitions to the code entry screen.
6. **Zero Breakage Guarantee**:
   - Existing customer upload, PhonePe payments, and code redemption APIs remain untouched and fully compatible.

### Non-Goals
- Eliminating customer manual code redemption (remains available).
- Forcing customer user accounts or logins (customer flow remains friction-free).
- Modifying payment gateway protocols.

---

## 3. Approaches Considered & Selected

### Approach 1: Strict 1-to-1 Shop-to-Kiosk
Each Shop only ever has one kiosk.
- *Trade-off*: Simpler schema, but cannot scale if a shop operator adds a second printer or kiosk.

### Approach 2: Multi-Kiosk Shop Model with Default Printer (Selected by User)
A `Shop` can contain multiple `Kiosks` with a designated `defaultKioskId`. 
- Shop admins can change their default kiosk anytime.
- 1-Click Print dispatches directly to the `defaultKioskId` without extra dialogs, while retaining the capability to target specific kiosks.
- *Selected because*: Fits current single-station needs while future-proofing for multi-printer expansion.

---

## 4. Technical Architecture & Implementation Details

### A. Database Schema (`packages/database/prisma/schema.prisma`)
```prisma
model Shop {
  id             String       @id @default(uuid())
  name           String
  code           String       @unique // e.g. "SHOP-MAIN", "CAMPUS-HUB"
  address        String?
  phone          String?
  status         String       @default("ACTIVE") // ACTIVE, INACTIVE
  defaultKioskId String?      // Primary/default kiosk for 1-click print
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  kiosks         Kiosk[]
  adminUsers     AdminUser[]
  printJobs      PrintJob[]

  @@map("shops")
}

// In Kiosk:
model Kiosk {
  // ... existing fields ...
  shopId         String?
  shop           Shop?        @relation(fields: [shopId], references: [id])
}

// In AdminUser:
model AdminUser {
  // ... existing fields ...
  role           String       @default("SHOP_ADMIN") // SUPER_ADMIN, SHOP_ADMIN
  shopId         String?
  shop           Shop?        @relation(fields: [shopId], references: [id])
}

// In PrintJob:
model PrintJob {
  // ... existing fields ...
  shopId         String?
  shop           Shop?        @relation(fields: [shopId], references: [id])
}
```

### B. Authentication & Scoped API Routes (`apps/api/src/routes/admin.ts`)
1. **Authentication**:
   - `POST /api/admin/login`: Accepts `{ email, password }`. Verifies SHA-256 hash (or bcrypt). Returns JWT token with `{ id, email, role, shopId, shopName }`.
   - `GET /api/admin/me`: Returns current authenticated user and shop context.
2. **Shop Scoping**:
   - `GET /api/admin/dashboard`: When authenticated as `SHOP_ADMIN`, filters revenue, print jobs, and kiosks by `shopId`.
   - `GET /api/admin/jobs`: When authenticated as `SHOP_ADMIN`, filters by `shopId` or `kiosk.shopId`.
   - `GET /api/admin/kiosks`: When authenticated as `SHOP_ADMIN`, returns only kiosks where `shopId === user.shopId`.
3. **Super Admin Management**:
   - `GET /api/admin/shops`: List all shops with kiosk count, active jobs, and admin accounts.
   - `POST /api/admin/shops`: Create new shop and assign initial kiosks.
   - `PUT /api/admin/shops/:id`: Update shop details and assign default kiosk.
   - `POST /api/admin/users`: Create admin user (`SUPER_ADMIN` or `SHOP_ADMIN` with `shopId`).
   - `PATCH /api/admin/users/:id/password`: Reset admin user password.
4. **1-Click Print Dispatch Endpoint**:
   - `POST /api/admin/jobs/:id/print-now`:
     - Verifies job status is `PAID` or `QUEUED` and has an active `PrintCode`.
     - Validates shop authorization (job belongs to admin's shop or admin is `SUPER_ADMIN`).
     - Resolves destination kiosk: provided `kioskId` -> shop's `defaultKioskId` -> job's `kioskId` -> shop's first active kiosk.
     - Marks `PrintCode` as `USED` with `usedAt = now()`.
     - Updates `PrintJob` with `status: 'PRINTING'`, `kioskId: destinationKiosk.id`.
     - Emits WebSocket `kiosk_paired_print` to `kiosk:${destinationKiosk.id}` and `kiosk:${destinationKiosk.displayId}`.
     - Emits `job_update` to customer session `session:${job.sessionId}` and `admin` room.

### C. Admin Dashboard UI (`apps/admin/src/app/page.tsx`)
1. **Login Experience**:
   - Integrated login modal / view if unauthenticated.
   - Persists session in `localStorage` / cookie with role and shop details.
2. **Shop Admin Scoped View**:
   - Header shows current Shop Name and designated Default Kiosk with quick switcher.
   - Dashboard cards, kiosk status, and print jobs table automatically scoped to the shop.
   - "⚡ Print Now" action button on paid jobs in the table:
     - Prominent electric-bolt icon button styled in amber/blue gradient.
     - Single click triggers dispatch, shows instant loading spinner, and plays success confirmation.
3. **Super Admin Fleet View**:
   - "Shops" tab / section: view all shops, add new shop, assign kiosks, manage shop admin credentials.
   - Filter jobs and kiosks across all shops or switch shop context.

### D. Kiosk Hardware & Usability Updates
1. **Cursor Everywhere**:
   - In [apps/kiosk/src/app/globals.css](file:///c:/Users/ADMIN/Desktop/XPOS%20-%20Copy%20-%20Copy/apps/kiosk/src/app/globals.css):
     - Replace `cursor: none;` with `cursor: default;` across `body` and interactive elements.
2. **Physical Keyboard Support**:
   - In [apps/kiosk/src/app/page.tsx](file:///c:/Users/ADMIN/Desktop/XPOS%20-%20Copy%20-%20Copy/apps/kiosk/src/app/page.tsx):
     - Attach `window.addEventListener('keydown', handleGlobalKeyDown)`.
     - Keys `0`-`9` and `Numpad0`-`Numpad9`:
       - If currently on `idle` screen: transition to `code-entry` and populate first digit.
       - If on `code-entry`: populate next digit; automatically trigger verification if 6th digit.
     - Key `Backspace`:
       - If on `code-entry`: remove last entered digit.
     - Key `Enter`:
       - If on `code-entry` and 6 digits filled: trigger `verifyAndPrintCode`.
     - Key `Escape`:
       - Return to `idle` from `code-entry` or `qr`.

---

## 5. Verification & Testing Plan
1. **Database & Migration**:
   - Push schema to Neon/Postgres with Prisma.
   - Seed default shop (e.g., "Main Station Shop") and assign existing kiosks to ensure zero broken records.
2. **API Verification**:
   - Test `/api/admin/login` for both `SUPER_ADMIN` and `SHOP_ADMIN`.
   - Test scoping on `/api/admin/jobs` and `/api/admin/kiosks`.
   - Test `POST /api/admin/jobs/:id/print-now` emits socket and updates job state.
3. **Kiosk Verification**:
   - Verify cursor is visible and responsive.
   - Verify typing `123456` via physical keyboard transitions from idle screen and inputs the code.
   - Verify 1-click print from admin triggers the printing screen on the kiosk in real time.
4. **End-to-End Zero Breakage Check**:
   - Upload file -> PhonePe payment -> code generated -> verify manual kiosk entry still functions flawlessly.
