// ============================================================
// XPOS API Server — Main entry point
// ============================================================

import path from 'path';
import dotenv from 'dotenv';

// Multi-path fallback so .env is loaded regardless of execution directory
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught Exception thrown:', err);
});

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import rateLimit from 'express-rate-limit';

import { prisma } from '@xpos/database';
import { createStorageService } from '@xpos/storage';
import { createPaymentProvider } from '@xpos/payment';
import { createPrinterService } from '@xpos/printer';

import { sessionRoutes } from './routes/sessions';
import { kioskRoutes } from './routes/kiosks';
import { fileRoutes } from './routes/files';
import { pricingRoutes } from './routes/pricing';
import { jobRoutes } from './routes/jobs';
import { paymentRoutes } from './routes/payments';
import { printCodeRoutes } from './routes/print-codes';
import { adminRoutes } from './routes/admin';
import { setupWebSocket } from './websocket';
import { startWorkers } from './workers';

const app = express();
const httpServer = createServer(app);

// ── CORS ──
app.use(cors({
  origin: (origin, callback) => {
    // Allow all origins on local network/Wi-Fi
    callback(null, true);
  },
  credentials: true,
}));

// ── Security ──
app.use(helmet({ crossOriginResourcePolicy: false }));

// ── Rate Limiting ──
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// ── Body parsing ──
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Initialize Services ──
const storage = createStorageService();
const payment = createPaymentProvider();
const printer = createPrinterService();

// Store services in app locals for route handlers
app.locals.prisma = prisma;
app.locals.storage = storage;
app.locals.payment = payment;
app.locals.printer = printer;

// Run SQLite WAL cleanup only if using SQLite
if (process.env.DATABASE_URL?.includes('file:') || process.env.DATABASE_URL?.includes('sqlite')) {
  prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);').catch(() => {});
}

// ── Socket.IO ──
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*', credentials: true },
  transports: ['websocket', 'polling'],
});
app.locals.io = io;

// ── Routes ──
app.use('/api/sessions', sessionRoutes);
app.use('/api/kiosks', kioskRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/print-codes', printCodeRoutes);
app.use('/api/admin', adminRoutes);

// ── Root Landing & Status Dashboard ──
app.get('/', (_req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>XPOS Cloud API — Operational</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
        .card { background: #1e293b; border: 1px solid #334155; border-radius: 24px; padding: 40px; max-width: 520px; width: 100%; text-align: center; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); }
        .badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(16, 185, 129, 0.15); color: #34d399; font-weight: 700; font-size: 13px; padding: 6px 16px; border-radius: 9999px; border: 1px solid rgba(16, 185, 129, 0.3); margin-bottom: 20px; }
        .dot { width: 8px; height: 8px; background: #10b981; border-radius: 50%; box-shadow: 0 0 10px #10b981; }
        h1 { font-size: 28px; font-weight: 800; margin: 0 0 10px 0; color: #ffffff; }
        p { color: #94a3b8; font-size: 15px; margin: 0 0 30px 0; line-height: 1.5; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 30px; text-align: left; }
        .box { background: #0f172a; border: 1px solid #334155; border-radius: 16px; padding: 16px; }
        .box-title { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
        .box-value { font-size: 14px; font-weight: 700; color: #e2e8f0; }
        .footer { font-size: 12px; color: #475569; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="badge">
          <div class="dot"></div>
          XPOS Cloud API Active
        </div>
        <h1>XPOS Cloud Engine</h1>
        <p>Core cloud services, WebSockets, and database synchronization are operational.</p>
        <div class="grid">
          <div class="box">
            <div class="box-title">Database</div>
            <div class="box-value">Neon PostgreSQL 🟢</div>
          </div>
          <div class="box">
            <div class="box-title">WebSockets</div>
            <div class="box-value">Online (Socket.IO) ⚡</div>
          </div>
          <div class="box">
            <div class="box-title">Print Release</div>
            <div class="box-value">6-Digit Code Ready 🔑</div>
          </div>
          <div class="box">
            <div class="box-title">API Version</div>
            <div class="box-value">v2.0 Production 🚀</div>
          </div>
        </div>
        <div class="footer">XPOS Cloud Self-Service System • Canon MF280 Bridge</div>
      </div>
    </body>
    </html>
  `);
});

// ── Health check ──
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'xpos-api', timestamp: new Date().toISOString() });
});

// ── Error handler ──
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('API Error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ── Start ──
const PORT = parseInt(process.env.API_PORT || '4000');

async function start() {
  try {
    // Initialize storage bucket
    await storage.initialize();
    console.log('📦 Storage initialized');

    // Setup WebSocket handlers
    setupWebSocket(io, prisma);
    console.log('🔌 WebSocket ready');

    // Start background workers
    startWorkers(prisma, storage);
    console.log('⚙️ Workers started');

    // Start HTTP server on all interfaces (0.0.0.0)
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🚀 XPOS API running on http://0.0.0.0:${PORT}`);
      console.log(`📡 WebSocket ready for all Wi-Fi clients`);
      console.log(`\n🖨️  XPOS — Print On Screen\n`);
    });
  } catch (error) {
    console.error('❌ Failed to start XPOS API:', error);
    process.exit(1);
  }
}

start();

export { app, io };
