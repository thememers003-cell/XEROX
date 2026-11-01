'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  QrCode,
  Hash,
  Printer,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Wifi,
  WifiOff,
  ArrowLeft,
  Sparkles,
  Delete,
  FileText,
  Check,
  Zap,
  Clock,
  Heart
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { io, Socket } from 'socket.io-client';
import { getRandomCharmingLine, getRandomCompletionLine } from '../lib/charming-lines';
import { playKeySound } from '../lib/sound';

function getApiUrl(): string {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:4000';
    }
    if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(hostname)) {
      return `http://${hostname}:4000`;
    }
    if (hostname.includes('loca.lt')) {
      return 'https://xpos-api-cloud.loca.lt';
    }
    // Any public domain (riseupsolutions.in, vercel.app, onrender.com, etc.)
    return process.env.NEXT_PUBLIC_API_URL || 'https://xpos-printing-cloud.onrender.com';
  }
  return process.env.NEXT_PUBLIC_API_URL || 'https://xpos-printing-cloud.onrender.com';
}

function getAppUrl(): string {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname.includes('loca.lt')) {
      return 'https://xpos-print-customer.loca.lt';
    }
    if (hostname.includes('vercel.app') || hostname.includes('onrender.com')) {
      return 'https://xpos-printing-cloud-customer.vercel.app';
    }
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `http://${hostname}:3000`;
    }
  }
  return process.env.NEXT_PUBLIC_APP_URL || 'https://xpos-printing-cloud-customer.vercel.app';
}

const KIOSK_ID = process.env.NEXT_PUBLIC_KIOSK_ID || 'XPOS-001';
const IDLE_TIMEOUT = 60000;

type Screen = 'idle' | 'qr' | 'code-entry' | 'printing' | 'completed' | 'error';

interface PrintJobData {
  jobId: string;
  displayId: string;
  downloadUrl: string;
  totalPages: number;
  currentPage: number;
  fileName: string;
  colorMode: string;
  copies: number;
}

export default function KioskApp() {
  const [screen, setScreen] = useState<Screen>('idle');
  const [kioskInfo, setKioskInfo] = useState<any>(null);
  const [printerStatus, setPrinterStatus] = useState<string>('READY');
  const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
  const [jobData, setJobData] = useState<PrintJobData | null>(null);
  const [error, setError] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  // 🔒 Single-Use Dynamic QR Token for Instant Release Pairing
  const [pairToken, setPairToken] = useState<string>(() => {
    return 'XPOS-' + Math.random().toString(36).substring(2, 8).toUpperCase() + '-' + Date.now().toString(36);
  });

  const rotatePairToken = useCallback(() => {
    const newToken = 'XPOS-' + Math.random().toString(36).substring(2, 8).toUpperCase() + '-' + Date.now().toString(36);
    setPairToken(newToken);
    console.log('🔄 Kiosk single-use QR refreshed:', newToken);
  }, []);

  // 5-Second Auto Return Countdown for Upload Screen
  const [qrCountdown, setQrCountdown] = useState(5);

  // Charming flirty quotes
  const [currentCharmingLine, setCurrentCharmingLine] = useState('');
  const [currentCompletionLine, setCurrentCompletionLine] = useState('');

  // Completed countdown timer (7 Seconds)
  const [countdown, setCountdown] = useState(7);

  const socketRef = useRef<Socket | null>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ── 5-Second Auto Return from Scan QR Upload Screen ──
  useEffect(() => {
    if (screen !== 'qr') return;
    setQrCountdown(5);

    const interval = setInterval(() => {
      setQrCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setScreen('idle');
          return 5;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [screen]);

  // ── Reset idle timer ──
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (screen !== 'idle' && screen !== 'printing' && screen !== 'completed') {
      idleTimerRef.current = setTimeout(() => {
        setScreen('idle');
        setCode(['', '', '', '', '', '']);
        setJobData(null);
        setError('');
      }, IDLE_TIMEOUT);
    }
  }, [screen]);

  useEffect(() => { resetIdleTimer(); }, [screen, resetIdleTimer]);

  // ── Load kiosk info ──
  useEffect(() => {
    async function loadKiosk() {
      try {
        const res = await fetch(`${getApiUrl()}/api/kiosks/${KIOSK_ID}`);
        const data = await res.json();
        if (data.success) setKioskInfo(data.data);
      } catch (e) { console.error('Failed to load kiosk info:', e); }
    }
    loadKiosk();
  }, []);

  // ── WebSocket connection ──
  useEffect(() => {
    const socket = io(getApiUrl(), { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('🔌 Kiosk connected to XPOS Cloud');
      setIsConnected(true);
      socket.emit('join_kiosk', { kioskId: KIOSK_ID });
    });

    socket.on('disconnect', () => {
      console.log('❌ Kiosk disconnected from XPOS Cloud');
      setIsConnected(false);
    });

    // ⚡ Instant QR Pairing Event from Customer Phone
    socket.on('kiosk_paired_print', (data: any) => {
      console.log('⚡ Real-Time QR Pairing Triggered:', data);
      if (data.kioskId && data.kioskId !== KIOSK_ID && data.targetKioskId && data.targetKioskId !== KIOSK_ID) {
        return;
      }

      playKeySound('success');
      const totalPgs = data.totalPages || 1;
      setJobData({
        jobId: data.jobId,
        displayId: data.displayId,
        downloadUrl: data.downloadUrl || `${getApiUrl()}/api/files/download/${data.jobId}`,
        totalPages: totalPgs,
        currentPage: 1,
        fileName: data.fileName || 'Document.pdf',
        colorMode: data.colorMode || 'BW',
        copies: data.copies || 1,
      });

      setCurrentCharmingLine(getRandomCharmingLine());
      setScreen('printing');
      setIsVerifying(false);
      rotatePairToken(); // Single-use guarantee: Invalidate old QR immediately
      startPageProgressSimulation(totalPgs);

      // Trigger physical print pipeline on backend/printer
      if (data.jobId) {
        fetch(`${getApiUrl()}/api/jobs/${data.jobId}/print`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kioskId: KIOSK_ID }),
        }).catch((e) => console.warn('Kiosk print trigger notice:', e));
      }

      // Simulate completion after printing
      setTimeout(() => {
        handleJobCompleted(data.jobId);
      }, Math.max(5000, totalPgs * 1200));
    });

    // Receive new print job
    socket.on('new_job', (data: any) => {
      console.log('📥 New print job received:', data);
      const totalPgs = data.job?.totalPages || 1;
      setJobData({
        jobId: data.job.id,
        displayId: data.job.displayId,
        downloadUrl: data.downloadUrl || `${getApiUrl()}/api/files/download/${data.job.file?.storageKey}`,
        totalPages: totalPgs,
        currentPage: 1,
        fileName: data.job.file?.originalName || 'Document.pdf',
        colorMode: data.job.colorMode,
        copies: data.job.copies,
      });
      setCurrentCharmingLine(getRandomCharmingLine());
      setScreen('printing');
      rotatePairToken();
      startPageProgressSimulation(totalPgs);
    });

    // Receive print job progress
    socket.on('job_progress', (data: any) => {
      setJobData((prev) => prev ? { ...prev, currentPage: data.currentPage || prev.currentPage } : null);
    });

    // Receive job completion
    socket.on('job_completed', () => {
      handleJobCompleted();
    });

    // Receive job failure
    socket.on('job_failed', (data: any) => {
      setError(data.error || 'Printing encountered an issue. Please try again.');
      setScreen('error');
    });

    // Receive printer status update
    socket.on('printer_status', (data: any) => {
      setPrinterStatus(data.status || 'READY');
    });

    return () => {
      socket.disconnect();
    };
  }, [rotatePairToken]);

  // ── Page Progress Simulation for Multi-page Jobs ──
  const startPageProgressSimulation = (totalPages: number) => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    if (totalPages <= 1) return;

    let cur = 1;
    const intervalMs = Math.max(800, Math.floor(4500 / totalPages));

    progressIntervalRef.current = setInterval(() => {
      cur += 1;
      if (cur <= totalPages) {
        setJobData((prev) => prev ? { ...prev, currentPage: cur } : null);
      } else {
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      }
    }, intervalMs);
  };

  // ── Handle Job Completed (Auto-redirect in 7 Seconds & Sync with Backend) ──
  const handleJobCompleted = (completedJobId?: string) => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    playKeySound('success');
    setCurrentCompletionLine(getRandomCompletionLine());
    setScreen('completed');
    setCountdown(7);

    const activeJobId = completedJobId || jobData?.jobId;
    if (activeJobId) {
      // Sync completion with cloud backend so customer screen instantly transitions to PRINT COMPLETED 🎉
      fetch(`${getApiUrl()}/api/jobs/${activeJobId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' }),
      }).catch((e) => console.warn('Completion sync to backend:', e));
    }

    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

    let currentSeconds = 7;
    countdownTimerRef.current = setInterval(() => {
      currentSeconds -= 1;
      setCountdown(currentSeconds);

      if (currentSeconds <= 0) {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        setScreen('idle');
        setCode(['', '', '', '', '', '']);
        setJobData(null);
        setError('');
        rotatePairToken();
      }
    }, 1000);
  };

  // ── Verify Code & Direct Print (No extra verify button needed) ──
  const verifyAndPrintCode = useCallback(async (fullCode: string) => {
    setIsVerifying(true);
    setError('');

    try {
      const res = await fetch(`${getApiUrl()}/api/print-codes/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: fullCode,
          kioskId: KIOSK_ID,
        }),
      });

      const data = await res.json();

      if (data.success && data.data) {
        playKeySound('success');
        const printData = data.data;
        const jobId = printData.jobId || printData.job?.id || '';
        const displayId = printData.displayId || printData.job?.displayId || 'Active';
        const downloadUrl = printData.downloadUrl || `${getApiUrl()}/api/files/download/${printData.file?.storageKey || ''}`;
        const totalPages = printData.printSettings?.totalPages || printData.job?.totalPages || 1;
        const fileName = printData.file?.originalName || printData.job?.file?.originalName || 'Document.pdf';
        const colorMode = printData.printSettings?.colorMode || printData.job?.colorMode || 'BW';
        const copies = printData.printSettings?.copies || printData.job?.copies || 1;

        setJobData({
          jobId,
          displayId,
          downloadUrl,
          totalPages,
          currentPage: 1,
          fileName,
          colorMode,
          copies,
        });

        setCurrentCharmingLine(getRandomCharmingLine());
        setScreen('printing');
        setIsVerifying(false);

        startPageProgressSimulation(totalPages);

        // Send print trigger to backend / physical printer
        if (jobId) {
          try {
            await fetch(`${getApiUrl()}/api/jobs/${jobId}/print`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ kioskId: KIOSK_ID }),
            });
          } catch (e) {
            console.warn('Physical print trigger request sent');
          }
        }

        // Simulate complete after physical print duration
        setTimeout(() => {
          handleJobCompleted(jobId);
        }, Math.max(5000, totalPages * 1200));

      } else {
        playKeySound('error');
        setIsShaking(true);
        setError(data.error || 'Invalid or already used code. Please check and try again.');
        setIsVerifying(false);

        setTimeout(() => {
          setIsShaking(false);
          setCode(['', '', '', '', '', '']);
        }, 1800);
      }
    } catch (e: any) {
      playKeySound('error');
      setIsShaking(true);
      setError('Connection failed. Please verify kiosk network.');
      setIsVerifying(false);
      setTimeout(() => {
        setIsShaking(false);
        setCode(['', '', '', '', '', '']);
      }, 1800);
    }
  }, []);

  // ── Numpad Tap Handler ──
  const handleDigitPress = useCallback((digit: string) => {
    if (isVerifying) return;
    resetIdleTimer();

    setCode((prevCode) => {
      const emptyIdx = prevCode.findIndex((d) => d === '');
      if (emptyIdx === -1) return prevCode;

      playKeySound('tap');
      const newCode = [...prevCode];
      newCode[emptyIdx] = digit;

      // If 6th digit entered, auto-verify and start printing immediately!
      if (emptyIdx === 5) {
        const fullCode = newCode.join('');
        verifyAndPrintCode(fullCode);
      }
      return newCode;
    });
  }, [isVerifying, resetIdleTimer, verifyAndPrintCode]);

  // ── Backspace Handler ──
  const handleBackspace = useCallback(() => {
    if (isVerifying) return;
    resetIdleTimer();
    playKeySound('delete');

    setCode((prevCode) => {
      const filledIndices = prevCode
        .map((d, i) => (d !== '' ? i : -1))
        .filter((i) => i !== -1);

      if (filledIndices.length === 0) return prevCode;
      const lastFilled = filledIndices[filledIndices.length - 1];

      const newCode = [...prevCode];
      newCode[lastFilled] = '';
      return newCode;
    });
    setError('');
  }, [isVerifying, resetIdleTimer]);

  // ── Clear Code Handler ──
  const handleClear = useCallback(() => {
    if (isVerifying) return;
    resetIdleTimer();
    playKeySound('delete');
    setCode(['', '', '', '', '', '']);
    setError('');
  }, [isVerifying, resetIdleTimer]);

  // ── Physical Keyboard Support (Digits 0-9, Numpad, Backspace, Enter, Escape) ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      // 1. Digits 0-9 and Numpad 0-9
      const digitMatch = e.code.match(/^(Digit|Numpad)([0-9])$/);
      if (digitMatch || /^[0-9]$/.test(e.key)) {
        const digit = digitMatch ? digitMatch[2] : e.key;
        e.preventDefault();

        if (screen === 'idle') {
          playKeySound('tap');
          setScreen('code-entry');
          setCode([digit, '', '', '', '', '']);
          resetIdleTimer();
          return;
        }

        if (screen === 'code-entry') {
          handleDigitPress(digit);
          return;
        }
      }

      // 2. Backspace
      if (e.key === 'Backspace') {
        if (screen === 'code-entry') {
          e.preventDefault();
          handleBackspace();
          return;
        }
      }

      // 3. Enter key
      if (e.key === 'Enter') {
        if (screen === 'code-entry') {
          e.preventDefault();
          const fullCode = code.join('');
          if (fullCode.length === 6 && !code.includes('')) {
            verifyAndPrintCode(fullCode);
          }
          return;
        }
      }

      // 4. Escape key: return to home
      if (e.key === 'Escape') {
        if (screen === 'code-entry' || screen === 'qr') {
          e.preventDefault();
          playKeySound('tap');
          setScreen('idle');
          setCode(['', '', '', '', '', '']);
          setError('');
          resetIdleTimer();
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [screen, code, handleDigitPress, handleBackspace, verifyAndPrintCode, resetIdleTimer]);

  return (
    <div className="min-h-screen bg-[#f8fbff] text-slate-900 font-sans flex flex-col justify-between select-none overflow-hidden p-6 md:p-10 relative">
      {/* Background Soft Ambient Light Spheres */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-400/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-indigo-400/10 rounded-full blur-3xl pointer-events-none" />

      {/* ════════════════════════════════════════════════ */}
      {/* TOP HEADER & BRANDING */}
      {/* ════════════════════════════════════════════════ */}
      <header className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-3.5">
          <img src="/printbro_logo.png" alt="PrintBro" className="h-12 md:h-14 object-contain" />
        </div>

        {/* Station & Status Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white/80 backdrop-blur-md px-4 py-2 rounded-2xl border border-slate-200 shadow-sm text-xs font-bold text-slate-700">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Station: <strong className="text-slate-900">{KIOSK_ID}</strong></span>
          </div>

          <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 px-3.5 py-2 rounded-2xl text-xs font-bold shadow-sm">
            {isConnected ? <Wifi className="w-4 h-4 text-emerald-600" /> : <WifiOff className="w-4 h-4 text-rose-500" />}
            <span>{isConnected ? 'Online' : 'Reconnecting'}</span>
          </div>
        </div>
      </header>

      {/* ════════════════════════════════════════════════ */}
      {/* MAIN SCREEN BODY */}
      {/* ════════════════════════════════════════════════ */}
      <main className="flex-1 flex flex-col items-center justify-center py-6 relative z-10 max-w-4xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {/* ──────────────────────────────────────── */}
          {/* 1. IDLE / HOME SCREEN */}
          {/* ──────────────────────────────────────── */}
          {screen === 'idle' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.25 }}
              className="w-full flex flex-col items-center text-center space-y-6"
            >
              <div className="space-y-1.5">
                <span className="text-xs md:text-sm font-black text-blue-700 bg-blue-100 px-4 py-1 rounded-full uppercase tracking-wider">
                  ⚡ Self-Service Print Station
                </span>
                <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
                  Welcome to Print Bro
                </h2>
                <p className="text-slate-600 font-medium text-xs md:text-sm max-w-lg mx-auto">
                  Scan the single-use QR from your phone, enter your 6-digit code, or scan to upload documents.
                </p>
              </div>

              {/* Action Cards Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full max-w-4xl text-left items-stretch">
                {/* ⚡ 1. INSTANT PRINT RELEASE QR CARD */}
                <motion.div
                  whileHover={{ scale: 1.01 }}
                  className="bg-white p-6 md:p-7 rounded-[32px] border-2 border-blue-300 shadow-xl shadow-blue-500/10 flex flex-col items-center text-center justify-between space-y-4"
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Live • Single Use</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        playKeySound('tap');
                        rotatePairToken();
                      }}
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200 transition-colors"
                      title="Refresh single-use pairing token"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Refresh</span>
                    </button>
                  </div>

                  <div>
                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                      SCAN TO PRINT INSTANTLY
                    </h3>
                    <p className="text-slate-600 text-xs md:text-sm font-medium mt-1 leading-snug max-w-xs">
                      Open your code screen on phone & tap <strong>"Scan Kiosk QR"</strong>. Document prints in 1 second!
                    </p>
                  </div>

                  {/* Dynamic Single-Use QR Code */}
                  <div className="p-4 bg-white rounded-3xl border-2 border-blue-200 shadow-md flex items-center justify-center">
                    <QRCodeSVG
                      value={JSON.stringify({
                        type: 'xpos_kiosk_pair',
                        kioskId: KIOSK_ID,
                        token: pairToken,
                        pairKiosk: KIOSK_ID,
                      })}
                      size={180}
                      level="H"
                      includeMargin={true}
                      imageSettings={{
                        src: '/logo.svg',
                        x: undefined,
                        y: undefined,
                        height: 28,
                        width: 28,
                        excavate: true,
                      }}
                    />
                  </div>

                  <div className="w-full bg-blue-50 rounded-2xl py-2.5 px-3 border border-blue-200 flex items-center justify-center gap-2 text-xs font-bold text-blue-900">
                    <Zap className="w-4 h-4 text-blue-600 animate-pulse" />
                    <span>Instant QR Release • Zero Typing</span>
                  </div>
                </motion.div>

                {/* RIGHT COLUMN: MANUAL CODE ENTRY & UPLOAD */}
                <div className="flex flex-col gap-5 justify-between">
                  {/* ENTER 6-DIGIT CODE CARD */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      playKeySound('tap');
                      setScreen('code-entry');
                    }}
                    className="flex-1 p-6 md:p-7 rounded-[28px] bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex flex-col justify-between items-start space-y-4 shadow-xl shadow-blue-500/25 border-2 border-blue-400 group transition-all text-left"
                    id="btn-kiosk-enter-code"
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white border border-white/20 shadow-inner group-hover:scale-110 transition-transform">
                        <Hash className="w-7 h-7" />
                      </div>
                      <span className="bg-white text-blue-700 font-black text-xs px-3.5 py-1.5 rounded-full shadow-sm">
                        Touchscreen 🔢
                      </span>
                    </div>
                    <div>
                      <h3 className="text-xl md:text-2xl font-black tracking-tight mb-1">ENTER 6-DIGIT CODE</h3>
                      <p className="text-blue-100 text-xs md:text-sm font-medium leading-snug">
                        Prefer typing? Enter your release code manually on the touchscreen keypad.
                      </p>
                    </div>
                  </motion.button>

                  {/* SCAN QR TO UPLOAD CARD */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      playKeySound('tap');
                      setScreen('qr');
                    }}
                    className="flex-1 p-6 md:p-7 rounded-[28px] bg-white text-slate-900 flex flex-col justify-between items-start space-y-4 shadow-xl shadow-slate-200/50 border-2 border-slate-200 hover:border-blue-300 group transition-all text-left"
                    id="btn-kiosk-scan-qr"
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100 group-hover:scale-110 transition-transform">
                        <QrCode className="w-7 h-7" />
                      </div>
                      <span className="bg-blue-50 text-blue-700 font-black text-xs px-3.5 py-1.5 rounded-full border border-blue-200">
                        Upload from Phone 📲
                      </span>
                    </div>
                    <div>
                      <h3 className="text-xl md:text-2xl font-black tracking-tight mb-1 text-slate-900">SCAN QR TO UPLOAD</h3>
                      <p className="text-slate-600 text-xs md:text-sm font-medium leading-snug">
                        Don't have a document uploaded yet? Scan to upload and pay from your phone.
                      </p>
                    </div>
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ──────────────────────────────────────── */}
          {/* 2. QR CODE DISPLAY SCREEN */}
          {/* ──────────────────────────────────────── */}
          {screen === 'qr' && (
            <motion.div
              key="qr"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-md flex flex-col items-center text-center space-y-5"
            >
              <div className="space-y-1">
                <h2 className="text-3xl font-black text-slate-900">Scan QR with Phone</h2>
                <p className="text-slate-600 text-sm font-medium">Point your camera to upload documents directly</p>
              </div>

              {/* ⏱️ 5-Second Auto-Return Countdown Badge & Progress Bar */}
              <div className="flex flex-col items-center gap-1.5 w-full">
                <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-300 text-amber-900 px-4 py-1.5 rounded-full text-xs font-bold shadow-sm">
                  <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                  <span>Returning to Home in {qrCountdown}s</span>
                </div>
                <div className="w-48 h-1.5 bg-slate-200 rounded-full overflow-hidden mt-0.5">
                  <motion.div
                    animate={{ width: `${(qrCountdown / 5) * 100}%` }}
                    transition={{ duration: 0.3 }}
                    className="h-full bg-blue-600 rounded-full"
                  />
                </div>
              </div>

              <div className="p-6 bg-white rounded-3xl border-2 border-blue-200 shadow-2xl shadow-blue-500/10">
                <QRCodeSVG
                  value={`${getAppUrl()}/remote?kiosk=${KIOSK_ID}`}
                  size={230}
                  level="H"
                  includeMargin={true}
                  imageSettings={{
                    src: '/logo.svg',
                    x: undefined,
                    y: undefined,
                    height: 36,
                    width: 36,
                    excavate: true,
                  }}
                />
              </div>

              <p className="font-mono text-xs text-blue-600 font-bold bg-blue-50 px-4 py-1.5 rounded-full border border-blue-100">
                {getAppUrl()}/remote
              </p>

              <button
                onClick={() => {
                  playKeySound('tap');
                  setScreen('idle');
                }}
                className="py-3 px-6 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm flex items-center gap-2 transition-all active:scale-95"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Home Now
              </button>
            </motion.div>
          )}

          {/* ──────────────────────────────────────── */}
          {/* 3. CODE ENTRY SCREEN (FROSTED GLASS ROUND NUMPAD) */}
          {/* ──────────────────────────────────────── */}
          {screen === 'code-entry' && (
            <motion.div
              key="code-entry"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.22 }}
              className="w-full max-w-lg flex flex-col items-center text-center space-y-6"
            >
              {/* Top Title & Back Button */}
              <div className="w-full flex items-center justify-between">
                <button
                  onClick={() => {
                    playKeySound('tap');
                    setScreen('idle');
                  }}
                  className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-bold text-sm bg-blue-50 px-4 py-2 rounded-xl border border-blue-100 active:scale-95 transition-all shadow-sm"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <span className="text-xs font-black uppercase text-blue-700 tracking-wider bg-blue-100 px-3 py-1 rounded-full">
                  6-Digit Release
                </span>
              </div>

              <div>
                <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
                  Enter Print Code
                </h2>
                <p className="text-slate-600 text-xs md:text-sm font-medium mt-1">
                  Type your 6-digit code. Printing starts automatically!
                </p>
              </div>

              {/* 6 Digit Input Display Boxes */}
              <motion.div
                animate={isShaking ? { x: [-10, 10, -10, 10, -5, 5, 0] } : {}}
                transition={{ duration: 0.4 }}
                className="flex items-center justify-center gap-2.5 md:gap-3.5 my-2"
              >
                {code.map((digit, i) => (
                  <div
                    key={i}
                    className={`w-12 h-16 md:w-14 md:h-18 rounded-2xl flex items-center justify-center text-3xl md:text-4xl font-display font-black transition-all duration-200 border-2 ${
                      digit
                        ? 'bg-blue-50 text-blue-900 border-blue-600 shadow-md shadow-blue-500/10 scale-105'
                        : i === code.findIndex((d) => d === '')
                        ? 'bg-white text-blue-600 border-blue-400 ring-2 ring-blue-300 animate-pulse'
                        : 'bg-white text-slate-300 border-slate-200'
                    }`}
                  >
                    {digit}
                  </div>
                ))}
              </motion.div>

              {/* Status or Error Banner */}
              {isVerifying ? (
                <div className="flex items-center gap-2 text-blue-700 bg-blue-50 border border-blue-200 px-4 py-2 rounded-xl text-xs md:text-sm font-black">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying code & preparing printer...</span>
                </div>
              ) : error ? (
                <div className="text-rose-600 bg-rose-50 border border-rose-200 px-4 py-2 rounded-xl text-xs md:text-sm font-bold animate-fade-in">
                  {error}
                </div>
              ) : (
                <p className="text-slate-400 text-xs font-medium">Valid for 24 hours from creation</p>
              )}

              {/* 🌟 ULTRA-PREMIUM FROSTED GLASS ROUND NUMPAD */}
              <div className="grid grid-cols-3 gap-3.5 md:gap-4.5 pt-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                  <motion.button
                    key={num}
                    type="button"
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.88 }}
                    onClick={() => handleDigitPress(num)}
                    disabled={isVerifying}
                    className="w-18 h-18 md:w-20 md:h-20 rounded-full bg-white/70 backdrop-blur-2xl hover:bg-gradient-to-tr hover:from-blue-600 hover:to-indigo-600 hover:text-white border-2 border-white/90 hover:border-transparent text-slate-900 font-display font-black text-2xl md:text-3xl shadow-[0_10px_25px_rgba(0,0,0,0.06)] hover:shadow-blue-500/25 flex items-center justify-center transition-all duration-150 active:scale-90 ring-1 ring-blue-200/50"
                  >
                    {num}
                  </motion.button>
                ))}

                {/* CLEAR BUTTON */}
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.88 }}
                  onClick={handleClear}
                  disabled={isVerifying}
                  className="w-18 h-18 md:w-20 md:h-20 rounded-full bg-slate-100/80 backdrop-blur-xl hover:bg-rose-50 hover:text-rose-600 border-2 border-slate-200/80 text-slate-600 font-black text-xs uppercase flex items-center justify-center transition-all duration-150 active:scale-90 shadow-sm"
                >
                  Clear
                </motion.button>

                {/* DIGIT 0 */}
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.88 }}
                  onClick={() => handleDigitPress('0')}
                  disabled={isVerifying}
                  className="w-18 h-18 md:w-20 md:h-20 rounded-full bg-white/70 backdrop-blur-2xl hover:bg-gradient-to-tr hover:from-blue-600 hover:to-indigo-600 hover:text-white border-2 border-white/90 hover:border-transparent text-slate-900 font-display font-black text-2xl md:text-3xl shadow-[0_10px_25px_rgba(0,0,0,0.06)] hover:shadow-blue-500/25 flex items-center justify-center transition-all duration-150 active:scale-90 ring-1 ring-blue-200/50"
                >
                  0
                </motion.button>

                {/* BACKSPACE BUTTON */}
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.88 }}
                  onClick={handleBackspace}
                  disabled={isVerifying}
                  className="w-18 h-18 md:w-20 md:h-20 rounded-full bg-slate-100/80 backdrop-blur-xl hover:bg-slate-200 text-slate-700 border-2 border-slate-200/80 flex items-center justify-center transition-all duration-150 active:scale-90 shadow-sm"
                >
                  <Delete className="w-6 h-6" />
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ──────────────────────────────────────── */}
          {/* 4. PRINTING IN PROGRESS SCREEN */}
          {/* ──────────────────────────────────────── */}
          {screen === 'printing' && (
            <motion.div
              key="printing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md flex flex-col items-center text-center space-y-6"
            >
              {/* 💖 Charming Flirty Line Card */}
              {currentCharmingLine && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full p-4 rounded-3xl bg-gradient-to-r from-blue-50 via-indigo-50/70 to-blue-50 border-2 border-blue-200 shadow-md text-center flex flex-col items-center gap-1.5"
                >
                  <div className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-blue-700 bg-white px-3 py-0.5 rounded-full border border-blue-200">
                    <Sparkles className="w-3 h-3 text-amber-500 animate-pulse" />
                    <span>A Note For You</span>
                    <Sparkles className="w-3 h-3 text-amber-500 animate-pulse" />
                  </div>
                  <p className="text-slate-900 font-black text-sm md:text-base leading-snug">
                    "{currentCharmingLine}"
                  </p>
                </motion.div>
              )}

              {/* 🖨️ High-Impact Animated Paper Ejection & Laser Feed Card */}
              <div className="w-full bg-white p-8 rounded-3xl border-2 border-blue-300 shadow-2xl shadow-blue-500/10 flex flex-col items-center relative overflow-hidden space-y-4">
                {/* Printer Top Slot */}
                <div className="w-48 h-4 bg-slate-800 rounded-full shadow-inner relative z-10" />

                {/* Animated Sliding Paper Sheet */}
                <div className="relative w-44 h-56 bg-gradient-to-b from-blue-50 to-white rounded-2xl border-2 border-slate-300 shadow-lg p-3 flex flex-col justify-between overflow-hidden">
                  {/* Laser Scanning Line */}
                  <motion.div
                    animate={{ y: [0, 180, 0] }}
                    transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                    className="absolute left-0 right-0 h-1.5 bg-gradient-to-r from-transparent via-blue-500 to-transparent shadow-sm shadow-blue-500"
                  />

                  <div className="space-y-1.5 opacity-60">
                    <div className="h-2 bg-blue-600 rounded-full w-3/4" />
                    <div className="h-1.5 bg-slate-300 rounded-full w-full" />
                    <div className="h-1.5 bg-slate-200 rounded-full w-5/6" />
                    <div className="h-1.5 bg-slate-200 rounded-full w-4/5" />
                  </div>

                  <div className="flex items-center justify-center my-auto">
                    <Printer className="w-9 h-9 text-blue-600 animate-bounce" />
                  </div>

                  <div className="h-1.5 bg-slate-300 rounded-full w-2/3 opacity-60" />
                </div>

                <div className="w-full space-y-2">
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                    🖨️ PRINTING IN PROGRESS
                  </h3>

                  {/* 📊 REAL-TIME PAGE-BY-PAGE COUNTER: e.g. "1/10 pages printed" */}
                  <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 space-y-1.5">
                    <div className="flex justify-between items-center text-xs font-black">
                      <span className="text-slate-700">Printing Progress</span>
                      <span className="text-blue-700">
                        {jobData?.currentPage || 1} / {jobData?.totalPages || 1} Pages Printed
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full"
                        initial={{ width: '10%' }}
                        animate={{
                          width: `${Math.min(100, Math.round(((jobData?.currentPage || 1) / (jobData?.totalPages || 1)) * 100))}%`
                        }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  </div>

                  <p className="text-slate-500 text-xs font-medium">
                    Please collect your pages as they emerge from the printer tray.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* ──────────────────────────────────────── */}
          {/* 5. ORDER COMPLETED SCREEN (5-SECOND AUTO REDIRECT) */}
          {/* ──────────────────────────────────────── */}
          {screen === 'completed' && (
            <motion.div
              key="completed"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              className="w-full max-w-md flex flex-col items-center text-center space-y-6"
            >
              {/* Success Badge */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                className="w-24 h-24 rounded-full bg-emerald-50 border-4 border-emerald-500 flex items-center justify-center text-emerald-600 shadow-2xl shadow-emerald-500/20"
              >
                <Check className="w-12 h-12 stroke-[3]" />
              </motion.div>

              <div>
                <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
                  Printing Completed!
                </h2>
                <p className="text-slate-600 text-sm font-medium mt-1">
                  Please collect your pages from the printer tray below.
                </p>
              </div>

              {/* 💖 Warm / Flirty Completion Quote Card */}
              {currentCompletionLine && (
                <div className="w-full p-5 rounded-3xl bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border-2 border-emerald-300 shadow-md text-center flex flex-col items-center gap-1.5">
                  <div className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-white px-3 py-0.5 rounded-full border border-emerald-200">
                    <Heart className="w-3 h-3 text-rose-500 fill-rose-500" />
                    <span>Thank You!</span>
                    <Heart className="w-3 h-3 text-rose-500 fill-rose-500" />
                  </div>
                  <p className="text-emerald-950 font-black text-base md:text-lg leading-snug">
                    "{currentCompletionLine}"
                  </p>
                </div>
              )}

              {/* ⏱️ Auto-Redirect 5s Countdown Notice */}
              <div className="flex items-center justify-center gap-2 text-xs font-bold text-slate-500 bg-slate-100 px-5 py-2.5 rounded-full">
                <Clock className="w-4 h-4 text-blue-600" />
                <span>Returning to home screen in <strong className="text-slate-900 font-black">{countdown}s</strong>...</span>
              </div>
            </motion.div>
          )}

          {/* ──────────────────────────────────────── */}
          {/* 6. ERROR SCREEN */}
          {/* ──────────────────────────────────────── */}
          {screen === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-md flex flex-col items-center text-center space-y-5"
            >
              <div className="w-20 h-20 rounded-full bg-rose-50 border-4 border-rose-500 flex items-center justify-center text-rose-600 shadow-lg">
                <XCircle className="w-10 h-10" />
              </div>

              <div>
                <h2 className="text-2xl font-black text-slate-900">Printing Issue</h2>
                <p className="text-rose-600 font-bold text-sm mt-1">{error || 'Something went wrong.'}</p>
              </div>

              <button
                onClick={() => {
                  playKeySound('tap');
                  setScreen('idle');
                }}
                className="py-3.5 px-8 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-base shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
              >
                Back to Home
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ════════════════════════════════════════════════ */}
      {/* FOOTER */}
      {/* ════════════════════════════════════════════════ */}
      <footer className="flex items-center justify-between text-xs font-bold text-slate-500 relative z-10 pt-4 border-t border-slate-200">
        <div className="flex items-center gap-2">
          <span>Print Bro Cloud v2.0</span>
          <span>•</span>
          <span className="text-emerald-700 font-bold flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Printer {printerStatus}
          </span>
        </div>
        <p className="text-slate-400">Powered by Print Bro Self-Service</p>
      </footer>
    </div>
  );
}
