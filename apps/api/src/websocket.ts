// ============================================================
// WebSocket — Real-time communication setup
// Includes Live Customer, Kiosk, and Real-time Admin Portal
// ============================================================

import { Server as SocketIOServer, Socket } from 'socket.io';
import type { PrismaClient } from '@prisma/client';

export function setupWebSocket(io: SocketIOServer, prisma: PrismaClient): void {
  // Helper to fetch and broadcast fresh admin stats
  const broadcastAdminStats = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [
        totalJobsToday,
        completedJobsToday,
        failedJobsToday,
        revenueToday,
        totalKiosks,
        onlineKiosks,
        totalPages,
      ] = await Promise.all([
        prisma.printJob.count({ where: { createdAt: { gte: today } } }),
        prisma.printJob.count({ where: { status: 'COMPLETED', createdAt: { gte: today } } }),
        prisma.printJob.count({ where: { status: 'PRINT_FAILED', createdAt: { gte: today } } }),
        prisma.payment.aggregate({
          _sum: { amount: true },
          where: { status: 'PAID', createdAt: { gte: today } },
        }),
        prisma.kiosk.count(),
        prisma.kiosk.count({
          where: { lastHeartbeat: { gte: new Date(Date.now() - 60000) } },
        }),
        prisma.printJob.aggregate({
          _sum: { totalPages: true },
          where: { status: 'COMPLETED', createdAt: { gte: today } },
        }),
      ]);

      io.to('admin').emit('admin_stats', {
        today: {
          revenue: revenueToday._sum.amount || 0,
          printJobs: totalJobsToday,
          pages: totalPages._sum.totalPages || 0,
          successful: completedJobsToday,
          failed: failedJobsToday,
        },
        kiosks: {
          total: totalKiosks,
          online: onlineKiosks,
        },
      });
    } catch (e) {
      console.error('Error broadcasting admin stats:', e);
    }
  };

  io.on('connection', (socket: Socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // ── Join Admin Room ──
    socket.on('join_admin', () => {
      socket.join('admin');
      console.log(`👑 Admin connected: ${socket.id}`);
      broadcastAdminStats();
    });

    // ── Join session room (customers) ──
    socket.on('join_session', (data: { sessionId: string }) => {
      if (data.sessionId) {
        socket.join(`session:${data.sessionId}`);
        console.log(`📱 Customer joined session: ${data.sessionId}`);
      }
    });

    // ── Join kiosk room ──
    socket.on('join_kiosk', async (data: { kioskId: string }) => {
      try {
        if (data.kioskId) {
          const kiosk = await prisma.kiosk.findFirst({
            where: {
              OR: [{ id: data.kioskId }, { displayId: data.kioskId }],
            },
          });

          if (kiosk) {
            socket.join(`kiosk:${kiosk.id}`);
            socket.data.kioskId = kiosk.id;
            socket.data.kioskDisplayId = kiosk.displayId;
            console.log(`🖥️  Kiosk joined: ${kiosk.displayId}`);

            await prisma.kiosk.update({
              where: { id: kiosk.id },
              data: { lastHeartbeat: new Date() },
            });

            broadcastAdminStats();
            io.to('admin').emit('kiosk_heartbeat', {
              kioskId: kiosk.id,
              displayId: kiosk.displayId,
              isOnline: true,
              lastHeartbeat: new Date().toISOString(),
            });
          }
        }
      } catch (err) {
        console.error('Error handling join_kiosk:', err);
      }
    });

    // ── Kiosk heartbeat ──
    socket.on('heartbeat', async (data: any) => {
      try {
        if (socket.data.kioskId) {
          await prisma.kiosk.update({
            where: { id: socket.data.kioskId },
            data: {
              lastHeartbeat: new Date(),
              cpu: data.cpu,
              ram: data.ram,
              disk: data.disk,
              appVersion: data.appVersion,
            },
          });

          if (data.printerStatus) {
            await prisma.printer.updateMany({
              where: { kioskId: socket.data.kioskId },
              data: {
                status: data.printerStatus,
                currentJobId: data.currentJobId || null,
              },
            });
          }

          // Notify real-time admin portal
          io.to('admin').emit('kiosk_heartbeat', {
            kioskId: socket.data.kioskId,
            displayId: socket.data.kioskDisplayId,
            cpu: data.cpu,
            ram: data.ram,
            disk: data.disk,
            printerStatus: data.printerStatus,
            isOnline: true,
            lastHeartbeat: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error('Error handling kiosk heartbeat:', err);
      }
    });

    // ── Kiosk reports job status ──
    socket.on('job_status', async (data: {
      jobId: string;
      status: string;
      currentPage?: number;
      totalPages?: number;
      error?: string;
    }) => {
      try {
        const job = await prisma.printJob.findUnique({
          where: { id: data.jobId },
          include: { file: true, kiosk: true, payment: true },
        });
        if (!job) return;

        const updateData: any = { status: data.status };
        if (data.currentPage !== undefined) updateData.currentPage = data.currentPage;
        if (data.error) updateData.errorMessage = data.error;
        if (data.status === 'COMPLETED') updateData.completedAt = new Date();

        await prisma.printJob.update({
          where: { id: job.id },
          data: updateData,
        });

        // Forward to customer
        io.to(`session:${job.sessionId}`).emit('job_update', {
          type: 'JOB_UPDATE',
          jobId: job.id,
          displayId: job.displayId,
          status: data.status,
          currentPage: data.currentPage,
          totalPages: data.totalPages || job.totalPages,
        });

        // Forward to Admin Dashboard in Real Time
        io.to('admin').emit('job_updated', {
          id: job.id,
          displayId: job.displayId,
          status: data.status,
          currentPage: data.currentPage,
          totalPages: data.totalPages || job.totalPages,
          fileName: job.file?.originalName,
          kioskName: job.kiosk?.displayId,
          totalPrice: job.totalPrice,
          paymentStatus: job.payment?.status,
        });

        broadcastAdminStats();

        // If completed, mark code as used
        if (data.status === 'COMPLETED') {
          await prisma.printCode.updateMany({
            where: { jobId: job.id, status: 'ACTIVE' },
            data: { status: 'USED', usedAt: new Date() },
          });
        }
      } catch (error) {
        console.error('Job status update error:', error);
      }
    });

    // ── Disconnect ──
    socket.on('disconnect', () => {
      if (socket.data.kioskDisplayId) {
        console.log(`🖥️  Kiosk disconnected: ${socket.data.kioskDisplayId}`);
        io.to('admin').emit('kiosk_heartbeat', {
          kioskId: socket.data.kioskId,
          displayId: socket.data.kioskDisplayId,
          isOnline: false,
        });
      } else {
        console.log(`📱 Client disconnected: ${socket.id}`);
      }
    });
  });
}
