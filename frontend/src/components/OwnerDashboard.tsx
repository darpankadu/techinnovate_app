import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Fuel, Video, Camera, Receipt, Gauge,
  MapPin, AlertTriangle, CheckCircle2,
  Car, Users, BarChart3, Shield,
  LogOut, Plus, Trash2, X, Play,
  Pause, RotateCcw, Check, Globe, Upload,
  Bell
} from 'lucide-react'
import { storage, calculateDistance } from '../lib/storage'
import { firestoreSync } from '../lib/firestoreSync'
import { t } from '../lib/translations'
import type { Language, Role, Driver, Owner, Vehicle, Fill, Alert, CameraCapture, CreditAction, PaymentEntry, Notification } from '../lib/types'
import { CameraModal } from './CameraModal'

type View = 'welcome' | 'driver-login' | 'owner-login' | 'owner-register' | 'admin-login' | 'driver-dash' | 'owner-dash' | 'admin-dash' | 'wizard'

const sanitizeInput = (val: string): string => {
  if (typeof val !== 'string') return val
  return val.replace(/<[^>]*>/g, '').trim()
}

function LiveTrackingMap({ liveLocations }: { liveLocations: any[] }) {
  const mapRef = useRef<any>(null)
  const markersRef = useRef<{ [key: string]: any }>({})
  const hasCenteredRef = useRef<boolean>(false)

  // 1. Initialize map once on mount, clean up only on unmount
  useEffect(() => {
    if (typeof window === 'undefined' || !(window as any).L) return

    const L = (window as any).L

    if (!mapRef.current) {
      const centerLat = liveLocations.length > 0 ? liveLocations[0].lat : 22.0
      const centerLng = liveLocations.length > 0 ? liveLocations[0].lng : 72.0

      mapRef.current = L.map('live-map').setView([centerLat, centerLng], 12)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(mapRef.current)
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      markersRef.current = {}
    }
  }, [])

  // 2. Update markers and fit bounds whenever locations change
  useEffect(() => {
    if (!mapRef.current || typeof window === 'undefined' || !(window as any).L) return

    const L = (window as any).L
    const map = mapRef.current
    const currentMarkers = markersRef.current
    const activeIds = new Set(liveLocations.map(l => l.driverId))

    // Remove markers for drivers no longer active
    Object.keys(currentMarkers).forEach(id => {
      if (!activeIds.has(id)) {
        currentMarkers[id].remove()
        delete currentMarkers[id]
      }
    })

    // Add or update active markers
    liveLocations.forEach(loc => {
      const updatedTime = new Date(loc.lastUpdated)
      const isRecent = Date.now() - updatedTime.getTime() < 5 * 60 * 1000

      const markerContent = `
        <div style="font-family: sans-serif; font-size: 11px; color: #111827; line-height: 1.4;">
          <strong style="color: #E10600; font-size: 12px; display: block; margin-bottom: 2px;">${loc.driverName}</strong>
          <span>Status: ${isRecent ? '🟢 Active' : '⚪ Offline'}</span><br/>
          <span>Updated: ${updatedTime.toLocaleTimeString()}</span><br/>
          <a href="https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}" target="_blank" style="color: #E10600; font-weight: 600; text-decoration: none; display: inline-block; margin-top: 4px;">Google Maps ↗</a>
        </div>
      `

      const icon = L.divIcon({
        className: 'custom-div-icon',
        html: `
          <div style="
            position: relative;
            width: 14px;
            height: 14px;
            background-color: ${isRecent ? '#10B981' : '#9CA3AF'};
            border: 2px solid white;
            border-radius: 50%;
            box-shadow: 0 0 6px rgba(0,0,0,0.3);
          ">
            ${isRecent ? `
              <div style="
                position: absolute;
                top: -4px;
                left: -4px;
                width: 18px;
                height: 18px;
                background-color: rgba(16, 185, 129, 0.4);
                border-radius: 50%;
                animation: pulse-tracking 1.5s infinite;
              "></div>
            ` : ''}
          </div>
        `,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      })

      if (currentMarkers[loc.driverId]) {
        currentMarkers[loc.driverId].setLatLng([loc.lat, loc.lng])
        currentMarkers[loc.driverId].setIcon(icon)
        currentMarkers[loc.driverId].setPopupContent(markerContent)
      } else {
        const marker = L.marker([loc.lat, loc.lng], { icon })
          .addTo(map)
          .bindPopup(markerContent)
        currentMarkers[loc.driverId] = marker
      }
    })

    const markerList = Object.values(currentMarkers)
    if (markerList.length > 0 && !hasCenteredRef.current) {
      const group = L.featureGroup(markerList)
      map.fitBounds(group.getBounds().pad(0.1))
      hasCenteredRef.current = true
    }

    // Force recalculating map size inside tab container
    setTimeout(() => {
      map.invalidateSize()
    }, 100)

  }, [liveLocations])

  return (
    <div className="relative w-full h-[450px] rounded-xl overflow-hidden border border-[#E2E6EB] bg-[#F3F4F6]">
      <style>{`
        @keyframes pulse-tracking {
          0% { transform: scale(0.8); opacity: 0.8; }
          100% { transform: scale(2.0); opacity: 0; }
        }
        .leaflet-container {
          width: 100%;
          height: 100%;
          z-index: 1;
        }
      `}</style>
      <div id="live-map" className="w-full h-full" />
    </div>
  )
}

const localRedeemTranslations: Record<Language, Record<string, string>> = {
  en: {
    driverRedemptions: 'Driver Savings Redemptions',
    noRedemptions: 'No redemption requests found',
    approvePayout: 'Approve Payout',
    rejectPayout: 'Reject',
    statusPending: 'Pending',
    statusApproved: 'Approved',
    statusRejected: 'Rejected'
  },
  hi: {
    driverRedemptions: 'ड्राइवर बचत निकासी अनुरोध',
    noRedemptions: 'कोई निकासी अनुरोध नहीं मिला',
    approvePayout: 'भुगतान स्वीकृत करें',
    rejectPayout: 'अस्वीकार करें',
    statusPending: 'लंबित',
    statusApproved: 'स्वीकृत',
    statusRejected: 'अस्वीकृत'
  },
  gu: {
    driverRedemptions: 'ડ્રાઇવર બચત ઉપાડ વિનંતીઓ',
    noRedemptions: 'કોઈ ઉપાડ વિનંતીઓ મળી નથી',
    approvePayout: 'ચુકવણી મંજૂર કરો',
    rejectPayout: 'અસ્વીકાર કરો',
    statusPending: 'બાકી',
    statusApproved: 'મંજૂર',
    statusRejected: 'નામંજૂર'
  }
}

const localNotifTranslations = {
  en: {
    announcements: "Announcements",
    notifications: "Notifications",
    markAllRead: "Mark all as read",
    markRead: "Mark read",
    noNotifications: "No notifications",
    critical: "Critical",
    warning: "Warning",
    info: "Info",
    close: "Close"
  },
  hi: {
    announcements: "घोषणाएं",
    notifications: "सूचनाएं",
    markAllRead: "सभी पढ़े हुए चिह्नित करें",
    markRead: "पड़ा हुआ चिह्नित करें",
    noNotifications: "कोई सूचना नहीं है",
    critical: "गंभीर",
    warning: "चेतावनी",
    info: "सामान्य",
    close: "बंद करें"
  },
  gu: {
    announcements: "જાહેરાતો",
    notifications: "સૂચનાઓ",
    markAllRead: "બધા વાંચેલા તરીકે માર્ક કરો",
    markRead: "વાંચેલું માર્ક કરો",
    noNotifications: "કોઈ સૂચનાઓ નથી",
    critical: "ગંભીર",
    warning: "ચેતવણી",
    info: "માહિતી",
    close: "બંધ કરો"
  }
}

export function OwnerDashboard({ lang, session, syncKey, loadData, liveLocations }: { lang: Language; session: any; syncKey: number; loadData?: () => void; liveLocations: any[] }) {
  const [tab, setTab] = useState<'kpi' | 'fleet' | 'payments' | 'loadmatch' | 'enroll' | 'alerts'>('kpi')
  const [kpiTab, setKpiTab] = useState<'overview' | 'fills'>('overview')
  const [fillsTab, setFillsTab] = useState<'fills' | 'media' | 'trip-media' | 'reports'>('fills')
  const [fleetTab, setFleetTab] = useState<'vehicles' | 'drivers' | 'tracking'>('vehicles')
  const [showNotifModal, setShowNotifModal] = useState(false)
  const [readNotifIds, setReadNotifIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('cng_read_notifs_' + String(session.ownerId)) || '[]')
    } catch {
      return []
    }
  })
  const [showAddDriver, setShowAddDriver] = useState(false)
  const [showAddVehicle, setShowAddVehicle] = useState(false)
  const [showCreditRequest, setShowCreditRequest] = useState(false)
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null)
  const [editCode, setEditCode] = useState('')
  const [editingDriverVehicle, setEditingDriverVehicle] = useState<Driver | null>(null)
  const [editVehicleId, setEditVehicleId] = useState('')
  const [lightboxMedia, setLightboxMedia] = useState<{ url: string; label: string } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [creditReqAmount, setCreditReqAmount] = useState('')
  const [creditReqNote, setCreditReqNote] = useState('')
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null)
  const [trackingDriverId, setTrackingDriverId] = useState<string | null>(null)
  const [redemptionRequests, setRedemptionRequests] = useState<any[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('cng_redemption_requests') || '[]')
    } catch {
      return []
    }
  })

  // Enroll Truck form state
  const [enrollPlate, setEnrollPlate] = useState('')
  const [enrollModel, setEnrollModel] = useState('')
  const [enrollFuelType, setEnrollFuelType] = useState<'CNG' | 'EV' | 'Diesel'>('CNG')
  const [enrollCapacity, setEnrollCapacity] = useState('')
  const [enrollInitOdo, setEnrollInitOdo] = useState('')
  const [enrollYear, setEnrollYear] = useState('')
  const [enrollSuccess, setEnrollSuccess] = useState(false)
  const [enrollError, setEnrollError] = useState('')

  const [monthlyBudget, setMonthlyBudget] = useState<number>(() => {
    try { return parseInt(localStorage.getItem('cng_monthly_budget_' + String(session.ownerId)) || '0') } catch { return 0 }
  })
  const [editingBudget, setEditingBudget] = useState(false)
  const [budgetInput, setBudgetInput] = useState('')

  const handleApproveRedemption = (reqId: string) => {
    try {
      const allReqs = JSON.parse(localStorage.getItem('cng_redemption_requests') || '[]');
      const updated = allReqs.map((req: any) => {
        if (req.id === reqId) {
          return { ...req, status: 'approved', approvedAt: new Date().toISOString() };
        }
        return req;
      });
      setRedemptionRequests(updated);
      localStorage.setItem('cng_redemption_requests', JSON.stringify(updated));
      window.dispatchEvent(new Event('storage'));
    } catch (e) {
      console.error('Failed to approve redemption:', e);
    }
  };

  const handleRejectRedemption = (reqId: string) => {
    try {
      const allReqs = JSON.parse(localStorage.getItem('cng_redemption_requests') || '[]');
      const updated = allReqs.map((req: any) => {
        if (req.id === reqId) {
          return { ...req, status: 'rejected', rejectedAt: new Date().toISOString() };
        }
        return req;
      });
      setRedemptionRequests(updated);
      localStorage.setItem('cng_redemption_requests', JSON.stringify(updated));
      window.dispatchEvent(new Event('storage'));
    } catch (e) {
      console.error('Failed to reject redemption:', e);
    }
  };

  useEffect(() => {
    const updateRequests = () => {
      try {
        setRedemptionRequests(JSON.parse(localStorage.getItem('cng_redemption_requests') || '[]'))
      } catch {}
      try {
        setReadNotifIds(JSON.parse(localStorage.getItem('cng_read_notifs_' + String(session.ownerId)) || '[]'))
      } catch {}
      setRefreshKey(k => k + 1)
    }
    window.addEventListener('storage', updateRequests)
    return () => window.removeEventListener('storage', updateRequests)
  }, [session.ownerId])

  useEffect(() => {
    if (!trackingDriverId || !loadData) return
    loadData()
    const interval = setInterval(() => {
      loadData()
    }, 5000)
    return () => clearInterval(interval)
  }, [trackingDriverId, loadData])
  
  // Media tab filters
  const [mediaFilterDriver, setMediaFilterDriver] = useState<string>('all')
  const [mediaFilterVehicle, setMediaFilterVehicle] = useState<string>('all')
  const [mediaFilterVerified, setMediaFilterVerified] = useState<'all' | 'verified' | 'pending'>('all')

  // Trip Media tab filters
  const [tripMediaFilterDriver, setTripMediaFilterDriver] = useState<string>('all')
  const [tripMediaFilterVehicle, setTripMediaFilterVehicle] = useState<string>('all')
  const [tripMediaFilterStatus, setTripMediaFilterStatus] = useState<'all' | 'active' | 'completed'>('all')

  // Reports tab filters
  const [reportRange, setReportRange] = useState<'weekly' | 'monthly' | 'all'>('weekly')
  const [reportVehicle, setReportVehicle] = useState<string>('all')
  const [reportDriver, setReportDriver] = useState<string>('all')

  const ownerId = session.ownerId
  const ownerIdStr = String(ownerId)
  console.log('[OwnerDashboard] Session:', session, 'Keys:', Object.keys(session))
  console.log('[OwnerDashboard] ownerId:', ownerId, 'ownerIdStr:', ownerIdStr)
  
  // First get vehicles and drivers
  const allVehicles = storage.getVehicles()
  const vehicles = allVehicles.filter(v => String(v.ownerId) === ownerIdStr)
  console.log('[OwnerDashboard] Vehicles for owner:', vehicles.length)
  
  const allDrivers = storage.getDrivers()
  const drivers = allDrivers.filter(d => String(d.ownerId) === ownerIdStr)
  console.log('[OwnerDashboard] Drivers for owner:', drivers.length)
  
  // Now get fills for these vehicles and drivers
  const vehicleIds = vehicles.map(v => String(v.id))
  const vehiclePlates = vehicles.map(v => String(v.plate || '').trim().toLowerCase())
  const driverIds = drivers.map(d => String(d.id))
  const allFills = storage.getFills()
  console.log('[OwnerDashboard] All fills:', allFills.length)
  console.log('[OwnerDashboard] Sample fills:', allFills.slice(0, 3).map(f => ({ id: f.id, vehicleId: f.vehicleId, driverId: f.driverId })))
  const fills = allFills.filter(f => {
    const fOwnerId = String(f.ownerId || '').trim()
    const fVehicleId = String(f.vehicleId || '').trim().toLowerCase()
    const fDriverId = String(f.driverId || '').trim()
    return fOwnerId === ownerIdStr || 
           vehicleIds.includes(fVehicleId) || 
           vehiclePlates.includes(fVehicleId) || 
           driverIds.includes(fDriverId)
  })
  console.log('[OwnerDashboard] Fills for owner:', fills.length, 'by', vehicleIds.length, 'vehicles and', driverIds.length, 'drivers')
  
  const ownerNotifications = useMemo(() => {
    const allNotifs = storage.getNotifications();
    return allNotifs.filter((n: Notification) => 
      n.targetRole === 'all' || 
      n.targetRole === 'owner' || 
      n.targetUserId === ownerIdStr
    );
  }, [syncKey, refreshKey, ownerIdStr]);

  const unreadOwnerNotifsCount = useMemo(() => {
    return ownerNotifications.filter((n: Notification) => !readNotifIds.includes(n.id)).length;
  }, [ownerNotifications, readNotifIds]);
  
  // BUG-017 FIX: alerts store driver NAME in .user field (set during fill submit via session.name)
  // Driver names match more reliably. Also check ownerId for owner-level alerts.
  const driverNames = drivers.map(d => d.name)
  const alerts = storage.getAlerts().filter(a =>
    !a.resolved && (
      driverNames.includes(a.user) ||
      driverIds.includes(String(a.user)) ||
      String(a.ownerId) === ownerIdStr
    )
  )
  // Payment entries - match case-insensitively and trim keys
  const paymentEntries = storage.getPaymentEntries().filter(p => p.ownerId && String(p.ownerId).trim().toLowerCase() === ownerIdStr.trim().toLowerCase())
  const owner = storage.getOwners().find(o => o.id && String(o.id) === ownerIdStr)

  const todayFills = fills.filter(f => new Date(f.time).toDateString() === new Date().toDateString())
  const pendingVerifications = fills.filter(f => !f.verified)
  const totalSpent = fills.reduce((s, f) => s + f.total, 0)
  const todaySpent = todayFills.reduce((s, f) => s + f.total, 0)
  
  // Credit calculations
  const creditLimit = owner?.creditLimit || 0
  const creditUsed = totalSpent - (owner?.totalPaid || 0)
  const creditRemaining = Math.max(0, creditLimit - creditUsed)
  const totalPaid = owner?.totalPaid || 0
  const outstanding = Math.max(0, creditUsed)
  const lastPaymentDate = owner?.lastPaymentDate
  const creditFrozen = owner?.creditFrozen || false
  const riskScore = owner?.riskScore || 'green'
  
  // Monthly calculations
  const currentMonth = new Date().getMonth()
  const currentYear = new Date().getFullYear()
  const monthFills = fills.filter(f => {
    const fillDate = new Date(f.time)
    return fillDate.getMonth() === currentMonth && fillDate.getFullYear() === currentYear
  })
  const monthFillsCount = monthFills.length
  const monthSpent = monthFills.reduce((s, f) => s + f.total, 0)
  const avgFillCost = fills.length > 0 ? totalSpent / fills.length : 0
  const avgDailySpent = (() => {
    if (fills.length === 0) return 0
    const firstFill = fills.reduce((oldest, f) => new Date(f.time) < new Date(oldest.time) ? f : oldest, fills[0])
    const daysSinceFirst = Math.max(1, Math.ceil((Date.now() - new Date(firstFill.time).getTime()) / (1000 * 60 * 60 * 24)))
    return totalSpent / daysSinceFirst
  })()
  
  // Overdue check (>30 days since last payment and outstanding > 0)
  const isPaymentOverdue = (() => {
    if (!lastPaymentDate || outstanding <= 0) return false
    const daysSinceLastPayment = Math.floor((Date.now() - new Date(lastPaymentDate).getTime()) / (1000 * 60 * 60 * 24))
    return daysSinceLastPayment > 30
  })()
  // BUG-033 FIX: Show days actually overdue (i.e. days beyond the 30-day grace period)
  const daysOverdue = lastPaymentDate && isPaymentOverdue
    ? Math.floor((Date.now() - new Date(lastPaymentDate).getTime()) / (1000 * 60 * 60 * 24)) - 30
    : 0

  // Weekly data
  const last7Days = Array.from({length: 7}, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return d.toISOString().split('T')[0]
  })
  const dailySpent = last7Days.map(day => 
    fills.filter(f => f.time && f.time.startsWith(day)).reduce((s, f) => s + f.total, 0)
  )

  const mainNav = [
    { key: 'kpi',       label: 'KPI Dashboard',          icon: '📊' },
    { key: 'fleet',     label: 'Manage Fleet',            icon: '🚛' },
    { key: 'payments',  label: 'Payments',                icon: '💳' },
    { key: 'loadmatch', label: 'Load Matching',           icon: '📦' },
    { key: 'enroll',    label: 'Enroll Truck',            icon: '➕' },
    { key: 'alerts',    label: 'Notifications & Alerts',  icon: '🔔' },
  ]
  const kpiSubNav = [
    { key: 'overview', label: 'Overview', icon: '📈' },
    { key: 'fills',    label: 'Fills',    icon: '⛽' },
  ]
  const fillsSubNav = [
    { key: 'fills',      label: 'Fills',      icon: '⛽' },
    { key: 'media',      label: 'Media',      icon: '📷' },
    { key: 'trip-media', label: 'Trip Media', icon: '📸' },
    { key: 'reports',    label: 'Reports',    icon: '📋' },
  ]
  const fleetSubNav = [
    { key: 'vehicles', label: 'Vehicles',         icon: '🚛' },
    { key: 'drivers',  label: 'Drivers',          icon: '👷' },
    { key: 'tracking', label: 'Live GPS Tracking', icon: '📍' },
  ]

  const KPI = (label: string, value: string, sub?: string, color?: string) => (
    <div className="p-3 sm:p-4 rounded-xl bg-white border border-[#E2E6EB]">
      <p className={`text-lg sm:text-xl font-bold ${color || 'text-[#111827]'}`}>{value}</p>
      <p className="text-[11px] text-[#6B7280] mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-[#9CA3AF] mt-0.5">{sub}</p>}
    </div>
  )

  const MiniBar = ({ data }: { data: { label: string; value: number; color: string }[] }) => {
    if (!data || data.length === 0) return <div className="h-16 flex items-center justify-center text-[11px] text-[#9CA3AF]">{t('noData', lang)}</div>
    const maxValue = Math.max(...data.map(x => x.value || 1), 1)
    return (
      <div className="flex items-end gap-1 h-16">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full bg-[#E2E6EB] rounded-t-sm relative" style={{ height: '100%' }}>
              <div className="absolute bottom-0 left-0 right-0 rounded-t-sm transition-all duration-500" 
                style={{ 
                  height: `${Math.max(0, Math.min(100, ((d.value || 0) / maxValue) * 100))}%`,
                  backgroundColor: d.color 
                }} 
              />
            </div>
            <span className="text-[9px] text-[#6B7280]">{d.label}</span>
          </div>
        ))}
      </div>
    )
  }

  const exportToCSV = (filename: string, headers: string[], rows: any[][]) => {
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const exportToPDF = (reportTitle: string, filteredFills: Fill[], filterInfo: { range: string; vehicle: string; driver: string }) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Pop-up blocker is enabled. Please allow pop-ups to export PDF.');
      return;
    }

    const lookupVehicle = (id: string) => {
      const v = vehicles.find(veh => String(veh.id) === String(id) || veh.plate === id);
      return v ? v.plate : id;
    };
    const lookupDriver = (id: string) => {
      const d = drivers.find(drv => String(drv.id) === String(id));
      return d ? d.name : id;
    };

    const totalKgs = filteredFills.reduce((s, f) => s + f.kgs, 0);
    const totalCost = filteredFills.reduce((s, f) => s + f.total, 0);

    const rowsHtml = filteredFills.map(f => `
      <tr>
        <td>${new Date(f.time).toLocaleString()}</td>
        <td>${lookupVehicle(f.vehicleId)}</td>
        <td>${lookupDriver(f.driverId)}</td>
        <td>${f.station || 'N/A'}</td>
        <td style="text-align: right;">${f.kgs.toFixed(2)}</td>
        <td style="text-align: right;">₹${f.rate.toFixed(2)}</td>
        <td style="text-align: right; font-weight: bold;">₹${f.total.toFixed(2)}</td>
        <td style="text-align: center;">${f.verified ? '<span class="verified">✓ Yes</span>' : '<span class="pending">✗ No</span>'}</td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${reportTitle}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #111827;
            margin: 40px;
            font-size: 12px;
            line-height: 1.5;
          }
          .header {
            border-bottom: 2px solid #E10600;
            padding-bottom: 20px;
            margin-bottom: 25px;
          }
          .logo {
            font-size: 20px;
            font-weight: bold;
            color: #E10600;
          }
          .title {
            font-size: 18px;
            font-weight: bold;
            margin-top: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .meta-info {
            display: flex;
            justify-content: space-between;
            margin-bottom: 25px;
            background: #F9FAFB;
            padding: 15px;
            border-radius: 8px;
            border: 1px solid #E5E7EB;
          }
          .meta-block h3 {
            margin: 0 0 5px 0;
            font-size: 11px;
            text-transform: uppercase;
            color: #6B7280;
            letter-spacing: 0.5px;
          }
          .meta-block p {
            margin: 0;
            font-size: 13px;
            font-weight: 600;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
          }
          th {
            background-color: #F3F4F6;
            color: #374151;
            font-weight: 600;
            text-align: left;
            padding: 10px 8px;
            border-bottom: 2px solid #D1D5DB;
            text-transform: uppercase;
            font-size: 10px;
            letter-spacing: 0.5px;
          }
          td {
            padding: 10px 8px;
            border-bottom: 1px solid #E5E7EB;
            font-size: 11px;
          }
          tr:nth-child(even) {
            background-color: #F9FAFB;
          }
          .summary-row {
            background-color: #F3F4F6 !important;
            font-weight: bold;
          }
          .summary-row td {
            border-top: 2px solid #D1D5DB;
            border-bottom: 2px solid #D1D5DB;
            font-size: 12px;
          }
          .verified {
            color: #166534;
            background-color: #DCFCE7;
            padding: 2px 6px;
            border-radius: 4px;
            font-weight: 600;
          }
          .pending {
            color: #991B1B;
            background-color: #FEE2E2;
            padding: 2px 6px;
            border-radius: 4px;
            font-weight: 600;
          }
          .signature-section {
            margin-top: 50px;
            display: flex;
            justify-content: space-between;
            page-break-inside: avoid;
          }
          .sig-box {
            width: 45%;
            border-top: 1px solid #9CA3AF;
            padding-top: 8px;
            text-align: center;
            color: #4B5563;
            font-size: 11px;
          }
          @media print {
            body { margin: 20px; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span class="logo">CNG Fuel Tracker</span>
            <span style="color: #6B7280;">Date Generated: ${new Date().toLocaleDateString()}</span>
          </div>
          <div class="title">${reportTitle}</div>
        </div>

        <div class="meta-info">
          <div class="meta-block">
            <h3>{t('fleetOwner', lang)}</h3>
            <p>${owner?.business || owner?.name || 'N/A'}</p>
          </div>
          <div class="meta-block">
            <h3>{t('dateRange', lang)}</h3>
            <p>${filterInfo.range}</p>
          </div>
          <div class="meta-block">
            <h3>{t('vehicleFilter', lang)}</h3>
            <p>${filterInfo.vehicle}</p>
          </div>
          <div class="meta-block">
            <h3>{t('driverFilter', lang)}</h3>
            <p>${filterInfo.driver}</p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>{t('dateTime', lang)}</th>
              <th>{t('vehicle', lang)}</th>
              <th>{t('driver', lang)}</th>
              <th>{t('station', lang)}</th>
              <th style="text-align: right;">{t('kgs', lang)}</th>
              <th style="text-align: right;">{t('rate', lang)}</th>
              <th style="text-align: right;">{t('total', lang)}</th>
              <th style="text-align: center;">{t('verified', lang)}</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr class="summary-row">
              <td colspan="4">{t('totals', lang)}</td>
              <td style="text-align: right;">${totalKgs.toFixed(2)} kg</td>
              <td>—</td>
              <td style="text-align: right;">₹${totalCost.toFixed(2)}</td>
              <td style="text-align: center;">${filteredFills.length} fills</td>
            </tr>
          </tbody>
        </table>

        <div class="signature-section">
          <div class="sig-box">
            Owner Signature
          </div>
          <div class="sig-box">
            Verified Date & Reviewer Name
          </div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const filteredFillsForReports = fills.filter(f => {
    const fillDate = new Date(f.time)
    const now = new Date()
    if (reportRange === 'weekly') {
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(now.getDate() - 7)
      if (fillDate < sevenDaysAgo) return false
    } else if (reportRange === 'monthly') {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(now.getDate() - 30)
      if (fillDate < thirtyDaysAgo) return false
    }
    
    if (reportVehicle !== 'all') {
      const targetVehicle = vehicles.find(v => String(v.id) === reportVehicle || v.plate === reportVehicle)
      if (!targetVehicle) return false
      const fillVehicleIdStr = String(f.vehicleId).toLowerCase().trim()
      const targetIdStr = String(targetVehicle.id).toLowerCase().trim()
      const targetPlateStr = String(targetVehicle.plate).toLowerCase().trim()
      if (fillVehicleIdStr !== targetIdStr && fillVehicleIdStr !== targetPlateStr) {
        return false
      }
    }
    
    if (reportDriver !== 'all') {
      const targetDriver = drivers.find(d => String(d.id) === reportDriver)
      if (!targetDriver) return false
      const fillDriverIdStr = String(f.driverId).toLowerCase().trim()
      const targetIdStr = String(targetDriver.id).toLowerCase().trim()
      const targetNameStr = String(targetDriver.name).toLowerCase().trim()
      if (fillDriverIdStr !== targetIdStr && fillDriverIdStr !== targetNameStr) {
        return false
      }
    }
    
    return true
  }).sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())

  return (
    <div className="min-h-screen bg-[#F5F6F8] flex flex-col">
      {/* Header bar with Bell Icon */}
      <div className="bg-white border-b border-[#E2E6EB] px-4 py-3 flex items-center justify-between z-40 shadow-sm shrink-0">
        <div className="flex items-center gap-2">
          <span className="bg-[#E10600] text-white font-black px-2 py-0.5 rounded text-[14px]">CNG</span>
          <span className="text-[#111827] text-[12px] font-bold uppercase tracking-wider">{t('ownerPanel', lang)}</span>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowNotifModal(true)} 
            className="w-9 h-9 rounded-xl bg-[#F5F6F8] hover:bg-[#E2E6EB] flex items-center justify-center relative transition-all active:scale-95"
            aria-label="Notifications"
          >
            <Bell size={16} className="text-[#4B5563]" />
            {unreadOwnerNotifsCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#E10600] text-white text-[9px] font-black rounded-full min-w-[16px] h-[16px] px-1 flex items-center justify-center">
                {unreadOwnerNotifsCount}
              </span>
            )}
          </button>
          <span className="text-[12px] font-bold text-[#4B5563] hidden sm:inline-block border-l border-[#E2E6EB] pl-3">
            {owner?.business || session.name}
          </span>
        </div>
      </div>

      {/* Mobile top nav */}
      <div className="flex sm:hidden gap-1 p-3 bg-white border-b border-[#E2E6EB] overflow-x-auto">
        {mainNav.map(item => (
          <button key={item.key} onClick={() => setTab(item.key as any)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-medium ${tab === item.key ? 'bg-[#E10600] text-white' : 'bg-[#F5F6F8] text-[#6B7280]'}`}
          >{item.icon} {item.label}</button>
        ))}
      </div>

      {/* Mobile sub-nav */}
      {(tab === 'kpi' || tab === 'fleet') && (
        <div className="flex sm:hidden gap-1 px-3 pb-2 pt-1 bg-white border-b border-[#E2E6EB] overflow-x-auto">
          {(tab === 'kpi' ? kpiSubNav : fleetSubNav).map(item => (
            <button key={item.key}
              onClick={() => tab === 'kpi' ? setKpiTab(item.key as any) : setFleetTab(item.key as any)}
              className={`shrink-0 px-3 py-1 rounded-lg text-[10px] font-medium ${
                (tab === 'kpi' ? kpiTab : fleetTab) === item.key
                  ? 'bg-[#111827] text-white'
                  : 'bg-[#F5F6F8] text-[#6B7280]'
              }`}
            >{item.icon} {item.label}</button>
          ))}
        </div>
      )}
      {/* Mobile fills inner sub-nav */}
      {tab === 'kpi' && kpiTab === 'fills' && (
        <div className="flex sm:hidden gap-1 px-3 pb-2 pt-1 bg-[#F9FAFB] border-b border-[#E2E6EB] overflow-x-auto">
          {fillsSubNav.map(item => (
            <button key={item.key} onClick={() => setFillsTab(item.key as any)}
              className={`shrink-0 px-3 py-1 rounded-lg text-[10px] font-medium ${
                fillsTab === item.key ? 'bg-[#E10600] text-white' : 'bg-white text-[#6B7280] border border-[#E2E6EB]'
              }`}
            >{item.icon} {item.label}</button>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row flex-1">
        {/* Desktop sidebar */}
        <div className="hidden sm:flex sm:flex-col w-[220px] shrink-0 bg-white border-r border-[#E2E6EB] p-3 gap-0.5">
          <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider px-3 pb-1 pt-2">Owner Panel</p>
          <p className="px-3 pb-3 text-[13px] font-bold text-[#111827] truncate">{owner?.business || session.name}</p>

          {mainNav.map(item => (
            <div key={item.key}>
              <button onClick={() => setTab(item.key as any)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-[12px] font-semibold flex items-center gap-2.5 transition-all ${
                  tab === item.key ? 'bg-[#FDE8E8] text-[#E10600]' : 'text-[#6B7280] hover:bg-[#F5F6F8]'
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
              {/* KPI sub-nav */}
              {tab === 'kpi' && item.key === 'kpi' && (
                <div className="ml-3 mt-0.5 flex flex-col gap-0.5">
                  {kpiSubNav.map(s => (
                    <div key={s.key}>
                      <button onClick={() => setKpiTab(s.key as any)}
                        className={`w-full text-left pl-5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                          kpiTab === s.key ? 'text-[#E10600] bg-[#FEF2F2]' : 'text-[#9CA3AF] hover:text-[#4B5563] hover:bg-[#F9FAFB]'
                        }`}
                      >{s.icon} {s.label}</button>
                      {/* Fills inner sub-nav */}
                      {kpiTab === 'fills' && s.key === 'fills' && (
                        <div className="ml-3 mt-0.5 flex flex-col gap-0.5">
                          {fillsSubNav.map(f => (
                            <button key={f.key} onClick={() => setFillsTab(f.key as any)}
                              className={`w-full text-left pl-4 py-1 rounded-lg text-[10px] font-medium transition-all ${
                                fillsTab === f.key ? 'text-[#111827] bg-[#F0F2F5]' : 'text-[#B0B7C3] hover:text-[#4B5563] hover:bg-[#F9FAFB]'
                              }`}
                            >{f.icon} {f.label}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {/* Fleet sub-nav */}
              {tab === 'fleet' && item.key === 'fleet' && (
                <div className="ml-3 mt-0.5 flex flex-col gap-0.5">
                  {fleetSubNav.map(s => (
                    <button key={s.key} onClick={() => setFleetTab(s.key as any)}
                      className={`w-full text-left pl-5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                        fleetTab === s.key ? 'text-[#E10600] bg-[#FEF2F2]' : 'text-[#9CA3AF] hover:text-[#4B5563] hover:bg-[#F9FAFB]'
                      }`}
                    >{s.icon} {s.label}</button>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div className="mt-auto pt-4 border-t border-[#E2E6EB]">
            <button onClick={() => window.location.reload()} className="w-full text-left px-3 py-2 rounded-lg text-[12px] text-[#6B7280] hover:bg-[#F5F6F8] flex items-center gap-2">
              <span>↻</span> <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 p-4 sm:p-5 max-w-full sm:max-w-[1000px]">
          {/* Credit Alert Banner */}
          {/* BUG-032 FIX: Only show credit alert if creditLimit > 0 to prevent division-by-zero on new accounts */}
          {(creditFrozen || (creditLimit > 0 && creditUsed > creditLimit * 0.9)) && (
            <div className={`mb-4 p-3 rounded-xl border ${creditFrozen ? 'bg-[#FEE2E2] border-[#FCA5A5]' : 'bg-[#FEF3C7] border-[#FCD34D]'}`}>
              <p className={`text-[12px] font-medium ${creditFrozen ? 'text-[#991B1B]' : 'text-[#92400E]'}`}>
                {creditFrozen ? '⚠️ Credit Frozen — Contact Admin' : `⚠️ Credit ${Math.round((creditUsed / creditLimit) * 100)}% used`}
              </p>
            </div>
          )}

          {/* Overdue Payment Alert */}
          {isPaymentOverdue && (
            <div className="mb-4 p-3 rounded-xl border bg-[#FEE2E2] border-[#FCA5A5]">
              <p className="text-[12px] font-medium text-[#991B1B]">
                ⚠️ Payment Overdue — {daysOverdue} days since last payment
              </p>
              <p className="text-[11px] text-[#991B1B] mt-1">
                Outstanding: ₹{outstanding.toLocaleString()} | Last paid: {lastPaymentDate ? new Date(lastPaymentDate).toLocaleDateString() : 'Never'}
              </p>
            </div>
          )}

          {/* KPI DASHBOARD — OVERVIEW */}
          {tab === 'kpi' && kpiTab === 'overview' && (
            <>
              <h1 className="text-xl sm:text-[22px] font-bold mb-4 text-[#111827]">{t('dashboard', lang)}</h1>
              
              {/* Credit Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-5">
                {KPI(t('creditLimit', lang), `₹${(creditLimit/1000).toFixed(1)}k`)}
                {KPI(t('creditUsed', lang), `₹${(creditUsed/1000).toFixed(1)}k`, undefined, creditUsed > creditLimit * 0.8 ? 'text-[#991B1B]' : 'text-[#1E40AF]')}
                {KPI(t('remaining', lang), `₹${(creditRemaining/1000).toFixed(1)}k`, undefined, creditRemaining < creditLimit * 0.2 ? 'text-[#991B1B]' : 'text-[#166534]')}
                {KPI(t('totalPaid', lang), `₹${(totalPaid/1000).toFixed(1)}k`)}
                {KPI(t('outstanding', lang), `₹${(outstanding/1000).toFixed(1)}k`, undefined, outstanding > 0 ? 'text-[#991B1B]' : 'text-[#166534]')}
                {KPI(t('todayFuel', lang), `₹${(todaySpent/1000).toFixed(1)}k`)}
                {KPI(t('totalFills', lang), String(fills.length))}
                {KPI(t('pendingVerify', lang), String(pendingVerifications.length), undefined, pendingVerifications.length > 0 ? 'text-[#92400E]' : undefined)}
              </div>

              {/* Request Credit Button */}
              <div className="mb-5">
                <button onClick={() => setShowCreditRequest(true)} disabled={creditFrozen}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg bg-[#E10600] text-white text-[12px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creditFrozen ? t('frozen', lang) : t('requestCreditIncrease', lang)}
                </button>
                {lastPaymentDate && (
                  <p className="text-[11px] text-[#6B7280] mt-2">{lang === 'hi' ? 'अंतिम भुगतान' : lang === 'gu' ? 'છેલ્લી ચુકવણી' : 'Last payment'}: {new Date(lastPaymentDate).toLocaleDateString()}</p>
                )}
              </div>

              {/* 7-Day Trend */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                  <p className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">{t('fuelSpending7Days', lang)}</p>
                  <MiniBar data={last7Days.map((d, i) => ({ 
                    label: new Date(d).toLocaleDateString('en', { weekday: 'short' }), 
                    value: dailySpent[i], 
                    color: '#E10600' 
                  }))} />
                </div>
                <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                  <p className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">{t('quickStats', lang)}</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#6B7280]">{t('vehicles', lang)}</span>
                      <span className="font-medium text-[#111827]">{vehicles.length}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#6B7280]">{t('drivers', lang)}</span>
                      <span className="font-medium text-[#111827]">{drivers.length}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#6B7280]">{t('creditUtilization', lang)}</span>
                      <span className={`font-medium ${creditLimit > 0 ? (creditUsed / creditLimit > 0.8 ? 'text-[#991B1B]' : 'text-[#166534]') : 'text-[#111827]'}`}>
                        {creditLimit > 0 ? Math.round((creditUsed / creditLimit) * 100) : 0}%
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#6B7280]">{t('riskScore', lang)}</span>
                      <span className={`font-medium ${riskScore === 'red' ? 'text-[#991B1B]' : riskScore === 'yellow' ? 'text-[#92400E]' : 'text-[#166534]'}`}>
                        {riskScore === 'red' ? t('highRisk', lang) : riskScore === 'yellow' ? t('mediumRisk', lang) : t('lowRisk', lang)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Monthly Summary */}
              <div className="mb-5">
                <h3 className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">📅 {t('monthlySummary', lang)}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  <div className="p-4 rounded-xl bg-white border border-[#E2E6EB] text-center">
                    <p className="text-[11px] text-[#6B7280] mb-1">{t('totalFills', lang)}</p>
                    <p className="text-[22px] font-bold text-[#111827]">{monthFillsCount}</p>
                    <p className="text-[9px] text-[#9CA3AF]">{lang === 'hi' ? 'इस महीने' : lang === 'gu' ? 'આ મહિને' : 'this month'}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-white border border-[#E2E6EB] text-center">
                    <p className="text-[11px] text-[#6B7280] mb-1">{t('totalCost', lang)}</p>
                    <p className="text-[18px] font-bold text-[#991B1B]">₹{(monthSpent/1000).toFixed(1)}k</p>
                    <p className="text-[9px] text-[#9CA3AF]">{lang === 'hi' ? 'इस महीने' : lang === 'gu' ? 'આ મહિને' : 'this month'}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-white border border-[#E2E6EB] text-center">
                    <p className="text-[11px] text-[#6B7280] mb-1">{t('avgPerFill', lang)}</p>
                    <p className="text-[18px] font-bold text-[#1E40AF]">₹{Math.round(avgFillCost)}</p>
                    <p className="text-[9px] text-[#9CA3AF]">{t('lifetimeAvg', lang)}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-white border border-[#E2E6EB] text-center">
                    <p className="text-[11px] text-[#6B7280] mb-1">{t('avgDaily', lang)}</p>
                    <p className="text-[18px] font-bold text-[#166534]">₹{Math.round(avgDailySpent)}</p>
                    <p className="text-[9px] text-[#9CA3AF]">{lang === 'hi' ? 'प्रति दिन' : lang === 'gu' ? 'દરરોજ' : 'per day'}</p>
                  </div>
                </div>
              </div>

              {/* ── Fuel Budget vs Actual ── */}
              {(() => {
                const now = new Date();
                const monthFills = fills.filter(f => {
                  const d = new Date(f.time);
                  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                });
                const monthSpentAmt = monthFills.reduce((s, f) => s + f.total, 0);
                const pct = monthlyBudget > 0 ? Math.min(Math.round((monthSpentAmt / monthlyBudget) * 100), 100) : 0;
                const over = monthlyBudget > 0 && monthSpentAmt > monthlyBudget;
                return (
                  <div className="mb-5 p-4 rounded-xl bg-white border border-[#E2E6EB]">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider">⛽ Fuel Budget — {now.toLocaleDateString('en', { month: 'long' })}</p>
                      <button onClick={() => { setEditingBudget(v => !v); setBudgetInput(String(monthlyBudget || '')) }}
                        className="text-[11px] text-[#E10600] font-bold">{editingBudget ? 'Cancel' : monthlyBudget ? 'Edit' : '+ Set Budget'}</button>
                    </div>
                    {editingBudget ? (
                      <div className="flex gap-2 items-center">
                        <span className="text-sm text-[#6B7280]">₹</span>
                        <input type="number" value={budgetInput} onChange={e => setBudgetInput(e.target.value)}
                          placeholder="Monthly budget e.g. 50000"
                          className="flex-1 h-9 px-3 bg-[#F5F6F8] border border-[#E2E6EB] rounded-lg text-[12px]" />
                        <button onClick={() => {
                          const val = parseInt(budgetInput) || 0;
                          setMonthlyBudget(val);
                          localStorage.setItem('cng_monthly_budget_' + String(session.ownerId), String(val));
                          setEditingBudget(false);
                        }} className="h-9 px-4 bg-[#E10600] text-white text-[11px] font-bold rounded-lg">Save</button>
                      </div>
                    ) : monthlyBudget > 0 ? (
                      <div>
                        <div className="flex justify-between text-[12px] mb-1.5">
                          <span className={`font-bold ${over ? 'text-[#991B1B]' : 'text-[#111827]'}`}>
                            ₹{monthSpentAmt.toLocaleString()} spent {over && '⚠️ Over budget!'}
                          </span>
                          <span className="text-[#6B7280]">of ₹{monthlyBudget.toLocaleString()} budget</span>
                        </div>
                        <div className="w-full h-3 rounded-full bg-[#F3F4F6]">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: over ? '#E10600' : pct > 80 ? '#F59E0B' : '#059669' }} />
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-[10px] text-[#6B7280]">{pct}% used</span>
                          <span className="text-[10px] text-[#6B7280]">₹{Math.max(0, monthlyBudget - monthSpentAmt).toLocaleString()} remaining</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[12px] text-[#9CA3AF]">No monthly budget set. Tap "+ Set Budget" to track spending vs target.</p>
                    )}
                  </div>
                );
              })()}

              {/* ── Driver Wallet Balances ── */}
              {drivers.length > 0 && (() => {
                const allFillsLocal = fills;
                const driverWallets = drivers.map(d => {
                  const dFills = allFillsLocal.filter(f => f.driverId === d.id);
                  const totalKgs = dFills.reduce((s, f) => s + f.kgs, 0);
                  return { ...d, wallet: dFills.reduce((s, f) => s + Math.floor(f.kgs), 0), fills: dFills.length };
                }).filter(d => d.wallet > 0 || d.fills > 0);
                if (driverWallets.length === 0) return null;
                return (
                  <div className="mb-5 p-4 rounded-xl bg-white border border-[#E2E6EB]">
                    <p className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">💜 Driver Wallet Balances</p>
                    <div className="space-y-2">
                      {driverWallets.map(d => {
                        const pctOfMax = driverWallets.length > 0 ? (d.wallet / Math.max(...driverWallets.map(x => x.wallet), 1)) * 100 : 0;
                        return (
                          <div key={d.id} className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-full bg-[#4338ca]/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-[10px] font-bold text-[#4338ca]">{(d.name || '?')[0]}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between text-[11px] mb-0.5">
                                <span className="truncate font-medium text-[#111827]">{d.name}</span>
                                <span className="text-[#4338ca] font-bold ml-2 flex-shrink-0">₹{d.wallet}</span>
                              </div>
                              <div className="w-full h-1.5 rounded-full bg-[#F3F4F6]">
                                <div className="h-full rounded-full bg-[#4338ca]" style={{ width: `${pctOfMax}%` }} />
                              </div>
                            </div>
                            <span className="text-[10px] text-[#9CA3AF] flex-shrink-0">{d.fills} fills</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Top Drivers Section */}
              {(() => {
                const topDrivers = drivers.map(d => {
                  const dFills = fills.filter(f => f.driverId === d.id)
                  const totalCost = dFills.reduce((s, f) => s + f.total, 0)
                  return { ...d, fills: dFills.length, totalCost }
                }).sort((a, b) => b.totalCost - a.totalCost).slice(0, 3)
                
                if (topDrivers.length === 0) return null
                
                return (
                  <div className="mb-5">
                    <h3 className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">{t('topDrivers', lang)}</h3>
                    <div className="grid grid-cols-3 gap-2">
                      {topDrivers.map((d, i) => (
                        <div key={d.id} className="p-3 rounded-xl bg-white border border-[#E2E6EB] text-center">
                          <div className={`w-8 h-8 mx-auto mb-2 rounded-full flex items-center justify-center text-[11px] font-bold ${i === 0 ? 'bg-[#FCD34D] text-[#92400E]' : i === 1 ? 'bg-[#E2E8F0] text-[#475569]' : 'bg-[#FECACA] text-[#991B1B]'}`}>
                            {i + 1}
                          </div>
                          <p className="text-[12px] font-medium text-[#111827] truncate">{d.name}</p>
                          <p className="text-[10px] text-[#6B7280]">{d.fills} {t('fills', lang).toLowerCase()}</p>
                          <p className="text-[11px] font-bold text-[#166534]">₹{d.totalCost.toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* Recent Activity */}
              <div>
                <h3 className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">{t('recentFills', lang)}</h3>
                <div className="space-y-1.5">
                  {fills.slice(-5).reverse().map(f => {
                    const v = vehicles.find(veh => String(veh.id) === String(f.vehicleId) || veh.plate === f.vehicleId)
                    const d = drivers.find(drv => String(drv.id) === String(f.driverId))
                    return (
                      <div key={f.id} className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-[#E2E6EB] text-[11px]">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-[#111827]">{v?.plate || t('unknown', lang)}</span>
                          <span className="text-[#6B7280] ml-2">₹{f.total}</span>
                          <span className="text-[#9CA3AF] ml-2">• {d?.name || t('unknown', lang)}</span>
                        </div>
                        <span className="text-[#9CA3AF] shrink-0">{new Date(f.time).toLocaleDateString()}</span>
                      </div>
                    )
                  })}
                  {fills.length === 0 && <p className="text-[12px] text-[#6B7280]">{t('noFillsRecorded', lang)}</p>}
                </div>
              </div>
            </>
          )}

          {/* KPI — FILLS: Fills list */}
          {tab === 'kpi' && kpiTab === 'fills' && fillsTab === 'fills' && (
            <div className="space-y-2">
              {/* BUG-016 FIX: Removed misplaced Add Driver/Add Vehicle buttons from Fills tab.
                  Those buttons belong in the Drivers and Vehicles tabs respectively. */}
              {fills.slice().reverse().map(fill => {
                const v = vehicles.find(veh => String(veh.id) === String(fill.vehicleId) || veh.plate === fill.vehicleId)
                const d = drivers.find(drv => String(drv.id) === String(fill.driverId))
                return (
                  <div key={fill.id} className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-[14px] text-[#111827]">{v?.plate || 'Unknown'} — ₹{fill.total}</p>
                        <p className="text-[12px] text-[#6B7280]">{d?.name || 'Unknown'} • {fill.station} • {fill.kgs}kg @ ₹{fill.rate}/kg</p>
                        <p className="text-[11px] text-[#6B7280]">{new Date(fill.time).toLocaleString()}</p>
                      </div>
                      <button onClick={async () => {
                        // BUG-024 FIX: Read ALL fills, update the one record, save all back
                        // Previously only saved owner-filtered 'fills', deleting other owners' fill records
                        const allFillsGlobal = storage.getFills()
                        const targetVerify = !fill.verified
                        const updated = allFillsGlobal.map(f => f.id === fill.id ? { ...f, verified: targetVerify, verifiedBy: owner?.name || 'Owner', verifiedAt: new Date().toISOString() } : f)
                        storage.saveFills(updated)
                        setRefreshKey(k => k + 1)
                      }} className={`px-3 py-1.5 rounded-lg text-[12px] font-medium ${fill.verified ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#F5F6F8] text-[#6B7280]'}`}>
                        {fill.verified ? 'Verified' : 'Verify'}
                      </button>
                    </div>
                  </div>
                )
              })}
              {fills.length === 0 && <p className="text-[12px] text-[#6B7280] text-center py-8">{t('noFillsRecorded', lang)}</p>}
            </div>
          )}

          {/* FLEET — VEHICLES */}
          {tab === 'fleet' && fleetTab === 'vehicles' && (
            <div className="space-y-4">
              {/* Vehicle Summary Stats */}
              {(() => {
                const totalVehicleFills = vehicles.reduce((sum, v) => sum + fills.filter(f => String(f.vehicleId) === String(v.id) || f.vehicleId === v.plate).length, 0)
                const totalKmTraveled = vehicles.reduce((sum, v) => sum + (v.currentOdo - v.initialOdo), 0)
                const totalFuel = fills.reduce((sum, f) => sum + f.kgs, 0)
                const overallEfficiency = totalFuel > 0 ? (totalKmTraveled / totalFuel).toFixed(1) : '0'
                
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="p-3 rounded-xl bg-white border border-[#E2E6EB] text-center">
                      <p className="text-[10px] text-[#6B7280]">{t('totalVehicles', lang)}</p>
                      <p className="text-[18px] font-bold text-[#111827]">{vehicles.length}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-white border border-[#E2E6EB] text-center">
                      <p className="text-[10px] text-[#6B7280]">{t('totalKm', lang)}</p>
                      <p className="text-[16px] font-bold text-[#1E40AF]">{(totalKmTraveled/1000).toFixed(1)}k</p>
                    </div>
                    <div className="p-3 rounded-xl bg-white border border-[#E2E6EB] text-center">
                      <p className="text-[10px] text-[#6B7280]">{t('totalFuel', lang)}</p>
                      <p className="text-[16px] font-bold text-[#92400E]">{totalFuel.toFixed(0)} kg</p>
                    </div>
                    <div className="p-3 rounded-xl bg-white border border-[#E2E6EB] text-center">
                      <p className="text-[10px] text-[#6B7280]">{t('efficiency', lang)}</p>
                      <p className="text-[16px] font-bold text-[#166534]">{overallEfficiency} km/kg</p>
                    </div>
                  </div>
                )
              })()}

              <button onClick={() => setShowAddVehicle(true)} className="w-full h-10 rounded-lg bg-white border border-[#E2E6EB] flex items-center justify-center gap-2 hover:bg-[#F5F6F8]">
                <Plus className="w-4 h-4 text-[#E10600]" />
                <span className="text-[12px] font-medium">{t('addVehicle', lang)}</span>
              </button>

              {/* Service Due Reminders */}
              {(() => {
                const SERVICE_INTERVAL = 5000;
                const dueVehicles = vehicles.map(v => {
                  const lastServiceOdo = (v as any).lastServiceOdo || (v as any).initialOdo || 0;
                  const kmSinceService = (v.currentOdo || 0) - lastServiceOdo;
                  const kmToService = SERVICE_INTERVAL - kmSinceService;
                  return { ...v, kmSinceService, kmToService };
                }).filter(v => v.kmToService <= 1000);
                if (dueVehicles.length === 0) return null;
                return (
                  <div className="p-4 rounded-xl bg-[#FEF3C7] border border-[#FDE68A]">
                    <p className="text-[11px] font-bold text-[#92400E] uppercase tracking-wider mb-2">🔧 Service Due Soon</p>
                    {dueVehicles.map(v => (
                      <div key={v.id} className="flex items-center justify-between text-[12px]">
                        <span className="font-medium text-[#111827]">{v.plate}</span>
                        <span className={`font-bold ${v.kmToService <= 0 ? 'text-[#991B1B]' : 'text-[#92400E]'}`}>
                          {v.kmToService <= 0 ? `${Math.abs(v.kmToService)} km overdue` : `${v.kmToService} km to service`}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Vehicle Cards */}
              <div className="space-y-3">
                {vehicles.map(v => {
                  const vFills = fills.filter(f => String(f.vehicleId) === String(v.id) || f.vehicleId === v.plate)
                  const spent = vFills.reduce((s, f) => s + f.total, 0)
                  const totalFuel = vFills.reduce((s, f) => s + f.kgs, 0)
                  const kmTraveled = v.currentOdo - v.initialOdo
                  const efficiency = totalFuel > 0 ? (kmTraveled / totalFuel).toFixed(1) : '0'
                  const lastFill = vFills.length > 0 ? vFills.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0] : null
                  const daysSinceFill = lastFill ? Math.floor((Date.now() - new Date(lastFill.time).getTime()) / (1000 * 60 * 60 * 24)) : null
                  
                  return (
                    <div key={v.id} className="p-4 rounded-xl bg-white border border-[#E2E6EB] hover:border-[#E10600] transition-colors cursor-pointer" onClick={() => setSelectedVehicle(v)}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-mono font-bold text-[16px] text-[#111827]">{v.plate}</p>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] ${v.status === 'active' ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#FEE2E2] text-[#991B1B]'}`}>
                              {v.status}
                            </span>
                          </div>
                          <p className="text-[13px] text-[#6B7280] mb-2">{v.model}</p>
                          
                          {/* Stats Grid */}
                          <div className="grid grid-cols-4 gap-2 mb-2">
                            <div className="text-center p-2 rounded-lg bg-[#F5F6F8]">
                              <p className="text-[13px] font-bold text-[#111827]">{vFills.length}</p>
                              <p className="text-[9px] text-[#6B7280]">{t('fills', lang)}</p>
                            </div>
                            <div className="text-center p-2 rounded-lg bg-[#F5F6F8]">
                              <p className="text-[13px] font-bold text-[#991B1B]">₹{(spent/1000).toFixed(1)}k</p>
                              <p className="text-[9px] text-[#6B7280]">{t('cost', lang)}</p>
                            </div>
                            <div className="text-center p-2 rounded-lg bg-[#F5F6F8]">
                              <p className="text-[13px] font-bold text-[#1E40AF]">{(kmTraveled/1000).toFixed(0)}k</p>
                              <p className="text-[9px] text-[#6B7280]">{t('km', lang)}</p>
                            </div>
                            <div className="text-center p-2 rounded-lg bg-[#F5F6F8]">
                              <p className="text-[13px] font-bold text-[#166534]">{efficiency}</p>
                              <p className="text-[9px] text-[#6B7280]">{t('kmKg', lang)}</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3 text-[10px] text-[#6B7280]">
                            <span>Odometer: {(v.currentOdo || 0).toLocaleString()}</span>
                            {daysSinceFill !== null && (
                              <span className={daysSinceFill > 7 ? 'text-[#991B1B]' : ''}>
                                Last fill: {daysSinceFill === 0 ? 'Today' : daysSinceFill === 1 ? 'Yesterday' : `${daysSinceFill} days ago`}
                              </span>
                            )}
                          </div>
                        </div>
                        <button onClick={async (e) => {
                          e.stopPropagation()
                          // BUG-022 FIX: Delete from allVehicles (global), not filtered 'vehicles'
                          // Previously saving filtered 'vehicles' deleted all other owners' vehicles
                          const allVehicles = storage.getVehicles()
                          storage.saveVehicles(allVehicles.filter(x => x.id !== v.id))
                          await firestoreSync.deleteVehicle(v.id).catch(console.error)
                          setRefreshKey(k => k + 1)
                        }} className="p-1.5 hover:bg-[#FEE2E2] rounded-lg ml-2">
                          <Trash2 className="w-4 h-4 text-[#EF4444]" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* FLEET — DRIVERS */}
          {tab === 'fleet' && fleetTab === 'drivers' && (
            <div className="space-y-4">
              {/* Driver Leaderboard */}
              <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                <p className="text-[12px] font-semibold text-[#6B7280] uppercase mb-4">🏆 Driver Leaderboard</p>
                {(() => {
                  const driverStats = drivers.map(d => {
                    const dFills = fills.filter(f => f.driverId === d.id)
                    const totalFuel = dFills.reduce((s, f) => s + f.kgs, 0)
                    const totalCost = dFills.reduce((s, f) => s + f.total, 0)
                    const verifiedCount = dFills.filter(f => f.verified).length
                    const verificationRate = dFills.length > 0 ? Math.round((verifiedCount / dFills.length) * 100) : 0
                    const mismatches = dFills.filter(f => f.mismatch).length
                    return { ...d, fills: dFills.length, totalFuel, totalCost, verificationRate, mismatches }
                  }).sort((a, b) => b.fills - a.fills)
                  
                  if (driverStats.length === 0) {
                    return <p className="text-[12px] text-[#6B7280] text-center py-4">{t('noDriversYet', lang)}</p>
                  }
                  
                  return (
                    <div className="space-y-3">
                      {driverStats.slice(0, 5).map((d, i) => (
                        <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg bg-[#F5F6F8]">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold ${i === 0 ? 'bg-[#FCD34D] text-[#92400E]' : i === 1 ? 'bg-[#E2E8F0] text-[#475569]' : i === 2 ? 'bg-[#FECACA] text-[#991B1B]' : 'bg-white text-[#6B7280]'}`}>
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-[14px] text-[#111827] truncate">{d.name}</p>
                            <p className="text-[11px] text-[#6B7280]">{d.fills} fills • {d.totalFuel.toFixed(1)} kg • ₹{d.totalCost.toLocaleString()}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[12px] font-medium text-[#166534]">{d.verificationRate}% verified</p>
                            {d.mismatches > 0 && <p className="text-[10px] text-[#991B1B]">{d.mismatches} {t('alerts', lang).toLowerCase()}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>

              {/* Driver Performance Table */}
              <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[12px] font-semibold text-[#6B7280] uppercase">{t('driverPerformance', lang)}</p>
                  <button onClick={() => setShowAddDriver(true)} className="px-3 py-1.5 rounded-lg bg-[#E10600] text-white text-[11px] font-medium">
                    + {t('addDriver', lang)}
                  </button>
                </div>
                <div className="space-y-2">
                  {(() => {
                    const driverAnalytics = drivers.map(d => {
                      const v = vehicles.find(veh => veh.plate === d.assignedVehicleId || String(veh.id) === String(d.assignedVehicleId))
                      const dFills = fills.filter(f => f.driverId === d.id)
                      const totalFuel = dFills.reduce((s, f) => s + f.kgs, 0)
                      const totalCost = dFills.reduce((s, f) => s + f.total, 0)
                      const avgFuel = dFills.length > 0 ? (totalFuel / dFills.length) : 0
                      const avgCost = dFills.length > 0 ? (totalCost / dFills.length) : 0
                      const verifiedCount = dFills.filter(f => f.verified).length
                      const verificationRate = dFills.length > 0 ? Math.round((verifiedCount / dFills.length) * 100) : 0
                      const mismatches = dFills.filter(f => f.mismatch).length
                      const fuelDrops = dFills.filter(f => f.fuelDropPercent > 20).length
                      const thisMonthFills = dFills.filter(f => new Date(f.time).getMonth() === new Date().getMonth()).length
                      
                      return { 
                        ...d, 
                        vehicle: v,
                        fills: dFills.length, 
                        totalFuel, 
                        totalCost, 
                        avgFuel,
                        avgCost,
                        verificationRate,
                        mismatches,
                        fuelDrops,
                        thisMonthFills
                      }
                    }).sort((a, b) => b.totalCost - a.totalCost)
                    
                    if (driverAnalytics.length === 0) {
                      return (
                        <div className="py-8 text-center">
                          <Users className="w-10 h-10 text-[#D1D5DB] mx-auto mb-2" />
                          <p className="text-[12px] text-[#6B7280]">{t('noDriversYet', lang)}</p>
                        </div>
                      )
                    }
                    
                    return driverAnalytics.map(d => (
                      <div key={d.id} className="p-3 rounded-xl bg-white border border-[#E2E6EB] hover:border-[#E10600] transition-colors">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium text-[14px] text-[#111827]">{d.name}</p>
                              <button 
                                onClick={() => {
                                  setEditingDriver(d)
                                  setEditCode(d.code)
                                }}
                                title={t('clickEditDriverCode', lang)}
                                className="px-2 py-0.5 rounded-full bg-[#F5F6F8] hover:bg-[#E2E6EB] hover:text-[#E10600] text-[10px] text-[#6B7280] flex items-center gap-1 transition-colors font-mono"
                              >
                                {d.code}
                                <span className="text-[8px] opacity-60">✏️</span>
                              </button>
                              {d.mismatches > 0 && <span className="px-2 py-0.5 rounded-full bg-[#FEE2E2] text-[10px] text-[#991B1B]">{d.mismatches} {t('alerts', lang).toLowerCase()}</span>}
                            </div>
                            <button
                              onClick={() => {
                                setEditingDriverVehicle(d)
                                setEditVehicleId(d.assignedVehicleId || '')
                              }}
                              title={t('clickChangeVehicle', lang)}
                              className="text-[11px] text-[#6B7280] hover:text-[#E10600] mb-2 flex items-center gap-1 transition-colors"
                            >
                              {d.vehicle?.plate ? `Vehicle: ${d.vehicle.plate}` : 'No vehicle assigned'}
                              <span className="text-[8px] opacity-60">✏️</span>
                            </button>
                            <div className="grid grid-cols-4 gap-2">
                              <div className="text-center p-2 rounded-lg bg-[#F5F6F8]">
                                <p className="text-[13px] font-bold text-[#111827]">{d.fills}</p>
                                <p className="text-[9px] text-[#6B7280]">{t('totalFills', lang)}</p>
                              </div>
                              <div className="text-center p-2 rounded-lg bg-[#F5F6F8]">
                                <p className="text-[13px] font-bold text-[#111827]">{d.thisMonthFills}</p>
                                <p className="text-[9px] text-[#6B7280]">{t('thisMonth', lang)}</p>
                              </div>
                              <div className="text-center p-2 rounded-lg bg-[#F5F6F8]">
                                <p className="text-[13px] font-bold text-[#166534]">{d.verificationRate}%</p>
                                <p className="text-[9px] text-[#6B7280]">{t('verified', lang)}</p>
                              </div>
                              <div className="text-center p-2 rounded-lg bg-[#F5F6F8]">
                                <p className="text-[13px] font-bold text-[#1E40AF]">₹{Math.round(d.avgCost)}</p>
                                <p className="text-[9px] text-[#6B7280]">{t('avgFill', lang)}</p>
                              </div>
                            </div>
                          </div>
                          <button onClick={async () => {
                            // BUG-023 FIX: Delete from allDrivers (global), not filtered 'drivers'
                            // Previously saving filtered 'drivers' deleted all other owners' drivers
                            const allDrivers = storage.getDrivers()
                            storage.saveDrivers(allDrivers.filter(x => x.id !== d.id))
                            await firestoreSync.deleteDriver(d.id).catch(console.error)
                            setRefreshKey(k => k + 1)
                          }} className="p-2 hover:bg-[#FEE2E2] rounded-lg ml-2">
                            <Trash2 className="w-4 h-4 text-[#EF4444]" />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-[#E2E6EB]">
                          <span className="text-[10px] text-[#6B7280]">Total: ₹{d.totalCost.toLocaleString()}</span>
                          <span className="text-[10px] text-[#6B7280]">•</span>
                          <span className="text-[10px] text-[#6B7280]">{d.totalFuel.toFixed(1)} kg total</span>
                          <span className="text-[10px] text-[#6B7280]">•</span>
                          <span className="text-[10px] text-[#6B7280]">{d.avgFuel.toFixed(1)} kg avg</span>
                          {d.fuelDrops > 0 && <span className="px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[10px] text-[#92400E]">{d.fuelDrops} {t('fuelDrops', lang)}</span>}
                        </div>
                      </div>
                    ))
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* PAYMENTS */}
          {tab === 'payments' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                <p className="text-[12px] font-semibold text-[#6B7280] uppercase mb-3">{t('creditSummary', lang)}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-[#F5F6F8]">
                    <p className="text-[11px] text-[#6B7280]">{t('creditLimit', lang)}</p>
                    <p className="text-[16px] font-bold text-[#111827]">₹{creditLimit.toLocaleString()}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-[#F5F6F8]">
                    <p className="text-[11px] text-[#6B7280]">{t('creditUsed', lang)}</p>
                    <p className={`text-[16px] font-bold ${creditUsed > creditLimit * 0.8 ? 'text-[#991B1B]' : 'text-[#111827]'}`}>₹{creditUsed.toLocaleString()}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-[#F5F6F8]">
                    <p className="text-[11px] text-[#6B7280]">{t('totalPaid', lang)}</p>
                    <p className="text-[16px] font-bold text-[#166534]">₹{totalPaid.toLocaleString()}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-[#F5F6F8]">
                    <p className="text-[11px] text-[#6B7280]">{t('outstanding', lang)}</p>
                    <p className={`text-[16px] font-bold ${outstanding > 0 ? 'text-[#991B1B]' : 'text-[#166534]'}`}>₹{outstanding.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* Driver Redemption Requests */}
              <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                <p className="text-[12px] font-semibold text-[#6B7280] uppercase mb-3">
                  {localRedeemTranslations[lang]?.driverRedemptions || localRedeemTranslations.en.driverRedemptions}
                </p>
                <div className="space-y-3">
                  {redemptionRequests.filter((req: any) => String(req.ownerId) === ownerIdStr).length === 0 ? (
                    <p className="text-[12px] text-[#6B7280] text-center py-4">
                      {localRedeemTranslations[lang]?.noRedemptions || localRedeemTranslations.en.noRedemptions}
                    </p>
                  ) : (
                    redemptionRequests
                      .filter((req: any) => String(req.ownerId) === ownerIdStr)
                      .slice()
                      .reverse()
                      .map((req: any) => (
                        <div key={req.id} className="p-3.5 rounded-lg border border-[#E2E6EB] bg-[#F9FAFB] flex flex-col gap-2.5">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-sm font-bold text-[#111827]">{req.driverName}</p>
                              <p className="text-[11px] text-[#6B7280] mt-0.5">{req.vehiclePlate} • {req.date}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-base font-black text-[#E10600]">₹{req.amount}</p>
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold mt-1 uppercase ${
                                req.status === 'pending' ? 'bg-[#FEF3C7] text-[#92400E]' :
                                req.status === 'approved' ? 'bg-[#DCFCE7] text-[#166534]' :
                                'bg-[#FEE2E2] text-[#991B1B]'
                              }`}>
                                {req.status === 'pending'
                                  ? (localRedeemTranslations[lang]?.statusPending || localRedeemTranslations.en.statusPending)
                                  : req.status === 'approved'
                                  ? (localRedeemTranslations[lang]?.statusApproved || localRedeemTranslations.en.statusApproved)
                                  : (localRedeemTranslations[lang]?.statusRejected || localRedeemTranslations.en.statusRejected)}
                              </span>
                            </div>
                          </div>
                          {req.status === 'pending' && (
                            <div className="flex gap-2 border-t border-[#E2E6EB] pt-2.5">
                              <button
                                onClick={() => handleApproveRedemption(req.id)}
                                className="flex-1 h-8 rounded-lg bg-[#166534] text-white text-xs font-bold hover:brightness-105 active:scale-95 transition-all flex items-center justify-center gap-1"
                              >
                                <Check size={12} /> {localRedeemTranslations[lang]?.approvePayout || localRedeemTranslations.en.approvePayout}
                              </button>
                              <button
                                onClick={() => handleRejectRedemption(req.id)}
                                className="flex-1 h-8 rounded-lg border border-[#E2E6EB] bg-white text-[#4B5563] text-xs font-bold hover:bg-gray-50 active:scale-95 transition-all flex items-center justify-center gap-1"
                              >
                                <X size={12} /> {localRedeemTranslations[lang]?.rejectPayout || localRedeemTranslations.en.rejectPayout}
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                  )}
                </div>
              </div>
              
              <div>
                <p className="text-[12px] font-semibold text-[#6B7280] uppercase mb-3">{t('paymentsHistory', lang)}</p>
                <div className="space-y-2">
                  {paymentEntries.slice().reverse().map(p => (
                    <div key={p.id} className="p-3 rounded-xl bg-white border border-[#E2E6EB] flex items-center justify-between">
                      <div>
                        <p className="font-medium text-[14px] text-[#111827]">₹{p.amount.toLocaleString()}</p>
                        <p className="text-[11px] text-[#6B7280]">{p.type} • {new Date(p.timestamp).toLocaleDateString()}</p>
                      </div>
                      <span className="text-[10px] text-[#6B7280]">{p.adminName}</span>
                    </div>
                  ))}
                  {paymentEntries.length === 0 && <p className="text-[12px] text-[#6B7280] text-center py-4">{t('noPaymentRecords', lang)}</p>}
                </div>
              </div>
            </div>
          )}

          {/* NOTIFICATIONS & ALERTS */}
          {tab === 'alerts' && (
            <div className="space-y-4">
              {/* Driver Alert Summary */}
              {(() => {
                const driverAlertCounts = drivers.map(d => {
                  const dAlerts = alerts.filter(a => a.user === d.name || a.user === d.id)
                  const mismatches = dAlerts.filter(a => a.type === 'location_mismatch').length
                  const fuelDrops = dAlerts.filter(a => a.type === 'fuel_drop').length
                  const overrides = dAlerts.filter(a => a.type === 'vehicle_override').length
                  return { ...d, totalAlerts: dAlerts.length, mismatches, fuelDrops, overrides }
                }).filter(d => d.totalAlerts > 0).sort((a, b) => b.totalAlerts - a.totalAlerts)
                
                if (driverAlertCounts.length === 0) return null
                
                return (
                  <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                    <p className="text-[12px] font-semibold text-[#6B7280] uppercase mb-3">⚠️ {t('driversWithAlerts', lang)}</p>
                    <div className="space-y-2">
                      {driverAlertCounts.map(d => (
                        <div key={d.id} className="flex items-center justify-between p-2.5 rounded-lg bg-[#F5F6F8]">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-[#FEE2E2] text-[#991B1B] flex items-center justify-center text-[10px] font-bold">{d.totalAlerts}</span>
                            <span className="text-[13px] font-medium text-[#111827]">{d.name}</span>
                          </div>
                          <div className="flex gap-1.5">
                            {d.mismatches > 0 && <span className="px-2 py-0.5 rounded-full bg-[#FEE2E2] text-[10px] text-[#991B1B]">{d.mismatches} {lang === 'hi' ? 'बेमेल' : lang === 'gu' ? 'સ્થાન' : 'loc'}</span>}
                            {d.fuelDrops > 0 && <span className="px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[10px] text-[#92400E]">{d.fuelDrops} {lang === 'hi' ? 'ईंधन' : lang === 'gu' ? 'ઇંધણ' : 'fuel'}</span>}
                            {d.overrides > 0 && <span className="px-2 py-0.5 rounded-full bg-[#DBEAFE] text-[10px] text-[#1E40AF]">{d.overrides} {lang === 'hi' ? 'वाहन' : lang === 'gu' ? 'વાહન' : 'vehicle'}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* All Alerts */}
              <div>
                <p className="text-[12px] font-semibold text-[#6B7280] uppercase mb-3">{t('allAlerts', lang)}</p>
                <div className="space-y-2">
                  {alerts.length === 0 ? (
                    <div className="py-12 text-center">
                      <CheckCircle2 className="w-10 h-10 text-[#10B981] mx-auto mb-2" />
                      <p className="text-[12px] text-[#6B7280]">{t('noActiveAlerts', lang)}</p>
                    </div>
                  ) : alerts.map(alert => (
                    <div key={alert.id} className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${alert.type === 'vehicle_override' ? 'bg-[#FEF3C7]' : alert.type === 'fuel_drop' ? 'bg-[#FEF3C7]' : 'bg-[#FEE2E2]'}`}>
                          <AlertTriangle className={`w-4 h-4 ${alert.type === 'vehicle_override' ? 'text-[#92400E]' : alert.type === 'fuel_drop' ? 'text-[#92400E]' : 'text-[#991B1B]'}`} />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-[14px] text-[#111827]">{alert.event}</p>
                          <p className="text-[12px] text-[#6B7280]">{alert.user} • {new Date(alert.time).toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                 </div>
              </div>
            </div>
          )}

          {/* KPI — FILLS: Media */}
          {tab === 'kpi' && kpiTab === 'fills' && fillsTab === 'media' && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                <p className="text-[12px] font-semibold text-[#6B7280] uppercase mb-3">{t('filters', lang)}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <select 
                    value={mediaFilterDriver} 
                    onChange={e => setMediaFilterDriver(e.target.value)}
                    className="h-10 px-3 bg-[#F5F6F8] border border-[#E2E6EB] rounded-lg text-[12px]"
                  >
                    <option value="all">{t('allDrivers', lang)}</option>
                    {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <select 
                    value={mediaFilterVehicle} 
                    onChange={e => setMediaFilterVehicle(e.target.value)}
                    className="h-10 px-3 bg-[#F5F6F8] border border-[#E2E6EB] rounded-lg text-[12px]"
                  >
                    <option value="all">{t('allVehicles', lang)}</option>
                    {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate}</option>)}
                  </select>
                  <select 
                    value={mediaFilterVerified} 
                    onChange={e => setMediaFilterVerified(e.target.value as 'all' | 'verified' | 'pending')}
                    className="h-10 px-3 bg-[#F5F6F8] border border-[#E2E6EB] rounded-lg text-[12px]"
                  >
                    <option value="all">{t('allStatus', lang)}</option>
                    <option value="verified">{t('verified', lang)}</option>
                    <option value="pending">{t('pending', lang)}</option>
                  </select>
                  <button 
                    onClick={() => {
                      setMediaFilterDriver('all')
                      setMediaFilterVehicle('all')
                      setMediaFilterVerified('all')
                    }}
                    className="h-10 px-3 bg-[#F5F6F8] border border-[#E2E6EB] rounded-lg text-[12px] text-[#6B7280] hover:bg-[#E2E6EB]"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>

              {/* Media Grid */}
              {(() => {
                const filteredFills = fills
                  .filter(f => {
                    if (mediaFilterDriver !== 'all' && f.driverId !== mediaFilterDriver) return false
                    if (mediaFilterVehicle !== 'all' && f.vehicleId !== mediaFilterVehicle) return false
                    if (mediaFilterVerified === 'verified' && !f.verified) return false
                    if (mediaFilterVerified === 'pending' && f.verified) return false
                    return true
                  })
                  .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())

                if (filteredFills.length === 0) {
                  return (
                    <div className="py-12 text-center">
                      <Camera className="w-10 h-10 text-[#D1D5DB] mx-auto mb-2" />
                      <p className="text-[12px] text-[#6B7280]">{t('noFillsFoundWithMedia', lang)}</p>
                    </div>
                  )
                }

                return filteredFills.map(fill => {
                  const v = vehicles.find(veh => String(veh.id) === String(fill.vehicleId) || veh.plate === fill.vehicleId)
                  const d = drivers.find(drv => String(drv.id) === String(fill.driverId))
                  const mediaItems = [
                    { label: 'Video', url: fill.videoUrl, isVideo: true },
                    { label: 'Pump', url: fill.pumpPhotoUrl, isVideo: false },
                    { label: 'Receipt', url: fill.receiptPhotoUrl, isVideo: false },
                    { label: 'Odo', url: fill.odoPhotoUrl, isVideo: false },
                  ]

                  return (
                    <div key={fill.id} className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                      {/* Fill Info Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-mono text-[14px] font-medium text-[#111827]">{v?.plate || fill.vehicleId}</p>
                            {fill.verified && <CheckCircle2 className="w-4 h-4 text-[#10B981]" />}
                          </div>
                          <p className="text-[12px] text-[#6B7280]">{d?.name || fill.driverId} • {new Date(fill.time).toLocaleString()}</p>
                          <p className="text-[11px] text-[#6B7280]">{fill.station} • {fill.kgs}kg • ₹{fill.total}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {fill.mismatch && (
                            <span className="px-2 py-0.5 rounded-full bg-[#FEE2E2] text-[10px] text-[#991B1B] flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {Math.round(fill.distanceDiff)}m
                            </span>
                          )}
                          {fill.fuelDropPercent > 20 && (
                            <span className="px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[10px] text-[#92400E]">
                              Fuel drop {fill.fuelDropPercent.toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Media Grid */}
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        {mediaItems.map((m, i) => (
                          <div
                            key={i}
                            className={`block aspect-video rounded-lg border bg-[#F5F6F8] border-[#E2E6EB] overflow-hidden relative ${m.url ? 'cursor-pointer hover:border-[#E10600] transition-colors' : ''}`}
                            onClick={() => m.url && window.open(m.url, '_blank')}
                          >
                            <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                              <Camera className="w-5 h-5 text-[#D1D5DB]" />
                              <span className="text-[10px] text-[#4B5563] font-medium">{m.label}</span>
                              {m.url ? (
                                <span className="text-[9px] text-[#10B981] bg-[#D1FAE5] px-2 py-0.5 rounded-full mt-1 font-medium">
                                  Captured
                                </span>
                              ) : (
                                <span className="text-[9px] text-[#9CA3AF] bg-[#F3F4F6] px-2 py-0.5 rounded-full mt-1 font-medium">
                                  Not Captured
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Verify Button */}
                      {!fill.verified && (
                        <button
                          onClick={async () => {
                            const updatedFill = { ...fill, verified: true, verifiedBy: owner?.name || 'Owner', verifiedAt: new Date().toISOString() }
                            const allFills = storage.getFills()
                            storage.saveFills(allFills.map(f => f.id === fill.id ? updatedFill : f))
                            setRefreshKey(k => k + 1)
                          }}
                          className="w-full h-10 rounded-lg bg-[#E10600] text-white text-[12px] font-medium hover:bg-[#991B1B]"
                        >
                          Verify Fill
                        </button>
                      )}
                      {fill.verified && (
                        <div className="flex items-center justify-center gap-2 h-10 rounded-lg bg-[#DCFCE7] text-[#166534] text-[12px] font-medium">
                          <CheckCircle2 className="w-4 h-4" />
                          Verified by {fill.verifiedBy || 'Owner'} on {fill.verifiedAt ? new Date(fill.verifiedAt).toLocaleDateString() : new Date().toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  )
                })
              })()}
            </div>
          )}

          {/* KPI — FILLS: Trip Media */}
          {tab === 'kpi' && kpiTab === 'fills' && fillsTab === 'trip-media' && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                <p className="text-[12px] font-semibold text-[#6B7280] uppercase mb-3">{t('tripMediaFilters', lang)}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <select 
                    value={tripMediaFilterDriver} 
                    onChange={e => setTripMediaFilterDriver(e.target.value)}
                    className="h-10 px-3 bg-[#F5F6F8] border border-[#E2E6EB] rounded-lg text-[12px]"
                  >
                    <option value="all">{t('allDrivers', lang)}</option>
                    {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <select 
                    value={tripMediaFilterVehicle} 
                    onChange={e => setTripMediaFilterVehicle(e.target.value)}
                    className="h-10 px-3 bg-[#F5F6F8] border border-[#E2E6EB] rounded-lg text-[12px]"
                  >
                    <option value="all">{t('allVehicles', lang)}</option>
                    {vehicles.map(v => <option key={v.id} value={v.plate}>{v.plate}</option>)}
                  </select>
                  <select 
                    value={tripMediaFilterStatus} 
                    onChange={e => setTripMediaFilterStatus(e.target.value as 'all' | 'active' | 'completed')}
                    className="h-10 px-3 bg-[#F5F6F8] border border-[#E2E6EB] rounded-lg text-[12px]"
                  >
                    <option value="all">{t('allStatus', lang)}</option>
                    <option value="active">{t('active', lang)}</option>
                    <option value="completed">{t('completed', lang)}</option>
                  </select>
                  <button 
                    onClick={() => {
                      setTripMediaFilterDriver('all')
                      setTripMediaFilterVehicle('all')
                      setTripMediaFilterStatus('all')
                    }}
                    className="h-10 px-3 bg-[#F5F6F8] border border-[#E2E6EB] rounded-lg text-[12px] text-[#6B7280] hover:bg-[#E2E6EB]"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>

              {/* Trips List */}
              {(() => {
                const allTrips = storage.getTrips()
                const filteredTrips = allTrips
                  .filter((t: any) => {
                    if (String(t.ownerId) !== ownerIdStr) return false
                    if (tripMediaFilterDriver !== 'all' && String(t.driverId) !== tripMediaFilterDriver) return false
                    if (tripMediaFilterVehicle !== 'all' && String(t.vehicleId) !== tripMediaFilterVehicle) return false
                    if (tripMediaFilterStatus !== 'all' && t.status !== tripMediaFilterStatus) return false
                    return true
                  })
                  .sort((a, b) => new Date(b.start.time).getTime() - new Date(a.start.time).getTime())

                if (filteredTrips.length === 0) {
                  return (
                    <div className="py-12 text-center bg-white border border-[#E2E6EB] rounded-xl">
                      <Camera className="w-10 h-10 text-[#D1D5DB] mx-auto mb-2" />
                      <p className="text-[12px] text-[#6B7280]">{t('noTripMediaRecordsFound', lang)}</p>
                    </div>
                  )
                }

                return (
                  <div className="space-y-4">
                    {filteredTrips.map((trip: any) => {
                      const d = drivers.find(drv => String(drv.id) === String(trip.driverId))
                      
                      return (
                        <div key={trip.id} className="p-5 rounded-xl bg-white border border-[#E2E6EB] shadow-sm">
                          {/* Header info */}
                          <div className="flex items-start justify-between border-b border-[#F3F4F6] pb-3 mb-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[14px] font-bold text-[#111827]">{trip.vehicleId}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  trip.status === 'active' 
                                    ? 'bg-[#FEF3C7] text-[#D97706] animate-pulse' 
                                    : 'bg-[#D1FAE5] text-[#065F46]'
                                }`}>
                                  {trip.status === 'active' ? 'Active' : 'Completed'}
                                </span>
                              </div>
                              <p className="text-[12px] text-[#6B7280] mt-0.5">
                                {d?.name || trip.driverName || 'Unknown Driver'}
                              </p>
                            </div>
                            <div className="text-right">
                              {trip.status === 'completed' && (
                                <p className="text-[13px] font-semibold text-[#111827]">{trip.distanceKms} km</p>
                              )}
                              <p className="text-[10px] text-[#9CA3AF] mt-0.5">
                                {new Date(trip.start.time).toLocaleDateString()}
                              </p>
                            </div>
                          </div>

                          {/* Media preview section */}
                          <div className="grid grid-cols-2 gap-4">
                            {/* Start Odometer */}
                            <div className="space-y-2">
                              <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">{t('startTripOdo', lang)}</p>
                              <p className="text-[13px] font-mono text-[#374151] font-semibold">{trip.start.odoReading} km</p>
                              {trip.start.odoPhotoUrl ? (
                                <div 
                                  className="aspect-video w-full rounded-lg border border-[#E2E6EB] bg-[#F5F6F8] overflow-hidden relative cursor-pointer hover:border-[#E10600] transition-colors"
                                  onClick={() => setLightboxMedia({ url: trip.start.odoPhotoUrl, label: `Start Odo: ${trip.start.odoReading} km` })}
                                >
                                  <img 
                                    src={trip.start.odoPhotoUrl} 
                                    alt="Start Odometer" 
                                    loading="lazy"
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              ) : (
                                <div className="aspect-video w-full rounded-lg border border-[#E2E6EB] bg-[#F3F4F6] flex flex-col items-center justify-center gap-1">
                                  <Camera className="w-5 h-5 text-[#9CA3AF]" />
                                  <span className="text-[9px] text-[#9CA3AF] font-medium">{t('noPhoto', lang)}</span>
                                </div>
                              )}
                            </div>

                            {/* End Odometer */}
                            <div className="space-y-2">
                              <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">{t('endTripOdo', lang)}</p>
                              {trip.status === 'completed' ? (
                                <>
                                  <p className="text-[13px] font-mono text-[#374151] font-semibold">{trip.end?.odoReading} km</p>
                                  {trip.end?.odoPhotoUrl ? (
                                    <div 
                                      className="aspect-video w-full rounded-lg border border-[#E2E6EB] bg-[#F5F6F8] overflow-hidden relative cursor-pointer hover:border-[#E10600] transition-colors"
                                      onClick={() => setLightboxMedia({ url: trip.end.odoPhotoUrl, label: `End Odo: ${trip.end.odoReading} km` })}
                                    >
                                      <img 
                                        src={trip.end.odoPhotoUrl} 
                                        alt="End Odometer" 
                                        loading="lazy"
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                  ) : (
                                    <div className="aspect-video w-full rounded-lg border border-[#E2E6EB] bg-[#F3F4F6] flex flex-col items-center justify-center gap-1">
                                      <Camera className="w-5 h-5 text-[#9CA3AF]" />
                                      <span className="text-[9px] text-[#9CA3AF] font-medium">{t('noPhoto', lang)}</span>
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div className="h-full flex items-center justify-center pt-5">
                                  <span className="text-[11px] text-[#9CA3AF] italic">{t('tripInProgress', lang)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          )}

          {/* KPI — FILLS: Reports */}
          {tab === 'kpi' && kpiTab === 'fills' && fillsTab === 'reports' && (() => {
            const handleExportCSV = () => {
              const fn = `cng_fills_${reportRange}_${Date.now()}.csv`;
              const headers = ['Date & Time', 'Vehicle', 'Driver', 'Station', 'KGs', 'Rate (₹)', 'Total (₹)', 'Verified'];
              
              const lookupVehicle = (id: string) => {
                const v = vehicles.find(veh => String(veh.id) === String(id) || veh.plate === id);
                return v ? v.plate : id;
              };
              const lookupDriver = (id: string) => {
                const d = drivers.find(drv => String(drv.id) === String(id));
                return d ? d.name : id;
              };

              const rows = filteredFillsForReports.map(f => [
                new Date(f.time).toLocaleString(),
                lookupVehicle(f.vehicleId),
                lookupDriver(f.driverId),
                f.station,
                f.kgs,
                f.rate,
                f.total,
                f.verified ? 'Yes' : 'No'
              ]);
              
              exportToCSV(fn, headers, rows);
            };

            const handleExportPDF = () => {
              const rangeText = reportRange === 'weekly' ? 'Weekly (Last 7 Days)' : reportRange === 'monthly' ? 'Monthly (Last 30 Days)' : 'All Time';
              
              const selectedVehObj = vehicles.find(v => String(v.id) === reportVehicle || v.plate === reportVehicle);
              const vehText = selectedVehObj ? selectedVehObj.plate : 'All Vehicles';
              
              const selectedDrvObj = drivers.find(d => String(d.id) === reportDriver);
              const drvText = selectedDrvObj ? selectedDrvObj.name : 'All Drivers';

              exportToPDF('CNG Fuel Fills Report', filteredFillsForReports, {
                range: rangeText,
                vehicle: vehText,
                driver: drvText
              });
            };

            return (
              <div className="space-y-4">
                {/* Reports Dashboard Title */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-xl border border-[#E2E6EB]">
                  <div>
                    <h2 className="text-[16px] font-bold text-[#111827]">{t('reportsAndExport', lang)}</h2>
                    <p className="text-[12px] text-[#6B7280]">{t('selectDateRangeAndFilters', lang)}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button 
                      onClick={handleExportCSV}
                      disabled={filteredFillsForReports.length === 0}
                      className="h-10 px-4 rounded-lg bg-[#166534] text-white text-[12px] font-medium hover:bg-[#14532D] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
                    >
                      <span>📥</span> Export Excel
                    </button>
                    <button 
                      onClick={handleExportPDF}
                      disabled={filteredFillsForReports.length === 0}
                      className="h-10 px-4 rounded-lg bg-[#E10600] text-white text-[12px] font-medium hover:bg-[#B91C1C] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
                    >
                      <span>📄</span> Export PDF
                    </button>
                  </div>
                </div>

                {/* Filters Card */}
                <div className="p-4 rounded-xl bg-white border border-[#E2E6EB] space-y-4">
                  <p className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider">{t('configureReport', lang)}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium text-[#4B5563]">{t('timeRange', lang)}</label>
                      <select 
                        value={reportRange} 
                        onChange={e => setReportRange(e.target.value as any)}
                        className="h-10 px-3 bg-[#F5F6F8] border border-[#E2E6EB] rounded-lg text-[12px] focus:outline-none focus:border-[#E10600]"
                      >
                        <option value="weekly">{t('weeklyLast7Days', lang)}</option>
                        <option value="monthly">{t('monthlyLast30Days', lang)}</option>
                        <option value="all">{t('allTime', lang)}</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium text-[#4B5563]">{t('filterByVehicle', lang)}</label>
                      <select 
                        value={reportVehicle} 
                        onChange={e => setReportVehicle(e.target.value)}
                        className="h-10 px-3 bg-[#F5F6F8] border border-[#E2E6EB] rounded-lg text-[12px] focus:outline-none focus:border-[#E10600]"
                      >
                        <option value="all">{t('allVehicles', lang)}</option>
                        {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium text-[#4B5563]">{t('filterByDriver', lang)}</label>
                      <select 
                        value={reportDriver} 
                        onChange={e => setReportDriver(e.target.value)}
                        className="h-10 px-3 bg-[#F5F6F8] border border-[#E2E6EB] rounded-lg text-[12px] focus:outline-none focus:border-[#E10600]"
                      >
                        <option value="all">{t('allDrivers', lang)}</option>
                        {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Selection Summary KPI Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-3.5 rounded-xl bg-white border border-[#E2E6EB]">
                    <p className="text-[10px] text-[#6B7280] uppercase tracking-wider font-semibold">{t('totalCost', lang)}</p>
                    <p className="text-[16px] sm:text-[18px] font-bold text-[#111827] mt-1">
                      ₹{filteredFillsForReports.reduce((s, f) => s + f.total, 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-white border border-[#E2E6EB]">
                    <p className="text-[10px] text-[#6B7280] uppercase tracking-wider font-semibold">{t('totalFuel', lang)}</p>
                    <p className="text-[16px] sm:text-[18px] font-bold text-[#1E40AF] mt-1">
                      {filteredFillsForReports.reduce((s, f) => s + f.kgs, 0).toFixed(1)} kg
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-white border border-[#E2E6EB]">
                    <p className="text-[10px] text-[#6B7280] uppercase tracking-wider font-semibold">{t('avgRate', lang)}</p>
                    <p className="text-[16px] sm:text-[18px] font-bold text-[#92400E] mt-1">
                      ₹{(() => {
                        const totalKgs = filteredFillsForReports.reduce((s, f) => s + f.kgs, 0);
                        const totalCost = filteredFillsForReports.reduce((s, f) => s + f.total, 0);
                        return totalKgs > 0 ? (totalCost / totalKgs).toFixed(2) : '0.00';
                      })()}/kg
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-white border border-[#E2E6EB]">
                    <p className="text-[10px] text-[#6B7280] uppercase tracking-wider font-semibold">{t('fillsCount', lang)}</p>
                    <p className="text-[16px] sm:text-[18px] font-bold text-[#166534] mt-1">
                      {filteredFillsForReports.length}
                    </p>
                  </div>
                </div>

                {/* Data Table Preview */}
                <div className="bg-white rounded-xl border border-[#E2E6EB] overflow-hidden">
                  <p className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider px-4 py-3 border-b border-[#E2E6EB]">
                    Report Preview ({filteredFillsForReports.length} bills matched)
                  </p>
                  <div className="overflow-x-auto max-h-[350px] overflow-y-auto">
                    <table className="w-full text-left border-collapse text-[11px] sm:text-[12px]">
                      <thead className="bg-[#F9FAFB] text-[#374151] font-semibold sticky top-0 z-10 border-b border-[#E2E6EB]">
                        <tr>
                          <th className="p-3">{t('date', lang)}</th>
                          <th className="p-3">{t('vehicle', lang)}</th>
                          <th className="p-3">{t('driver', lang)}</th>
                          <th className="p-3">{t('station', lang)}</th>
                          <th className="p-3 text-right">{t('kgs', lang)}</th>
                          <th className="p-3 text-right">{t('rate', lang)}</th>
                          <th className="p-3 text-right font-bold">{t('total', lang)}</th>
                          <th className="p-3 text-center">{t('verified', lang)}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E6EB] text-[#111827]">
                        {filteredFillsForReports.map(f => {
                          const v = vehicles.find(veh => String(veh.id) === String(f.vehicleId) || veh.plate === f.vehicleId);
                          const d = drivers.find(drv => String(drv.id) === String(f.driverId));
                          return (
                            <tr key={f.id} className="hover:bg-[#F9FAFB]">
                              <td className="p-3 whitespace-nowrap">{new Date(f.time).toLocaleDateString()}</td>
                              <td className="p-3 font-mono">{v?.plate || f.vehicleId}</td>
                              <td className="p-3">{d?.name || f.driverId}</td>
                              <td className="p-3 truncate max-w-[120px]">{f.station}</td>
                              <td className="p-3 text-right">{f.kgs.toFixed(2)}</td>
                              <td className="p-3 text-right">₹{f.rate.toFixed(2)}</td>
                              <td className="p-3 text-right font-bold">₹{f.total.toFixed(2)}</td>
                              <td className="p-3 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${f.verified ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#FEE2E2] text-[#991B1B]'}`}>
                                  {f.verified ? 'Yes' : 'No'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                        {filteredFillsForReports.length === 0 && (
                          <tr>
                            <td colSpan={8} className="p-8 text-center text-[#6B7280]">
                              No fills match the selected range and filters.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* FLEET — LIVE GPS TRACKING */}
          {tab === 'fleet' && fleetTab === 'tracking' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl sm:text-[22px] font-bold text-[#111827]">{t('liveDriverTracking', lang)}</h1>
                  <p className="text-[12px] text-[#6B7280]">Real-time visual map tracking (pulsing green = active, gray = offline)</p>
                </div>
              </div>

              {(() => {
                const allTrips = storage.getTrips();
                const assignedDrivers = drivers.filter(d => d.assignedVehicleId !== null && d.assignedVehicleId !== '')
                  .sort((a, b) => {
                    const aTrips = allTrips.filter((t: any) => String(t.driverId) === String(a.id));
                    const bTrips = allTrips.filter((t: any) => String(t.driverId) === String(b.id));

                    const aActive = aTrips.some((t: any) => t.status === 'active');
                    const bActive = bTrips.some((t: any) => t.status === 'active');

                    if (aActive && !bActive) return -1;
                    if (!aActive && bActive) return 1;

                    const aTime = aTrips.length > 0 ? Math.max(...aTrips.map((t: any) => new Date(t.start.time).getTime())) : 0;
                    const bTime = bTrips.length > 0 ? Math.max(...bTrips.map((t: any) => new Date(t.start.time).getTime())) : 0;

                    return bTime - aTime;
                  });

                if (assignedDrivers.length === 0) {
                  return (
                    <div className="p-8 text-center text-[#D97706] text-[13px] bg-[#FEF3C7]/50 rounded-[20px] border border-[#FDE68A] max-w-lg mx-auto">
                      <span className="block text-[24px] mb-2">⚠️</span>
                      <strong className="text-[#92400E] text-[15px]">{t('noDriversAssignedToVehicles', lang)}</strong>
                      <p className="mt-1.5 text-[#B45309] text-[13px] leading-relaxed">
                        There are currently no drivers assigned to vehicles in your fleet.
                        {t('pleaseGoToDriversTab', lang)}
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="p-5 rounded-[20px] bg-white border border-[#E2E6EB] shadow-sm">
                    <p className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-4 pb-2 border-b border-[#E2E6EB]">{t('fleetDriversList', lang)}</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-[#E2E6EB] text-[11px] text-[#6B7280] uppercase tracking-wider font-semibold">
                            <th className="pb-3 font-semibold">{t('driverInfo', lang)}</th>
                            <th className="pb-3 font-semibold">{t('assignedVehicle', lang)}</th>
                            <th className="pb-3 font-semibold">{t('liveGpsStatus', lang)}</th>
                            <th className="pb-3 font-semibold text-right">{t('actions', lang)}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F0F2F5]">
                          {assignedDrivers.map((driver) => {
                            const matchingLoc = liveLocations.find(loc => String(loc.driverId) === String(driver.id));
                            const hasActiveTrip = allTrips.some((t: any) => String(t.driverId) === String(driver.id) && t.status === 'active');
                            const isRecent = (matchingLoc && hasActiveTrip) 
                              ? (Date.now() - new Date(matchingLoc.lastUpdated).getTime() < 5 * 60 * 1000) 
                              : false;
                            const currentVehicle = vehicles.find(v => v.plate === driver.assignedVehicleId || String(v.id) === String(driver.assignedVehicleId));

                            return (
                              <tr key={driver.id} className="text-[13px] hover:bg-[#F9FAFB]/50 transition-colors">
                                <td className="py-3.5 pr-3 font-medium text-[#111827]">
                                  {driver.name}
                                </td>
                                <td className="py-3.5 pr-3 text-[#4B5563]">
                                  {currentVehicle ? (
                                    <div>
                                      <span className="font-mono font-bold text-[#111827]">{currentVehicle.plate}</span>
                                      <span className="text-[11px] text-[#6B7280] ml-2">({currentVehicle.model})</span>
                                    </div>
                                  ) : (
                                    <span className="text-[#9CA3AF]">--</span>
                                  )}
                                </td>
                                <td className="py-3.5 pr-3">
                                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold ${isRecent ? 'bg-[#D1FAE5] text-[#065F46]' : 'bg-[#F3F4F6] text-[#374151]'}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${isRecent ? 'bg-[#10B981] animate-pulse' : 'bg-[#9CA3AF]'}`} />
                                    {isRecent ? '🟢 Active on Trip' : '⚪ Offline / Idle'}
                                  </span>
                                </td>
                                <td className="py-3.5 text-right">
                                  <button
                                    onClick={() => setTrackingDriverId(driver.id)}
                                    className={`h-9 px-4 rounded-xl text-[12px] font-medium transition-all ${
                                      isRecent 
                                        ? 'bg-[#E10600] text-white hover:bg-[#C00500] hover:shadow-md hover:shadow-[#E10600]/10' 
                                        : 'bg-[#F3F4F6] text-[#4B5563] hover:bg-[#E5E7EB]'
                                    }`}
                                  >
                                    <span className="flex items-center gap-1.5 justify-center"><MapPin className="w-3.5 h-3.5" /> {t('trackDriver', lang)}</span>
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Live Geolocation Map Modal */}
      {trackingDriverId && (() => {
        const trackedDriver = drivers.find(d => d.id === trackingDriverId);
        const filteredLocs = liveLocations.filter(loc => loc.driverId === trackingDriverId);
        const currentVehicle = trackedDriver ? vehicles.find(v => v.plate === trackedDriver.assignedVehicleId || String(v.id) === String(trackedDriver.assignedVehicleId)) : null;

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]" onClick={() => setTrackingDriverId(null)}>
            <div className="bg-white rounded-[24px] w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
              
              {/* Modal Header */}
              <div className="p-5 border-b border-[#E2E6EB] flex justify-between items-center bg-[#F9FAFB]">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-[18px] text-[#111827]">
                      Live Tracking: {trackedDriver?.name}
                    </h3>
                    {filteredLocs.length > 0 && (
                      <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] animate-pulse" />
                    )}
                  </div>
                  <p className="text-[12px] text-[#6B7280]">
                    Assigned Vehicle: <strong className="font-mono text-[#111827]">{currentVehicle?.plate || trackedDriver?.assignedVehicleId || 'N/A'}</strong> ({currentVehicle?.model || 'N/A'})
                  </p>
                </div>
                <button
                  onClick={() => setTrackingDriverId(null)}
                  className="w-10 h-10 rounded-xl bg-white border border-[#E2E6EB] hover:bg-[#F5F6F8] flex items-center justify-center text-[#6B7280] hover:text-[#111827] transition-all font-semibold"
                >
                  ✕
                </button>
              </div>

              {/* Modal Map Content */}
              <div className="flex-1 p-5 bg-[#F9FAFB]">
                {filteredLocs.length === 0 ? (
                  <div className="h-[450px] rounded-xl border border-[#E2E6EB] bg-[#F3F4F6] flex flex-col items-center justify-center p-6 text-center">
                    <span className="text-[32px] mb-2">😴</span>
                    <strong className="text-[#4B5563] text-[14px]">{t('driverOffline', lang)}</strong>
                    <p className="text-[12px] text-[#6B7280] max-w-xs mt-1 leading-relaxed">
                      No active GPS coordinates found. The map will load and update once the driver starts their active trip.
                    </p>
                  </div>
                ) : (
                  <div className="h-[450px]">
                    <LiveTrackingMap liveLocations={filteredLocs} />
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-[#E2E6EB] bg-white flex justify-between items-center px-6">
                <div className="text-[11px] text-[#6B7280]">
                  {filteredLocs.length > 0 ? (
                    <span>Last updated: {new Date(filteredLocs[0].lastUpdated).toLocaleTimeString()}</span>
                  ) : (
                    <span>{t('lastUpdatedNever', lang)}</span>
                  )}
                </div>
                <button
                  onClick={() => setTrackingDriverId(null)}
                  className="px-5 py-2.5 rounded-xl bg-[#111827] text-white text-[13px] font-semibold hover:bg-black transition-colors"
                >
                  Close Tracking
                </button>
              </div>

            </div>
          </div>
        );
      })()}

          {/* LOAD MATCHING TAB */}
          {tab === 'loadmatch' && (() => {
            const loads: any[] = (() => { try { return JSON.parse(localStorage.getItem('cng_load_listings') || '[]') } catch { return [] } })()
            const bookings: any[] = (() => { try { return JSON.parse(localStorage.getItem('cng_load_bookings') || '[]') } catch { return [] } })()
            const activeLoads = loads.filter(l => l.status === 'active')
            return (
              <div className="space-y-5">
                <div>
                  <h1 className="text-xl sm:text-[22px] font-bold text-[#111827]">Load Matching</h1>
                  <p className="text-[12px] text-[#6B7280] mt-0.5">Live loads posted by admin — view bookings from your drivers</p>
                </div>

                {/* KPI strip */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-white border border-[#E2E6EB] text-center">
                    <p className="text-[20px] font-bold text-[#111827]">{activeLoads.length}</p>
                    <p className="text-[10px] text-[#6B7280] mt-0.5">Active Loads</p>
                  </div>
                  <div className="p-3 rounded-xl bg-white border border-[#E2E6EB] text-center">
                    <p className="text-[20px] font-bold text-[#1d4ed8]">{bookings.filter(b => b.status === 'pending').length}</p>
                    <p className="text-[10px] text-[#6B7280] mt-0.5">Pending Bookings</p>
                  </div>
                  <div className="p-3 rounded-xl bg-white border border-[#E2E6EB] text-center">
                    <p className="text-[20px] font-bold text-[#166534]">{bookings.filter(b => b.status === 'approved').length}</p>
                    <p className="text-[10px] text-[#6B7280] mt-0.5">Approved</p>
                  </div>
                </div>

                {/* Active Loads */}
                <div>
                  <p className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">📦 Available Loads</p>
                  {activeLoads.length === 0 ? (
                    <div className="p-8 rounded-2xl bg-white border border-[#E2E6EB] text-center">
                      <p className="text-[32px] mb-2">📭</p>
                      <p className="text-[14px] font-semibold text-[#111827]">No active loads</p>
                      <p className="text-[12px] text-[#6B7280] mt-1">Admin will post loads here when available.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {activeLoads.map((load: any) => (
                        <div key={load.id} className="p-4 rounded-2xl bg-white border border-[#E2E6EB]">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <p className="text-[13px] font-bold text-[#111827]">{load.from} → {load.to}</p>
                              <p className="text-[11px] text-[#6B7280]">{load.cargo} · {load.weight} · {load.distance}</p>
                            </div>
                            <span className="text-[12px] font-black text-[#E10600]">{load.rate}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#F0FDF4] text-[#166534] border border-[#BBF7D0]">{load.vehicleType}</span>
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#EFF6FF] text-[#1d4ed8] border border-[#BFDBFE]">{load.available}</span>
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#F5F6F8] text-[#6B7280]">{load.category}</span>
                          </div>
                          {/* Driver bookings on this load */}
                          {bookings.filter((b: any) => b.loadId === load.id).length > 0 && (
                            <div className="mt-3 pt-3 border-t border-[#F0F2F5]">
                              <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wide mb-2">Driver Bookings</p>
                              {bookings.filter((b: any) => b.loadId === load.id).map((b: any) => (
                                <div key={b.id} className="flex items-center justify-between py-1.5">
                                  <div>
                                    <p className="text-[12px] font-semibold text-[#111827]">{b.driverName || b.driverId}</p>
                                    <p className="text-[10px] text-[#9CA3AF]">{b.bookedAt ? new Date(b.bookedAt).toLocaleDateString() : ''}</p>
                                  </div>
                                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                    b.status === 'approved' ? 'bg-green-100 text-green-700' :
                                    b.status === 'rejected' ? 'bg-red-100 text-red-700' :
                                    'bg-amber-100 text-amber-700'
                                  }`}>{b.status}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* All driver bookings */}
                {bookings.length > 0 && (
                  <div>
                    <p className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">📋 All Booking Requests</p>
                    <div className="bg-white rounded-2xl border border-[#E2E6EB] overflow-hidden">
                      <table className="w-full text-left">
                        <thead className="border-b border-[#E2E6EB] bg-[#F9FAFB]">
                          <tr>
                            {['Driver','Route','Booked','Status'].map(h => (
                              <th key={h} className="px-4 py-3 text-[10px] font-semibold text-[#6B7280] uppercase tracking-wide">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F0F2F5]">
                          {bookings.map((b: any) => {
                            const load = loads.find((l: any) => l.id === b.loadId)
                            return (
                              <tr key={b.id} className="hover:bg-[#F9FAFB]">
                                <td className="px-4 py-3 text-[12px] font-medium text-[#111827]">{b.driverName || b.driverId}</td>
                                <td className="px-4 py-3 text-[11px] text-[#6B7280]">{load ? `${load.from} → ${load.to}` : '—'}</td>
                                <td className="px-4 py-3 text-[11px] text-[#9CA3AF]">{b.bookedAt ? new Date(b.bookedAt).toLocaleDateString() : '—'}</td>
                                <td className="px-4 py-3">
                                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                    b.status === 'approved' ? 'bg-green-100 text-green-700' :
                                    b.status === 'rejected' ? 'bg-red-100 text-red-700' :
                                    'bg-amber-100 text-amber-700'
                                  }`}>{b.status}</span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ENROLL TRUCK TAB */}
          {tab === 'enroll' && (
            <div className="space-y-5 max-w-xl">
              <div>
                <h1 className="text-xl sm:text-[22px] font-bold text-[#111827]">Enroll Truck</h1>
                <p className="text-[12px] text-[#6B7280] mt-0.5">Add a new vehicle to your fleet</p>
              </div>

              {enrollSuccess && (
                <div className="p-4 rounded-2xl bg-[#F0FDF4] border border-[#BBF7D0] flex items-center gap-3">
                  <span className="text-[20px]">✅</span>
                  <p className="text-[13px] font-semibold text-[#166534]">Vehicle enrolled successfully!</p>
                </div>
              )}
              {enrollError && (
                <div className="p-4 rounded-2xl bg-[#FEF2F2] border border-[#FECACA]">
                  <p className="text-[13px] font-semibold text-[#991B1B]">{enrollError}</p>
                </div>
              )}

              <div className="bg-white rounded-2xl border border-[#E2E6EB] p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide block mb-1.5">Plate Number *</label>
                    <input value={enrollPlate} onChange={e => setEnrollPlate(e.target.value.toUpperCase())}
                      placeholder="GJ06AB1234"
                      className="w-full h-10 px-3 border border-[#E2E6EB] rounded-xl text-[13px] font-mono bg-[#F9FAFB] focus:outline-none focus:border-[#E10600]" />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide block mb-1.5">Model / Make *</label>
                    <input value={enrollModel} onChange={e => setEnrollModel(e.target.value)}
                      placeholder="Tata Ace, Mahindra Veero..."
                      className="w-full h-10 px-3 border border-[#E2E6EB] rounded-xl text-[13px] bg-[#F9FAFB] focus:outline-none focus:border-[#E10600]" />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide block mb-1.5">Fuel Type</label>
                    <div className="flex gap-2">
                      {(['CNG','EV','Diesel'] as const).map(f => (
                        <button key={f} onClick={() => setEnrollFuelType(f)}
                          className={`flex-1 py-2 rounded-xl text-[12px] font-bold border transition-all ${enrollFuelType === f ? 'bg-[#E10600] text-white border-[#E10600]' : 'bg-[#F9FAFB] text-[#6B7280] border-[#E2E6EB]'}`}
                        >{f}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide block mb-1.5">Capacity (kg)</label>
                    <input value={enrollCapacity} onChange={e => setEnrollCapacity(e.target.value)} type="number"
                      placeholder="e.g. 750"
                      className="w-full h-10 px-3 border border-[#E2E6EB] rounded-xl text-[13px] bg-[#F9FAFB] focus:outline-none focus:border-[#E10600]" />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide block mb-1.5">Initial Odometer (km)</label>
                    <input value={enrollInitOdo} onChange={e => setEnrollInitOdo(e.target.value)} type="number"
                      placeholder="e.g. 12500"
                      className="w-full h-10 px-3 border border-[#E2E6EB] rounded-xl text-[13px] bg-[#F9FAFB] focus:outline-none focus:border-[#E10600]" />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide block mb-1.5">Year of Manufacture</label>
                    <input value={enrollYear} onChange={e => setEnrollYear(e.target.value)} type="number"
                      placeholder="e.g. 2022"
                      className="w-full h-10 px-3 border border-[#E2E6EB] rounded-xl text-[13px] bg-[#F9FAFB] focus:outline-none focus:border-[#E10600]" />
                  </div>
                </div>

                <button onClick={() => {
                  setEnrollError('')
                  const cleanPlate = enrollPlate.trim().toUpperCase()
                  if (!cleanPlate || !enrollModel.trim()) { setEnrollError('Plate number and model are required.'); return }
                  const existing = storage.getVehicles()
                  if (existing.some(v => v.plate === cleanPlate)) { setEnrollError('A vehicle with this plate already exists.'); return }
                  const newVehicle = {
                    id: 'v_' + Date.now(),
                    plate: cleanPlate,
                    model: enrollModel.trim(),
                    fuelType: enrollFuelType,
                    capacity: enrollCapacity ? parseFloat(enrollCapacity) : undefined,
                    initialOdo: enrollInitOdo ? parseInt(enrollInitOdo) : 0,
                    currentOdo: enrollInitOdo ? parseInt(enrollInitOdo) : 0,
                    year: enrollYear ? parseInt(enrollYear) : undefined,
                    ownerId: ownerIdStr,
                    status: 'active',
                    createdAt: new Date().toISOString(),
                  }
                  localStorage.setItem('cng_vehicles', JSON.stringify([...existing, newVehicle]))
                  window.dispatchEvent(new Event('storage'))
                  setEnrollSuccess(true)
                  setEnrollPlate(''); setEnrollModel(''); setEnrollCapacity(''); setEnrollInitOdo(''); setEnrollYear('')
                  setTimeout(() => setEnrollSuccess(false), 3000)
                }}
                  className="w-full py-3 bg-[#E10600] text-white rounded-xl text-[14px] font-bold hover:bg-[#C80500] transition-colors mt-2">
                  Enroll Vehicle
                </button>
              </div>

              {vehicles.length > 0 && (
                <div>
                  <p className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">Your Fleet ({vehicles.length} vehicles)</p>
                  <div className="space-y-2">
                    {vehicles.map(v => (
                      <div key={v.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-[#E2E6EB]">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-[#F5F6F8] flex items-center justify-center text-[16px]">🚛</div>
                          <div>
                            <p className="text-[13px] font-bold text-[#111827] font-mono">{v.plate}</p>
                            <p className="text-[11px] text-[#6B7280]">{v.model}</p>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#F0FDF4] text-[#166534] border border-[#BBF7D0]">Active</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

      {/* Vehicle Detail Modal */}
      {selectedVehicle && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur flex items-center justify-center p-4" onClick={() => setSelectedVehicle(null)}>
          <div className="bg-white rounded-[24px] border border-[#E2E6EB] p-6 w-full max-w-[500px] shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {(() => {
              const v = selectedVehicle
              const vFills = fills.filter(f => String(f.vehicleId) === String(v.id) || f.vehicleId === v.plate)
              const spent = vFills.reduce((s, f) => s + f.total, 0)
              const totalFuel = vFills.reduce((s, f) => s + f.kgs, 0)
              const kmTraveled = (v.currentOdo || 0) - (v.initialOdo || 0)
              const efficiency = totalFuel > 0 ? (kmTraveled / totalFuel).toFixed(1) : '0'
              const avgCost = vFills.length > 0 ? (spent / vFills.length) : 0
              const avgFuel = vFills.length > 0 ? (totalFuel / vFills.length) : 0
              const monthFills = vFills.filter(f => new Date(f.time).getMonth() === new Date().getMonth())
              const monthSpent = monthFills.reduce((s, f) => s + f.total, 0)
              
              // Last 7 fills for mini chart
              const lastFills = vFills.slice(-7)
              const maxFuel = Math.max(...lastFills.map(f => f.kgs), 1)
              
              return (
                <>
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h3 className="text-[20px] font-bold text-[#111827]">{v.plate}</h3>
                      <p className="text-[14px] text-[#6B7280]">{v.model}</p>
                    </div>
                    <button onClick={() => setSelectedVehicle(null)} className="p-2 hover:bg-[#F5F6F8] rounded-lg">
                      <X className="w-5 h-5 text-[#6B7280]" />
                    </button>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <div className="p-3 rounded-xl bg-[#F5F6F8]">
                      <p className="text-[11px] text-[#6B7280]">{t('totalFills', lang)}</p>
                      <p className="text-[20px] font-bold text-[#111827]">{vFills.length}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F5F6F8]">
                      <p className="text-[11px] text-[#6B7280]">{t('totalCost', lang)}</p>
                      <p className="text-[20px] font-bold text-[#991B1B]">₹{spent.toLocaleString()}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F5F6F8]">
                      <p className="text-[11px] text-[#6B7280]">{t('kmTraveled', lang)}</p>
                      <p className="text-[20px] font-bold text-[#1E40AF]">{kmTraveled.toLocaleString()}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F5F6F8]">
                      <p className="text-[11px] text-[#6B7280]">{t('efficiency', lang)}</p>
                      <p className="text-[20px] font-bold text-[#166534]">{efficiency} <span className="text-[12px]">{t('kmKg', lang)}</span></p>
                    </div>
                  </div>

                  {/* Efficiency Analysis */}
                  <div className="p-4 rounded-xl bg-white border border-[#E2E6EB] mb-5">
                    <p className="text-[12px] font-semibold text-[#6B7280] uppercase mb-3">{t('efficiencyAnalysis', lang)}</p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-[12px]">
                        <span className="text-[#6B7280]">{t('avgPerFill', lang)}</span>
                        <span className="font-medium">₹{Math.round(avgCost)} • {avgFuel.toFixed(1)} {t('kgs', lang).toLowerCase()}</span>
                      </div>
                      <div className="flex justify-between text-[12px]">
                        <span className="text-[#6B7280]">{t('costPerKm', lang)}</span>
                        <span className="font-medium">₹{kmTraveled > 0 ? (spent / kmTraveled).toFixed(2) : '0'}</span>
                      </div>
                      <div className="flex justify-between text-[12px]">
                        <span className="text-[#6B7280]">{t('thisMonth', lang)}</span>
                        <span className="font-medium">{monthFills.length} {t('fills', lang).toLowerCase()} • ₹{monthSpent.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-[12px]">
                        <span className="text-[#6B7280]">{t('odoPhoto', lang)}</span>
                        <span className="font-medium">{(v.currentOdo || 0).toLocaleString()} km</span>
                      </div>
                    </div>
                  </div>

                  {/* Recent Fills Mini Chart */}
                  {lastFills.length > 0 && (
                    <div className="mb-5">
                      <p className="text-[12px] font-semibold text-[#6B7280] uppercase mb-3">{t('recentFillsCount', lang).replace('{count}', String(lastFills.length))}</p>
                      <div className="flex items-end gap-1 h-16">
                        {lastFills.map((f, i) => (
                          <div key={f.id} className="flex-1 flex flex-col items-center gap-1">
                            <div className="w-full bg-[#E2E6EB] rounded-t-sm relative" style={{ height: '100%' }}>
                              <div 
                                className="absolute bottom-0 left-0 right-0 rounded-t-sm bg-[#E10600]" 
                                style={{ height: `${(f.kgs / maxFuel) * 100}%` }}
                              />
                            </div>
                            <span className="text-[8px] text-[#6B7280] truncate w-full text-center">{new Date(f.time).getDate()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recent Fills List */}
                  <div>
                    <p className="text-[12px] font-semibold text-[#6B7280] uppercase mb-3">{t('recentFills', lang)}</p>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {vFills.slice(-5).reverse().map(f => {
                        const d = drivers.find(drv => String(drv.id) === String(f.driverId))
                        return (
                          <div key={f.id} className="p-3 rounded-lg bg-[#F5F6F8] text-[11px]">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-[#111827]">₹{f.total}</span>
                              <span className="text-[#6B7280]">{f.kgs} kg</span>
                            </div>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-[#6B7280]">{d?.name || t('unknown', lang)}</span>
                              <span className="text-[#9CA3AF]">{new Date(f.time).toLocaleDateString()}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <button onClick={() => setSelectedVehicle(null)} className="w-full mt-5 h-12 rounded-xl bg-[#E10600] text-white font-medium">
                    Close
                  </button>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* Credit Request Modal */}
      {showCreditRequest && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur flex items-center justify-center p-4" onClick={() => setShowCreditRequest(false)}>
          <div className="bg-white rounded-[24px] border border-[#E2E6EB] p-6 w-full max-w-[400px] shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-[20px] font-bold mb-2 text-[#111827]">{t('requestCreditIncrease', lang)}</h3>
            <p className="text-[14px] text-[#6B7280] mb-5">{t('currentLimit', lang)}: ₹{creditLimit.toLocaleString()}</p>
            <div className="space-y-4">
              <div>
                <label className="text-[12px] text-[#6B7280] mb-1 block">{t('requestedAmount', lang)}</label>
                <input 
                  type="number" 
                  value={creditReqAmount} 
                  onChange={e => setCreditReqAmount(e.target.value)}
                  placeholder="50000"
                  className="w-full h-12 px-4 bg-[#F5F6F8] border border-[#E2E6EB] rounded-xl text-[15px]"
                />
              </div>
              <div>
                <label className="text-[12px] text-[#6B7280] mb-1 block">{t('reason', lang)}</label>
                <textarea 
                  value={creditReqNote} 
                  onChange={e => setCreditReqNote(e.target.value)}
                  placeholder={t('reasonPlaceholder', lang)}
                  className="w-full h-24 px-4 py-3 bg-[#F5F6F8] border border-[#E2E6EB] rounded-xl text-[15px] resize-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowCreditRequest(false)} className="flex-1 h-12 rounded-xl bg-[#F5F6F8] font-medium text-[#6B7280]">{t('cancel', lang)}</button>
                <button 
                  onClick={() => {
                    const amountVal = parseFloat(creditReqAmount)
                    if (isNaN(amountVal) || amountVal <= 0) {
                      alert(t('validAmountError', lang))
                      return
                    }

                    const actionId = 'ca_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
                    const newAction: CreditAction = {
                      id: actionId,
                      ownerId: ownerIdStr,
                      type: 'emergency', // Default type for requests
                      amount: amountVal,
                      timestamp: new Date().toISOString(),
                      notes: sanitizeInput(creditReqNote),
                      status: 'pending',
                      requestedBy: owner?.business || session.name,
                      approvedBy: ''
                    }

                    // Save to local creditActions
                    const currentActions = storage.getCreditActions()
                    storage.saveCreditActions([...currentActions, newAction])

                    // Create notification for admin
                    storage.addNotification({
                      id: 'notif_' + Date.now(),
                      type: 'credit_request',
                      message: `${owner?.business || session.name} requested credit increase of ₹${amountVal.toLocaleString()}`,
                      severity: 'info',
                      timestamp: new Date().toISOString(),
                      read: false
                    })

                    setShowCreditRequest(false)
                    setCreditReqAmount('')
                    setCreditReqNote('')
                    setRefreshKey(k => k + 1) // Refresh local UI



                    alert(t('creditRequestSubmitted', lang))
                  }} 
                  disabled={!creditReqAmount}
                  className="flex-1 h-12 rounded-xl bg-[#E10600] font-medium text-white disabled:opacity-50"
                >
                  Submit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Driver Modal */}
      {/* Lightbox */}
      {lightboxMedia && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur flex items-center justify-center p-4" onClick={() => setLightboxMedia(null)}>
          <div className="relative max-w-full max-h-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setLightboxMedia(null)} className="absolute -top-10 right-0 text-white/70 hover:text-white text-[14px]">
              Close ✕
            </button>
            {lightboxMedia.url.match(/\.(mp4|webm|ogg|mov)$/i) || lightboxMedia.label === 'Video' ? (
              <video src={lightboxMedia.url.replace('uc?id=', 'uc?export=download&id=')} controls autoPlay className="max-w-[90vw] max-h-[85vh] rounded-xl" />
            ) : (
              <img src={lightboxMedia.url} alt={lightboxMedia.label} className="max-w-[90vw] max-h-[85vh] rounded-xl object-contain" />
            )}
          </div>
        </div>
      )}

      {/* Add Driver Modal */}
      {showAddDriver && (
        <AddDriverModal lang={lang} ownerId={session.ownerId} onClose={() => { setShowAddDriver(false); setRefreshKey(k => k + 1) }} />
      )}
      {showAddVehicle && (
        <AddVehicleModal lang={lang} ownerId={session.ownerId} onClose={() => { setShowAddVehicle(false); setRefreshKey(k => k + 1) }} />
      )}
      {editingDriver && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur flex items-center justify-center p-4" onClick={() => setEditingDriver(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-[16px] font-semibold text-[#111827] mb-1">{t('changeDriverCode', lang)}</h3>
            <p className="text-[13px] text-[#6B7280] mb-4">{editingDriver.name}</p>
            <input
              value={editCode}
              onChange={e => setEditCode(e.target.value)}
              placeholder={t('newCode', lang)}
              maxLength={10}
              className="w-full px-4 py-2.5 rounded-xl border border-[#E2E6EB] text-[14px] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600] mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditingDriver(null)} className="px-4 py-2 rounded-xl bg-[#F5F6F8] text-[#6B7280] text-[13px] font-medium">{t('cancel', lang)}</button>
              <button onClick={async () => {
                if (!editCode.trim()) return
                const allDrivers = storage.getDrivers()
                const updated = allDrivers.map(d => d.id === editingDriver.id ? { ...d, code: editCode.trim() } : d)
                storage.saveDrivers(updated)
                await firestoreSync.updateDriver({ id: editingDriver.id, code: editCode.trim() }).catch(console.error)
                setEditingDriver(null)
                setRefreshKey(k => k + 1)
              }} className="px-4 py-2 rounded-xl bg-[#E10600] text-white text-[13px] font-medium">{t('save', lang)}</button>
            </div>
          </div>
        </div>
      )}
      {editingDriverVehicle && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur flex items-center justify-center p-4" onClick={() => setEditingDriverVehicle(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-[16px] font-semibold text-[#111827] mb-1">{t('changeAssignedVehicle', lang)}</h3>
            <p className="text-[13px] text-[#6B7280] mb-4">{editingDriverVehicle.name}</p>
            <select
              value={editVehicleId}
              onChange={e => setEditVehicleId(e.target.value)}
              className="w-full h-[52px] px-4 bg-white border border-[#E2E6EB] rounded-xl text-[15px] focus:border-[#E10600] focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 mb-4"
            >
              <option value="">{t('selectVehicle', lang)}</option>
              {(() => {
                const assignedPlates = drivers
                  .filter(d => String(d.id) !== String(editingDriverVehicle.id) && d.assignedVehicleId)
                  .map(d => d.assignedVehicleId);
                return vehicles
                  .filter(v => !assignedPlates.includes(v.plate))
                  .map(v => <option key={v.id} value={v.plate}>{v.plate}</option>);
              })()}
            </select>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditingDriverVehicle(null)} className="px-4 py-2 rounded-xl bg-[#F5F6F8] text-[#6B7280] text-[13px] font-medium">{t('cancel', lang)}</button>
              <button 
                onClick={async () => {
                  if (!editVehicleId) return
                  const plate = editVehicleId
                  const allDrivers = storage.getDrivers()
                  const updated = allDrivers.map(d => String(d.id) === String(editingDriverVehicle.id) ? { ...d, assignedVehicleId: plate } : d)
                  storage.saveDrivers(updated)
                  await firestoreSync.updateDriver({ id: editingDriverVehicle.id, assignedVehicleId: plate }).catch(console.error)
                  setEditingDriverVehicle(null)
                  setRefreshKey(k => k + 1)
                }} 
                disabled={!editVehicleId}
                className="px-4 py-2 rounded-xl bg-[#E10600] text-white text-[13px] font-medium disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Notifications Modal */}
      {showNotifModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]" onClick={() => setShowNotifModal(false)}>
          <div className="bg-white rounded-[24px] border border-[#E2E6EB] p-6 w-full max-w-[480px] shadow-2xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 border-b border-[#E2E6EB] pb-3">
              <div>
                <h3 className="text-[16px] font-bold text-[#111827]">
                  {localNotifTranslations[lang]?.notifications || 'Notifications'}
                </h3>
                <p className="text-[11px] text-[#6B7280]">
                  {unreadOwnerNotifsCount} unread
                </p>
              </div>
              <div className="flex gap-2">
                {unreadOwnerNotifsCount > 0 && (
                  <button 
                    onClick={() => {
                      const allUnreadIds = ownerNotifications.filter((n: Notification) => !readNotifIds.includes(n.id)).map((n: Notification) => n.id);
                      const updated = [...readNotifIds, ...allUnreadIds];
                      setReadNotifIds(updated);
                      localStorage.setItem('cng_read_notifs_' + String(session.ownerId), JSON.stringify(updated));
                      window.dispatchEvent(new Event('storage'));
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-[#DBEAFE] text-[#1E40AF] text-[10px] font-semibold"
                  >
                    {localNotifTranslations[lang]?.markAllRead || 'Mark all read'}
                  </button>
                )}
                <button onClick={() => setShowNotifModal(false)} className="w-8 h-8 hover:bg-[#F5F6F8] rounded-full flex items-center justify-center text-[#6B7280] font-bold">
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[50vh] pr-1">
              {ownerNotifications.length === 0 ? (
                <div className="py-12 text-center text-[#6B7280] text-[12px]">
                  <span className="text-[20px] block mb-2">🔔</span> {localNotifTranslations[lang]?.noNotifications || 'No notifications'}
                </div>
              ) : (
                ownerNotifications.slice().reverse().map((n: Notification) => {
                  const isRead = readNotifIds.includes(n.id);
                  return (
                    <div 
                      key={n.id} 
                      className={`p-3.5 rounded-xl border text-[11px] transition-all ${
                        isRead ? 'bg-white border-[#E2E6EB]' : 'bg-[#FFFBEB] border-[#FDE68A] shadow-sm'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              n.severity === 'critical' ? 'bg-[#FEE2E2] text-[#991B1B]' : 
                              n.severity === 'warning' ? 'bg-[#FEF3C7] text-[#92400E]' : 
                              'bg-[#DBEAFE] text-[#1E40AF]'
                            }`}>
                              {localNotifTranslations[lang]?.[n.severity] || n.severity}
                            </span>
                            {!isRead && <span className="w-1.5 h-1.5 rounded-full bg-[#E10600]" />}
                          </div>
                          <p className="font-semibold text-[#111827] text-[12px] leading-snug break-words">{n.message}</p>
                          <p className="text-[9px] text-[#6B7280] mt-1.5">
                            {new Date(n.timestamp).toLocaleString()}
                          </p>
                        </div>
                        {!isRead && (
                          <button 
                            onClick={() => {
                              const updated = [...readNotifIds, n.id];
                              setReadNotifIds(updated);
                              localStorage.setItem('cng_read_notifs_' + String(session.ownerId), JSON.stringify(updated));
                              window.dispatchEvent(new Event('storage'));
                            }}
                            className="shrink-0 px-2 py-1 bg-white border border-[#E2E6EB] hover:bg-[#F5F6F8] text-[9px] font-bold text-[#4B5563] rounded-lg transition-colors"
                          >
                            {localNotifTranslations[lang]?.markRead || 'Read'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <button 
              onClick={() => setShowNotifModal(false)}
              className="w-full mt-4 h-11 bg-[#111827] hover:bg-black text-white text-[12px] font-bold rounded-xl transition-colors"
            >
              {localNotifTranslations[lang]?.close || 'Close'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function AddDriverModal({ lang, ownerId, onClose }: { lang: Language; ownerId: string; onClose: () => void }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const vehicles = storage.getVehicles().filter(v => v.ownerId === ownerId)
  const drivers = storage.getDrivers().filter(d => d.ownerId === ownerId)
  const [vehicleId, setVehicleId] = useState('')

  // Filter vehicles that are not assigned to other active drivers
  const assignedPlates = drivers.filter(d => d.assignedVehicleId).map(d => d.assignedVehicleId)
  const availableVehicles = vehicles.filter(v => !assignedPlates.includes(v.plate))

  const handleSave = async () => {
    if (!vehicleId) return
    const plate = vehicleId
    const newDriver = {
      id: 'drv' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name: sanitizeInput(name),
      code,
      assignedVehicleId: plate,
      ownerId,
      status: 'active' as const,
      createdAt: new Date().toISOString(),
    }
    
    const driversList = storage.getDrivers()
    driversList.push(newDriver)
    storage.saveDrivers(driversList)
    await firestoreSync.addDriver(newDriver).catch(console.error)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-[400px] bg-white rounded-[24px] border border-[#E2E6EB] p-6 shadow-xl">
        <h3 className="text-[20px] font-bold mb-5 text-[#111827]">{t('addDriver', lang)}</h3>
        <div className="space-y-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder={t('name', lang)} className="w-full h-12 px-4 bg-[#F5F6F8] border border-[#E2E6EB] rounded-xl outline-none focus:border-[#E10600] text-[15px]" />
          <input value={code} onChange={e => setCode(e.target.value)} placeholder={t('code', lang) + ' (' + (lang === 'hi' ? '4 अंक' : lang === 'gu' ? '4 અંક' : '4 digits') + ')'} maxLength={4} className="w-full h-12 px-4 bg-[#F5F6F8] border border-[#E2E6EB] rounded-xl font-mono outline-none focus:border-[#E10600] text-[15px]" />
          <select value={vehicleId} onChange={e => setVehicleId(e.target.value)} className="w-full h-12 px-4 bg-[#F5F6F8] border border-[#E2E6EB] rounded-xl outline-none focus:border-[#E10600] text-[15px]">
            <option value="">{t('selectVehicle', lang)}</option>
            {availableVehicles.map(v => <option key={v.id} value={v.plate}>{v.plate}</option>)}
          </select>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 h-12 rounded-xl bg-[#F5F6F8] font-medium text-[#6B7280]">{t('cancel', lang)}</button>
          <button onClick={handleSave} disabled={!name || code.length !== 4 || !vehicleId} className="flex-1 h-12 rounded-xl bg-[#E10600] font-medium text-white disabled:opacity-50">{t('save', lang)}</button>
        </div>
      </div>
    </div>
  )
}

function AddVehicleModal({ lang, ownerId, onClose }: { lang: Language; ownerId: string; onClose: () => void }) {
  const [plate, setPlate] = useState('')
  const [model, setModel] = useState('')
  const [odo, setOdo] = useState('')
  const [capacity, setCapacity] = useState('60')
  const [plateError, setPlateError] = useState('')

  const validateIndianPlate = (input: string) => {
    const clean = input.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    return /^[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}$/.test(clean);
  };

  const formatIndianPlate = (input: string) => {
    return input.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  };

  const handlePlateChange = (val: string) => {
    const clean = val.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    setPlate(clean);
    if (clean && !validateIndianPlate(clean)) {
      setPlateError(t('plateFormatError', lang));
    } else {
      setPlateError('');
    }
  }

  const handleSave = async () => {
    const initialOdo = parseInt(odo)
    const capacityNum = parseInt(capacity)
    if (isNaN(initialOdo) || initialOdo < 0 || isNaN(capacityNum) || capacityNum <= 0) {
      alert(t('validOdoCapacityWarning', lang))
      return
    }

    if (!validateIndianPlate(plate)) {
      setPlateError(t('indianPlateWarning', lang));
      return;
    }

    const formattedPlate = formatIndianPlate(plate);

    const newVehicle = {
      id: 'veh' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      plate: formattedPlate,
      model: sanitizeInput(model),
      initialOdo,
      currentOdo: initialOdo,
      capacity: capacityNum,
      ownerId,
      status: 'active' as const,
    }
    
    const vehicles = storage.getVehicles()
    vehicles.push(newVehicle)
    storage.saveVehicles(vehicles)
    await firestoreSync.addVehicle(newVehicle).catch(console.error)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-[400px] bg-white rounded-[24px] border border-[#E2E6EB] p-6 shadow-xl">
        <h3 className="text-[20px] font-bold mb-5 text-[#111827]">{t('addVehicle', lang)}</h3>
        <div className="space-y-3">
          <div>
            <input 
              value={plate} 
              onChange={e => handlePlateChange(e.target.value)} 
              placeholder={t('plate', lang) + ' (' + (lang === 'hi' ? 'जैसे' : lang === 'gu' ? 'દા.ત.' : 'e.g.') + ', KA01AB1234)'} 
              maxLength={10}
              className={`w-full h-12 px-4 bg-[#F5F6F8] border rounded-xl font-mono text-[15px] outline-none transition-all uppercase ${
                plateError ? 'border-red-300 focus:border-red-500 focus:bg-red-50/10' : 'border-[#E2E6EB] focus:border-[#E10600]'
              }`} 
            />
            {plateError && <p className="text-red-500 text-[11px] mt-1 font-medium">{plateError}</p>}
            {!plateError && <p className="text-[#6B7280] text-[10px] mt-1">{t('plateFormatDesc', lang)}</p>}
          </div>
          <input value={model} onChange={e => setModel(e.target.value)} placeholder={t('model', lang)} className="w-full h-12 px-4 bg-[#F5F6F8] border border-[#E2E6EB] rounded-xl outline-none focus:border-[#E10600] text-[15px]" />
          <input value={odo} onChange={e => setOdo(e.target.value)} placeholder={t('initialOdometer', lang)} type="number" className="w-full h-12 px-4 bg-[#F5F6F8] border border-[#E2E6EB] rounded-xl outline-none focus:border-[#E10600] text-[15px]" />
          <input value={capacity} onChange={e => setCapacity(e.target.value)} placeholder={t('capacityKg', lang)} type="number" className="w-full h-12 px-4 bg-[#F5F6F8] border border-[#E2E6EB] rounded-xl outline-none focus:border-[#E10600] text-[15px]" />
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 h-12 rounded-xl bg-[#F5F6F8] font-medium text-[#6B7280]">{t('cancel', lang)}</button>
          <button onClick={handleSave} disabled={!plate || !model || !odo || !capacity || !!plateError} className="flex-1 h-12 rounded-xl bg-[#E10600] font-medium text-white disabled:opacity-50">{t('save', lang)}</button>
        </div>
      </div>
    </div>
  )
}

