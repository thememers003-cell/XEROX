'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Printer,
  DollarSign,
  FileText,
  RefreshCw,
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Radio,
  Plus,
  X,
  MapPin,
  Loader2,
  Trash2,
  Ban,
  RotateCcw,
  Sparkles,
  ShieldAlert,
  Download,
  Eye,
  Layers,
  FileCheck,
  Zap,
  Power,
  ChevronRight,
  TrendingUp,
  Activity,
  ArrowUpRight,
  Sliders,
  Bell,
  Settings,
  Database,
  Cpu,
  Check,
  Building,
  Store,
  LogOut,
  Key,
  Users,
  ChevronDown,
  CheckCheck,
  Lock,
  AlertCircle
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { getApiUrl } from '../lib/api';

interface DashboardStats {
  today: {
    revenue: number;
    allTimeRevenue: number;
    printJobs: number;
    pages: number;
    successful: number;
    failed: number;
    cancelled: number;
    activeCodes: number;
  };
  kiosks: {
    total: number;
    online: number;
  };
}

interface PrintJob {
  id: string;
  displayId: string;
  status: string;
  printMethod: string;
  colorMode: string;
  copies: number;
  totalPages: number;
  totalPrice: number;
  sides: string;
  printCode: string | null;
  printCodeStatus: string | null;
  printCodeExpiresAt: string | null;
  fileName: string;
  fileSize?: number;
  kioskId?: string;
  kioskName?: string;
  kioskLocation?: string;
  shopId?: string;
  shopName?: string;
  paymentStatus?: string;
  paymentAmount?: number;
  paymentOrderId?: string;
  createdAt: string;
  completedAt?: string;
}

interface KioskInfo {
  id: string;
  displayId: string;
  name: string;
  location: string;
  status: string;
  shopId?: string;
  shopName?: string;
  isDefault?: boolean;
  printerStatus: string;
  printerName: string;
  totalJobsServed: number;
  lastHeartbeat: string;
  isOnline: boolean;
  paperLevel: number;
  tonerLevel: number;
  cpu: number;
  ram: number;
  disk: number;
  appVersion: string;
}

interface ShopInfo {
  id: string;
  name: string;
  code: string;
  address?: string;
  location?: string;
  phone?: string;
  status: string;
  defaultKioskId?: string;
  kiosksCount: number;
  jobsCount: number;
  kiosks: Array<{
    id: string;
    displayId: string;
    name: string;
    location: string;
    status: string;
    printerStatus: string;
    isDefault: boolean;
  }>;
  admins: Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    createdAt: string;
  }>;
}

interface AdminProfile {
  id: string;
  email: string;
  name: string;
  role: 'SUPER_ADMIN' | 'SHOP_ADMIN';
  shopId?: string | null;
  shopName?: string | null;
  defaultKioskId?: string | null;
}

interface PricingRule {
  id?: string;
  paperSize: string;
  colorMode: string;
  pricePerPage: number;
  isActive: boolean;
}

export default function SuperAdminRootPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'jobs' | 'kiosks' | 'shops' | 'pricing' | 'logs'>('overview');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [kiosks, setKiosks] = useState<KioskInfo[]>([]);
  const [shops, setShops] = useState<ShopInfo[]>([]);
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ── Authentication State ──
  const [adminUser, setAdminUser] = useState<AdminProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // ── Multi-Shop Selection & Default Station ──
  const [selectedShopId, setSelectedShopId] = useState<string>('ALL');
  const [defaultKioskId, setDefaultKioskId] = useState<string | null>(null);

  // Real-time second clock for live countdowns
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modals
  const [selectedJob, setSelectedJob] = useState<PrintJob | null>(null);
  const [showAddKioskModal, setShowAddKioskModal] = useState(false);
  const [newKioskDisplayId, setNewKioskDisplayId] = useState('');
  const [newKioskName, setNewKioskName] = useState('');
  const [newKioskLocation, setNewKioskLocation] = useState('');
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [showAddShopModal, setShowAddShopModal] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showDefaultPrinterModal, setShowDefaultPrinterModal] = useState(false);

  // Form State for Modals
  const [newShopName, setNewShopName] = useState('');
  const [newShopCode, setNewShopCode] = useState('');
  const [newShopAddress, setNewShopAddress] = useState('');
  const [newShopPhone, setNewShopPhone] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'SUPER_ADMIN' | 'SHOP_ADMIN'>('SHOP_ADMIN');
  const [newUserShopId, setNewUserShopId] = useState('');

  const socketRef = useRef<Socket | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage(null), 4000);
  };

  const getRemainingCountdown = (expiresAtStr: string | null) => {
    if (!expiresAtStr) return null;
    const diff = Math.floor((new Date(expiresAtStr).getTime() - now) / 1000);
    if (diff <= 0) return 'Expired';
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s left`;
  };

  const getHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (adminUser?.role) headers['x-admin-role'] = adminUser.role;
    if (adminUser?.shopId) headers['x-admin-shop-id'] = adminUser.shopId;
    return headers;
  }, [token, adminUser]);

  // Auth persistence check on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('xpos_admin_token');
    const savedUser = localStorage.getItem('xpos_admin_user');
    if (savedToken && savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        setToken(savedToken);
        setAdminUser(parsed);
        setIsLoggedIn(true);
        if (parsed.role === 'SHOP_ADMIN' && parsed.shopId) {
          setSelectedShopId(parsed.shopId);
        }
        if (parsed.defaultKioskId) {
          setDefaultKioskId(parsed.defaultKioskId);
        }
      } catch (e) {
        // invalid saved user
      }
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const baseUrl = getApiUrl();
      const headers = getHeaders();
      const effectiveShopId = adminUser?.role === 'SHOP_ADMIN' ? (adminUser.shopId || undefined) : (selectedShopId !== 'ALL' ? selectedShopId : undefined);
      const shopParam = effectiveShopId ? `&shopId=${effectiveShopId}` : '';
      const kioskShopParam = effectiveShopId ? `?shopId=${effectiveShopId}` : '';

      const [statsRes, jobsRes, kiosksRes, shopsRes, pricingRes, logsRes] = await Promise.all([
        fetch(`${baseUrl}/api/admin/dashboard${kioskShopParam}`, { headers }).then(r => r.json()).catch(() => ({})),
        fetch(`${baseUrl}/api/admin/jobs?status=${statusFilter}&search=${encodeURIComponent(searchQuery)}${shopParam}`, { headers }).then(r => r.json()).catch(() => ({})),
        fetch(`${baseUrl}/api/admin/kiosks${kioskShopParam}`, { headers }).then(r => r.json()).catch(() => ({})),
        fetch(`${baseUrl}/api/admin/shops`, { headers }).then(r => r.json()).catch(() => ({})),
        fetch(`${baseUrl}/api/pricing`).then(r => r.json()).catch(() => ({})),
        fetch(`${baseUrl}/api/admin/audit-logs`, { headers }).then(r => r.json()).catch(() => ({})),
      ]);

      if (statsRes.success) setStats(statsRes.data);
      if (jobsRes.success) setJobs(jobsRes.data?.jobs || []);
      if (kiosksRes.success) setKiosks(kiosksRes.data || []);
      if (shopsRes.success) {
        setShops(shopsRes.data || []);
        if (adminUser?.shopId) {
          const myShop = shopsRes.data?.find((s: any) => s.id === adminUser.shopId);
          if (myShop?.defaultKioskId) {
            setDefaultKioskId(myShop.defaultKioskId);
          }
        }
      }
      if (pricingRes.success) setPricingRules(pricingRes.data || []);
      if (logsRes.success) setAuditLogs(logsRes.data || []);
    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery, selectedShopId, adminUser, getHeaders]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    const socket = io(getApiUrl(), { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsLiveConnected(true);
      socket.emit('join_admin');
    });

    socket.on('disconnect', () => setIsLiveConnected(false));
    socket.on('job_updated', () => fetchData());
    socket.on('job_update', () => fetchData());

    return () => {
      socket.disconnect();
    };
  }, [fetchData]);

  // ── Authentication Actions ──
  const handleLogin = async (e?: React.FormEvent, directEmail?: string, directPassword?: string) => {
    if (e) e.preventDefault();
    const emailToUse = directEmail || loginEmail;
    const passwordToUse = directPassword || loginPassword;
    if (!emailToUse || !passwordToUse) return;

    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailToUse, password: passwordToUse }),
      });
      const data = await res.json();
      if (data.success && data.token && data.user) {
        localStorage.setItem('xpos_admin_token', data.token);
        localStorage.setItem('xpos_admin_user', JSON.stringify(data.user));
        setToken(data.token);
        setAdminUser(data.user);
        setIsLoggedIn(true);
        if (data.user.role === 'SHOP_ADMIN' && data.user.shopId) {
          setSelectedShopId(data.user.shopId);
        }
        if (data.user.defaultKioskId) {
          setDefaultKioskId(data.user.defaultKioskId);
        }
        showToast(`Welcome back, ${data.user.name}!`);
      } else {
        setLoginError(data.error || 'Invalid credentials');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Network connection failed');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('xpos_admin_token');
    localStorage.removeItem('xpos_admin_user');
    setToken(null);
    setAdminUser(null);
    setIsLoggedIn(false);
    setSelectedShopId('ALL');
    showToast('Logged out successfully');
  };

  // ── ⚡ 1-Click Print Dispatch Action ──
  const handle1ClickPrint = async (jobId: string, displayId: string) => {
    setActionLoading(`print-${jobId}`);
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/jobs/${jobId}/print-now`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          kioskId: defaultKioskId || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || `⚡ Job ${displayId} dispatched to kiosk!`);
        fetchData();
      } else {
        showToast(data.error || 'Failed to dispatch print job', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Network error', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // ── Change Default Kiosk / Printer Station ──
  const handleSetDefaultKiosk = async (kioskDisplayId: string) => {
    const activeShopId = adminUser?.shopId || (selectedShopId !== 'ALL' ? selectedShopId : shops[0]?.id);
    if (!activeShopId) {
      setDefaultKioskId(kioskDisplayId);
      showToast(`Default station set to ${kioskDisplayId}`);
      setShowDefaultPrinterModal(false);
      return;
    }
    setActionLoading(`default-kiosk-${kioskDisplayId}`);
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/shops/${activeShopId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ defaultKioskId: kioskDisplayId }),
      });
      const data = await res.json();
      if (data.success) {
        setDefaultKioskId(kioskDisplayId);
        showToast(`Default printer set to ${kioskDisplayId}!`);
        setShowDefaultPrinterModal(false);
        fetchData();
      } else {
        showToast(data.error || 'Failed to update default printer', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Network error', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // ── Create New Shop ──
  const handleCreateShop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShopName || !newShopCode) return;
    setActionLoading('create-shop');
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/shops`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          name: newShopName,
          code: newShopCode,
          address: newShopAddress,
          phone: newShopPhone,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Shop ${newShopName} created successfully!`);
        setShowAddShopModal(false);
        setNewShopName('');
        setNewShopCode('');
        setNewShopAddress('');
        setNewShopPhone('');
        fetchData();
      } else {
        showToast(data.error || 'Failed to create shop', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Network error', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // ── Create New Admin User ──
  const handleCreateAdminUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail || !newUserPassword || !newUserName) return;
    setActionLoading('create-user');
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/users`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          email: newUserEmail,
          password: newUserPassword,
          name: newUserName,
          role: newUserRole,
          shopId: newUserRole === 'SUPER_ADMIN' ? undefined : (newUserShopId || undefined),
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`User ${newUserEmail} created successfully!`);
        setShowAddUserModal(false);
        setNewUserEmail('');
        setNewUserName('');
        setNewUserPassword('');
        fetchData();
      } else {
        showToast(data.error || 'Failed to create user', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Network error', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // ── Action Handlers ──
  const handleCancelJob = async (jobId: string) => {
    if (!confirm('Cancel this print job and deactivate its 6-digit release code? The customer will be informed immediately.')) return;
    setActionLoading(jobId);
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/jobs/${jobId}/cancel`, {
        method: 'POST',
        headers: getHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Job cancelled successfully');
        fetchData();
        setSelectedJob(null);
      } else {
        showToast(data.error || 'Failed to cancel job', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Network error', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestoreJob = async (jobId: string, displayId: string) => {
    setActionLoading(`restore-${jobId}`);
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/jobs/${jobId}/restore`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(`Job ${displayId} restored to active queue!`);
        fetchData();
        setSelectedJob(null);
      } else {
        showToast(data.error || 'Failed to restore job', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Network error', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleExtendCode = async (code: string) => {
    setActionLoading(code);
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/codes/${code}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours: 24 }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Code ${code} extended by +24 Hours`);
        fetchData();
      } else {
        showToast(data.error || 'Failed to extend code', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Network error', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteJob = async (jobId: string, displayId: string) => {
    if (!confirm(`Are you sure you want to permanently delete job ${displayId}?`)) return;
    setActionLoading(`delete-${jobId}`);
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/jobs/${jobId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast(`Job ${displayId} permanently deleted`);
        fetchData();
        setSelectedJob(null);
      } else {
        showToast(data.error || 'Failed to delete job', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Network error', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleKioskStatus = async (kioskId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'MAINTENANCE' : 'ACTIVE';
    setActionLoading(kioskId);
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/kiosks/${kioskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Kiosk status set to ${nextStatus}`);
        fetchData();
      } else {
        showToast(data.error || 'Failed to update kiosk status', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Network error', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRebootKiosk = async (kioskId: string, displayId: string) => {
    if (!confirm(`Send remote reboot signal to Station ${displayId}?`)) return;
    setActionLoading(kioskId);
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/kiosks/${kioskId}/reboot`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(`Reboot signal sent to Station ${displayId}`);
      } else {
        showToast(data.error || 'Failed to reboot kiosk', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Network error', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddKiosk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKioskDisplayId.trim()) return;
    setActionLoading('add-kiosk');
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/kiosks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayId: newKioskDisplayId.trim().toUpperCase(),
          name: newKioskName.trim() || `XPOS Station ${newKioskDisplayId.trim().toUpperCase()}`,
          location: newKioskLocation.trim() || 'Main Campus',
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Kiosk ${newKioskDisplayId.toUpperCase()} registered!`);
        setShowAddKioskModal(false);
        setNewKioskDisplayId('');
        setNewKioskName('');
        setNewKioskLocation('');
        fetchData();
      } else {
        showToast(data.error || 'Failed to add kiosk', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Network error', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdatePrice = async (paperSize: string, colorMode: string, newPrice: number) => {
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/pricing`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paperSize, colorMode, pricePerPage: newPrice }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Price updated to ₹${newPrice}/page`);
        fetchData();
      } else {
        showToast(data.error || 'Failed to update pricing', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Network error', 'error');
    }
  };

  const handleEmergencyFlush = async () => {
    setActionLoading('emergency-flush');
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/queue/flush`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'All print queues flushed!', 'success');
        setShowEmergencyModal(false);
        fetchData();
      } else {
        showToast(data.error || 'Failed to flush queue', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Network error', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const exportJobsCSV = () => {
    if (jobs.length === 0) return;
    const headers = ['Display ID', 'Status', 'File Name', 'Pages', 'Price (INR)', 'Code', 'Created At', 'Completed At'];
    const rows = jobs.map(j => [
      j.displayId,
      j.status,
      `"${j.fileName.replace(/"/g, '""')}"`,
      j.totalPages,
      j.totalPrice,
      j.printCode || 'N/A',
      j.createdAt,
      j.completedAt || 'In Queue',
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `XPOS_Jobs_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> COMPLETED</span>;
      case 'PRINTING':
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-sky-50 text-sky-700 border border-sky-300 animate-pulse shadow-sm"><Printer className="w-3.5 h-3.5 text-sky-600" /> PRINTING</span>;
      case 'QUEUED':
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-50 text-amber-700 border border-amber-300 shadow-sm"><Clock className="w-3.5 h-3.5 text-amber-600" /> CODE ACTIVE</span>;
      case 'CANCELLED':
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-rose-50 text-rose-700 border border-rose-200"><Ban className="w-3.5 h-3.5 text-rose-500" /> CANCELLED</span>;
      case 'FAILED':
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-rose-50 text-rose-700 border border-rose-200"><XCircle className="w-3.5 h-3.5 text-rose-600" /> FAILED</span>;
      default:
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-slate-100 text-slate-700">{status}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-sky-50/40 to-blue-50/30 text-slate-800 font-sans antialiased selection:bg-sky-500 selection:text-white flex">
      {/* ── DESKTOP SLEEK SIDEBAR ── */}
      <aside className="w-64 bg-white/80 backdrop-blur-2xl border-r border-sky-100/80 p-5 flex flex-col justify-between hidden lg:flex shrink-0 shadow-sm sticky top-0 h-screen z-30">
        <div className="space-y-6">
          {/* Logo & Brand Header */}
          <div className="flex items-center gap-3 px-2 py-1">
            <img src="/printbro_logo.png" alt="PrintBro" className="h-10 object-contain" />
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            {[
              { id: 'overview', label: 'Dashboard Overview', icon: LayoutDashboard },
              { id: 'jobs', label: 'Live Print Queue & Codes', icon: Printer },
              { id: 'kiosks', label: 'Kiosk Fleet & Hardware', icon: Radio },
              ...(adminUser?.role === 'SUPER_ADMIN' ? [{ id: 'shops', label: 'Shops & Stations', icon: Store }] : []),
              { id: 'pricing', label: 'Pricing Matrix Engine', icon: DollarSign },
              { id: 'logs', label: 'Audit Trail & Telemetry', icon: Activity },
            ].map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-xs transition-all ${
                    isActive
                      ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/30'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-sky-50/80'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer / User Profile & Pulse */}
        <div className="space-y-3">
          <div className="bg-sky-50/70 border border-sky-100 p-3.5 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-600 to-blue-500 text-white font-black text-xs flex items-center justify-center shadow-sm shrink-0">
                  {adminUser?.name?.charAt(0) || 'A'}
                </div>
                <div className="overflow-hidden">
                  <div className="text-xs font-bold text-slate-800 truncate">{adminUser?.name || 'Administrator'}</div>
                  <div className="text-[10px] font-black uppercase text-sky-600 flex items-center gap-1">
                    {adminUser?.role === 'SUPER_ADMIN' ? '👑 Fleet Super Admin' : '🏪 Shop Admin'}
                  </div>
                </div>
              </div>

              {isLoggedIn ? (
                <button
                  onClick={handleLogout}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all shrink-0"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => setIsLoggedIn(false)}
                  className="text-[11px] font-bold text-sky-600 hover:underline shrink-0"
                >
                  Sign In
                </button>
              )}
            </div>

            {adminUser?.role === 'SHOP_ADMIN' && adminUser.shopName && (
              <div className="text-[11px] text-slate-600 font-medium bg-white/80 p-2 rounded-xl border border-sky-100/80 truncate">
                <span className="text-slate-400 font-bold uppercase text-[9px] block">Shop Scope:</span>
                <span className="font-bold text-slate-800 truncate block">{adminUser.shopName}</span>
              </div>
            )}
          </div>

          <div className="bg-white border border-sky-100 p-3 rounded-2xl flex items-center justify-between text-xs shadow-sm">
            <span className="text-slate-500 font-bold text-[11px]">WebSocket</span>
            <span className={`flex items-center gap-1.5 font-bold text-[11px] ${isLiveConnected ? 'text-emerald-600' : 'text-amber-600'}`}>
              <span className={`w-2 h-2 rounded-full ${isLiveConnected ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'}`} />
              {isLiveConnected ? 'Connected' : 'Connecting'}
            </span>
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT AREA (Spacious Desktop First) ── */}
      <div className="flex-1 flex flex-col min-w-0 pb-16">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-sky-100/80 px-6 lg:px-10 py-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
          <div>
            <h1 className="text-xl font-black text-slate-900 capitalize tracking-tight flex items-center gap-2">
              <span>
                {activeTab === 'overview' && 'Executive Fleet Dashboard'}
                {activeTab === 'jobs' && 'Live Print Queue & 6-Digit Codes'}
                {activeTab === 'kiosks' && 'Kiosk Stations & Hardware Fleet'}
                {activeTab === 'shops' && 'Shops & Multi-Station Franchises'}
                {activeTab === 'pricing' && 'Dynamic Pricing Matrix'}
                {activeTab === 'logs' && 'Security & System Audit Trail'}
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              {adminUser?.role === 'SHOP_ADMIN'
                ? `Filtered strictly to ${adminUser.shopName || 'your shop'} jobs and kiosks`
                : 'Fleet-wide control center for all kiosks and franchise shops'}
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Super Admin Shop Filter */}
            {adminUser?.role === 'SUPER_ADMIN' && (
              <div className="flex items-center gap-1.5 bg-white border border-sky-200 px-3 py-1.5 rounded-xl shadow-sm">
                <Store className="w-3.5 h-3.5 text-sky-600" />
                <select
                  value={selectedShopId}
                  onChange={(e) => setSelectedShopId(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                >
                  <option value="ALL">🌐 All Shops (Fleet)</option>
                  {shops.map(s => (
                    <option key={s.id} value={s.id}>
                      🏪 {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Default Kiosk Badge with Quick Switcher */}
            <button
              onClick={() => setShowDefaultPrinterModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 font-bold text-xs shadow-sm transition-all active:scale-95"
              title="Click to change target default printer station for 1-Click Print"
            >
              <Zap className="w-3.5 h-3.5 text-amber-600 fill-current" />
              <span>Default Kiosk: <strong className="font-mono text-amber-900">{defaultKioskId || kiosks[0]?.displayId || 'XPOS-001'}</strong></span>
              <ChevronDown className="w-3 h-3 text-amber-600 ml-0.5" />
            </button>

            {/* Quick Refresh */}
            <button
              onClick={fetchData}
              className="p-2 rounded-xl bg-white hover:bg-sky-50 text-slate-600 border border-sky-100 shadow-sm transition-all active:scale-95"
              title="Refresh Data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {/* Emergency Stop Button */}
            <button
              onClick={() => setShowEmergencyModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-black transition-all active:scale-95 shadow-sm"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
              <span>STOP QUEUE</span>
            </button>
          </div>
        </header>

        {/* ── Toast Notification ── */}
        <AnimatePresence>
          {actionMessage && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`fixed top-20 right-8 z-50 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border text-sm font-bold ${
                actionMessage.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-rose-50 border-rose-300 text-rose-800'
              }`}
            >
              {actionMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertTriangle className="w-5 h-5 text-rose-600" />}
              <span>{actionMessage.text}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Body */}
        <main className="p-6 lg:p-10 max-w-[1700px] w-full mx-auto space-y-8">
          {/* ── METRIC CARDS ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
            {/* Revenue */}
            <div className="bg-white border border-sky-100 p-6 rounded-3xl shadow-xl shadow-sky-950/5 relative overflow-hidden transition-all hover:border-sky-300">
              <div className="flex justify-between items-start mb-4">
                <span className="text-xs font-black uppercase text-slate-400 tracking-wider">Today's Revenue</span>
                <div className="p-3 rounded-2xl bg-sky-50 text-sky-600 border border-sky-100">
                  <DollarSign className="w-5 h-5" />
                </div>
              </div>
              <div className="text-3xl font-black text-slate-900 mb-1">
                ₹{stats?.today.revenue || 0}
              </div>
              <div className="text-xs font-bold text-sky-600 flex items-center gap-1">
                <span>All-Time Total: ₹{stats?.today.allTimeRevenue || 0}</span>
              </div>
              <div className="absolute -bottom-8 -right-8 w-28 h-28 bg-sky-400/10 rounded-full blur-2xl pointer-events-none" />
            </div>

            {/* Active 6-Digit Codes */}
            <div className="bg-white border border-sky-100 p-6 rounded-3xl shadow-xl shadow-sky-950/5 relative overflow-hidden transition-all hover:border-sky-300">
              <div className="flex justify-between items-start mb-4">
                <span className="text-xs font-black uppercase text-slate-400 tracking-wider">Active Release Codes</span>
                <div className="p-3 rounded-2xl bg-amber-50 text-amber-600 border border-amber-100">
                  <Clock className="w-5 h-5" />
                </div>
              </div>
              <div className="text-3xl font-black text-amber-600 mb-1">
                {stats?.today.activeCodes || 0} <span className="text-sm font-bold text-slate-400">Ready</span>
              </div>
              <div className="text-xs font-medium text-slate-400">Active 24h validity for kiosk pickup</div>
              <div className="absolute -bottom-8 -right-8 w-28 h-28 bg-amber-400/10 rounded-full blur-2xl pointer-events-none" />
            </div>

            {/* Total Prints Delivered */}
            <div className="bg-white border border-sky-100 p-6 rounded-3xl shadow-xl shadow-sky-950/5 relative overflow-hidden transition-all hover:border-sky-300">
              <div className="flex justify-between items-start mb-4">
                <span className="text-xs font-black uppercase text-slate-400 tracking-wider">Prints Delivered</span>
                <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                  <FileCheck className="w-5 h-5" />
                </div>
              </div>
              <div className="text-3xl font-black text-emerald-600 mb-1">
                {stats?.today.successful || 0} <span className="text-sm font-bold text-slate-400">({stats?.today.pages || 0} pgs)</span>
              </div>
              <div className="text-xs font-medium text-slate-400">{stats?.today.printJobs || 0} total jobs submitted today</div>
              <div className="absolute -bottom-8 -right-8 w-28 h-28 bg-emerald-400/10 rounded-full blur-2xl pointer-events-none" />
            </div>

            {/* Active Kiosks */}
            <div className="bg-white border border-sky-100 p-6 rounded-3xl shadow-xl shadow-sky-950/5 relative overflow-hidden transition-all hover:border-sky-300">
              <div className="flex justify-between items-start mb-4">
                <span className="text-xs font-black uppercase text-slate-400 tracking-wider">Kiosk Stations Fleet</span>
                <div className="p-3 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100">
                  <Radio className="w-5 h-5" />
                </div>
              </div>
              <div className="text-3xl font-black text-blue-600 mb-1">
                {kiosks.filter(k => k.status === 'ACTIVE').length} / {kiosks.length}
              </div>
              <div className="text-xs font-medium text-slate-400">Hardware Touchpoints Active</div>
              <div className="absolute -bottom-8 -right-8 w-28 h-28 bg-blue-400/10 rounded-full blur-2xl pointer-events-none" />
            </div>
          </div>

          {/* ── TAB 1 & 2: JOBS & CODES MANAGEMENT ── */}
          {(activeTab === 'overview' || activeTab === 'jobs') && (
            <div className="space-y-4">
              {/* Action Toolbar */}
              <div className="bg-white border border-sky-100 p-4 rounded-3xl shadow-sm flex flex-wrap items-center justify-between gap-4">
                <div className="relative flex-1 min-w-[280px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search by Job ID (XP-000001), Document Name, or 6-Digit Code..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 text-xs md:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white transition-all"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-slate-400">Filter:</span>
                  {['ALL', 'QUEUED', 'PRINTING', 'COMPLETED', 'CANCELLED'].map(st => (
                    <button
                      key={st}
                      onClick={() => setStatusFilter(st)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all ${
                        statusFilter === st
                          ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {st}
                    </button>
                  ))}

                  <button
                    onClick={exportJobsCSV}
                    className="flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-sky-50 text-slate-700 border border-sky-200 rounded-xl text-xs font-bold transition-all ml-2 active:scale-95 shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5 text-sky-600" />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>

              {/* Data Table */}
              <div className="bg-white border border-sky-100 rounded-3xl overflow-hidden shadow-xl shadow-sky-950/5">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs md:text-sm">
                    <thead className="bg-sky-50/60 text-slate-600 font-bold border-b border-sky-100 text-[11px] uppercase tracking-wider">
                      <tr>
                        <th className="p-4">Job ID / File</th>
                        <th className="p-4">6-Digit Code & Expiry</th>
                        <th className="p-4">Specs & Amount</th>
                        <th className="p-4">Status</th>
                        <th className="p-4">Exact Timeline</th>
                        <th className="p-4 text-right">Super Admin Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sky-100/80">
                      {loading ? (
                        <tr>
                          <td colSpan={6} className="p-12 text-center text-slate-400">
                            <Loader2 className="w-8 h-8 animate-spin mx-auto text-sky-500 mb-2" />
                            <span>Loading print queue & live codes...</span>
                          </td>
                        </tr>
                      ) : jobs.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-12 text-center text-slate-400">
                            No print jobs found matching filters.
                          </td>
                        </tr>
                      ) : (
                        jobs.map(job => (
                          <tr key={job.id} className="hover:bg-sky-50/40 transition-colors">
                            {/* Job ID & File */}
                            <td className="p-4">
                              <div className="font-mono font-black text-slate-900 text-sm">{job.displayId}</div>
                              <div className="text-slate-500 text-xs truncate max-w-[200px] font-medium" title={job.fileName}>
                                {job.fileName}
                              </div>
                            </td>

                            {/* 6-Digit Code & Live Remaining Time */}
                            <td className="p-4">
                              {job.printCode ? (
                                <div className="space-y-1">
                                  <span className="font-mono font-black text-base text-amber-700 bg-amber-50 px-3 py-1 rounded-xl border border-amber-200 shadow-sm inline-block">
                                    {job.printCode}
                                  </span>
                                  {job.status === 'QUEUED' && (
                                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-sky-600">
                                      <Clock className="w-3 h-3 animate-spin text-sky-500" />
                                      <span>{getRemainingCountdown(job.printCodeExpiresAt)}</span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">None</span>
                              )}
                            </td>

                            {/* Specs & Price */}
                            <td className="p-4">
                              <div className="font-black text-slate-900 text-sm">₹{job.totalPrice}</div>
                              <div className="text-slate-500 text-xs">{job.totalPages} pgs • {job.colorMode} ({job.copies} copy)</div>
                            </td>

                            {/* Status */}
                            <td className="p-4">
                              {getStatusBadge(job.status)}
                            </td>

                            {/* Exact Timeline (Created & Completed Timestamps) */}
                            <td className="p-4 text-xs font-mono space-y-1">
                              <div className="text-slate-700">
                                <span className="text-slate-400 font-bold uppercase text-[10px]">Created: </span>
                                {new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} ({new Date(job.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })})
                              </div>
                              {job.completedAt ? (
                                <div className="text-emerald-700 font-bold">
                                  <span className="text-emerald-500 font-bold uppercase text-[10px]">Printed: </span>
                                  {new Date(job.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </div>
                              ) : (
                                <div className="text-slate-400 italic text-[11px]">
                                  {job.status === 'CANCELLED' ? 'Deactivated' : 'In Queue / Awaiting Kiosk'}
                                </div>
                              )}
                            </td>

                            {/* Actions Column with Restore, Cancel, Extend, Delete */}
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                {/* ⚡ 1-CLICK PRINT NOW BUTTON */}
                                {(job.status === 'QUEUED' || job.status === 'PAID') && job.printCode && (
                                  <button
                                    onClick={() => handle1ClickPrint(job.id, job.displayId)}
                                    disabled={actionLoading === `print-${job.id}`}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-black text-xs shadow-md shadow-amber-500/20 active:scale-95 transition-all"
                                    title={`⚡ 1-Click Print — Dispatch directly to ${defaultKioskId || 'Kiosk'}`}
                                  >
                                    {actionLoading === `print-${job.id}` ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Zap className="w-3.5 h-3.5 fill-current text-white" />
                                    )}
                                    <span>⚡ Print Now</span>
                                  </button>
                                )}

                                {/* Inspect */}
                                <button
                                  onClick={() => setSelectedJob(job)}
                                  className="p-2 rounded-xl bg-slate-100 hover:bg-sky-100 text-sky-700 transition-all shadow-sm"
                                  title="Inspect Job Details"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>

                                {/* 🔄 Restore / Reactivate Cancelled Job */}
                                {job.status === 'CANCELLED' && (
                                  <button
                                    onClick={() => handleRestoreJob(job.id, job.displayId)}
                                    disabled={actionLoading === `restore-${job.id}`}
                                    className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-all active:scale-95 shadow-sm"
                                    title="Restore / Reactivate Job & Code"
                                  >
                                    {actionLoading === `restore-${job.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                                  </button>
                                )}

                                {/* ⏳ Extend 6-digit Code (+24 Hours) */}
                                {job.printCode && job.status === 'QUEUED' && (
                                  <button
                                    onClick={() => handleExtendCode(job.printCode!)}
                                    disabled={actionLoading === job.printCode}
                                    className="p-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition-all active:scale-95 shadow-sm"
                                    title="Add +24 Hours to Code"
                                  >
                                    <Clock className="w-4 h-4" />
                                  </button>
                                )}

                                {/* 🚫 Stop / Cancel Active Job */}
                                {job.status !== 'COMPLETED' && job.status !== 'CANCELLED' && (
                                  <button
                                    onClick={() => handleCancelJob(job.id)}
                                    disabled={actionLoading === job.id}
                                    className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-all active:scale-95 shadow-sm"
                                    title="Stop & Cancel Job (Informs Customer)"
                                  >
                                    {actionLoading === job.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                                  </button>
                                )}

                                {/* 🗑️ Permanent Delete Option */}
                                <button
                                  onClick={() => handleDeleteJob(job.id, job.displayId)}
                                  disabled={actionLoading === `delete-${job.id}`}
                                  className="p-2 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-700 transition-all active:scale-95 shadow-sm"
                                  title="Delete Record Permanently"
                                >
                                  {actionLoading === `delete-${job.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 3: KIOSK FLEET MANAGEMENT ── */}
          {activeTab === 'kiosks' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-900">Kiosk Stations & Hardware Fleet</h2>
                  <p className="text-slate-400 text-xs">Monitor paper trays, toner cartridges, and maintenance status</p>
                </div>
                <button
                  onClick={() => setShowAddKioskModal(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-sky-500 hover:bg-sky-600 text-white rounded-2xl font-bold text-xs md:text-sm shadow-lg shadow-sky-500/25 transition-all active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>Register Kiosk Station</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {kiosks.map(kiosk => (
                  <div
                    key={kiosk.id}
                    className={`bg-white border rounded-3xl p-6 space-y-5 transition-all shadow-xl shadow-sky-950/5 ${
                      kiosk.status === 'ACTIVE' ? 'border-sky-100' : 'border-amber-300 bg-amber-50/20'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-black text-slate-900">{kiosk.displayId}</h3>
                          <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                            kiosk.status === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {kiosk.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{kiosk.name} • {kiosk.location}</p>
                      </div>

                      <div className="p-3 rounded-2xl bg-sky-50 text-sky-600 border border-sky-100">
                        <Printer className="w-6 h-6" />
                      </div>
                    </div>

                    {/* Printer Telemetry */}
                    <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <div>
                        <span className="text-slate-400 font-bold block text-[10px] uppercase">Printer Engine</span>
                        <span className="text-slate-800 font-black truncate block">{kiosk.printerName}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-bold block text-[10px] uppercase">Engine Status</span>
                        <span className="text-emerald-700 font-black flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> {kiosk.printerStatus}
                        </span>
                      </div>
                    </div>

                    {/* Gauges (Paper & Toner) */}
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-xs font-bold mb-1">
                          <span className="text-slate-500">Paper Tray</span>
                          <span className="text-sky-600">{kiosk.paperLevel}%</span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-sky-500 rounded-full" style={{ width: `${kiosk.paperLevel}%` }} />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs font-bold mb-1">
                          <span className="text-slate-500">Toner Cartridge</span>
                          <span className="text-indigo-600">{kiosk.tonerLevel}%</span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${kiosk.tonerLevel}%` }} />
                        </div>
                      </div>
                    </div>

                    {/* Controls */}
                    <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                      <button
                        onClick={() => handleToggleKioskStatus(kiosk.id, kiosk.status)}
                        disabled={actionLoading === kiosk.id}
                        className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-sm ${
                          kiosk.status === 'ACTIVE'
                            ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{kiosk.status === 'ACTIVE' ? 'Set Maintenance' : 'Set Active'}</span>
                      </button>

                      <button
                        onClick={() => handleRebootKiosk(kiosk.id, kiosk.displayId)}
                        disabled={actionLoading === kiosk.id}
                        className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all active:scale-95 shadow-sm"
                        title="Remote Reboot"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── TAB: SHOPS & MULTI-STATION FRANCHISES ── */}
          {activeTab === 'shops' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-slate-900">Shops & Multi-Station Franchises</h2>
                  <p className="text-slate-400 text-xs">Provision shop accounts, assign kiosks, and configure default printers</p>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => setShowAddUserModal(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-sky-50 text-sky-700 border border-sky-200 rounded-2xl font-bold text-xs shadow-sm transition-all active:scale-95"
                  >
                    <Users className="w-4 h-4 text-sky-600" />
                    <span>Create Shop Admin</span>
                  </button>
                  <button
                    onClick={() => setShowAddShopModal(true)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-sky-500 hover:bg-sky-600 text-white rounded-2xl font-bold text-xs shadow-lg shadow-sky-500/25 transition-all active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add New Shop</span>
                  </button>
                </div>
              </div>

              {shops.length === 0 ? (
                <div className="bg-white border border-sky-100 rounded-3xl p-12 text-center text-slate-400 space-y-3">
                  <Store className="w-12 h-12 text-sky-400 mx-auto opacity-50" />
                  <p className="font-bold text-slate-700">No franchise shops configured yet</p>
                  <p className="text-xs">Create your first shop station to enable tenant-scoped operations.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {shops.map(shop => (
                    <div
                      key={shop.id}
                      className="bg-white border border-sky-100 rounded-3xl p-6 space-y-6 shadow-xl shadow-sky-950/5 hover:border-sky-300 transition-all"
                    >
                      {/* Shop Header */}
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-black text-slate-900">{shop.name}</h3>
                            <span className="font-mono text-xs font-black uppercase px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                              {shop.code}
                            </span>
                            <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                              shop.status === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {shop.status}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            {shop.address || shop.location || 'Main Campus Hub'}
                          </p>
                        </div>

                        <div className="p-3 rounded-2xl bg-sky-50 text-sky-600 border border-sky-100">
                          <Store className="w-6 h-6" />
                        </div>
                      </div>

                      {/* Station & Stats Bar */}
                      <div className="grid grid-cols-3 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs">
                        <div>
                          <span className="text-slate-400 font-bold block text-[10px] uppercase">Stations</span>
                          <span className="text-slate-900 font-black text-sm">{shop.kiosks?.length || 0} Kiosks</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-bold block text-[10px] uppercase">Print Jobs</span>
                          <span className="text-slate-900 font-black text-sm">{shop.jobsCount || 0} Served</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-bold block text-[10px] uppercase">Default Kiosk</span>
                          <span className="text-amber-700 font-black text-sm font-mono truncate block">
                            {shop.defaultKioskId || 'Auto (First)'}
                          </span>
                        </div>
                      </div>

                      {/* Assigned Kiosks */}
                      <div className="space-y-2.5">
                        <span className="text-xs font-black uppercase text-slate-400 tracking-wider block">
                          Assigned Stations & Hardware
                        </span>
                        {shop.kiosks && shop.kiosks.length > 0 ? (
                          <div className="space-y-2">
                            {shop.kiosks.map(k => (
                              <div
                                key={k.id}
                                className={`p-3.5 rounded-2xl border flex items-center justify-between text-xs transition-all ${
                                  k.isDefault
                                    ? 'bg-amber-50/50 border-amber-300 shadow-sm'
                                    : 'bg-white border-slate-200 hover:border-sky-200'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`p-2 rounded-xl ${k.isDefault ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                    <Printer className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono font-black text-slate-900 text-sm">{k.displayId}</span>
                                      {k.isDefault && (
                                        <span className="bg-amber-500 text-white font-black text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                                          <Zap className="w-2.5 h-2.5 fill-current" />
                                          Default Printer
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-slate-500 text-[11px]">{k.name} • {k.location}</div>
                                  </div>
                                </div>

                                {!k.isDefault && (
                                  <button
                                    onClick={() => handleSetDefaultKiosk(k.displayId)}
                                    disabled={actionLoading === `default-kiosk-${k.displayId}`}
                                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300 border border-slate-200 text-slate-600 font-bold text-xs transition-all active:scale-95"
                                  >
                                    Set Default
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-400 italic p-3 bg-slate-50 rounded-xl">
                            No kiosks assigned yet. Register a kiosk with this shop's ID.
                          </div>
                        )}
                      </div>

                      {/* Assigned Admins */}
                      <div className="space-y-2.5 pt-2 border-t border-slate-100">
                        <span className="text-xs font-black uppercase text-slate-400 tracking-wider block">
                          Shop Admins ({shop.admins?.length || 0})
                        </span>
                        {shop.admins && shop.admins.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {shop.admins.map(a => (
                              <div
                                key={a.id}
                                className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700"
                              >
                                <Key className="w-3 h-3 text-slate-400" />
                                <span>{a.name} ({a.email})</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic">No shop admin account provisioned yet.</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── TAB 4: DYNAMIC PRICING MATRIX ── */}
          {activeTab === 'pricing' && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="bg-white border border-sky-100 p-8 rounded-3xl space-y-6 shadow-xl shadow-sky-950/5">
                <div>
                  <h2 className="text-xl font-black text-slate-900">Dynamic Pricing Matrix</h2>
                  <p className="text-slate-400 text-xs mt-1">
                    Set per-page printing fees. New prices apply immediately across all kiosks and customer mobile phones.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Black & White A4 */}
                  <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-slate-800 text-white flex items-center justify-center font-black text-sm shadow-md">
                        B&W
                      </div>
                      <div>
                        <h4 className="font-black text-slate-900 text-base">Black & White (A4)</h4>
                        <p className="text-xs text-slate-400">Standard monochrome print</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-lg font-black text-slate-400">₹</span>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        defaultValue={pricingRules.find(r => r.colorMode === 'BW')?.pricePerPage || 2}
                        onBlur={(e) => handleUpdatePrice('A4', 'BW', Number(e.target.value))}
                        className="w-20 bg-white border border-sky-500 rounded-xl px-3 py-2 text-center text-lg font-black text-slate-900 focus:outline-none shadow-sm"
                      />
                      <span className="text-xs text-slate-400 font-bold">/ page</span>
                    </div>
                  </div>

                  {/* Color A4 */}
                  <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-500 to-sky-500 text-white flex items-center justify-center font-black text-sm shadow-md">
                        CLR
                      </div>
                      <div>
                        <h4 className="font-black text-slate-900 text-base">Full Color (A4)</h4>
                        <p className="text-xs text-slate-400">High-resolution vibrant color print</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-lg font-black text-slate-400">₹</span>
                      <input
                        type="number"
                        min="1"
                        max="200"
                        defaultValue={pricingRules.find(r => r.colorMode === 'COLOR')?.pricePerPage || 10}
                        onBlur={(e) => handleUpdatePrice('A4', 'COLOR', Number(e.target.value))}
                        className="w-20 bg-white border border-sky-500 rounded-xl px-3 py-2 text-center text-lg font-black text-slate-900 focus:outline-none shadow-sm"
                      />
                      <span className="text-xs text-slate-400 font-bold">/ page</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 5: AUDIT LOGS ── */}
          {activeTab === 'logs' && (
            <div className="bg-white border border-sky-100 rounded-3xl p-8 shadow-xl shadow-sky-950/5 space-y-4">
              <h2 className="text-lg font-black text-slate-900">System & Security Audit Trail</h2>
              <div className="divide-y divide-slate-100">
                {auditLogs.length === 0 ? (
                  <p className="text-slate-400 text-xs py-8 text-center">No recent audit events logged.</p>
                ) : (
                  auditLogs.map((log: any) => (
                    <div key={log.id} className="py-3.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-black text-sky-700 uppercase bg-sky-50 px-3 py-1 rounded-md border border-sky-200">
                          {log.action}
                        </span>
                        <span className="text-slate-700 font-semibold">{log.entityType} ({log.entityId || 'Global'})</span>
                      </div>
                      <span className="text-slate-400 font-mono">
                        {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── MODAL: INSPECT JOB DETAILS & REAL-TIME CONTROLS ── */}
      <AnimatePresence>
        {selectedJob && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-sky-100 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl"
            >
              <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-lg font-black text-slate-900">{selectedJob.displayId}</h3>
                  <p className="text-xs text-slate-400">Detailed Print Job Telemetry & Timing</p>
                </div>
                <button
                  onClick={() => setSelectedJob(null)}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  <span className="text-slate-400 font-bold">Document Name</span>
                  <span className="text-slate-900 font-black">{selectedJob.fileName}</span>
                </div>
                <div className="flex justify-between bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  <span className="text-slate-400 font-bold">6-Digit Release Code</span>
                  <div className="text-right">
                    <span className="text-amber-700 font-mono font-black text-sm block">{selectedJob.printCode || 'None'}</span>
                    {selectedJob.status === 'QUEUED' && (
                      <span className="text-[11px] text-sky-600 font-bold">
                        {getRemainingCountdown(selectedJob.printCodeExpiresAt)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex justify-between bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  <span className="text-slate-400 font-bold">Created Timestamp</span>
                  <span className="text-slate-900 font-mono font-bold">
                    {new Date(selectedJob.createdAt).toLocaleString()}
                  </span>
                </div>
                {selectedJob.completedAt && (
                  <div className="flex justify-between bg-emerald-50 p-3.5 rounded-xl border border-emerald-100">
                    <span className="text-emerald-700 font-bold">Completed / Printed Timestamp</span>
                    <span className="text-emerald-950 font-mono font-bold">
                      {new Date(selectedJob.completedAt).toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="flex justify-between bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  <span className="text-slate-400 font-bold">Total Pages / Amount</span>
                  <span className="text-slate-900 font-bold">{selectedJob.totalPages} pages • ₹{selectedJob.totalPrice} ({selectedJob.paymentStatus || 'PAID'})</span>
                </div>
              </div>

              <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* 🔄 Restore / Reactivate Cancelled Job */}
                {selectedJob.status === 'CANCELLED' && (
                  <button
                    onClick={() => handleRestoreJob(selectedJob.id, selectedJob.displayId)}
                    className="py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 active:scale-95 shadow-md shadow-emerald-500/20"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restore Job to Normal</span>
                  </button>
                )}

                {/* ⏳ Extend Code (+24h) */}
                {selectedJob.printCode && selectedJob.status === 'QUEUED' && (
                  <button
                    onClick={() => handleExtendCode(selectedJob.printCode!)}
                    className="py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 active:scale-95 shadow-sm"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Extend Code (+24h)</span>
                  </button>
                )}

                {/* 🚫 Stop Job */}
                {selectedJob.status !== 'COMPLETED' && selectedJob.status !== 'CANCELLED' && (
                  <button
                    onClick={() => handleCancelJob(selectedJob.id)}
                    className="py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold text-xs transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-md shadow-rose-500/20"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Stop & Cancel Job</span>
                  </button>
                )}

                {/* 🗑️ Delete Record */}
                <button
                  onClick={() => handleDeleteJob(selectedJob.id, selectedJob.displayId)}
                  className="py-2.5 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 rounded-xl font-bold text-xs transition-all active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Record</span>
                </button>

                <button
                  onClick={() => setSelectedJob(null)}
                  className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL: ADD KIOSK STATION ── */}
      <AnimatePresence>
        {showAddKioskModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-sky-100 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl"
            >
              <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-lg font-black text-slate-900">Register Kiosk Station</h3>
                  <p className="text-xs text-slate-400">Add physical touchpoint to cloud fleet</p>
                </div>
                <button
                  onClick={() => setShowAddKioskModal(false)}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddKiosk} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Kiosk ID (e.g. XPOS-002)</label>
                  <input
                    type="text"
                    required
                    placeholder="XPOS-002"
                    value={newKioskDisplayId}
                    onChange={(e) => setNewKioskDisplayId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-mono font-bold focus:outline-none focus:border-sky-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Station Name</label>
                  <input
                    type="text"
                    placeholder="Library Lobby Kiosk"
                    value={newKioskName}
                    onChange={(e) => setNewKioskName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Physical Location</label>
                  <input
                    type="text"
                    placeholder="Building B, Floor 1"
                    value={newKioskLocation}
                    onChange={(e) => setNewKioskLocation(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white"
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="submit"
                    disabled={actionLoading === 'add-kiosk'}
                    className="w-full py-3 bg-sky-500 hover:bg-sky-600 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 active:scale-95 shadow-md shadow-sky-500/20"
                  >
                    {actionLoading === 'add-kiosk' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    <span>Save & Register Kiosk</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddKioskModal(false)}
                    className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL: EMERGENCY STOP & FLUSH QUEUE ── */}
      <AnimatePresence>
        {showEmergencyModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-rose-200 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-rose-700">EMERGENCY FLUSH</h3>
                  <p className="text-xs text-slate-400">Halt all active printing jobs immediately</p>
                </div>
              </div>

              <p className="text-slate-600 text-xs leading-relaxed">
                This will immediately cancel all queued and in-progress print jobs across all kiosks and invalidate all active release codes. Use in case of paper jams, hardware emergencies, or maintenance shutdowns.
              </p>

              <div className="pt-2 flex gap-3">
                <button
                  onClick={handleEmergencyFlush}
                  disabled={actionLoading === 'emergency-flush'}
                  className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-xs transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-rose-600/25"
                >
                  {actionLoading === 'emergency-flush' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  <span>CONFIRM FLUSH ALL JOBS</span>
                </button>
                <button
                  onClick={() => setShowEmergencyModal(false)}
                  className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL: CHANGE DEFAULT PRINTER / STATION ── */}
      <AnimatePresence>
        {showDefaultPrinterModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-sky-100 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl"
            >
              <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 border border-sky-100 flex items-center justify-center">
                    <Printer className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Default Station Printer</h3>
                    <p className="text-xs text-slate-400">Select target kiosk for 1-click &quot;⚡ Print Now&quot; dispatches</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDefaultPrinterModal(false)}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {kiosks.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400">No kiosks found in this shop.</div>
                ) : (
                  kiosks.map((k) => {
                    const isCurrent = defaultKioskId === k.displayId || k.isDefault;
                    return (
                      <div
                        key={k.id}
                        className={`p-4 rounded-2xl border transition-all flex items-center justify-between ${
                          isCurrent
                            ? 'bg-sky-50/80 border-sky-300 ring-2 ring-sky-500/20'
                            : 'bg-white border-slate-200/80 hover:border-sky-200 hover:bg-slate-50/50'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-sm text-slate-900">{k.displayId}</span>
                            {isCurrent && (
                              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-sky-500 text-white">
                                Active Default
                              </span>
                            )}
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                k.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {k.status}
                            </span>
                          </div>
                          <div className="text-xs text-slate-600 font-medium">{k.name}</div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            <span>{k.location || 'Main Counter'}</span>
                            {k.shopName && <span className="text-slate-300">• {k.shopName}</span>}
                          </div>
                        </div>

                        <div>
                          {isCurrent ? (
                            <div className="text-sky-600 font-black text-xs flex items-center gap-1 px-3 py-1.5 rounded-xl bg-sky-100/60">
                              <CheckCircle2 className="w-4 h-4" /> Selected
                            </div>
                          ) : (
                            <button
                              onClick={() => handleSetDefaultKiosk(k.displayId)}
                              disabled={actionLoading === `default-kiosk-${k.displayId}`}
                              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-sky-600 text-white transition-all active:scale-95 flex items-center gap-1.5 shadow-sm"
                            >
                              {actionLoading === `default-kiosk-${k.displayId}` ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Zap className="w-3.5 h-3.5 text-amber-300" />
                              )}
                              <span>Set as Default</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setShowDefaultPrinterModal(false)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL: CREATE NEW SHOP HUB ── */}
      <AnimatePresence>
        {showAddShopModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-sky-100 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl"
            >
              <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 border border-sky-100 flex items-center justify-center">
                    <Store className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Provision New Shop Hub</h3>
                    <p className="text-xs text-slate-400">Register print station location in the cloud fleet</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAddShopModal(false)}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateShop} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Shop Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. North Campus Library Hub"
                    value={newShopName}
                    onChange={(e) => setNewShopName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Shop Code (Unique Identifier) *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SHOP-NORTH"
                    value={newShopCode}
                    onChange={(e) => setNewShopCode(e.target.value.toUpperCase())}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 font-mono font-bold text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Physical Address / Campus Building</label>
                  <input
                    type="text"
                    placeholder="e.g. Student Center, Level 1"
                    value={newShopAddress}
                    onChange={(e) => setNewShopAddress(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Contact Phone</label>
                  <input
                    type="text"
                    placeholder="e.g. +91 9876543210"
                    value={newShopPhone}
                    onChange={(e) => setNewShopPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white"
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="submit"
                    disabled={actionLoading === 'create-shop'}
                    className="w-full py-3 bg-sky-500 hover:bg-sky-600 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 active:scale-95 shadow-md shadow-sky-500/20"
                  >
                    {actionLoading === 'create-shop' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    <span>Create Shop Hub</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddShopModal(false)}
                    className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL: CREATE ADMIN USER ── */}
      <AnimatePresence>
        {showAddUserModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-sky-100 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl"
            >
              <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 border border-sky-100 flex items-center justify-center">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Provision Admin Account</h3>
                    <p className="text-xs text-slate-400">Configure credentials & shop access privileges</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAddUserModal(false)}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateAdminUser} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Kumar"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Email Address (Login) *</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. ramesh@xpos.app"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Password *</label>
                  <input
                    type="password"
                    required
                    placeholder="Minimum 6 characters"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Role Privileges *</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewUserRole('SHOP_ADMIN')}
                      className={`p-2.5 rounded-xl border text-center font-bold transition-all ${
                        newUserRole === 'SHOP_ADMIN'
                          ? 'bg-sky-50 border-sky-400 text-sky-700'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      🏪 Shop Admin
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewUserRole('SUPER_ADMIN')}
                      className={`p-2.5 rounded-xl border text-center font-bold transition-all ${
                        newUserRole === 'SUPER_ADMIN'
                          ? 'bg-sky-50 border-sky-400 text-sky-700'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      👑 Super Admin
                    </button>
                  </div>
                </div>

                {newUserRole === 'SHOP_ADMIN' && (
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">Assign to Shop Hub *</label>
                    <select
                      value={newUserShopId}
                      onChange={(e) => setNewUserShopId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-bold focus:outline-none focus:border-sky-500 focus:bg-white"
                    >
                      <option value="">Select a shop...</option>
                      {shops.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="pt-2 flex gap-3">
                  <button
                    type="submit"
                    disabled={actionLoading === 'create-user'}
                    className="w-full py-3 bg-sky-500 hover:bg-sky-600 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 active:scale-95 shadow-md shadow-sky-500/20"
                  >
                    {actionLoading === 'create-user' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    <span>Save Account</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddUserModal(false)}
                    className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL: AUTHENTICATION / LOGIN OVERLAY ── */}
      <AnimatePresence>
        {!isLoggedIn && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 15 }}
              className="bg-white border border-sky-100 rounded-3xl max-w-md w-full p-8 space-y-6 shadow-2xl relative overflow-hidden"
            >
              <div className="text-center space-y-2">
                <div className="inline-flex p-3 rounded-2xl bg-sky-50 border border-sky-100 mb-1">
                  <img src="/printbro_logo.png" alt="PrintBro" className="h-9 object-contain" />
                </div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Admin Console Login</h2>
                <p className="text-xs text-slate-500">Sign in with your Fleet Super Admin or Shop Admin account</p>
              </div>

              {loginError && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{loginError}</span>
                </div>
              )}

              <form onSubmit={(e) => handleLogin(e)} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-700 font-bold mb-1.5">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="admin@xpos.app"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-medium focus:outline-none focus:border-sky-500 focus:bg-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1.5">Password</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-medium focus:outline-none focus:border-sky-500 focus:bg-white text-sm"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loginLoading}
                  className="w-full py-3.5 bg-sky-500 hover:bg-sky-600 text-white rounded-xl font-black text-sm transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-sky-500/25"
                >
                  {loginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  <span>Sign In to Dashboard</span>
                </button>
              </form>

              {/* Quick Login Helpers for testing/demo */}
              <div className="pt-4 border-t border-slate-100 space-y-2">
                <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 text-center">
                  Quick Demo Accounts
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setLoginEmail('admin@xpos.app');
                      setLoginPassword('admin123');
                      handleLogin(undefined, 'admin@xpos.app', 'admin123');
                    }}
                    className="p-2.5 rounded-xl border border-sky-200 bg-sky-50/60 hover:bg-sky-100/80 text-sky-800 text-left transition-all text-[11px]"
                  >
                    <div className="font-bold flex items-center gap-1">👑 Super Admin</div>
                    <div className="text-[10px] text-slate-500 font-mono truncate">admin@xpos.app</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setLoginEmail('shopadmin@xpos.app');
                      setLoginPassword('shop123');
                      handleLogin(undefined, 'shopadmin@xpos.app', 'shop123');
                    }}
                    className="p-2.5 rounded-xl border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-100/80 text-emerald-800 text-left transition-all text-[11px]"
                  >
                    <div className="font-bold flex items-center gap-1">🏪 Shop Admin</div>
                    <div className="text-[10px] text-slate-500 font-mono truncate">shopadmin@xpos.app</div>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

