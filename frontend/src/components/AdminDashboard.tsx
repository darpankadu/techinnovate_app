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
import { googleSync } from '../lib/googleSync'
import { t } from '../lib/translations'
import type { Language, Role, Driver, Owner, Vehicle, Fill, Alert, CameraCapture, CreditAction, PaymentEntry, AuditLog } from '../lib/types'
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
  const [txSearch, setTxSearch] = useState('')
  const [fraudFilter, setFraudFilter] = useState<'all' | 'active' | 'resolved'>('all')
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread'>('all')
  const [auditFilter, setAuditFilter] = useState('all')
  const [refreshKey, setRefreshKey] = useState(0)

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
    { key: 'dashboard', label: 'Dashboard', icon: 'â–¦' },
    { key: 'owners', label: 'Owners', icon: 'ðŸ‘¥' },
    { key: 'credit', label: 'Credit', icon: 'ðŸ’°' },
    { key: 'payments', label: 'Payments', icon: 'ðŸ’³' },
    { key: 'transactions', label: 'Transactions', icon: 'ðŸ“‹' },
    { key: 'fraud', label: 'Fraud Center', icon: 'ðŸ›¡' },
    { key: 'reports', label: 'Reports', icon: 'ðŸ“Š' },
    { key: 'notifications', label: 'Notifications', icon: 'ðŸ””' },
    { key: 'audit', label: 'Audit Logs', icon: 'ðŸ“œ' },
    { key: 'settings', label: 'Settings', icon: 'âš™' },
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
          <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider px-3 pb-3 pt-2">Admin Panel</p>
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
              <span>â†»</span> <span>Refresh</span>
            </button>
            <div className="px-3 pt-2 text-[10px] text-[#9CA3AF]">
              {syncStatus === 'synced' && <span className="text-[#059669]">â— Data synced</span>}
              {syncStatus === 'failed' && <span className="text-[#991B1B]">â— Sync failed â€” reload to retry</span>}
              {syncStatus === 'syncing' && <span className="text-[#1E40AF]">â— Syncing...</span>}
            </div>
          </div>
        </div>
        <div className="flex-1 p-4 sm:p-5 max-w-full sm:max-w-[1000px]">

          {/* ===== DASHBOARD ===== */}
          {tab === 'dashboard' && (
            <>
              <h1 className="text-xl sm:text-[22px] font-bold mb-4 text-[#111827]">Master Dashboard</h1>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-5">
                {KPI('Total Owners', String(owners.length))}
                {KPI('Active Credits', String(owners.filter(o => o.status === 'active').length))}
                {KPI('Total Outstanding', `â‚¹${(totalPending/1000).toFixed(1)}k`)}
                {KPI("Today's Fuel Value", `â‚¹${(todayFuelValue/1000).toFixed(1)}k`)}
                {KPI('Blocked Owners', String(blockedOwners.length), blockedOwners.length > 0 ? 'Requires review' : undefined)}
                {KPI('Overdue Owners', String(overdueOwners.length), overdueOwners.length > 0 ? 'Payment overdue' : undefined)}
                {KPI('Fraud Alerts', String(fraudAlerts.length), fraudAlerts.length > 0 ? 'Needs investigation' : undefined)}
                {KPI('Total Collections', `â‚¹${(totalPaidAmt/1000).toFixed(1)}k`, `${totalDue > 0 ? ((totalPaidAmt/totalDue)*100).toFixed(0) : '0'}% recovery`)}
                {KPI('Total Drivers', String(drivers.length), `${drivers.filter(d => d.status === 'active').length} active`)}
                {KPI('Total Vehicles', String(vehicles.length), `${vehicles.filter(v => v.status === 'active').length} active`)}
                {KPI('Total Fills', String(fills.length), `${fills.filter(f => f.verified).length} verified`)}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                  <p className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">Credit Issued vs Recovery (7 days)</p>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <p className="text-[10px] text-[#6B7280] mb-1">Issued</p>
                      <MiniBar data={dayLabels.map((l, i) => ({ label: l, value: dailyCredit[i], color: '#E10600' }))} />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] text-[#6B7280] mb-1">Recovered</p>
                      <MiniBar data={dayLabels.map((l, i) => ({ label: l, value: dailyRecovery[i], color: '#059669' }))} />
                    </div>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                  <p className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">Top Owners by Fuel Usage</p>
                  <div className="space-y-2">
                    {topOwners.map((o, i) => {
                      const maxUsed = topOwners[0]?.stats?.used || 1
                      return (
                        <div key={o.id} className="flex items-center gap-2">
                          <span className="text-[10px] text-[#6B7280] w-4">{i + 1}.</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between text-[11px]">
                              <span className="truncate">{o.business}</span>
                              <span className="font-medium">â‚¹{(o.stats.used/1000).toFixed(1)}k</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-[#F5F6F8] mt-0.5">
                              <div className="h-full rounded-full bg-[#E10600]" style={{ width: `${(o.stats.used / maxUsed) * 100}%` }} />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {topOwners.length === 0 && <p className="text-[12px] text-[#6B7280]">No data</p>}
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">Live Activity Feed</h3>
                <div className="space-y-1.5">
                  {auditLogs.length > 0 ? auditLogs.slice(-10).reverse().map(a => (
                    <div key={a.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-white border border-[#E2E6EB] text-[11px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#E10600] mt-1 shrink-0" />
                      <div>
                        <span className="font-medium text-[#111827]">{a.action.replace(/_/g, ' ')}</span>
                        <span className="text-[#6B7280] ml-1">â€” {a.details}</span>
                        <span className="text-[#9CA3AF] ml-1">â€¢ {new Date(a.timestamp).toLocaleString()}</span>
                      </div>
                    </div>
                  )) : alerts.slice(-5).reverse().map(a => (
                    <div key={a.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-white border border-[#E2E6EB] text-[11px]">
                      <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${a.resolved ? 'bg-[#6B7280]' : 'bg-[#E10600]'}`} />
                      <div>
                        <span className="text-[#111827]">{a.event}</span>
                        <span className="text-[#6B7280] ml-1">â€” {a.user}</span>
                      </div>
                    </div>
                  ))}
                  {(auditLogs.length === 0 && alerts.length === 0) && <p className="text-[12px] text-[#6B7280]">No activity yet</p>}
                </div>
              </div>
            </>
          )}

          {/* ===== OWNERS ===== */}
          {tab === 'owners' && (
            <>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h1 className="text-xl sm:text-[22px] font-bold text-[#111827]">Owner Management</h1>
                <input value={ownerSearch} onChange={e => setOwnerSearch(e.target.value)} placeholder="Search owners..."
                  className="h-9 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px] w-[200px]" />
              </div>
              <div className="flex gap-2 mb-4 flex-wrap">
                {(['all', 'active', 'blocked'] as const).map(f => (
                  <button key={f} onClick={() => setOwnerFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-medium ${ownerFilter === f ? 'bg-[#E10600] text-white' : 'bg-[#F5F6F8] text-[#6B7280]'}`}
                  >{f.charAt(0).toUpperCase() + f.slice(1)}</button>
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
                  const riskLabel = riskColor === 'red' ? 'High Risk' : riskColor === 'amber' ? 'Medium' : 'Low Risk'
                  return (
                    <div key={o.id} className="rounded-xl bg-white border border-[#E2E6EB] overflow-hidden">
                      <div className="p-3 sm:p-4 flex items-center justify-between cursor-pointer hover:bg-[#F9FAFB]" onClick={() => setExpandedOwner(exp ? null : o.id)}>
                        <div className="flex-1 min-w-0 pr-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-[13px] text-[#111827]">{o.business}</p>
                            <Badge label={o.status === 'active' ? 'Active' : 'Blocked'} color={o.status === 'active' ? 'green' : 'red'} />
                            <Badge label={riskLabel} color={riskColor} />
                            {o.creditFrozen && <Badge label="Frozen" color="red" />}
                          </div>
                          <p className="text-[11px] text-[#6B7280]">{o.name} â€¢ {o.email} â€¢ {o.phone}</p>
                          <div className="flex gap-3 mt-1 text-[11px] text-[#6B7280] flex-wrap">
                            <span>{stats.drivers} drivers</span>
                            <span>{stats.vehicles} vehicles</span>
                            <span>{stats.fills} fills</span>
                            <span>Limit: â‚¹{((o.creditLimit || 0)/1000).toFixed(1)}k</span>
                            <span>Used: â‚¹{(stats.used/1000).toFixed(1)}k</span>
                            <span className={stats.pending > 0 ? 'text-[#991B1B] font-medium' : 'text-[#166534]'}>Pending: â‚¹{(stats.pending/1000).toFixed(1)}k</span>
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
                              className="px-2.5 py-1 rounded-lg bg-[#FEE2E2] text-[#991B1B] text-[10px] font-medium">Block</button>
                          ) : (
                            <button onClick={async () => { 
                              storage.saveOwners(owners.map(x => x.id === o.id ? { ...x, status: 'active' as const } : x)); 

                              addAuditLog('unblock_owner', `Unblocked ${o.business}`); 
                              setRefreshKey(k => k + 1) 
                            }}
                              className="px-2.5 py-1 rounded-lg bg-[#DCFCE7] text-[#166534] text-[10px] font-medium">Unblock</button>
                          )}
                          {o.creditFrozen ? (
                            <button onClick={async () => {
                              storage.saveOwners(owners.map(x => x.id === o.id ? { ...x, creditFrozen: false } : x));

                              addAuditLog('unfreeze_credit', `Unfroze credit for ${o.business}`);
                              setRefreshKey(k => k + 1);
                            }} className="px-2.5 py-1 rounded-lg bg-[#DBEAFE] text-[#1E40AF] text-[10px] font-medium">Unfreeze</button>
                          ) : (
                            <button onClick={async () => {
                              storage.saveOwners(owners.map(x => x.id === o.id ? { ...x, creditFrozen: true } : x));

                              addAuditLog('freeze_credit', `Froze credit for ${o.business}`);
                              addNotification('credit', `${o.business} credit frozen`, 'critical');
                              setRefreshKey(k => k + 1);
                            }} className="px-2.5 py-1 rounded-lg bg-[#FEF3C7] text-[#92400E] text-[10px] font-medium">Freeze</button>
                          )}
                          <button onClick={() => setEditCredit({ id: o.id, val: String(o.creditLimit || '') })} className="px-2.5 py-1 rounded-lg bg-[#DBEAFE] text-[#1E40AF] text-[10px] font-medium">Limit</button>
                          <button onClick={() => setEditNotes({ id: o.id, val: o.adminNotes || '' })} className="px-2.5 py-1 rounded-lg bg-[#F5F6F8] text-[#6B7280] text-[10px] font-medium">Note</button>
                        </div>
                      </div>
                      {exp && (
                        <div className="px-3 sm:px-4 pb-4 border-t border-[#E2E6EB] pt-3 space-y-3">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                            <div className="p-2.5 rounded-lg bg-[#F5F6F8]"><p className="text-[#6B7280]">Credit Limit</p><p className="font-semibold text-[#111827]">â‚¹{((o.creditLimit || 0)/1000).toFixed(1)}k</p></div>
                            <div className="p-2.5 rounded-lg bg-[#F5F6F8]"><p className="text-[#6B7280]">Credit Used</p><p className="font-semibold text-[#1E40AF]">â‚¹{(stats.creditUsedAmount/1000).toFixed(1)}k</p></div>
                            <div className="p-2.5 rounded-lg bg-[#F5F6F8]"><p className="text-[#6B7280]">Remaining</p><p className={`font-semibold ${stats.creditRemaining > 0 ? 'text-[#166534]' : 'text-[#991B1B]'}`}>â‚¹{(stats.creditRemaining/1000).toFixed(1)}k</p></div>
                            <div className="p-2.5 rounded-lg bg-[#F5F6F8]"><p className="text-[#6B7280]">Last Payment</p><p className="font-semibold text-[#111827]">{o.lastPaymentDate ? new Date(o.lastPaymentDate).toLocaleDateString() : 'Never'}</p></div>
                          </div>
                          {editCredit?.id === o.id && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] text-[#6B7280]">â‚¹</span>
                              <input value={editCredit.val} onChange={e => setEditCredit({ ...editCredit, val: e.target.value })}
                                className="flex-1 min-w-[120px] h-9 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px]" placeholder="Credit limit" />
                              <button onClick={async () => {
                                const newLimit = parseInt(editCredit.val) || 0;
                                storage.saveOwners(owners.map(x => x.id === o.id ? { ...x, creditLimit: newLimit } : x));
  
                                setEditCredit(null);
                                addAuditLog('set_credit_limit', `Set limit â‚¹${editCredit.val} for ${o.business}`);
                                setRefreshKey(k => k + 1);
                              }}
                                className="px-3 h-9 rounded-lg bg-[#E10600] text-white text-[11px] font-medium">Save</button>
                              <button onClick={() => setEditCredit(null)} className="px-3 h-9 rounded-lg bg-[#F5F6F8] text-[#6B7280] text-[11px]">Cancel</button>
                            </div>
                          )}
                          {editNotes?.id === o.id && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <input value={editNotes.val} onChange={e => setEditNotes({ ...editNotes, val: e.target.value })}
                                className="flex-1 min-w-[120px] h-9 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px]" placeholder="Private note..." />
                              <button onClick={async () => {
                                storage.saveOwners(owners.map(x => x.id === o.id ? { ...x, adminNotes: editNotes.val } : x));

                                setEditNotes(null);
                                addAuditLog('add_note', `Added note to ${o.business}`);
                                setRefreshKey(k => k + 1);
                              }}
                                className="px-3 h-9 rounded-lg bg-[#E10600] text-white text-[11px] font-medium">Save</button>
                              <button onClick={() => setEditNotes(null)} className="px-3 h-9 rounded-lg bg-[#F5F6F8] text-[#6B7280] text-[11px]">Cancel</button>
                            </div>
                          )}
                          {o.adminNotes && editNotes?.id !== o.id && (
                            <p className="text-[11px] text-[#6B7280] italic bg-[#FFFBEB] p-2 rounded-lg border border-[#FDE68A]">ðŸ“ {o.adminNotes}</p>
                          )}
                          <div>
                            <p className="text-[11px] font-semibold text-[#6B7280] mb-1">Payment History</p>
                            {paymentEntries.filter(p => p.ownerId === o.id).slice(-5).reverse().map(p => (
                              <div key={p.id} className="flex items-center justify-between py-1.5 text-[11px] border-b border-[#F5F6F8] last:border-0">
                                <span className="text-[#111827]">â‚¹{p.amount} ({p.type})</span>
                                <span className="text-[#6B7280]">{new Date(p.timestamp).toLocaleDateString()} â€¢ {p.adminName}</span>
                              </div>
                            ))}
                            {paymentEntries.filter(p => p.ownerId === o.id).length === 0 && <p className="text-[11px] text-[#6B7280]">No payments recorded</p>}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                {owners.length === 0 && <p className="text-[12px] text-[#6B7280]">No owners registered</p>}
              </div>
            </>
          )}

          {/* ===== CREDIT CONTROL ===== */}
          {tab === 'credit' && (
            <>
              <h1 className="text-xl sm:text-[22px] font-bold mb-4 text-[#111827]">Credit Control Center</h1>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                  <p className="font-semibold text-[13px] text-[#111827] mb-3">Manual Credit Issue</p>
                  <div className="space-y-2.5">
                    <select value={creditOwner} onChange={e => setCreditOwner(e.target.value)}
                      className="w-full h-10 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px]">
                      <option value="">Select owner...</option>
                      {owners.filter(o => o.status === 'active').map(o => (
                        <option key={o.id} value={o.id}>{o.business}</option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      {(['issued', 'emergency', 'bonus'] as const).map(t => (
                        <button key={t} onClick={() => setCreditType(t)}
                          className={`flex-1 py-2 rounded-lg text-[11px] font-medium ${creditType === t ? 'bg-[#E10600] text-white' : 'bg-[#F5F6F8] text-[#6B7280]'}`}
                        >{t.charAt(0).toUpperCase() + t.slice(1)}</button>
                      ))}
                    </div>
                    <input value={creditAmount} onChange={e => setCreditAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Amount (â‚¹)" type="text"
                      className="w-full h-10 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px]" />
                    <input value={creditNote} onChange={e => setCreditNote(e.target.value)} placeholder="Notes" type="text"
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
                      addAuditLog('issue_credit', `${creditType} credit â‚¹${amt} to ${o?.business || creditOwner}`)
                      addNotification('credit', `â‚¹${amt} ${creditType} credit issued to ${o?.business || creditOwner}`, 'info')
                      setCreditOwner(''); setCreditAmount(''); setCreditNote('')
                      setRefreshKey(k => k + 1)
                      

                    }} disabled={!creditOwner || !creditAmount}
                      className="w-full h-10 rounded-lg bg-[#059669] text-white text-[12px] font-medium disabled:opacity-50">Issue Credit</button>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                  <p className="font-semibold text-[13px] text-[#111827] mb-3">Credit Rules</p>
                  <div className="space-y-2.5 text-[12px]">
                    <div className="flex justify-between p-2.5 rounded-lg bg-[#F5F6F8]">
                      <span className="text-[#6B7280]">Max Daily Usage</span>
                      <span className="font-medium">â‚¹{((settings.maxDailyUsage || 50000)/1000).toFixed(1)}k</span>
                    </div>
                    <div className="flex justify-between p-2.5 rounded-lg bg-[#F5F6F8]">
                      <span className="text-[#6B7280]">Max Transaction</span>
                      <span className="font-medium">â‚¹{((settings.maxTransaction || 10000)/1000).toFixed(1)}k</span>
                    </div>
                    <div className="flex justify-between p-2.5 rounded-lg bg-[#F5F6F8]">
                      <span className="text-[#6B7280]">Monthly Limit</span>
                      <span className="font-medium">â‚¹{((settings.monthlyLimit || 200000)/1000).toFixed(1)}k</span>
                    </div>
                    <div className="flex justify-between p-2.5 rounded-lg bg-[#F5F6F8]">
                      <span className="text-[#6B7280]">Auto Freeze After</span>
                      <span className="font-medium">{settings.autoFreezeDays || 30} days overdue</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pending Credit Requests section */}
              {pendingRequests.length > 0 && (
                <div className="mb-5 p-4 rounded-xl bg-white border border-amber-200 bg-amber-50/20">
                  <h3 className="text-[12px] font-semibold text-amber-800 uppercase tracking-wider mb-3">Pending Credit Requests</h3>
                  <div className="space-y-2">
                    {pendingRequests.map(ca => {
                      const o = owners.find(ow => ow.id === ca.ownerId)
                      return (
                        <div key={ca.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg bg-white border border-[#E2E6EB] text-[12px] gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge label="Pending" color="amber" />
                              <span className="font-bold text-[#111827]">â‚¹{ca.amount.toLocaleString()}</span>
                              <span className="text-[#6B7280]">for {o?.business || ca.ownerId}</span>
                            </div>
                            {ca.notes && <p className="text-[#4B5563] text-[11px] italic">Reason: {ca.notes}</p>}
                            <p className="text-[#9CA3AF] text-[10px]">Requested by: {ca.requestedBy || 'Owner'} on {new Date(ca.timestamp).toLocaleString()}</p>
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

                                addAuditLog('approve_credit', `Approved â‚¹${ca.amount} credit request for ${o?.business || ca.ownerId}`)
                                addNotification('credit', `â‚¹${ca.amount} credit request approved for ${o?.business || ca.ownerId}`, 'info')
                                
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

                                addAuditLog('reject_credit', `Rejected â‚¹${ca.amount} credit request for ${o?.business || ca.ownerId}`)
                                addNotification('credit', `â‚¹${ca.amount} credit request rejected for ${o?.business || ca.ownerId}`, 'warning')
                                
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
                <h3 className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2">Credit History</h3>
                <div className="space-y-1.5">
                  {creditActions.slice().reverse().map(ca => {
                    const o = owners.find(ow => ow.id === ca.ownerId)
                    return (
                      <div key={ca.id} className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-[#E2E6EB] text-[11px]">
                        <div className="flex items-center gap-2">
                          <Badge label={ca.type} color={ca.type === 'reversal' ? 'red' : ca.type === 'emergency' ? 'amber' : 'blue'} />
                          <span className="font-medium text-[#111827]">â‚¹{ca.amount}</span>
                          <span className="text-[#6B7280]">â†’ {o?.business || ca.ownerId}</span>
                          {ca.notes && <span className="text-[#6B7280] italic">â€” {ca.notes}</span>}
                        </div>
                        <span className="text-[#9CA3AF]">{new Date(ca.timestamp).toLocaleDateString()}</span>
                      </div>
                    )
                  })}
                  {creditActions.length === 0 && <p className="text-[12px] text-[#6B7280]">No credit actions recorded</p>}
                </div>
              </div>
            </>
          )}

          {/* ===== PAYMENTS ===== */}
          {tab === 'payments' && (
            <>
              <h1 className="text-xl sm:text-[22px] font-bold mb-3 text-[#111827]">Payment & Recovery</h1>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-5">
                {KPI('Total Due', `â‚¹${(totalDue/1000).toFixed(1)}k`)}
                {KPI('Total Paid', `â‚¹${(totalPaidAmt/1000).toFixed(1)}k`, `${totalDue > 0 ? ((totalPaidAmt/totalDue)*100).toFixed(0) : '0'}%`)}
                {KPI('Pending', `â‚¹${(totalPending/1000).toFixed(1)}k`)}
                {KPI('Overdue', String(overdueOwners.length), `${overdueOwners.length} owners`)}
              </div>
              <div className="space-y-2 mb-5">
                <h3 className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2">Owner Payment Status</h3>
                {owners.filter(o => getOwnerStats(o.id).used > 0).sort((a, b) => getOwnerStats(b.id).pending - getOwnerStats(a.id).pending).map(o => {
                  const stats = getOwnerStats(o.id)
                  const isPaying = payOwner === o.id
                  return (
                    <div key={o.id} className="p-3 sm:p-4 rounded-xl bg-white border border-[#E2E6EB]">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[13px] text-[#111827]">{o.business}</p>
                          <p className="text-[11px] text-[#6B7280]">{o.name} â€¢ {stats.vehicles} vehicles â€¢ {stats.drivers} drivers</p>
                          <div className="flex gap-3 mt-1.5 text-[11px] flex-wrap">
                            <span>Used: <strong>â‚¹{(stats.used/1000).toFixed(1)}k</strong></span>
                            <span className="text-[#166534]">Paid: <strong>â‚¹{(stats.paid/1000).toFixed(1)}k</strong></span>
                            <span className={stats.pending > 0 ? 'text-[#991B1B]' : 'text-[#166534]'}>Pending: <strong>â‚¹{(stats.pending/1000).toFixed(1)}k</strong></span>
                          </div>
                          {stats.lastFill && <p className="text-[10px] text-[#6B7280] mt-1">Last fill: {new Date(stats.lastFill).toLocaleDateString()}</p>}
                        </div>
                        <div className="shrink-0">
                          {stats.pending > 0 ? (
                            !isPaying ? (
                              <button onClick={() => { setPayOwner(o.id); setPayAmt(String(stats.pending)); setPayNote('') }}
                                className="px-3 py-1.5 rounded-lg bg-[#E10600] text-white text-[11px] font-medium">Mark Paid</button>
                            ) : (
                              <div className="flex flex-col items-end gap-1.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[11px] text-[#6B7280]">â‚¹</span>
                                  <input value={payAmt} onChange={e => setPayAmt(e.target.value.replace(/[^0-9.]/g, ''))}
                                    className="w-20 h-8 px-2 bg-white border border-[#E2E6EB] rounded-lg text-[11px] font-mono text-center" />
                                </div>
                                <input value={payNote} onChange={e => setPayNote(e.target.value)} placeholder="Note (optional)"
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
                                      addAuditLog('mark_paid', `â‚¹${amt} payment from ${o.business}`)
                                      addNotification('payment', `â‚¹${amt} received from ${o.business}`, 'info')
                                      setRefreshKey(k => k + 1)
                                      

                                    }
                                  }} className="px-2.5 h-8 rounded-lg bg-[#059669] text-white text-[11px] font-medium">Confirm</button>
                                  <button onClick={() => setPayOwner(null)} className="px-2 h-8 rounded-lg bg-[#F5F6F8] text-[#6B7280] text-[11px]">âœ•</button>
                                </div>
                              </div>
                            )
                          ) : (
                            <span className="px-3 py-1.5 rounded-lg bg-[#DCFCE7] text-[#166534] text-[11px] font-medium">Cleared</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {owners.every(o => getOwnerStats(o.id).used === 0) && <p className="text-[12px] text-[#6B7280]">No fill data available</p>}
              </div>
              <div className="mt-6">
                <h3 className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2">Payment Ledger</h3>
                <div className="space-y-1.5">
                  {paymentEntries.slice().reverse().map(pe => {
                    const o = owners.find(x => x.id === pe.ownerId)
                    return (
                      <div key={pe.id} className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-[#E2E6EB] text-[11px]">
                        <div className="flex items-center gap-2">
                          <Badge label={pe.type} color={pe.type === 'reversal' ? 'red' : pe.type === 'partial' ? 'amber' : 'green'} />
                          <span className="font-medium text-[#111827]">â‚¹{pe.amount}</span>
                          <span className="text-[#6B7280]">from {o?.business || pe.ownerId}</span>
                          {pe.note && <span className="text-[#6B7280] italic">â€” {pe.note}</span>}
                        </div>
                        <span className="text-[#9CA3AF]">{new Date(pe.timestamp).toLocaleDateString()} â€¢ {pe.adminName}</span>
                      </div>
                    )
                  })}
                  {paymentEntries.length === 0 && <p className="text-[12px] text-[#6B7280]">No payment entries yet</p>}
                </div>
              </div>
              {owners.filter(o => getOwnerStats(o.id).pending > 0).length > 0 && (
                <div className="mt-6">
                  <h3 className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2">Recovery Priority</h3>
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
                            <span className="text-[#991B1B]">â‚¹{(stats.pending/1000).toFixed(1)}k due</span>
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

          {/* ===== TRANSACTIONS ===== */}
          {tab === 'transactions' && (
            <>
              <h1 className="text-xl sm:text-[22px] font-bold mb-3 text-[#111827]">Transaction Monitoring</h1>
              <div className="flex flex-wrap gap-2 mb-4">
                <select value={txSearch} onChange={e => setTxSearch(e.target.value)}
                  className="h-9 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px]">
                  <option value="">All owners</option>
                  {owners.map(o => <option key={o.id} value={o.id}>{o.business}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                {fills.slice().reverse().filter(f => !txSearch || f.ownerId === txSearch).map(f => {
                  const v = vehicles.find(ve => ve.plate === f.vehicleId || String(ve.id) === String(f.vehicleId))
                  const d = drivers.find(dr => dr.id === f.driverId)
                  const o = owners.find(ow => ow.id === f.ownerId)
                  const isSuspicious = f.mismatch || f.fuelDropPercent > 20
                  return (
                    <div key={f.id} className={`p-3 rounded-xl border text-[11px] ${isSuspicious ? 'bg-[#FFFBEB] border-[#FDE68A]' : 'bg-white border-[#E2E6EB]'}`}>
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="font-semibold text-[12px] text-[#111827]">{v?.plate || f.vehicleId}</span>
                            <span className="text-[#6B7280]">{d?.name || f.driverId}</span>
                            <span className="text-[#6B7280]">â€¢</span>
                            <span className="text-[#6B7280]">{new Date(f.time).toLocaleDateString()}</span>
                            <span className="text-[#6B7280]">â€¢</span>
                            <span className="text-[#6B7280]">{f.station}</span>
                          </div>
                          <div className="flex gap-3 text-[11px] flex-wrap">
                            <span>{f.kgs}kg Ã— â‚¹{f.rate} = <strong>â‚¹{f.total}</strong></span>
                            <span className="text-[#6B7280]">Odo: {f.odoReading}km</span>
                            {o && <span className="text-[#6B7280]">({o.business})</span>}
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-1.5">
                          {isSuspicious && <Badge label="Flagged" color="red" />}
                          {!f.verified && <Badge label="Unverified" color="amber" />}
                          {f.verified && <Badge label="Verified" color="green" />}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {fills.length === 0 && <p className="text-[12px] text-[#6B7280]">No transactions found</p>}
              </div>
            </>
          )}

          {/* ===== FRAUD ===== */}
          {tab === 'fraud' && (
            <>
              <h1 className="text-xl sm:text-[22px] font-bold mb-3 text-[#111827]">Fraud Monitoring Center</h1>
              <div className="flex gap-2 mb-4">
                {(['all', 'active', 'resolved'] as const).map(f => (
                  <button key={f} onClick={() => setFraudFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-medium ${fraudFilter === f ? 'bg-[#E10600] text-white' : 'bg-[#F5F6F8] text-[#6B7280]'}`}
                  >{f.charAt(0).toUpperCase() + f.slice(1)}</button>
                ))}
              </div>
              {alerts.filter(a => fraudFilter === 'all' || (fraudFilter === 'active' ? !a.resolved : a.resolved)).length === 0 && (
                <div className="p-4 rounded-xl bg-[#DCFCE7] border border-[#BBF7D0] text-[12px] font-medium text-[#166534]">All clear â€” no unresolved alerts</div>
              )}
              <div className="space-y-1.5">
                {alerts.slice().reverse().filter(a => fraudFilter === 'all' || (fraudFilter === 'active' ? !a.resolved : a.resolved)).map(a => {
                  const riskLevel = a.type === 'fuel_drop' ? 'Critical' : a.type === 'vehicle_override' ? 'High' : 'Medium'
                  const riskColor = riskLevel === 'Critical' ? 'red' : riskLevel === 'High' ? 'amber' : 'blue'
                  const o = owners.find(ow => ow.id === a.ownerId)
                  return (
                    <div key={a.id} className={`p-3 sm:p-4 rounded-xl border text-[11px] ${a.resolved ? 'bg-white border-[#E2E6EB]' : 'bg-[#FFFBEB] border-[#FDE68A]'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge label={riskLevel} color={riskColor} />
                            <Badge label={a.type} color={a.type === 'fuel_drop' ? 'red' : a.type === 'vehicle_override' ? 'amber' : 'blue'} />
                            {!a.resolved && <span className="w-2 h-2 rounded-full bg-[#E10600]" />}
                            <span className="text-[#6B7280]">{a.resolved ? 'Resolved' : 'Active'}</span>
                          </div>
                          <p className="text-[12px] font-medium text-[#111827]">{a.event}</p>
                          <p className="text-[10px] text-[#6B7280] mt-0.5">{a.user} â€¢ {o?.business || ''} â€¢ {new Date(a.time).toLocaleString()}</p>
                        </div>
                        <div className="shrink-0 flex gap-1.5 flex-wrap">
                          {!a.resolved && (
                            <>
                              <button onClick={async () => { 
                                storage.saveAlerts(alerts.map(x => x.id === a.id ? { ...x, resolved: true } : x)); 
                                addAuditLog('resolve_alert', `Resolved ${a.type} alert: ${a.event}`); 
                                setRefreshKey(k => k + 1) 
                              }}
                                className="px-2.5 py-1 rounded-lg bg-white border border-[#E2E6EB] text-[10px] font-medium text-[#6B7280]">Resolve</button>
                              {o && (
                                <button onClick={() => { storage.saveOwners(owners.map(x => x.id === o.id ? { ...x, status: 'inactive' as const } : x)); addAuditLog('freeze_account', `Froze ${o.business} due to fraud alert`); addNotification('fraud', `${o.business} frozen due to ${a.type}`, 'critical'); setRefreshKey(k => k + 1) }}
                                  className="px-2.5 py-1 rounded-lg bg-[#FEE2E2] text-[#991B1B] text-[10px] font-medium">Freeze Owner</button>
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

          {/* ===== REPORTS ===== */}
          {tab === 'reports' && (
            <>
              <h1 className="text-xl sm:text-[22px] font-bold mb-4 text-[#111827]">Reports & Export</h1>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button onClick={() => expCSV('owners.csv', ['Business', 'Name', 'Email', 'Phone', 'Status', 'Risk', 'Credit Limit', 'Total Used', 'Total Paid', 'Pending', 'Drivers', 'Vehicles'],
                  owners.map(o => { const s = getOwnerStats(o.id); const r = calcRiskColor(o.id); return [o.business, o.name, o.email, o.phone, o.status, r, o.creditLimit || 0, s.used, s.paid, s.pending, s.drivers, s.vehicles] })
                )} className="p-4 rounded-xl bg-white border border-[#E2E6EB] text-left hover:bg-[#F9FAFB]">
                  <p className="font-semibold text-[13px] text-[#111827]">ðŸ“‹ Export Owners</p>
                  <p className="text-[10px] text-[#6B7280] mt-0.5">Owners with fleet, credit, risk score, and payment status</p>
                </button>
                <button onClick={() => expCSV('fills.csv', ['ID', 'Vehicle', 'Driver', 'Date', 'Station', 'KGs', 'Rate', 'Total', 'Owner', 'Verified', 'Fraud Flag'],
                  fills.map(f => {
                    const v = vehicles.find(ve => ve.plate === f.vehicleId || String(ve.id) === String(f.vehicleId)); const d = drivers.find(dr => dr.id === f.driverId)
                    const o = owners.find(ow => ow.id === f.ownerId)
                    const flagged = f.mismatch || f.fuelDropPercent > 20 ? 'Yes' : 'No'
                    return [f.id, v?.plate || f.vehicleId, d?.name || f.driverId, new Date(f.time).toLocaleDateString(), f.station, f.kgs, f.rate, f.total, o?.business || '', f.verified ? 'Yes' : 'No', flagged]
                  })
                )} className="p-4 rounded-xl bg-white border border-[#E2E6EB] text-left hover:bg-[#F9FAFB]">
                  <p className="font-semibold text-[13px] text-[#111827]">â›½ Export All Fills</p>
                  <p className="text-[10px] text-[#6B7280] mt-0.5">All fill entries with fraud flags</p>
                </button>
                <button onClick={() => expCSV('pending_payments.csv', ['Owner', 'Business', 'Total Used', 'Total Paid', 'Pending', 'Vehicles', 'Last Fill'],
                  owners.map(o => { const s = getOwnerStats(o.id); return s.pending > 0 ? [o.name, o.business, s.used, s.paid, s.pending, s.vehicles, s.lastFill ? new Date(s.lastFill).toLocaleDateString() : 'N/A'] : null }).filter((x): x is any[] => x !== null)
                )} className="p-4 rounded-xl bg-white border border-[#E2E6EB] text-left hover:bg-[#F9FAFB]">
                  <p className="font-semibold text-[13px] text-[#111827]">ðŸ“Š Export Pending Payments</p>
                  <p className="text-[10px] text-[#6B7280] mt-0.5">Owners with outstanding amounts</p>
                </button>
                <button onClick={() => expCSV('payment_summary.csv', ['Owner', 'Business', 'Total Used', 'Total Paid', 'Pending', 'Collection %'],
                  owners.map(o => { const s = getOwnerStats(o.id); return [o.name, o.business, s.used, s.paid, s.pending, s.used > 0 ? ((s.paid/s.used)*100).toFixed(0) + '%' : '0%'] })
                )} className="p-4 rounded-xl bg-white border border-[#E2E6EB] text-left hover:bg-[#F9FAFB]">
                  <p className="font-semibold text-[13px] text-[#111827]">ðŸ’° Payment Summary</p>
                  <p className="text-[10px] text-[#6B7280] mt-0.5">Per-owner payment breakdown with collection rate</p>
                </button>
                <button onClick={() => expCSV('fraud_alerts.csv', ['ID', 'Event', 'Type', 'Risk', 'User', 'Owner', 'Time', 'Resolved'],
                  alerts.map(a => { const o = owners.find(ow => ow.id === a.ownerId); const risk = a.type === 'fuel_drop' ? 'Critical' : a.type === 'vehicle_override' ? 'High' : 'Medium'; return [a.id, a.event, a.type, risk, a.user, o?.business || '', new Date(a.time).toLocaleString(), a.resolved ? 'Yes' : 'No'] })
                )} className="p-4 rounded-xl bg-white border border-[#E2E6EB] text-left hover:bg-[#F9FAFB]">
                  <p className="font-semibold text-[13px] text-[#111827]">ðŸ›¡ Export Fraud Alerts</p>
                  <p className="text-[10px] text-[#6B7280] mt-0.5">All fraud alerts with risk levels and resolution status</p>
                </button>
                <button onClick={() => expCSV('credit_actions.csv', ['ID', 'Type', 'Amount', 'Owner', 'Notes', 'Date'],
                  creditActions.map(ca => { const o = owners.find(ow => ow.id === ca.ownerId); return [ca.id, ca.type, ca.amount, o?.business || ca.ownerId, ca.notes || '', new Date(ca.timestamp).toLocaleDateString()] })
                )} className="p-4 rounded-xl bg-white border border-[#E2E6EB] text-left hover:bg-[#F9FAFB]">
                  <p className="font-semibold text-[13px] text-[#111827]">ðŸ’° Export Credit Actions</p>
                  <p className="text-[10px] text-[#6B7280] mt-0.5">All credit issuances and adjustments</p>
                </button>
              </div>
            </>
          )}

          {/* ===== NOTIFICATIONS ===== */}
          {tab === 'notifications' && (
            <>
              <div className="flex items-center justify-between mb-3">
                <h1 className="text-xl sm:text-[22px] font-bold text-[#111827]">Notifications</h1>
                <div className="flex gap-2">
                  {(['all', 'unread'] as const).map(f => (
                    <button key={f} onClick={() => setNotifFilter(f)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-medium ${notifFilter === f ? 'bg-[#E10600] text-white' : 'bg-[#F5F6F8] text-[#6B7280]'}`}
                    >{f.charAt(0).toUpperCase() + f.slice(1)}</button>
                  ))}
                  {unreadNotifs > 0 && (
                    <button onClick={() => { storage.saveNotifications(notifications.map(n => ({ ...n, read: true }))); setRefreshKey(k => k + 1) }}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-[#DBEAFE] text-[#1E40AF]">Mark All Read</button>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                {notifications.slice().reverse().filter(n => notifFilter === 'all' || !n.read).map(n => (
                  <div key={n.id} className={`p-3 rounded-xl border text-[11px] ${n.read ? 'bg-white border-[#E2E6EB]' : 'bg-[#FFFBEB] border-[#FDE68A]'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Badge label={n.severity} color={n.severity === 'critical' ? 'red' : n.severity === 'warning' ? 'amber' : 'blue'} />
                        <div>
                          <p className="font-medium text-[#111827]">{n.message}</p>
                          <p className="text-[10px] text-[#6B7280]">{new Date(n.timestamp).toLocaleString()} â€¢ {n.type}</p>
                        </div>
                      </div>
                      {!n.read && (
                        <button onClick={() => { storage.saveNotifications(notifications.map(x => x.id === n.id ? { ...x, read: true } : x)); setRefreshKey(k => k + 1) }}
                          className="px-2.5 py-1 rounded-lg bg-white border border-[#E2E6EB] text-[10px] font-medium text-[#6B7280]">Read</button>
                      )}
                    </div>
                  </div>
                ))}
                {notifications.length === 0 && <p className="text-[12px] text-[#6B7280]">No notifications</p>}
              </div>
            </>
          )}

          {/* ===== AUDIT LOGS ===== */}
          {tab === 'audit' && (
            <>
              <h1 className="text-xl sm:text-[22px] font-bold mb-3 text-[#111827]">Audit Logs</h1>
              <div className="flex gap-2 mb-4 flex-wrap">
                {(['all', 'issue_credit', 'mark_paid', 'block_owner', 'unblock_owner', 'freeze_credit', 'unfreeze_credit', 'set_credit_limit', 'add_note', 'resolve_alert', 'freeze_account'] as const).map(f => (
                  <button key={f} onClick={() => setAuditFilter(f)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-medium ${auditFilter === f ? 'bg-[#E10600] text-white' : 'bg-[#F5F6F8] text-[#6B7280]'}`}
                  >{f === 'all' ? 'All' : f.replace(/_/g, ' ')}</button>
                ))}
              </div>
              <div className="space-y-1">
                {auditLogs.slice().reverse().filter(a => auditFilter === 'all' || a.action === auditFilter).map(a => (
                  <div key={a.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-white border border-[#E2E6EB] text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#6B7280] mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-[#111827] capitalize">{a.action.replace(/_/g, ' ')}</span>
                        <Badge label={a.targetType} color="gray" />
                      </div>
                      <p className="text-[#6B7280]">{a.details}</p>
                      <p className="text-[#9CA3AF] text-[10px]">{a.adminName} â€¢ {new Date(a.timestamp).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
                {auditLogs.length === 0 && <p className="text-[12px] text-[#6B7280]">No audit logs yet. Admin actions will be recorded here.</p>}
              </div>
            </>
          )}

          {/* ===== SETTINGS ===== */}
          {tab === 'settings' && (
            <>
              <h1 className="text-xl sm:text-[22px] font-bold mb-4 text-[#111827]">Settings</h1>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                  <p className="font-semibold text-[13px] text-[#111827] mb-3">Credit Policies</p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] text-[#6B7280] block mb-1">Max Daily Usage (â‚¹)</label>
                      <input defaultValue={settings.maxDailyUsage || 50000} onBlur={e => { storage.saveSettings({ ...settings, maxDailyUsage: parseInt(e.target.value) || 50000 }) }}
                        className="w-full h-9 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px]" type="number" />
                    </div>
                    <div>
                      <label className="text-[11px] text-[#6B7280] block mb-1">Max Transaction (â‚¹)</label>
                      <input defaultValue={settings.maxTransaction || 10000} onBlur={e => { storage.saveSettings({ ...settings, maxTransaction: parseInt(e.target.value) || 10000 }) }}
                        className="w-full h-9 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px]" type="number" />
                    </div>
                    <div>
                      <label className="text-[11px] text-[#6B7280] block mb-1">Default Monthly Limit (â‚¹)</label>
                      <input defaultValue={settings.monthlyLimit || 200000} onBlur={e => { storage.saveSettings({ ...settings, monthlyLimit: parseInt(e.target.value) || 200000 }) }}
                        className="w-full h-9 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px]" type="number" />
                    </div>
                    <div>
                      <label className="text-[11px] text-[#6B7280] block mb-1">Auto Freeze After (days overdue)</label>
                      <input defaultValue={settings.autoFreezeDays || 30} onBlur={e => { storage.saveSettings({ ...settings, autoFreezeDays: parseInt(e.target.value) || 30 }) }}
                        className="w-full h-9 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px]" type="number" />
                    </div>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                  <p className="font-semibold text-[13px] text-[#111827] mb-3">Fraud Sensitivity</p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] text-[#6B7280] block mb-1">Fuel Drop Threshold (%)</label>
                      <input defaultValue={settings.fuelDropThreshold || 20} onBlur={e => { storage.saveSettings({ ...settings, fuelDropThreshold: parseInt(e.target.value) || 20 }) }}
                        className="w-full h-9 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px]" type="number" />
                      <p className="text-[10px] text-[#9CA3AF] mt-0.5">Triggers alert if fuel drop exceeds this %</p>
                    </div>
                    <div>
                      <label className="text-[11px] text-[#6B7280] block mb-1">Location Mismatch (meters)</label>
                      <input defaultValue={settings.locationMismatchDist || 100} onBlur={e => { storage.saveSettings({ ...settings, locationMismatchDist: parseInt(e.target.value) || 100 }) }}
                        className="w-full h-9 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px]" type="number" />
                      <p className="text-[10px] text-[#9CA3AF] mt-0.5">Distance between pump and receipt GPS to flag</p>
                    </div>
                    <div>
                      <label className="text-[11px] text-[#6B7280] block mb-1">Min Time Between Fills (minutes)</label>
                      <input defaultValue={settings.minTimeBetweenFills || 30} onBlur={e => { storage.saveSettings({ ...settings, minTimeBetweenFills: parseInt(e.target.value) || 30 }) }}
                        className="w-full h-9 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px]" type="number" />
                      <p className="text-[10px] text-[#9CA3AF] mt-0.5">Flags rapid consecutive fills below this interval</p>
                    </div>
                    <div>
                      <label className="text-[11px] text-[#6B7280] block mb-1">Penalty Rate (% on overdue)</label>
                      <input defaultValue={settings.penaltyRate || 2} onBlur={e => { storage.saveSettings({ ...settings, penaltyRate: parseInt(e.target.value) || 2 }) }}
                        className="w-full h-9 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px]" type="number" />
                      <p className="text-[10px] text-[#9CA3AF] mt-0.5">Monthly penalty % on overdue amounts</p>
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
