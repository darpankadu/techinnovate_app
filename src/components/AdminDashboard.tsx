import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Fuel, Video, Camera, Receipt, Gauge,
  MapPin, AlertTriangle, CheckCircle2,
  Car, Users, BarChart3, Shield,
  LogOut, Plus, Trash2, X, Play,
  Pause, RotateCcw, Check, Globe, Upload
} from 'lucide-react'
import { storage, calculateDistance } from '../lib/storage'
import { firestoreSync } from '../lib/firestoreSync'
import { t } from '../lib/translations'
import type { Language, Role, Driver, Owner, Vehicle, Fill, Alert, CameraCapture, CreditAction, PaymentEntry, AuditLog, Notification } from '../lib/types'
import { CameraModal } from './CameraModal'

type View = 'welcome' | 'driver-login' | 'owner-login' | 'owner-register' | 'admin-login' | 'driver-dash' | 'owner-dash' | 'admin-dash' | 'wizard'

const sanitizeInput = (val: string): string => {
  if (typeof val !== 'string') return val
  return val.replace(/<[^>]*>/g, '').trim()
}

export function AdminDashboard({ lang, syncKey, syncStatus, loadData }: { lang: Language; syncKey: number; syncStatus: string; loadData?: () => void }) {
  const [tab, setTab] = useState<string>('dashboard')
  const [expandedOwner, setExpandedOwner] = useState<string | null>(null)
  const [editCredit, setEditCredit] = useState<{id: string; val: string} | null>(null)
  const [editNotes, setEditNotes] = useState<{id: string; val: string} | null>(null)
  const [ownerFilter, setOwnerFilter] = useState<'all' | 'active' | 'blocked'>('all')
  const [ownerSearch, setOwnerSearch] = useState('')
  const [payOwner, setPayOwner] = useState<string | null>(null)
  const [payAmt, setPayAmt] = useState('')
  const [payNote, setPayNote] = useState('')
  const [creditOwner, setCreditOwner] = useState('')
  const [creditType, setCreditType] = useState<'issued' | 'emergency' | 'bonus'>('issued')
  const [creditAmount, setCreditAmount] = useState('')
  const [creditNote, setCreditNote] = useState('')
  const [fraudFilter, setFraudFilter] = useState<'all' | 'active' | 'resolved'>('all')
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread'>('all')
  const [auditFilter, setAuditFilter] = useState('all')
  const [refreshKey, setRefreshKey] = useState(0)

  // Stations tab state
  const [stations, setStations] = useState<Array<{id:string;name:string;city:string;address:string;rate:string;status:'active'|'inactive'}>>(() => {
    try { return JSON.parse(localStorage.getItem('cng_stations') || '[]') } catch { return [] }
  })
  const [showAddStation, setShowAddStation] = useState(false)
  const [newStation, setNewStation] = useState({ name: '', city: '', address: '', rate: '' })

  // Drivers tab state
  const [driverSearch, setDriverSearch] = useState('')
  const [driverFilter, setDriverFilter] = useState<'all' | 'active' | 'blocked'>('all')

  // Load Match tab state
  type LoadListing = { id: string; from: string; to: string; cargo: string; weight: string; rate: string; vehicleType: string; distance: string; available: string; category: string; status: 'active' | 'paused'; createdAt: string }
  type LoadBooking = { id: number; loadId: any; cargo: string; from: string; to: string; weight: string; rate: string; vehicleType: string; distance: string; contactName: string; contactPhone: string; driverId?: string; driverName?: string; time: string; status: string }
  const [loadListings, setLoadListings] = useState<LoadListing[]>(() => {
    try { return JSON.parse(localStorage.getItem('cng_load_listings') || '[]') } catch { return [] }
  })
  const [loadBookings, setLoadBookings] = useState<LoadBooking[]>(() => {
    try { return JSON.parse(localStorage.getItem('cng_load_bookings') || '[]') } catch { return [] }
  })
  const [showAddLoad, setShowAddLoad] = useState(false)
  const [newLoad, setNewLoad] = useState({ from: '', to: '', cargo: '', weight: '', rate: '', vehicleType: '', distance: '', available: 'Today', category: 'Light' })
  const saveLoadListings = (updated: LoadListing[]) => {
    setLoadListings(updated)
    localStorage.setItem('cng_load_listings', JSON.stringify(updated))
  }
  const saveLoadBookings = (updated: LoadBooking[]) => {
    setLoadBookings(updated)
    localStorage.setItem('cng_load_bookings', JSON.stringify(updated))
  }

  // Custom notifications states
  const [customNotifTargetType, setCustomNotifTargetType] = useState<'all' | 'owner' | 'driver' | 'specific_owner' | 'specific_driver'>('all')
  const [customNotifTargetId, setCustomNotifTargetId] = useState('')
  const [customNotifSeverity, setCustomNotifSeverity] = useState<'info' | 'warning' | 'critical'>('info')
  const [customNotifMessage, setCustomNotifMessage] = useState('')
  const [customNotifSuccess, setCustomNotifSuccess] = useState(false)

  const owners = useMemo(() => storage.getOwners(), [syncKey, refreshKey])    // BUG-011 FIX: was [syncKey + refreshKey] (arithmetic)
  const drivers = useMemo(() => storage.getDrivers(), [syncKey, refreshKey])
  const vehicles = useMemo(() => storage.getVehicles(), [syncKey, refreshKey])
  const fills = useMemo(() => storage.getFills(), [syncKey, refreshKey])
  const alerts = useMemo(() => storage.getAlerts(), [syncKey, refreshKey])
  const auditLogs = useMemo(() => storage.getAuditLogs(), [syncKey, refreshKey])
  const notifications = useMemo(() => storage.getNotifications(), [syncKey, refreshKey])
  const creditActions = useMemo(() => storage.getCreditActions(), [syncKey, refreshKey])
  const paymentEntries = useMemo(() => storage.getPaymentEntries(), [syncKey, refreshKey])
  const settings = useMemo(() => storage.getSettings(), [syncKey, refreshKey])
  const pendingRequests = useMemo(() => creditActions.filter(ca => ca.status === 'pending'), [creditActions])

  const todayFills = fills.filter(f => new Date(f.time).toDateString() === new Date().toDateString())
  const totalDue = fills.reduce((s, f) => s + f.total, 0)
  const totalPaidAmt = owners.reduce((s, o) => s + (o.totalPaid || 0), 0)
  const totalPending = totalDue - totalPaidAmt
  const todayFuelValue = todayFills.reduce((s, f) => s + f.total, 0)
  const blockedOwners = owners.filter(o => o.status === 'inactive')
  const fraudAlerts = alerts.filter(a => !a.resolved)

  const getOwnerStats = (ownerId: string) => {
    const oDrivers = drivers.filter(d => String(d.ownerId) === String(ownerId))
    const oVehicles = vehicles.filter(v => String(v.ownerId) === String(ownerId))
    const vehicleIds = oVehicles.map(v => String(v.id))
    const vehiclePlates = oVehicles.map(v => String(v.plate || '').trim().toLowerCase())
    const driverIds = oDrivers.map(d => String(d.id))
    
    const oFills = fills.filter(f => {
      const fOwnerId = String(f.ownerId || '').trim()
      const fVehicleId = String(f.vehicleId || '').trim().toLowerCase()
      const fDriverId = String(f.driverId || '').trim()
      return fOwnerId === String(ownerId) || 
             vehicleIds.includes(fVehicleId) || 
             vehiclePlates.includes(fVehicleId) || 
             driverIds.includes(fDriverId)
    })
    const owner = owners.find(o => o.id === ownerId)
    const paid = owner?.totalPaid || 0
    const used = oFills.reduce((s, f) => s + f.total, 0)
    const creditLimit = owner?.creditLimit || 0
    const creditUsedAmount = used - paid
    return {
      drivers: oDrivers.length,
      vehicles: oVehicles.length,
      fills: oFills.length,
      used,
      pending: used - paid,
      paid,
      creditUsedAmount,
      creditLimit,
      creditRemaining: Math.max(0, creditLimit - creditUsedAmount),
      lastFill: oFills.length > 0 ? oFills.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0].time : null,
    }
  }

  const overdueOwners = owners.filter(o => {
    if (o.status === 'inactive') return false
    const stats = getOwnerStats(o.id)
    return stats.pending > 0 && (!o.lastPaymentDate || Date.now() - new Date(o.lastPaymentDate).getTime() > 30 * 24 * 60 * 60 * 1000)
  })

  const calcRiskColor = (ownerId: string): 'green' | 'red' | 'amber' => {
    const o = owners.find(x => x.id === ownerId)
    if (o?.riskScore === 'red' || o?.creditFrozen) return 'red'
    if (o?.riskScore === 'yellow') return 'amber'
    if (o?.riskScore === 'green') return 'green'
    const stats = getOwnerStats(ownerId)
    if (stats.pending > 50000) return 'red'
    if (stats.pending > 10000 || (o?.lastPaymentDate && Date.now() - new Date(o.lastPaymentDate).getTime() > 30 * 24 * 60 * 60 * 1000)) return 'amber'
    return 'green'
  }

  const expCSV = (fn: string, h: string[], rows: any[][]) => {
    const csv = [h.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n')
    const a = document.createElement('a')
    const blobUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.href = blobUrl
    a.download = fn
    a.click()
    // BUG-031 FIX: Revoke object URL to prevent memory leak
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100)
  }

  const addAuditLog = (action: string, details: string) => {
    storage.addAuditLog({
      id: 'al_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      action,
      adminName: 'Admin',
      targetId: '-',
      targetType: 'admin',
      details,
      timestamp: new Date().toISOString(),
    })
  }

  const saveStations = (updated: typeof stations) => {
    setStations(updated)
    localStorage.setItem('cng_stations', JSON.stringify(updated))
  }

  const addNotification = (type: string, message: string, severity: 'info' | 'warning' | 'critical') => {
    storage.addNotification({
      id: 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      type,
      message,
      severity,
      timestamp: new Date().toISOString(),
      read: false,
    })
  }

  const handleSendCustomNotification = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customNotifMessage.trim()) return;

    let targetRole: 'all' | 'owner' | 'driver' | undefined = undefined;
    let targetUserId: string | undefined = undefined;

    if (customNotifTargetType === 'all') {
      targetRole = 'all';
    } else if (customNotifTargetType === 'owner') {
      targetRole = 'owner';
    } else if (customNotifTargetType === 'driver') {
      targetRole = 'driver';
    } else if (customNotifTargetType === 'specific_owner') {
      targetRole = 'owner';
      targetUserId = customNotifTargetId;
    } else if (customNotifTargetType === 'specific_driver') {
      targetRole = 'driver';
      targetUserId = customNotifTargetId;
    }

    const newNotif: Notification = {
      id: 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      type: 'admin_broadcast',
      message: customNotifMessage.trim(),
      severity: customNotifSeverity,
      timestamp: new Date().toISOString(),
      read: false,
      targetRole,
      targetUserId
    };

    storage.addNotification(newNotif);
    firestoreSync.addNotification(newNotif).catch(console.error);

    let targetDetail = '';
    if (customNotifTargetType === 'specific_owner') {
      const o = owners.find(x => x.id === customNotifTargetId);
      targetDetail = `to owner ${o?.business || customNotifTargetId}`;
    } else if (customNotifTargetType === 'specific_driver') {
      const d = drivers.find(x => x.id === customNotifTargetId);
      targetDetail = `to driver ${d?.name || customNotifTargetId}`;
    } else {
      targetDetail = `to ${customNotifTargetType}`;
    }

    addAuditLog('send_broadcast', `Sent ${customNotifSeverity} announcement: "${customNotifMessage.trim().slice(0, 30)}..." ${targetDetail}`);

    window.dispatchEvent(new Event('storage'));

    setCustomNotifMessage('');
    setCustomNotifSuccess(true);
    setRefreshKey(k => k + 1);

    setTimeout(() => {
      setCustomNotifSuccess(false);
    }, 4000);
  };


  const KPI = (label: string, value: string, sub?: string) => (
    <div className="p-3 sm:p-4 rounded-xl bg-white border border-[#E2E6EB]">
      <p className="text-lg sm:text-xl font-bold text-[#111827]">{value}</p>
      <p className="text-[11px] text-[#6B7280] mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-[#9CA3AF] mt-0.5">{sub}</p>}
    </div>
  )

  const Badge = ({ label, color }: { label: string; color: string }) => {
    const colors: Record<string, string> = {
      green: 'bg-[#DCFCE7] text-[#166534]',
      red: 'bg-[#FEE2E2] text-[#991B1B]',
      amber: 'bg-[#FEF3C7] text-[#92400E]',
      blue: 'bg-[#DBEAFE] text-[#1E40AF]',
      gray: 'bg-[#F5F6F8] text-[#6B7280]',
    }
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${colors[color] || colors.gray}`}>{label}</span>
  }

  const MiniBar = ({ data, height = 60 }: { data: { label: string; value: number; color: string }[]; height?: number }) => {
    const max = Math.max(...data.map(d => d.value), 1)
    return (
      <div className="flex items-end gap-1" style={{ height }}>
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
            <div className="w-full rounded-t-sm transition-all" style={{ height: `${(d.value / max) * 100}%`, backgroundColor: d.color, minHeight: d.value > 0 ? 3 : 0 }} />
            <span className="text-[7px] text-[#6B7280]">{d.label}</span>
          </div>
        ))}
      </div>
    )
  }

  const LineChart = ({ data, labels, color, height = 90 }: { data: number[]; labels: string[]; color: string; height?: number }) => {
    const max = Math.max(...data, 1)
    const W = 300; const H = height
    const pts = data.map((v, i) => {
      const x = data.length > 1 ? (i / (data.length - 1)) * (W - 24) + 12 : W / 2
      const y = H - 14 - ((v / max) * (H - 24))
      return `${x},${y}`
    }).join(' ')
    const areaBot = `${data.length > 1 ? (W - 24) + 12 : W / 2},${H - 14} 12,${H - 14}`
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
        <defs>
          <linearGradient id={`lg_${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`12,${H-14} ${pts} ${areaBot}`} fill={`url(#lg_${color.replace('#','')})`} />
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((v, i) => {
          const x = data.length > 1 ? (i / (data.length - 1)) * (W - 24) + 12 : W / 2
          const y = H - 14 - ((v / max) * (H - 24))
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={3.5} fill="white" stroke={color} strokeWidth="1.8" />
            </g>
          )
        })}
        {labels.map((l, i) => {
          const x = data.length > 1 ? (i / (data.length - 1)) * (W - 24) + 12 : W / 2
          return <text key={i} x={x} y={H - 2} textAnchor="middle" fontSize="7.5" fill="#9CA3AF">{l}</text>
        })}
      </svg>
    )
  }

  const DonutChart = ({ value, max, color }: { value: number; max: number; color: string }) => {
    const pct = max > 0 ? Math.min(value / max, 1) : 0
    const r = 30; const cx = 40; const cy = 40
    const circ = 2 * Math.PI * r
    const dash = pct * circ
    return (
      <svg viewBox="0 0 80 80" width="80" height="80">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth="8" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={circ * 0.25}
          strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.6s ease' }} />
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="800" fill="#111827">{Math.round(pct * 100)}%</text>
      </svg>
    )
  }

  const last7 = Array.from({length: 7}, (_, i) => {
    const d = new Date(Date.now() - i * 86400000)
    return d.toDateString()
  }).reverse()

  const dailyCredit = last7.map(day => {
    const dayFills = fills.filter(f => new Date(f.time).toDateString() === day)
    return dayFills.reduce((s, f) => s + f.total, 0)
  })

  const dailyRecovery = last7.map(day => {
    const dayPayments = paymentEntries.filter(p => new Date(p.timestamp).toDateString() === day && p.type !== 'reversal')
    return dayPayments.reduce((s, p) => s + p.amount, 0)
  })

  const dailyKgs = last7.map(day => {
    const dayFills = fills.filter(f => new Date(f.time).toDateString() === day)
    return dayFills.reduce((s, f) => s + f.kgs, 0)
  })

  const dailyFillCount = last7.map(day =>
    fills.filter(f => new Date(f.time).toDateString() === day).length
  )

  const totalKgsDispensed = fills.reduce((s, f) => s + f.kgs, 0)
  const totalWalletSavings = fills.reduce((s, f) => s + Math.floor(f.kgs), 0)
  const collectionRate = totalDue > 0 ? Math.round((totalPaidAmt / totalDue) * 100) : 0

  const fraudByType = {
    fuel_drop: alerts.filter(a => a.type === 'fuel_drop').length,
    vehicle_override: alerts.filter(a => a.type === 'vehicle_override').length,
    other: alerts.filter(a => a.type !== 'fuel_drop' && a.type !== 'vehicle_override').length,
  }

  const dayLabels = last7.map(d => {
    const date = new Date(d)
    return date.toLocaleDateString('en', { weekday: 'short' })
  })

  const topOwners = [...owners]
    .map(o => ({ ...o, stats: getOwnerStats(o.id) }))
    .sort((a, b) => b.stats.used - a.stats.used)
    .slice(0, 5)

  const unreadNotifs = notifications.filter(n => !n.read).length

  const nav = [
    { key: 'dashboard', label: t('dashboard', lang), icon: '▦' },
    { key: 'owners', label: t('owners', lang), icon: '👥' },
    { key: 'drivers', label: 'Drivers', icon: '🧑‍✈️' },
    { key: 'stations', label: 'CNG Stations', icon: '⛽' },
    { key: 'loadmatch', label: 'Load Match', icon: '📦' },
    { key: 'credit', label: t('credit', lang), icon: '💰' },
    { key: 'payments', label: t('payments', lang), icon: '💳' },
    { key: 'fraud', label: t('fraudCenter', lang), icon: '🛡' },
    { key: 'reports', label: t('reports', lang), icon: '📊' },
    { key: 'notifications', label: t('notifications', lang), icon: '🔔' },
    { key: 'audit', label: t('auditLogs', lang), icon: '📜' },
    { key: 'settings', label: t('settings', lang), icon: '⚙' },
  ]
  return (
    <div className="min-h-screen bg-[#F5F6F8]">
      <div className="flex sm:hidden gap-1 p-3 bg-white border-b border-[#E2E6EB] overflow-x-auto">
        {nav.filter(n => n.key !== 'audit' && n.key !== 'settings').map(item => (
          <button key={item.key} onClick={() => setTab(item.key)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-medium ${tab === item.key ? 'bg-[#E10600] text-white' : 'bg-[#F5F6F8] text-[#6B7280]'}`}
          >{item.icon} {item.label}</button>
        ))}
      </div>
      <div className="flex flex-col sm:flex-row">
        <div className="hidden sm:flex sm:flex-col w-[200px] shrink-0 bg-white border-r border-[#E2E6EB] p-3 gap-0.5">
          <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider px-3 pb-3 pt-2">{t('adminPanel', lang)}</p>
          {nav.map(item => (
            <button key={item.key} onClick={() => setTab(item.key)}
              className={`w-full text-left px-3 py-2 rounded-lg text-[12px] font-medium flex items-center gap-2 ${tab === item.key ? 'bg-[#FDE8E8] text-[#E10600]' : 'text-[#6B7280] hover:bg-[#F5F6F8]'}`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
              {item.key === 'notifications' && unreadNotifs > 0 && (
                <span className="ml-auto px-1.5 py-0.5 rounded-full bg-[#E10600] text-white text-[9px] font-bold">{unreadNotifs}</span>
              )}
            </button>
          ))}
          <div className="mt-auto pt-4 border-t border-[#E2E6EB]">  {/* BUG-038 FIX: removed duplicate mt-4 class */}
            <button onClick={() => window.location.reload()} className="w-full text-left px-3 py-2 rounded-lg text-[12px] text-[#6B7280] hover:bg-[#F5F6F8] flex items-center gap-2">
              <span>↻</span> <span>{t('refresh', lang)}</span>
            </button>
            <div className="px-3 pt-2 text-[10px] text-[#9CA3AF]">
              {syncStatus === 'synced' && <span className="text-[#059669]">� Data synced</span>}
              {syncStatus === 'failed' && <span className="text-[#991B1B]">� Sync failed — reload to retry</span>}
              {syncStatus === 'syncing' && <span className="text-[#1E40AF]">� Syncing...</span>}
            </div>
          </div>
        </div>
        <div className="flex-1 p-4 sm:p-5 max-w-full sm:max-w-[1000px]">

          {/* ===== DASHBOARD ===== */}
          {tab === 'dashboard' && (
            <>
              <h1 className="text-xl sm:text-[22px] font-bold mb-4 text-[#111827]">{t('masterDashboard', lang)}</h1>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-5">
                {KPI(t('totalOwners', lang), String(owners.length))}
                {KPI(t('activeCredits', lang), String(owners.filter(o => o.status === 'active').length))}
                {KPI(t('totalOutstanding', lang), `₹${(totalPending/1000).toFixed(1)}k`)}
                {KPI(t('todayFuelValue', lang), `₹${(todayFuelValue/1000).toFixed(1)}k`)}
                {KPI(t('blockedOwners', lang), String(blockedOwners.length), blockedOwners.length > 0 ? t('requiresReview', lang) : undefined)}
                {KPI(t('overdueOwners', lang), String(overdueOwners.length), overdueOwners.length > 0 ? t('paymentOverdue', lang) : undefined)}
                {KPI(t('fraudAlerts', lang), String(fraudAlerts.length), fraudAlerts.length > 0 ? t('needsInvestigation', lang) : undefined)}
                {KPI(t('totalCollections', lang), `₹${(totalPaidAmt/1000).toFixed(1)}k`, `${totalDue > 0 ? ((totalPaidAmt/totalDue)*100).toFixed(0) : '0'}% ${t('recoveryText', lang)}`)}
                {KPI(t('totalDrivers', lang), String(drivers.length), `${drivers.filter(d => d.status === 'active').length} ${t('activeText', lang)}`)}
                {KPI(t('totalVehicles', lang), String(vehicles.length), `${vehicles.filter(v => v.status === 'active').length} ${t('activeText', lang)}`)}
                {KPI(t('totalFills', lang), String(fills.length), `${fills.filter(f => f.verified).length} ${t('verifiedText', lang)}`)}
              </div>

              {/* Wallet & Collection overview */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                <div className="p-4 rounded-xl bg-gradient-to-br from-[#4338ca] to-[#3730a3] text-white">
                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-70 mb-1">Total Wallet Savings Issued</p>
                  <p className="text-[22px] font-black">₹{totalWalletSavings.toLocaleString()}</p>
                  <p className="text-[10px] opacity-70 mt-0.5">{totalKgsDispensed.toFixed(1)} Kg dispensed · ₹1/Kg</p>
                </div>
                <div className="p-4 rounded-xl bg-white border border-[#E2E6EB] flex items-center gap-4">
                  <DonutChart value={totalPaidAmt} max={totalDue} color="#059669" />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] mb-1">Collection Rate</p>
                    <p className="text-[18px] font-black text-[#111827]">{collectionRate}%</p>
                    <p className="text-[10px] text-[#6B7280]">₹{(totalPaidAmt/1000).toFixed(1)}k of ₹{(totalDue/1000).toFixed(1)}k</p>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] mb-2">Fraud Breakdown</p>
                  <div className="space-y-1.5">
                    {[
                      { label: 'Fuel Drop', val: fraudByType.fuel_drop, color: '#E10600' },
                      { label: 'Vehicle Override', val: fraudByType.vehicle_override, color: '#F59E0B' },
                      { label: 'Other', val: fraudByType.other, color: '#6B7280' },
                    ].map(row => (
                      <div key={row.label} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: row.color }} />
                        <span className="text-[11px] text-[#6B7280] flex-1">{row.label}</span>
                        <span className="text-[11px] font-bold text-[#111827]">{row.val}</span>
                      </div>
                    ))}
                    {alerts.length === 0 && <p className="text-[11px] text-[#6B7280]">No alerts recorded</p>}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider">Daily Fill Volume (Kg)</p>
                    <span className="text-[11px] font-bold text-[#E10600]">{totalKgsDispensed.toFixed(1)} Kg total</span>
                  </div>
                  <LineChart data={dailyKgs} labels={dayLabels} color="#E10600" />
                </div>
                <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider">Credit Issued vs Recovered</p>
                  </div>
                  <div className="flex gap-3 items-center mb-2">
                    <span className="flex items-center gap-1 text-[10px] text-[#6B7280]"><span className="w-3 h-0.5 bg-[#E10600] inline-block rounded" /> Issued</span>
                    <span className="flex items-center gap-1 text-[10px] text-[#6B7280]"><span className="w-3 h-0.5 bg-[#059669] inline-block rounded" /> Recovered</span>
                  </div>
                  <div className="relative">
                    <LineChart data={dailyCredit} labels={dayLabels} color="#E10600" height={75} />
                    <div className="absolute inset-0">
                      <LineChart data={dailyRecovery} labels={dayLabels} color="#059669" height={75} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white border border-[#E2E6EB] mb-5">
                <p className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">{t('topOwnersByFuel', lang)}</p>
                <div className="space-y-2">
                  {topOwners.map((o, i) => {
                    const maxUsed = topOwners[0]?.stats?.used || 1
                    return (
                      <div key={o.id} className="flex items-center gap-2">
                        <span className="text-[10px] text-[#6B7280] w-4">{i + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-[11px]">
                            <span className="truncate">{o.business}</span>
                            <span className="font-medium">₹{(o.stats.used/1000).toFixed(1)}k</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-[#F5F6F8] mt-0.5">
                            <div className="h-full rounded-full bg-[#E10600]" style={{ width: `${(o.stats.used / maxUsed) * 100}%` }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {topOwners.length === 0 && <p className="text-[12px] text-[#6B7280]">{t('noData', lang)}</p>}
                </div>
              </div>
              <div>
                <h3 className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">{t('liveActivityFeed', lang)}</h3>
                <div className="space-y-1.5">
                  {auditLogs.length > 0 ? auditLogs.slice(-10).reverse().map(a => (
                    <div key={a.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-white border border-[#E2E6EB] text-[11px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#E10600] mt-1 shrink-0" />
                      <div>
                        <span className="font-medium text-[#111827]">{a.action.replace(/_/g, ' ')}</span>
                        <span className="text-[#6B7280] ml-1">— {a.details}</span>
                        <span className="text-[#9CA3AF] ml-1">• {new Date(a.timestamp).toLocaleString()}</span>
                      </div>
                    </div>
                  )) : alerts.slice(-5).reverse().map(a => (
                    <div key={a.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-white border border-[#E2E6EB] text-[11px]">
                      <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${a.resolved ? 'bg-[#6B7280]' : 'bg-[#E10600]'}`} />
                      <div>
                        <span className="text-[#111827]">{a.event}</span>
                        <span className="text-[#6B7280] ml-1">— {a.user}</span>
                      </div>
                    </div>
                  ))}
                  {(auditLogs.length === 0 && alerts.length === 0) && <p className="text-[12px] text-[#6B7280]">{t('noActivityYet', lang)}</p>}
                </div>
              </div>
            </>
          )}

          {/* ===== OWNERS ===== */}
          {tab === 'owners' && (
            <>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h1 className="text-xl sm:text-[22px] font-bold text-[#111827]">{t('ownerManagement', lang)}</h1>
                <input value={ownerSearch} onChange={e => setOwnerSearch(e.target.value)} placeholder={t('searchOwners', lang)}
                  className="h-9 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px] w-[200px]" />
              </div>
              <div className="flex gap-2 mb-4 flex-wrap">
                {(['all', 'active', 'blocked'] as const).map(f => (
                  <button key={f} onClick={() => setOwnerFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-medium ${ownerFilter === f ? 'bg-[#E10600] text-white' : 'bg-[#F5F6F8] text-[#6B7280]'}`}
                  >{t(f, lang)}</button>
                ))}
              </div>
              <div className="space-y-1.5">
                {owners.filter(o => {
                  if (ownerFilter === 'blocked') return o.status === 'inactive'
                  if (ownerFilter === 'active') return o.status === 'active'
                  return true
                }).filter(o => {
                  if (!ownerSearch) return true
                  const q = ownerSearch.toLowerCase()
                  return (o.business || '').toLowerCase().includes(q) || (o.name || '').toLowerCase().includes(q) || (o.email || '').toLowerCase().includes(q)
                }).map(o => {
                  const stats = getOwnerStats(o.id)
                  const exp = expandedOwner === o.id
                  const riskColor = calcRiskColor(o.id)
                  const riskLabel = riskColor === 'red' ? t('highRisk', lang) : riskColor === 'amber' ? t('mediumRisk', lang) : t('lowRisk', lang)
                  return (
                    <div key={o.id} className="rounded-xl bg-white border border-[#E2E6EB] overflow-hidden">
                      <div className="p-3 sm:p-4 flex items-center justify-between cursor-pointer hover:bg-[#F9FAFB]" onClick={() => setExpandedOwner(exp ? null : o.id)}>
                        <div className="flex-1 min-w-0 pr-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-[13px] text-[#111827]">{o.business}</p>
                            <Badge label={o.status === 'active' ? t('active', lang) : t('blocked', lang)} color={o.status === 'active' ? 'green' : 'red'} />
                            <Badge label={riskLabel} color={riskColor} />
                            {o.creditFrozen && <Badge label={t('frozen', lang)} color="red" />}
                          </div>
                          <p className="text-[11px] text-[#6B7280]">{o.name} • {o.email} • {o.phone}</p>
                          <div className="flex gap-3 mt-1 text-[11px] text-[#6B7280] flex-wrap">
                            <span>{stats.drivers} {t('drivers', lang).toLowerCase()}</span>
                            <span>{stats.vehicles} {t('vehicles', lang).toLowerCase()}</span>
                            <span>{stats.fills} {t('fills', lang).toLowerCase()}</span>
                            <span>{t('limit', lang)}: ₹{((o.creditLimit || 0)/1000).toFixed(1)}k</span>
                            <span>{t('creditUsed', lang)}: ₹{(stats.used/1000).toFixed(1)}k</span>
                            <span className={stats.pending > 0 ? 'text-[#991B1B] font-medium' : 'text-[#166534]'}>{t('outstanding', lang)}: ₹{(stats.pending/1000).toFixed(1)}k</span>
                          </div>
                        </div>
                        <div className="shrink-0 flex flex-wrap gap-1">
                          {o.status === 'active' ? (
                            <button onClick={async () => { 
                              storage.saveOwners(owners.map(x => x.id === o.id ? { ...x, status: 'inactive' as const } : x)); 

                              addAuditLog('block_owner', `Blocked ${o.business}`); 
                              addNotification('owner', `${o.business} blocked`, 'warning'); 
                              setRefreshKey(k => k + 1) 
                            }}
                              className="px-2.5 py-1 rounded-lg bg-[#FEE2E2] text-[#991B1B] text-[10px] font-medium">{t('block', lang)}</button>
                          ) : (
                            <button onClick={async () => { 
                              storage.saveOwners(owners.map(x => x.id === o.id ? { ...x, status: 'active' as const } : x)); 

                              addAuditLog('unblock_owner', `Unblocked ${o.business}`); 
                              setRefreshKey(k => k + 1) 
                            }}
                              className="px-2.5 py-1 rounded-lg bg-[#DCFCE7] text-[#166534] text-[10px] font-medium">{t('unblock', lang)}</button>
                          )}
                          {o.creditFrozen ? (
                            <button onClick={async () => {
                              storage.saveOwners(owners.map(x => x.id === o.id ? { ...x, creditFrozen: false } : x));

                              addAuditLog('unfreeze_credit', `Unfroze credit for ${o.business}`);
                              setRefreshKey(k => k + 1);
                            }} className="px-2.5 py-1 rounded-lg bg-[#DBEAFE] text-[#1E40AF] text-[10px] font-medium">{t('unfreeze', lang)}</button>
                          ) : (
                            <button onClick={async () => {
                              storage.saveOwners(owners.map(x => x.id === o.id ? { ...x, creditFrozen: true } : x));

                              addAuditLog('freeze_credit', `Froze credit for ${o.business}`);
                              addNotification('credit', `${o.business} credit frozen`, 'critical');
                              setRefreshKey(k => k + 1);
                            }} className="px-2.5 py-1 rounded-lg bg-[#FEF3C7] text-[#92400E] text-[10px] font-medium">{t('freeze', lang)}</button>
                          )}
                          <button onClick={() => setEditCredit({ id: o.id, val: String(o.creditLimit || '') })} className="px-2.5 py-1 rounded-lg bg-[#DBEAFE] text-[#1E40AF] text-[10px] font-medium">{t('limit', lang)}</button>
                          <button onClick={() => setEditNotes({ id: o.id, val: o.adminNotes || '' })} className="px-2.5 py-1 rounded-lg bg-[#F5F6F8] text-[#6B7280] text-[10px] font-medium">{t('note', lang)}</button>
                        </div>
                      </div>
                      {exp && (
                        <div className="px-3 sm:px-4 pb-4 border-t border-[#E2E6EB] pt-3 space-y-3">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                            <div className="p-2.5 rounded-lg bg-[#F5F6F8]"><p className="text-[#6B7280]">{t('creditLimit', lang)}</p><p className="font-semibold text-[#111827]">₹{((o.creditLimit || 0)/1000).toFixed(1)}k</p></div>
                            <div className="p-2.5 rounded-lg bg-[#F5F6F8]"><p className="text-[#6B7280]">{t('creditUsed', lang)}</p><p className="font-semibold text-[#1E40AF]">₹{(stats.creditUsedAmount/1000).toFixed(1)}k</p></div>
                            <div className="p-2.5 rounded-lg bg-[#F5F6F8]"><p className="text-[#6B7280]">{t('remaining', lang)}</p><p className={`font-semibold ${stats.creditRemaining > 0 ? 'text-[#166534]' : 'text-[#991B1B]'}`}>₹{(stats.creditRemaining/1000).toFixed(1)}k</p></div>
                            <div className="p-2.5 rounded-lg bg-[#F5F6F8]"><p className="text-[#6B7280]">{t('lastPayment', lang)}</p><p className="font-semibold text-[#111827]">{o.lastPaymentDate ? new Date(o.lastPaymentDate).toLocaleDateString() : t('never', lang)}</p></div>
                          </div>
                          {editCredit?.id === o.id && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] text-[#6B7280]">₹</span>
                              <input value={editCredit.val} onChange={e => setEditCredit({ ...editCredit, val: e.target.value })}
                                className="flex-1 min-w-[120px] h-9 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px]" placeholder={t('creditLimit', lang)} />
                              <button onClick={async () => {
                                const newLimit = parseInt(editCredit.val) || 0;
                                storage.saveOwners(owners.map(x => x.id === o.id ? { ...x, creditLimit: newLimit } : x));
  
                                setEditCredit(null);
                                addAuditLog('set_credit_limit', `Set limit ₹${editCredit.val} for ${o.business}`);
                                setRefreshKey(k => k + 1);
                              }}
                                className="px-3 h-9 rounded-lg bg-[#E10600] text-white text-[11px] font-medium">{t('save', lang)}</button>
                              <button onClick={() => setEditCredit(null)} className="px-3 h-9 rounded-lg bg-[#F5F6F8] text-[#6B7280] text-[11px]">{t('cancel', lang)}</button>
                            </div>
                          )}
                          {editNotes?.id === o.id && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <input value={editNotes.val} onChange={e => setEditNotes({ ...editNotes, val: e.target.value })}
                                className="flex-1 min-w-[120px] h-9 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px]" placeholder={t('privateNote', lang)} />
                              <button onClick={async () => {
                                storage.saveOwners(owners.map(x => x.id === o.id ? { ...x, adminNotes: editNotes.val } : x));

                                setEditNotes(null);
                                addAuditLog('add_note', `Added note to ${o.business}`);
                                setRefreshKey(k => k + 1);
                              }}
                                className="px-3 h-9 rounded-lg bg-[#E10600] text-white text-[11px] font-medium">{t('save', lang)}</button>
                              <button onClick={() => setEditNotes(null)} className="px-3 h-9 rounded-lg bg-[#F5F6F8] text-[#6B7280] text-[11px]">{t('cancel', lang)}</button>
                            </div>
                          )}
                          {o.adminNotes && editNotes?.id !== o.id && (
                            <p className="text-[11px] text-[#6B7280] italic bg-[#FFFBEB] p-2 rounded-lg border border-[#FDE68A]">� {o.adminNotes}</p>
                          )}
                          <div>
                            <p className="text-[11px] font-semibold text-[#6B7280] mb-1">{t('paymentsHistory', lang)}</p>
                            {paymentEntries.filter(p => p.ownerId === o.id).slice(-5).reverse().map(p => (
                              <div key={p.id} className="flex items-center justify-between py-1.5 text-[11px] border-b border-[#F5F6F8] last:border-0">
                                <span className="text-[#111827]">₹{p.amount} ({t(p.type, lang)})</span>
                                <span className="text-[#6B7280]">{new Date(p.timestamp).toLocaleDateString()} • {p.adminName}</span>
                              </div>
                            ))}
                            {paymentEntries.filter(p => p.ownerId === o.id).length === 0 && <p className="text-[11px] text-[#6B7280]">{t('noPaymentsRecorded', lang)}</p>}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                {owners.length === 0 && <p className="text-[12px] text-[#6B7280]">{t('noOwnersRegistered', lang)}</p>}
              </div>
            </>
          )}

          {/* ===== CREDIT CONTROL ===== */}
          {tab === 'credit' && (
            <>
              <h1 className="text-xl sm:text-[22px] font-bold mb-4 text-[#111827]">{t('creditControlCenter', lang)}</h1>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                  <p className="font-semibold text-[13px] text-[#111827] mb-3">{t('manualCreditIssue', lang)}</p>
                  <div className="space-y-2.5">
                    <select value={creditOwner} onChange={e => setCreditOwner(e.target.value)}
                      className="w-full h-10 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px]">
                      <option value="">{t('selectOwner', lang)}</option>
                      {owners.filter(o => o.status === 'active').map(o => (
                        <option key={o.id} value={o.id}>{o.business}</option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      {(['issued', 'emergency', 'bonus'] as const).map(t_val => (
                        <button key={t_val} onClick={() => setCreditType(t_val)}
                          className={`flex-1 py-2 rounded-lg text-[11px] font-medium ${creditType === t_val ? 'bg-[#E10600] text-white' : 'bg-[#F5F6F8] text-[#6B7280]'}`}
                        >{t(t_val, lang)}</button>
                      ))}
                    </div>
                    <input value={creditAmount} onChange={e => setCreditAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder={t('amountPlaceholder', lang)} type="text"
                      className="w-full h-10 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px]" />
                    <input value={creditNote} onChange={e => setCreditNote(e.target.value)} placeholder={t('note', lang)} type="text"
                      className="w-full h-10 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px]" />
                    <button onClick={async () => {
                      if (!creditOwner || !creditAmount) return
                      const amt = parseFloat(creditAmount)
                      if (amt <= 0) return
                      const action: CreditAction = {
                        id: 'ca_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                        ownerId: creditOwner,
                        type: creditType,
                        amount: amt,
                        timestamp: new Date().toISOString(),
                        notes: creditNote || undefined,
                        status: 'approved',
                        requestedBy: 'Admin',
                        approvedBy: 'Admin'
                      }
                      
                      // Update local storage limit
                      storage.saveCreditActions([...creditActions, action])
                      const updatedOwners = owners.map(x => x.id === creditOwner ? { ...x, creditLimit: (x.creditLimit || 0) + amt } : x)
                      storage.saveOwners(updatedOwners)
                      
                      const o = owners.find(x => x.id === creditOwner)
                      addAuditLog('issue_credit', `${creditType} credit ₹${amt} to ${o?.business || creditOwner}`)
                      addNotification('credit', `₹${amt} ${creditType} credit issued to ${o?.business || creditOwner}`, 'info')
                      setCreditOwner(''); setCreditAmount(''); setCreditNote('')
                      setRefreshKey(k => k + 1)
                      

                    }} disabled={!creditOwner || !creditAmount}
                      className="w-full h-10 rounded-lg bg-[#059669] text-white text-[12px] font-medium disabled:opacity-50">{t('issueCredit', lang)}</button>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                  <p className="font-semibold text-[13px] text-[#111827] mb-3">{t('creditRules', lang)}</p>
                  <div className="space-y-2.5 text-[12px]">
                    <div className="flex justify-between p-2.5 rounded-lg bg-[#F5F6F8]">
                      <span className="text-[#6B7280]">{t('maxDailyUsage', lang)}</span>
                      <span className="font-medium">₹{((settings.maxDailyUsage || 50000)/1000).toFixed(1)}k</span>
                    </div>
                    <div className="flex justify-between p-2.5 rounded-lg bg-[#F5F6F8]">
                      <span className="text-[#6B7280]">{t('maxTransaction', lang)}</span>
                      <span className="font-medium">₹{((settings.maxTransaction || 10000)/1000).toFixed(1)}k</span>
                    </div>
                    <div className="flex justify-between p-2.5 rounded-lg bg-[#F5F6F8]">
                      <span className="text-[#6B7280]">{t('monthlyLimit', lang)}</span>
                      <span className="font-medium">₹{((settings.monthlyLimit || 200000)/1000).toFixed(1)}k</span>
                    </div>
                    <div className="flex justify-between p-2.5 rounded-lg bg-[#F5F6F8]">
                      <span className="text-[#6B7280]">{t('autoFreezeAfter', lang)}</span>
                      <span className="font-medium">{settings.autoFreezeDays || 30} {t('daysOverdue', lang)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pending Credit Requests section */}
              {pendingRequests.length > 0 && (
                <div className="mb-5 p-4 rounded-xl bg-white border border-amber-200 bg-amber-50/20">
                  <h3 className="text-[12px] font-semibold text-amber-800 uppercase tracking-wider mb-3">{t('pendingCreditRequests', lang)}</h3>
                  <div className="space-y-2">
                    {pendingRequests.map(ca => {
                      const o = owners.find(ow => ow.id === ca.ownerId)
                      return (
                        <div key={ca.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg bg-white border border-[#E2E6EB] text-[12px] gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge label={t('pending', lang)} color="amber" />
                              <span className="font-bold text-[#111827]">₹{ca.amount.toLocaleString()}</span>
                              <span className="text-[#6B7280]">{t('forText', lang)} {o?.business || ca.ownerId}</span>
                            </div>
                            {ca.notes && <p className="text-[#4B5563] text-[11px] italic">{t('reason', lang)}: {ca.notes}</p>}
                            <p className="text-[#9CA3AF] text-[10px]">{t('requestedBy', lang)}: {ca.requestedBy || t('owner', lang)} {t('on', lang)} {new Date(ca.timestamp).toLocaleString()}</p>
                          </div>
                          <div className="flex gap-2">
                            <button 
                              onClick={async () => {
                                // Update status to approved locally first
                                const updatedActions = creditActions.map(act => 
                                  act.id === ca.id ? { ...act, status: 'approved' as const, approvedBy: 'Admin' } : act
                                )
                                storage.saveCreditActions(updatedActions)

                                // Update owner credit limit locally
                                const updatedOwners = owners.map(x => 
                                  x.id === ca.ownerId ? { ...x, creditLimit: (x.creditLimit || 0) + ca.amount } : x
                                )
                                storage.saveOwners(updatedOwners)

                                addAuditLog('approve_credit', `Approved ₹${ca.amount} credit request for ${o?.business || ca.ownerId}`)
                                addNotification('credit', `₹${ca.amount} credit request approved for ${o?.business || ca.ownerId}`, 'info')
                                
                                setRefreshKey(k => k + 1)
                              }}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-medium text-[11px] hover:bg-emerald-700"
                            >
                              Approve
                            </button>
                            <button 
                              onClick={async () => {
                                // Reject action:
                                // Update status to rejected locally
                                const updatedActions = creditActions.map(act => 
                                  act.id === ca.id ? { ...act, status: 'rejected' as const, approvedBy: 'Admin' } : act
                                )
                                storage.saveCreditActions(updatedActions)

                                addAuditLog('reject_credit', `Rejected ₹${ca.amount} credit request for ${o?.business || ca.ownerId}`)
                                addNotification('credit', `₹${ca.amount} credit request rejected for ${o?.business || ca.ownerId}`, 'warning')
                                
                                setRefreshKey(k => k + 1)
                              }}
                              className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-medium text-[11px] hover:bg-rose-700"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2">{t('creditHistory', lang)}</h3>
                <div className="space-y-1.5">
                  {creditActions.slice().reverse().map(ca => {
                    const o = owners.find(ow => ow.id === ca.ownerId)
                    return (
                      <div key={ca.id} className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-[#E2E6EB] text-[11px]">
                        <div className="flex items-center gap-2">
                          <Badge label={t(ca.type, lang)} color={ca.type === 'reversal' ? 'red' : ca.type === 'emergency' ? 'amber' : 'blue'} />
                          <span className="font-medium text-[#111827]">₹{ca.amount}</span>
                          <span className="text-[#6B7280]">→ {o?.business || ca.ownerId}</span>
                          {ca.notes && <span className="text-[#6B7280] italic">— {ca.notes}</span>}
                        </div>
                        <span className="text-[#9CA3AF]">{new Date(ca.timestamp).toLocaleDateString()}</span>
                      </div>
                    )
                  })}
                  {creditActions.length === 0 && <p className="text-[12px] text-[#6B7280]">{t('noCreditActionsRecorded', lang)}</p>}
                </div>
              </div>
            </>
          )}

          {/* ===== PAYMENTS ===== */}
          {tab === 'payments' && (
            <>
              <h1 className="text-xl sm:text-[22px] font-bold mb-3 text-[#111827]">{t('paymentAndRecovery', lang)}</h1>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-5">
                {KPI(t('totalDue', lang), `₹${(totalDue/1000).toFixed(1)}k`)}
                {KPI(t('totalPaid', lang), `₹${(totalPaidAmt/1000).toFixed(1)}k`, `${totalDue > 0 ? ((totalPaidAmt/totalDue)*100).toFixed(0) : '0'}%`)}
                {KPI(t('pending', lang), `₹${(totalPending/1000).toFixed(1)}k`)}
                {KPI(t('overdue', lang), String(overdueOwners.length), `${overdueOwners.length} ${t('owners', lang).toLowerCase()}`)}
              </div>
              <div className="space-y-2 mb-5">
                <h3 className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2">{t('ownerPaymentStatus', lang)}</h3>
                {owners.filter(o => getOwnerStats(o.id).used > 0).sort((a, b) => getOwnerStats(b.id).pending - getOwnerStats(a.id).pending).map(o => {
                  const stats = getOwnerStats(o.id)
                  const isPaying = payOwner === o.id
                  return (
                    <div key={o.id} className="p-3 sm:p-4 rounded-xl bg-white border border-[#E2E6EB]">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[13px] text-[#111827]">{o.business}</p>
                          <p className="text-[11px] text-[#6B7280]">{o.name} • {stats.vehicles} {t('vehicles', lang).toLowerCase()} • {stats.drivers} {t('drivers', lang).toLowerCase()}</p>
                          <div className="flex gap-3 mt-1.5 text-[11px] flex-wrap">
                            <span>{t('creditUsed', lang)}: <strong>₹{(stats.used/1000).toFixed(1)}k</strong></span>
                            <span className="text-[#166534]">{t('totalPaid', lang)}: <strong>₹{(stats.paid/1000).toFixed(1)}k</strong></span>
                            <span className={stats.pending > 0 ? 'text-[#991B1B]' : 'text-[#166534]'}>{t('pending', lang)}: <strong>₹{(stats.pending/1000).toFixed(1)}k</strong></span>
                          </div>
                          {stats.lastFill && <p className="text-[10px] text-[#6B7280] mt-1">{t('lastFill', lang)}: {new Date(stats.lastFill).toLocaleDateString()}</p>}
                        </div>
                        <div className="shrink-0">
                          {stats.pending > 0 ? (
                            !isPaying ? (
                              <button onClick={() => { setPayOwner(o.id); setPayAmt(String(stats.pending)); setPayNote('') }}
                                className="px-3 py-1.5 rounded-lg bg-[#E10600] text-white text-[11px] font-medium">{t('markPaid', lang)}</button>
                            ) : (
                              <div className="flex flex-col items-end gap-1.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[11px] text-[#6B7280]">₹</span>
                                  <input value={payAmt} onChange={e => setPayAmt(e.target.value.replace(/[^0-9.]/g, ''))}
                                    className="w-20 h-8 px-2 bg-white border border-[#E2E6EB] rounded-lg text-[11px] font-mono text-center" />
                                </div>
                                <input value={payNote} onChange={e => setPayNote(e.target.value)} placeholder={t('noteOptional', lang)}
                                  className="w-full h-8 px-2 bg-white border border-[#E2E6EB] rounded-lg text-[10px]" />
                                <div className="flex gap-1">
                                  <button onClick={async () => {
                                    const amt = parseFloat(payAmt)
                                    if (amt > 0) {
                                      const entry = {
                                        id: 'pe_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                                        ownerId: o.id,
                                        amount: amt,
                                        type: (amt >= stats.pending ? 'payment' : 'partial') as 'payment' | 'partial',
                                        timestamp: new Date().toISOString(),
                                        adminName: 'Admin',
                                        note: payNote || undefined,
                                      }
                                      
                                      // Update local storage
                                      storage.savePaymentEntries([...paymentEntries, entry])
                                      const updated = owners.map(x => x.id === o.id ? { ...x, totalPaid: (x.totalPaid || 0) + amt, lastPaymentDate: new Date().toISOString() } : x)
                                      storage.saveOwners(updated)
                                      
                                      setPayOwner(null)
                                      addAuditLog('mark_paid', `₹${amt} payment from ${o.business}`)
                                      addNotification('payment', `₹${amt} received from ${o.business}`, 'info')
                                      setRefreshKey(k => k + 1)
                                      

                                    }
                                  }} className="px-2.5 h-8 rounded-lg bg-[#059669] text-white text-[11px] font-medium">{t('confirm', lang)}</button>
                                  <button onClick={() => setPayOwner(null)} className="px-2 h-8 rounded-lg bg-[#F5F6F8] text-[#6B7280] text-[11px]">✕</button>
                                </div>
                              </div>
                            )
                          ) : (
                            <span className="px-3 py-1.5 rounded-lg bg-[#DCFCE7] text-[#166534] text-[11px] font-medium">{t('cleared', lang)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {owners.every(o => getOwnerStats(o.id).used === 0) && <p className="text-[12px] text-[#6B7280]">{t('noFillDataAvailable', lang)}</p>}
              </div>
              <div className="mt-6">
                <h3 className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2">{t('paymentLedger', lang)}</h3>
                <div className="space-y-1.5">
                  {paymentEntries.slice().reverse().map(pe => {
                    const o = owners.find(x => x.id === pe.ownerId)
                    return (
                      <div key={pe.id} className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-[#E2E6EB] text-[11px]">
                        <div className="flex items-center gap-2">
                          <Badge label={t(pe.type, lang)} color={pe.type === 'reversal' ? 'red' : pe.type === 'partial' ? 'amber' : 'green'} />
                          <span className="font-medium text-[#111827]">₹{pe.amount}</span>
                          <span className="text-[#6B7280]">{t('fromText', lang)} {o?.business || pe.ownerId}</span>
                          {pe.note && <span className="text-[#6B7280] italic">— {pe.note}</span>}
                        </div>
                        <span className="text-[#9CA3AF]">{new Date(pe.timestamp).toLocaleDateString()} • {pe.adminName}</span>
                      </div>
                    )
                  })}
                  {paymentEntries.length === 0 && <p className="text-[12px] text-[#6B7280]">{t('noPaymentEntriesYet', lang)}</p>}
                </div>
              </div>
              {owners.filter(o => getOwnerStats(o.id).pending > 0).length > 0 && (
                <div className="mt-6">
                  <h3 className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2">{t('recoveryPriority', lang)}</h3>
                  <div className="space-y-1.5">
                    {[...owners].filter(o => getOwnerStats(o.id).pending > 0).sort((a, b) => getOwnerStats(b.id).pending - getOwnerStats(a.id).pending).map(o => {
                      const stats = getOwnerStats(o.id)
                      return (
                        <div key={o.id} className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-[#E2E6EB] text-[11px]">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${stats.pending > 50000 ? 'bg-[#E10600]' : stats.pending > 10000 ? 'bg-[#F59E0B]' : 'bg-[#6B7280]'}`} />
                            <span className="font-medium text-[#111827]">{o.business}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[#991B1B]">₹{(stats.pending/1000).toFixed(1)}k {t('due', lang)}</span>
                            <span className="text-[#9CA3AF]">{stats.vehicles} vehicles</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ===== FRAUD ===== */}
          {tab === 'fraud' && (
            <>
              <h1 className="text-xl sm:text-[22px] font-bold mb-3 text-[#111827]">{t('fraudMonitoringCenter', lang)}</h1>
              <div className="flex gap-2 mb-4">
                {(['all', 'active', 'resolved'] as const).map(f => (
                  <button key={f} onClick={() => setFraudFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-medium ${fraudFilter === f ? 'bg-[#E10600] text-white' : 'bg-[#F5F6F8] text-[#6B7280]'}`}
                  >{t(f, lang)}</button>
                ))}
              </div>
              {alerts.filter(a => fraudFilter === 'all' || (fraudFilter === 'active' ? !a.resolved : a.resolved)).length === 0 && (
                <div className="p-4 rounded-xl bg-[#DCFCE7] border border-[#BBF7D0] text-[12px] font-medium text-[#166534]">{t('allClearNoAlerts', lang)}</div>
              )}
              <div className="space-y-1.5">
                {alerts.slice().reverse().filter(a => fraudFilter === 'all' || (fraudFilter === 'active' ? !a.resolved : a.resolved)).map(a => {
                  const riskLevel = a.type === 'fuel_drop' ? t('critical', lang) : a.type === 'vehicle_override' ? t('warning', lang) : t('info', lang)
                  const riskColor = riskLevel === 'Critical' ? 'red' : riskLevel === 'High' ? 'amber' : 'blue'
                  const o = owners.find(ow => ow.id === a.ownerId)
                  return (
                    <div key={a.id} className={`p-3 sm:p-4 rounded-xl border text-[11px] ${a.resolved ? 'bg-white border-[#E2E6EB]' : 'bg-[#FFFBEB] border-[#FDE68A]'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge label={riskLevel} color={riskColor} />
                            <Badge label={t(a.type, lang)} color={a.type === 'fuel_drop' ? 'red' : a.type === 'vehicle_override' ? 'amber' : 'blue'} />
                            {!a.resolved && <span className="w-2 h-2 rounded-full bg-[#E10600]" />}
                            <span className="text-[#6B7280]">{a.resolved ? t('resolved', lang) : t('active', lang)}</span>
                          </div>
                          <p className="text-[12px] font-medium text-[#111827]">{a.event}</p>
                          <p className="text-[10px] text-[#6B7280] mt-0.5">{a.user} • {o?.business || ''} • {new Date(a.time).toLocaleString()}</p>
                        </div>
                        <div className="shrink-0 flex gap-1.5 flex-wrap">
                          {!a.resolved && (
                            <>
                              <button onClick={async () => { 
                                storage.saveAlerts(alerts.map(x => x.id === a.id ? { ...x, resolved: true } : x)); 
                                addAuditLog('resolve_alert', `Resolved ${a.type} alert: ${a.event}`); 
                                setRefreshKey(k => k + 1) 
                              }}
                                className="px-2.5 py-1 rounded-lg bg-white border border-[#E2E6EB] text-[10px] font-medium text-[#6B7280]">{t('resolve', lang)}</button>
                              {o && (
                                <button onClick={() => { storage.saveOwners(owners.map(x => x.id === o.id ? { ...x, status: 'inactive' as const } : x)); addAuditLog('freeze_account', `Froze ${o.business} due to fraud alert`); addNotification('fraud', `${o.business} frozen due to ${a.type}`, 'critical'); setRefreshKey(k => k + 1) }}
                                  className="px-2.5 py-1 rounded-lg bg-[#FEE2E2] text-[#991B1B] text-[10px] font-medium">{t('freezeOwner', lang)}</button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* ===== DRIVERS ===== */}
          {tab === 'drivers' && (
            <>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h1 className="text-xl sm:text-[22px] font-bold text-[#111827]">All Drivers</h1>
                <input value={driverSearch} onChange={e => setDriverSearch(e.target.value)} placeholder="Search by name or PIN..."
                  className="h-9 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px] w-[200px]" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                {KPI('Total Drivers', String(drivers.length))}
                {KPI('Active', String(drivers.filter(d => d.status !== 'inactive').length))}
                {KPI('Blocked', String(drivers.filter(d => d.status === 'inactive').length))}
                {KPI('Unassigned', String(drivers.filter(d => !d.assignedVehicleId).length))}
              </div>
              <div className="flex gap-2 mb-4">
                {(['all', 'active', 'blocked'] as const).map(f => (
                  <button key={f} onClick={() => setDriverFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-medium capitalize ${driverFilter === f ? 'bg-[#E10600] text-white' : 'bg-[#F5F6F8] text-[#6B7280]'}`}
                  >{f}</button>
                ))}
              </div>
              <div className="space-y-1.5">
                {drivers
                  .filter(d => {
                    if (driverFilter === 'blocked') return d.status === 'inactive'
                    if (driverFilter === 'active') return d.status !== 'inactive'
                    return true
                  })
                  .filter(d => {
                    if (!driverSearch) return true
                    const q = driverSearch.toLowerCase()
                    return (d.name || '').toLowerCase().includes(q) || (d.code || '').includes(q)
                  })
                  .map(d => {
                    const owner = owners.find(o => o.id === String(d.ownerId))
                    const vehicle = vehicles.find(v => v.plate === d.assignedVehicleId || String(v.id) === String(d.assignedVehicleId))
                    const driverFills = fills.filter(f => f.driverId === d.id)
                    const totalKgs = driverFills.reduce((s, f) => s + f.kgs, 0)
                    const lastFill = driverFills.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0]
                    const walletBal = driverFills.reduce((s, f) => s + Math.floor(f.kgs), 0)
                    return (
                      <div key={d.id} className="p-3 sm:p-4 rounded-xl bg-white border border-[#E2E6EB]">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <p className="font-semibold text-[13px] text-[#111827]">{d.name}</p>
                              <Badge label={d.status === 'inactive' ? 'Blocked' : 'Active'} color={d.status === 'inactive' ? 'red' : 'green'} />
                            </div>
                            <p className="text-[11px] text-[#6B7280]">
                              PIN: {d.code ? '••••' : 'Not set'} · Vehicle: {vehicle?.plate || 'Unassigned'} · Owner: {owner?.business || 'Unknown'}
                            </p>
                            <div className="flex gap-3 mt-1 text-[11px] text-[#6B7280] flex-wrap">
                              <span>{driverFills.length} fills</span>
                              <span>{totalKgs.toFixed(1)} Kg total</span>
                              <span className="text-[#4338ca] font-medium">₹{walletBal} wallet</span>
                              <span>Last fill: {lastFill ? new Date(lastFill.time).toLocaleDateString() : 'Never'}</span>
                            </div>
                          </div>
                          <div className="shrink-0 flex gap-1.5">
                            <button onClick={() => {
                              storage.saveDrivers(drivers.map(x => x.id === d.id ? { ...x, status: d.status === 'inactive' ? 'active' as const : 'inactive' as const } : x))
                              addAuditLog(d.status === 'inactive' ? 'unblock_driver' : 'block_driver', `${d.status === 'inactive' ? 'Unblocked' : 'Blocked'} driver ${d.name}`)
                              setRefreshKey(k => k + 1)
                            }} className={`px-2.5 py-1 rounded-lg text-[10px] font-medium ${d.status === 'inactive' ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#FEE2E2] text-[#991B1B]'}`}>
                              {d.status === 'inactive' ? 'Unblock' : 'Block'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                {drivers.length === 0 && <p className="text-[12px] text-[#6B7280]">No drivers registered yet.</p>}
              </div>
            </>
          )}

          {/* ===== CNG STATIONS ===== */}
          {tab === 'stations' && (
            <>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h1 className="text-xl sm:text-[22px] font-bold text-[#111827]">CNG Partner Stations</h1>
                <button onClick={() => setShowAddStation(v => !v)}
                  className="h-9 px-4 rounded-lg bg-[#E10600] text-white text-[12px] font-medium">
                  {showAddStation ? '✕ Cancel' : '+ Add Station'}
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                {KPI('Total Stations', String(stations.length))}
                {KPI('Active', String(stations.filter(s => s.status === 'active').length))}
                {KPI('Disabled', String(stations.filter(s => s.status === 'inactive').length))}
              </div>

              {showAddStation && (
                <div className="mb-5 p-4 bg-white rounded-xl border border-[#E2E6EB]">
                  <p className="font-bold text-[13px] text-[#111827] mb-3">⛽ New Partner Station</p>
                  <form onSubmit={e => {
                    e.preventDefault()
                    if (!newStation.name || !newStation.city) return
                    const added = [...stations, {
                      id: 'stn_' + Date.now(),
                      name: sanitizeInput(newStation.name),
                      city: sanitizeInput(newStation.city),
                      address: sanitizeInput(newStation.address),
                      rate: sanitizeInput(newStation.rate),
                      status: 'active' as const,
                    }]
                    saveStations(added)
                    addAuditLog('add_station', `Added CNG station: ${newStation.name}, ${newStation.city}`)
                    setNewStation({ name: '', city: '', address: '', rate: '' })
                    setShowAddStation(false)
                    setRefreshKey(k => k + 1)
                  }} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider block mb-1">Station Name *</label>
                      <input required value={newStation.name} onChange={e => setNewStation(p => ({ ...p, name: e.target.value }))}
                        placeholder="e.g. HP CNG — Alkapuri"
                        className="w-full h-9 px-3 bg-[#F5F6F8] border border-[#E2E6EB] rounded-lg text-[12px]" />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider block mb-1">City *</label>
                      <input required value={newStation.city} onChange={e => setNewStation(p => ({ ...p, city: e.target.value }))}
                        placeholder="e.g. Vadodara"
                        className="w-full h-9 px-3 bg-[#F5F6F8] border border-[#E2E6EB] rounded-lg text-[12px]" />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider block mb-1">Address</label>
                      <input value={newStation.address} onChange={e => setNewStation(p => ({ ...p, address: e.target.value }))}
                        placeholder="e.g. Near Sayajibaug Gate"
                        className="w-full h-9 px-3 bg-[#F5F6F8] border border-[#E2E6EB] rounded-lg text-[12px]" />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider block mb-1">CNG Rate (₹/Kg)</label>
                      <input type="number" value={newStation.rate} onChange={e => setNewStation(p => ({ ...p, rate: e.target.value }))}
                        placeholder="e.g. 96"
                        className="w-full h-9 px-3 bg-[#F5F6F8] border border-[#E2E6EB] rounded-lg text-[12px]" />
                    </div>
                    <div className="sm:col-span-2 flex justify-end">
                      <button type="submit" className="h-9 px-5 bg-[#E10600] text-white text-[12px] font-bold rounded-lg">Add Station</button>
                    </div>
                  </form>
                </div>
              )}

              <div className="space-y-1.5">
                {stations.length === 0 && (
                  <div className="p-6 rounded-xl bg-white border border-[#E2E6EB] text-center">
                    <p className="text-[13px] font-semibold text-[#111827] mb-1">No stations added yet</p>
                    <p className="text-[12px] text-[#6B7280]">Click "Add Station" to register your first CNG partner station.</p>
                  </div>
                )}
                {stations.map(s => (
                  <div key={s.id} className="p-3 sm:p-4 rounded-xl bg-white border border-[#E2E6EB]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <p className="font-semibold text-[13px] text-[#111827]">{s.name}</p>
                          <Badge label={s.status === 'active' ? 'Active' : 'Disabled'} color={s.status === 'active' ? 'green' : 'red'} />
                        </div>
                        <p className="text-[11px] text-[#6B7280]">
                          {s.city}{s.address ? ` · ${s.address}` : ''}{s.rate ? ` · ₹${s.rate}/Kg` : ''}
                        </p>
                      </div>
                      <div className="shrink-0 flex gap-1.5">
                        <button onClick={() => {
                          saveStations(stations.map(x => x.id === s.id ? { ...x, status: s.status === 'active' ? 'inactive' : 'active' } : x))
                          addAuditLog(s.status === 'active' ? 'disable_station' : 'enable_station', `${s.status === 'active' ? 'Disabled' : 'Enabled'} station ${s.name}`)
                        }} className={`px-2.5 py-1 rounded-lg text-[10px] font-medium ${s.status === 'active' ? 'bg-[#FEF3C7] text-[#92400E]' : 'bg-[#DCFCE7] text-[#166534]'}`}>
                          {s.status === 'active' ? 'Disable' : 'Enable'}
                        </button>
                        <button onClick={() => {
                          if (confirm(`Remove ${s.name}?`)) {
                            saveStations(stations.filter(x => x.id !== s.id))
                            addAuditLog('remove_station', `Removed station ${s.name}`)
                          }
                        }} className="px-2.5 py-1 rounded-lg bg-[#FEE2E2] text-[#991B1B] text-[10px] font-medium">Remove</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ===== LOAD MATCH ===== */}
          {tab === 'loadmatch' && (() => {
            const activeLoads = loadListings.filter(l => l.status === 'active')
            const pendingBookings = loadBookings.filter(b => b.status === 'pending')
            const approvedBookings = loadBookings.filter(b => b.status === 'approved')
            return (
              <>
                <h1 className="text-xl sm:text-[22px] font-bold mb-4 text-[#111827]">Load Match</h1>

                {/* KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  {[
                    { label: 'Active Loads', value: activeLoads.length, color: '#10B981' },
                    { label: 'Total Listings', value: loadListings.length, color: '#3B82F6' },
                    { label: 'Pending Requests', value: pendingBookings.length, color: '#F59E0B' },
                    { label: 'Approved', value: approvedBookings.length, color: '#8B5CF6' },
                  ].map(k => (
                    <div key={k.label} className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                      <p className="text-[11px] text-[#9CA3AF] font-medium mb-1">{k.label}</p>
                      <p className="text-[24px] font-black" style={{ color: k.color, fontFamily: "'Archivo', sans-serif" }}>{k.value}</p>
                    </div>
                  ))}
                </div>

                {/* ── Post New Load ── */}
                <div className="bg-white rounded-xl border border-[#E2E6EB] p-4 mb-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-bold text-[13px] text-[#111827]">📦 Load Listings</p>
                    <button onClick={() => setShowAddLoad(p => !p)}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[#111827] text-white">
                      {showAddLoad ? '✕ Cancel' : '+ Post New Load'}
                    </button>
                  </div>

                  {showAddLoad && (
                    <div className="border-t border-[#E2E6EB] pt-4 mb-4">
                      <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-3">New Load Details</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                        {[
                          { key: 'from', label: 'From City', placeholder: 'e.g. Vadodara' },
                          { key: 'to', label: 'To City', placeholder: 'e.g. Ahmedabad' },
                          { key: 'cargo', label: 'Cargo Type', placeholder: 'e.g. Electronics' },
                          { key: 'weight', label: 'Weight', placeholder: 'e.g. 480 Kg' },
                          { key: 'rate', label: 'Freight Rate', placeholder: 'e.g. ₹3,500' },
                          { key: 'vehicleType', label: 'Vehicle Type', placeholder: 'e.g. Tata Ace' },
                          { key: 'distance', label: 'Distance', placeholder: 'e.g. 110 km' },
                        ].map(field => (
                          <div key={field.key}>
                            <label className="text-[10px] text-[#6B7280] font-medium block mb-1">{field.label}</label>
                            <input value={(newLoad as any)[field.key]}
                              onChange={e => setNewLoad(p => ({ ...p, [field.key]: e.target.value }))}
                              placeholder={field.placeholder}
                              className="w-full h-9 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px] focus:border-[#111827] focus:outline-none" />
                          </div>
                        ))}
                        <div>
                          <label className="text-[10px] text-[#6B7280] font-medium block mb-1">Available</label>
                          <select value={newLoad.available} onChange={e => setNewLoad(p => ({ ...p, available: e.target.value }))}
                            className="w-full h-9 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px] focus:outline-none">
                            <option>Today</option><option>Tomorrow</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-[#6B7280] font-medium block mb-1">Category</label>
                          <select value={newLoad.category} onChange={e => setNewLoad(p => ({ ...p, category: e.target.value }))}
                            className="w-full h-9 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px] focus:outline-none">
                            <option>Light</option><option>Medium</option>
                          </select>
                        </div>
                      </div>
                      <button onClick={() => {
                        if (!newLoad.from || !newLoad.to || !newLoad.cargo) return
                        const listing: LoadListing = {
                          id: Date.now().toString(),
                          from: sanitizeInput(newLoad.from),
                          to: sanitizeInput(newLoad.to),
                          cargo: sanitizeInput(newLoad.cargo),
                          weight: sanitizeInput(newLoad.weight) || '—',
                          rate: sanitizeInput(newLoad.rate) || '—',
                          vehicleType: sanitizeInput(newLoad.vehicleType) || '—',
                          distance: sanitizeInput(newLoad.distance) || '—',
                          available: newLoad.available,
                          category: newLoad.category,
                          status: 'active',
                          createdAt: new Date().toISOString(),
                        }
                        saveLoadListings([listing, ...loadListings])
                        setNewLoad({ from: '', to: '', cargo: '', weight: '', rate: '', vehicleType: '', distance: '', available: 'Today', category: 'Light' })
                        setShowAddLoad(false)
                      }} className="px-4 py-2 bg-[#E10600] text-white text-[12px] font-bold rounded-lg">
                        Post Load
                      </button>
                    </div>
                  )}

                  {/* Listings list */}
                  {loadListings.length === 0 ? (
                    <p className="text-[12px] text-[#9CA3AF] text-center py-6">No loads posted yet. Click "+ Post New Load" to add one.</p>
                  ) : (
                    <div className="space-y-2">
                      {loadListings.map(l => (
                        <div key={l.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[#E2E6EB] bg-[#F9FAFB]">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${l.status === 'active' ? 'bg-green-500' : 'bg-amber-400'}`} />
                            <div className="min-w-0">
                              <p className="text-[12px] font-bold text-[#111827] truncate">{l.from} → {l.to} · {l.cargo}</p>
                              <p className="text-[10px] text-[#6B7280]">{l.weight} · {l.rate} · {l.vehicleType} · {l.available}</p>
                            </div>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            <button onClick={() => saveLoadListings(loadListings.map(x => x.id === l.id ? { ...x, status: l.status === 'active' ? 'paused' : 'active' } : x))}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-medium ${l.status === 'active' ? 'bg-[#FEF3C7] text-[#92400E]' : 'bg-[#DCFCE7] text-[#166534]'}`}>
                              {l.status === 'active' ? 'Pause' : 'Activate'}
                            </button>
                            <button onClick={() => { if (confirm(`Remove this load?`)) saveLoadListings(loadListings.filter(x => x.id !== l.id)) }}
                              className="px-2.5 py-1 rounded-lg bg-[#FEE2E2] text-[#991B1B] text-[10px] font-medium">Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Booking Requests ── */}
                <div className="bg-white rounded-xl border border-[#E2E6EB] p-4">
                  <div className="flex items-center justify-between mb-4">
                    <p className="font-bold text-[13px] text-[#111827]">🚛 Booking Requests</p>
                    <button onClick={() => {
                      try { setLoadBookings(JSON.parse(localStorage.getItem('cng_load_bookings') || '[]')) } catch {}
                    }} className="text-[10px] font-medium text-[#6B7280] hover:text-[#111827]">↻ Refresh</button>
                  </div>

                  {loadBookings.length === 0 ? (
                    <p className="text-[12px] text-[#9CA3AF] text-center py-6">No booking requests yet. Drivers will appear here when they book a load.</p>
                  ) : (
                    <div className="space-y-3">
                      {loadBookings.map(b => {
                        const timeAgo = (() => {
                          const diff = Date.now() - new Date(b.time).getTime()
                          const m = Math.floor(diff / 60000)
                          if (m < 60) return `${m}m ago`
                          const h = Math.floor(m / 60)
                          if (h < 24) return `${h}h ago`
                          return `${Math.floor(h / 24)}d ago`
                        })()
                        return (
                          <div key={b.id} className="p-3 rounded-xl border border-[#E2E6EB] bg-[#F9FAFB]">
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div className="min-w-0">
                                <p className="text-[12px] font-black text-[#111827]">{b.cargo} · {b.from} → {b.to}</p>
                                <p className="text-[10px] text-[#6B7280] mt-0.5">{b.rate} · {b.weight} · {b.vehicleType}</p>
                              </div>
                              <span className={`shrink-0 text-[9px] font-bold rounded-full px-2 py-0.5 uppercase ${
                                b.status === 'approved' ? 'bg-green-100 text-green-700' :
                                b.status === 'rejected' ? 'bg-red-100 text-red-700' :
                                'bg-amber-100 text-amber-700'
                              }`}>{b.status}</span>
                            </div>
                            <div className="flex items-center gap-3 mb-2">
                              <p className="text-[11px] text-[#374151]">
                                <span className="font-bold">{b.contactName || b.driverName || 'Unknown Driver'}</span>
                                {b.contactPhone ? ` · 📞 ${b.contactPhone}` : ''}
                              </p>
                              <span className="text-[10px] text-[#9CA3AF]">{timeAgo}</span>
                            </div>
                            {b.status === 'pending' && (
                              <div className="flex gap-2 mt-2">
                                <button onClick={() => saveLoadBookings(loadBookings.map(x => x.id === b.id ? { ...x, status: 'approved' } : x))}
                                  className="flex-1 py-1.5 bg-[#DCFCE7] text-[#166534] text-[11px] font-bold rounded-lg">
                                  ✓ Approve
                                </button>
                                <button onClick={() => saveLoadBookings(loadBookings.map(x => x.id === b.id ? { ...x, status: 'rejected' } : x))}
                                  className="flex-1 py-1.5 bg-[#FEE2E2] text-[#991B1B] text-[11px] font-bold rounded-lg">
                                  ✕ Reject
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )
          })()}

          {/* ===== REPORTS ===== */}
          {tab === 'reports' && (
            <>
              <h1 className="text-xl sm:text-[22px] font-bold mb-4 text-[#111827]">{t('reports', lang)}</h1>

              {/* ── Visual Analytics ── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                {KPI('Total KGs Dispensed', `${totalKgsDispensed.toFixed(0)} Kg`)}
                {KPI('Total Revenue', `₹${(totalDue/1000).toFixed(1)}k`)}
                {KPI('Collection Rate', `${collectionRate}%`)}
                {KPI('Wallet Savings', `₹${totalWalletSavings}`)}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                  <p className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">7-Day Fill Volume (Kg/day)</p>
                  <LineChart data={dailyKgs} labels={dayLabels} color="#E10600" height={100} />
                </div>
                <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                  <p className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">7-Day Fill Count</p>
                  <LineChart data={dailyFillCount} labels={dayLabels} color="#4338ca" height={100} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                  <p className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider mb-2">Credit Issued (7 days)</p>
                  <LineChart data={dailyCredit} labels={dayLabels} color="#E10600" height={90} />
                </div>
                <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                  <p className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider mb-2">Payment Recovered (7 days)</p>
                  <LineChart data={dailyRecovery} labels={dayLabels} color="#059669" height={90} />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white border border-[#E2E6EB] mb-4">
                <p className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider mb-3">Top Owners by Fuel Usage</p>
                <div className="space-y-2.5">
                  {topOwners.map((o, i) => {
                    const maxUsed = topOwners[0]?.stats?.used || 1
                    const pct = Math.round((o.stats.used / maxUsed) * 100)
                    return (
                      <div key={o.id} className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-[#9CA3AF] w-4 shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-[11px] mb-0.5">
                            <span className="truncate font-medium text-[#111827]">{o.business}</span>
                            <span className="text-[#6B7280] shrink-0 ml-2">₹{(o.stats.used/1000).toFixed(1)}k · {o.stats.fills} fills</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-[#F3F4F6]">
                            <div className="h-full rounded-full bg-[#E10600] transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-[#E10600] w-8 text-right shrink-0">{pct}%</span>
                      </div>
                    )
                  })}
                  {topOwners.length === 0 && <p className="text-[12px] text-[#6B7280]">No data yet</p>}
                </div>
              </div>

              {/* ── CSV Exports ── */}
              <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-3">Export Data (CSV)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button onClick={() => expCSV('owners.csv', ['Business', 'Name', 'Email', 'Phone', 'Status', 'Risk', 'Credit Limit', 'Total Used', 'Total Paid', 'Pending', 'Drivers', 'Vehicles'],
                  owners.map(o => { const s = getOwnerStats(o.id); const r = calcRiskColor(o.id); return [o.business, o.name, o.email, o.phone, o.status, r, o.creditLimit || 0, s.used, s.paid, s.pending, s.drivers, s.vehicles] })
                )} className="p-4 rounded-xl bg-white border border-[#E2E6EB] text-left hover:bg-[#F9FAFB]">
                  <p className="font-semibold text-[13px] text-[#111827]">📋 {t('exportOwners', lang)}</p>
                  <p className="text-[10px] text-[#6B7280] mt-0.5">{t('exportOwnersDesc', lang)}</p>
                </button>
                <button onClick={() => expCSV('fills.csv', ['ID', 'Vehicle', 'Driver', 'Date', 'Station', 'KGs', 'Rate', 'Total', 'Owner', 'Verified', 'Fraud Flag'],
                  fills.map(f => {
                    const v = vehicles.find(ve => ve.plate === f.vehicleId || String(ve.id) === String(f.vehicleId)); const d = drivers.find(dr => dr.id === f.driverId)
                    const o = owners.find(ow => ow.id === f.ownerId)
                    const flagged = f.mismatch || f.fuelDropPercent > 20 ? 'Yes' : 'No'
                    return [f.id, v?.plate || f.vehicleId, d?.name || f.driverId, new Date(f.time).toLocaleDateString(), f.station, f.kgs, f.rate, f.total, o?.business || '', f.verified ? 'Yes' : 'No', flagged]
                  })
                )} className="p-4 rounded-xl bg-white border border-[#E2E6EB] text-left hover:bg-[#F9FAFB]">
                  <p className="font-semibold text-[13px] text-[#111827]">⛽ {t('exportAllFills', lang)}</p>
                  <p className="text-[10px] text-[#6B7280] mt-0.5">{t('exportAllFillsDesc', lang)}</p>
                </button>
                <button onClick={() => expCSV('pending_payments.csv', ['Owner', 'Business', 'Total Used', 'Total Paid', 'Pending', 'Vehicles', 'Last Fill'],
                  owners.map(o => { const s = getOwnerStats(o.id); return s.pending > 0 ? [o.name, o.business, s.used, s.paid, s.pending, s.vehicles, s.lastFill ? new Date(s.lastFill).toLocaleDateString() : 'N/A'] : null }).filter((x): x is any[] => x !== null)
                )} className="p-4 rounded-xl bg-white border border-[#E2E6EB] text-left hover:bg-[#F9FAFB]">
                  <p className="font-semibold text-[13px] text-[#111827]">📊 {t('exportPendingPayments', lang)}</p>
                  <p className="text-[10px] text-[#6B7280] mt-0.5">{t('exportPendingPaymentsDesc', lang)}</p>
                </button>
                <button onClick={() => expCSV('payment_summary.csv', ['Owner', 'Business', 'Total Used', 'Total Paid', 'Pending', 'Collection %'],
                  owners.map(o => { const s = getOwnerStats(o.id); return [o.name, o.business, s.used, s.paid, s.pending, s.used > 0 ? ((s.paid/s.used)*100).toFixed(0) + '%' : '0%'] })
                )} className="p-4 rounded-xl bg-white border border-[#E2E6EB] text-left hover:bg-[#F9FAFB]">
                  <p className="font-semibold text-[13px] text-[#111827]">💰 {t('paymentSummary', lang)}</p>
                  <p className="text-[10px] text-[#6B7280] mt-0.5">{t('paymentSummaryDesc', lang)}</p>
                </button>
                <button onClick={() => expCSV('fraud_alerts.csv', ['ID', 'Event', 'Type', 'Risk', 'User', 'Owner', 'Time', 'Resolved'],
                  alerts.map(a => { const o = owners.find(ow => ow.id === a.ownerId); const risk = a.type === 'fuel_drop' ? 'Critical' : a.type === 'vehicle_override' ? 'High' : 'Medium'; return [a.id, a.event, a.type, risk, a.user, o?.business || '', new Date(a.time).toLocaleString(), a.resolved ? 'Yes' : 'No'] })
                )} className="p-4 rounded-xl bg-white border border-[#E2E6EB] text-left hover:bg-[#F9FAFB]">
                  <p className="font-semibold text-[13px] text-[#111827]">🛡 {t('exportFraudAlerts', lang)}</p>
                  <p className="text-[10px] text-[#6B7280] mt-0.5">{t('exportFraudAlertsDesc', lang)}</p>
                </button>
                <button onClick={() => expCSV('credit_actions.csv', ['ID', 'Type', 'Amount', 'Owner', 'Notes', 'Date'],
                  creditActions.map(ca => { const o = owners.find(ow => ow.id === ca.ownerId); return [ca.id, ca.type, ca.amount, o?.business || ca.ownerId, ca.notes || '', new Date(ca.timestamp).toLocaleDateString()] })
                )} className="p-4 rounded-xl bg-white border border-[#E2E6EB] text-left hover:bg-[#F9FAFB]">
                  <p className="font-semibold text-[13px] text-[#111827]">💰 {t('exportCreditActions', lang)}</p>
                  <p className="text-[10px] text-[#6B7280] mt-0.5">{t('exportCreditActionsDesc', lang)}</p>
                </button>
              </div>
            </>
          )}

          {/* ===== NOTIFICATIONS ===== */}
          {tab === 'notifications' && (
            <>
              <div className="flex items-center justify-between mb-3">
                <h1 className="text-xl sm:text-[22px] font-bold text-[#111827]">{t('notifications', lang)}</h1>
                <div className="flex gap-2">
                  {(['all', 'unread'] as const).map(f => (
                    <button key={f} onClick={() => setNotifFilter(f)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-medium ${notifFilter === f ? 'bg-[#E10600] text-white' : 'bg-[#F5F6F8] text-[#6B7280]'}`}
                    >{t(f, lang)}</button>
                  ))}
                  {unreadNotifs > 0 && (
                    <button onClick={() => { storage.saveNotifications(notifications.map(n => ({ ...n, read: true }))); setRefreshKey(k => k + 1) }}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-[#DBEAFE] text-[#1E40AF]">{t('markAllRead', lang)}</button>
                  )}
                </div>
              </div>

              {/* Send Announcement Form */}
              <form onSubmit={handleSendCustomNotification} className="mb-6 p-4 bg-white border border-[#E2E6EB] rounded-xl space-y-4 shadow-sm">
                <p className="font-bold text-[13px] text-[#111827] flex items-center gap-1.5">
                  <span>📢</span> Send Custom Announcement / Message
                </p>
                
                {customNotifSuccess && (
                  <div className="p-3 bg-[#DCFCE7] border border-[#BBF7D0] text-[#166534] text-[11px] rounded-lg font-medium flex items-center gap-1.5">
                    <span className="text-[13px] font-bold">✓</span> Announcement broadcasted successfully!
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">Target Audience</label>
                    <select
                      value={customNotifTargetType}
                      onChange={e => {
                        setCustomNotifTargetType(e.target.value as any);
                        setCustomNotifTargetId('');
                      }}
                      className="h-10 px-3 bg-[#F5F6F8] border border-[#E2E6EB] rounded-lg text-[12px] focus:outline-none focus:border-[#E10600]"
                    >
                      <option value="all">All Users</option>
                      <option value="owner">All Fleet Owners</option>
                      <option value="driver">All Drivers</option>
                      <option value="specific_owner">Specific Fleet Owner</option>
                      <option value="specific_driver">Specific Driver</option>
                    </select>
                  </div>

                  {/* Conditionally show Specific Target dropdown */}
                  {(customNotifTargetType === 'specific_owner' || customNotifTargetType === 'specific_driver') && (
                    <div className="flex flex-col gap-1 animate-fadeIn">
                      <label className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">
                        {customNotifTargetType === 'specific_owner' ? 'Select Fleet Owner' : 'Select Driver'}
                      </label>
                      <select
                        value={customNotifTargetId}
                        onChange={e => setCustomNotifTargetId(e.target.value)}
                        className="h-10 px-3 bg-[#F5F6F8] border border-[#E2E6EB] rounded-lg text-[12px] focus:outline-none focus:border-[#E10600]"
                        required
                      >
                        <option value="">-- Choose target --</option>
                        {customNotifTargetType === 'specific_owner' 
                          ? owners.map(o => (
                              <option key={o.id} value={o.id}>{o.business} ({o.name})</option>
                            ))
                          : drivers.map(d => (
                              <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                            ))
                        }
                      </select>
                    </div>
                  )}

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">Severity Level</label>
                    <select
                      value={customNotifSeverity}
                      onChange={e => setCustomNotifSeverity(e.target.value as any)}
                      className="h-10 px-3 bg-[#F5F6F8] border border-[#E2E6EB] rounded-lg text-[12px] focus:outline-none focus:border-[#E10600]"
                    >
                      <option value="info">Info (Blue)</option>
                      <option value="warning">Warning (Orange)</option>
                      <option value="critical">Critical (Red)</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">Message Details</label>
                  <textarea
                    value={customNotifMessage}
                    onChange={e => setCustomNotifMessage(e.target.value)}
                    placeholder="Type the message to send..."
                    className="w-full h-16 p-3 bg-[#F5F6F8] border border-[#E2E6EB] rounded-lg text-[12px] focus:outline-none focus:border-[#E10600] resize-none"
                    required
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={!customNotifMessage.trim() || ((customNotifTargetType === 'specific_owner' || customNotifTargetType === 'specific_driver') && !customNotifTargetId)}
                    className="h-9 px-4 bg-[#E10600] text-white text-[12px] font-bold rounded-lg hover:bg-[#C00500] disabled:opacity-50 transition-colors shadow-sm"
                  >
                    Send Message
                  </button>
                </div>
              </form>

              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2">System Alerts & Notifications Logs</p>
                {notifications.slice().reverse().filter(n => notifFilter === 'all' || !n.read).map(n => (
                  <div key={n.id} className={`p-3 rounded-xl border text-[11px] ${n.read ? 'bg-white border-[#E2E6EB]' : 'bg-[#FFFBEB] border-[#FDE68A]'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Badge label={t(n.severity, lang)} color={n.severity === 'critical' ? 'red' : n.severity === 'warning' ? 'amber' : 'blue'} />
                        <div>
                          <p className="font-medium text-[#111827]">{n.message}</p>
                          <p className="text-[10px] text-[#6B7280]">{new Date(n.timestamp).toLocaleString()} • {t(n.type, lang)}</p>
                        </div>
                      </div>
                      {!n.read && (
                        <button onClick={() => { storage.saveNotifications(notifications.map(x => x.id === n.id ? { ...x, read: true } : x)); setRefreshKey(k => k + 1) }}
                          className="px-2.5 py-1 rounded-lg bg-white border border-[#E2E6EB] text-[10px] font-medium text-[#6B7280]">{t('read', lang)}</button>
                      )}
                    </div>
                  </div>
                ))}
                {notifications.length === 0 && <p className="text-[12px] text-[#6B7280]">{t('noNotifications', lang)}</p>}
              </div>
            </>
          )}

          {/* ===== AUDIT LOGS ===== */}
          {tab === 'audit' && (
            <>
              <h1 className="text-xl sm:text-[22px] font-bold mb-3 text-[#111827]">{t('auditLogs', lang)}</h1>
              <div className="flex gap-2 mb-4 flex-wrap">
                {(['all', 'issue_credit', 'mark_paid', 'block_owner', 'unblock_owner', 'freeze_credit', 'unfreeze_credit', 'set_credit_limit', 'add_note', 'resolve_alert', 'freeze_account'] as const).map(f => (
                  <button key={f} onClick={() => setAuditFilter(f)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-medium ${auditFilter === f ? 'bg-[#E10600] text-white' : 'bg-[#F5F6F8] text-[#6B7280]'}`}
                  >{f === 'all' ? t('all', lang) : t(f, lang)}</button>
                ))}
              </div>
              <div className="space-y-1">
                {auditLogs.slice().reverse().filter(a => auditFilter === 'all' || a.action === auditFilter).map(a => (
                  <div key={a.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-white border border-[#E2E6EB] text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#6B7280] mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-[#111827] capitalize">{a.action.replace(/_/g, ' ')}</span>
                        <Badge label={t(a.targetType, lang)} color="gray" />
                      </div>
                      <p className="text-[#6B7280]">{a.details}</p>
                      <p className="text-[#9CA3AF] text-[10px]">{a.adminName} • {new Date(a.timestamp).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
                {auditLogs.length === 0 && <p className="text-[12px] text-[#6B7280]">{t('noAuditLogs', lang)}</p>}
              </div>
            </>
          )}

          {/* ===== SETTINGS ===== */}
          {tab === 'settings' && (
            <>
              <h1 className="text-xl sm:text-[22px] font-bold mb-4 text-[#111827]">{t('settings', lang)}</h1>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                  <p className="font-semibold text-[13px] text-[#111827] mb-3">{t('creditPolicies', lang)}</p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] text-[#6B7280] block mb-1">{t('maxDailyUsage', lang)} (₹)</label>
                      <input defaultValue={settings.maxDailyUsage || 50000} onBlur={e => { storage.saveSettings({ ...settings, maxDailyUsage: parseInt(e.target.value) || 50000 }) }}
                        className="w-full h-9 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px]" type="number" />
                    </div>
                    <div>
                      <label className="text-[11px] text-[#6B7280] block mb-1">{t('maxTransaction', lang)} (₹)</label>
                      <input defaultValue={settings.maxTransaction || 10000} onBlur={e => { storage.saveSettings({ ...settings, maxTransaction: parseInt(e.target.value) || 10000 }) }}
                        className="w-full h-9 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px]" type="number" />
                    </div>
                    <div>
                      <label className="text-[11px] text-[#6B7280] block mb-1">{t('defaultMonthlyLimit', lang)} (₹)</label>
                      <input defaultValue={settings.monthlyLimit || 200000} onBlur={e => { storage.saveSettings({ ...settings, monthlyLimit: parseInt(e.target.value) || 200000 }) }}
                        className="w-full h-9 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px]" type="number" />
                    </div>
                    <div>
                      <label className="text-[11px] text-[#6B7280] block mb-1">{t('autoFreezeAfter', lang)} ({t('daysOverdue', lang)})</label>
                      <input defaultValue={settings.autoFreezeDays || 30} onBlur={e => { storage.saveSettings({ ...settings, autoFreezeDays: parseInt(e.target.value) || 30 }) }}
                        className="w-full h-9 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px]" type="number" />
                    </div>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                  <p className="font-semibold text-[13px] text-[#111827] mb-3">{t('fraudSensitivity', lang)}</p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] text-[#6B7280] block mb-1">{t('fuelDropThreshold', lang)} (%)</label>
                      <input defaultValue={settings.fuelDropThreshold || 20} onBlur={e => { storage.saveSettings({ ...settings, fuelDropThreshold: parseInt(e.target.value) || 20 }) }}
                        className="w-full h-9 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px]" type="number" />
                      <p className="text-[10px] text-[#9CA3AF] mt-0.5">{t('fuelDropThresholdDesc', lang)}</p>
                    </div>
                    <div>
                      <label className="text-[11px] text-[#6B7280] block mb-1">{t('locationMismatchDist', lang)}</label>
                      <input defaultValue={settings.locationMismatchDist || 100} onBlur={e => { storage.saveSettings({ ...settings, locationMismatchDist: parseInt(e.target.value) || 100 }) }}
                        className="w-full h-9 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px]" type="number" />
                      <p className="text-[10px] text-[#9CA3AF] mt-0.5">{t('locationMismatchDistDesc', lang)}</p>
                    </div>
                    <div>
                      <label className="text-[11px] text-[#6B7280] block mb-1">{t('minTimeBetweenFills', lang)}</label>
                      <input defaultValue={settings.minTimeBetweenFills || 30} onBlur={e => { storage.saveSettings({ ...settings, minTimeBetweenFills: parseInt(e.target.value) || 30 }) }}
                        className="w-full h-9 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px]" type="number" />
                      <p className="text-[10px] text-[#9CA3AF] mt-0.5">{t('minTimeBetweenFillsDesc', lang)}</p>
                    </div>
                    <div>
                      <label className="text-[11px] text-[#6B7280] block mb-1">{t('penaltyRate', lang)}</label>
                      <input defaultValue={settings.penaltyRate || 2} onBlur={e => { storage.saveSettings({ ...settings, penaltyRate: parseInt(e.target.value) || 2 }) }}
                        className="w-full h-9 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px]" type="number" />
                      <p className="text-[10px] text-[#9CA3AF] mt-0.5">{t('penaltyRateDesc', lang)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
