import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Fuel, Video, Camera, Receipt, Gauge, 
  MapPin, AlertTriangle, CheckCircle2, 
  Car, Users, BarChart3, Shield, 
  LogOut, Plus, Trash2, X, Play,
  Pause, RotateCcw, Check, Globe
} from 'lucide-react'
import { storage, calculateDistance } from './lib/storage'
import { googleSync, APPS_SCRIPT_URL } from './lib/googleSync'
import { t } from './lib/translations'
import type { Language, Role, Driver, Owner, Vehicle, Fill, Alert, CameraCapture, CreditAction, PaymentEntry } from './lib/types'
import { OwnerRegister } from './components/OwnerRegister'

type View = 'welcome' | 'driver-login' | 'owner-login' | 'owner-register' | 'admin-login' | 'driver-dash' | 'owner-dash' | 'admin-dash' | 'wizard'

// Normalize sheet column names (case-insensitive) to expected JS property keys
function normalizeKeys(obj: any, expectedKeys: Record<string, string>): any {
  if (!obj || typeof obj !== 'object') return obj
  const result: any = {}
  const lowerMap: Record<string, string> = {}
  for (const [expected, actual] of Object.entries(expectedKeys)) {
    lowerMap[actual.toLowerCase().replace(/[\s_-]/g, '')] = expected
  }
  let emptyKeyMapped = false
  for (const key of Object.keys(obj)) {
    const normalized = key.toLowerCase().replace(/[\s_-]/g, '')
    const mapped = lowerMap[normalized]
    if (!mapped && normalized === '' && !emptyKeyMapped && 'id' in expectedKeys) {
      if (obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== '') {
        result['id'] = obj[key]
        emptyKeyMapped = true
      }
    } else if (mapped) {
      // Smart owner ID & credit limit fallback to handle duplicate/shifted columns
      if (mapped === 'id' && 'creditLimit' in expectedKeys) {
        const valStr = String(obj[key]).trim()
        if (valStr.startsWith('own')) {
          result['id'] = obj[key]
        } else {
          // If the 'id' column has a non-owner ID value (like a limit 50000), treat it as creditLimit
          result['creditLimit'] = parseFloat(valStr) || 0
        }
      } else {
        if (mapped === 'id') {
          const valStr = String(obj[key]).trim()
          if (valStr !== '' && valStr !== '0' && valStr !== 'false' && valStr.toLowerCase() !== 'undefined' && valStr.toLowerCase() !== 'null') {
            result['id'] = obj[key]
          }
        } else {
          result[mapped] = obj[key]
        }
      }
    } else {
      result[key] = obj[key]
    }
  }
  return result
}

const VEHICLE_KEYS = { id: 'id', plate: 'plate', model: 'model', initialOdo: 'initialOdo', currentOdo: 'currentOdo', capacity: 'capacity', ownerId: 'ownerId', status: 'status' }
const DRIVER_KEYS = { id: 'id', name: 'name', code: 'code', assignedVehicleId: 'assignedVehicleId', ownerId: 'ownerId', status: 'status', createdAt: 'createdAt' }
const FILL_KEYS = { id: 'id', vehicleId: 'vehicleId', driverId: 'driverId', time: 'time', station: 'station', kgs: 'kgs', rate: 'rate', total: 'total', videoUrl: 'videoUrl', pumpPhotoUrl: 'pumpPhotoUrl', receiptPhotoUrl: 'receiptPhotoUrl', odoPhotoUrl: 'odoPhotoUrl', pumpGPS: 'pumpGPS', receiptGPS: 'receiptGPS', odoGPS: 'odoGPS', odoReading: 'odoReading', distanceDiff: 'distanceDiff', mismatch: 'mismatch', fuelDropPercent: 'fuelDropPercent', ownerId: 'ownerId', verified: 'verified', pendingVehicleApproval: 'pendingVehicleApproval', paid: 'paid', paidAt: 'paidAt', paidAmount: 'paidAmount' }
const OWNER_KEYS = { id: 'id', name: 'name', email: 'email', phone: 'phone', business: 'business', password: 'password', status: 'status', createdAt: 'createdAt', creditLimit: 'creditLimit', creditUsed: 'creditUsed', creditFrozen: 'creditFrozen', adminNotes: 'notes', totalPaid: 'totalPaid', lastPaymentDate: 'lastPaymentDate' }

const sanitizeInput = (val: string): string => {
  if (typeof val !== 'string') return val
  return val.replace(/<[^>]*>/g, '').trim()
}

export default function App() {
  const [view, setView] = useState<View>('welcome')
  const [lang, setLang] = useState<Language>('en')
  const [session, setSession] = useState<any>(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [syncKey, setSyncKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'failed'>('idle')

  const loadDataFromBackend = async () => {
    if (!navigator.onLine) return
    
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get('clear') === 'data') {
      for (const k of ['cng_drivers','cng_vehicles','cng_fills','cng_alerts','cng_owners']) localStorage.removeItem(k)
      window.sessionStorage.removeItem('synced')
      window.location.href = window.location.pathname
      return
    }
    
    setSyncStatus('syncing')
    try {
      const data = await googleSync.fetchAllData()
      
      if (data?.success) {
        console.log('[LoadData] Owners from backend:', data.owners?.map((o: any) => ({ rawId: o.id, rawKeys: Object.keys(o) })))
        // Replace drivers from sheet (complete replacement)
        if (data.drivers?.length > 0) {
          const sheetDrivers = data.drivers.map((d: any) => normalizeKeys(d, DRIVER_KEYS))
          storage.saveDrivers(sheetDrivers)
        }
        // Replace vehicles from sheet (complete replacement)
        if (data.vehicles?.length > 0) {
          const sheetVehicles = data.vehicles.map((v: any) => normalizeKeys(v, VEHICLE_KEYS))
          storage.saveVehicles(sheetVehicles)
        }
        if (data.fills?.length > 0) {
          const parseGPS = (v: any): {lat: number; lng: number} | null => {
            if (!v) return null
            if (typeof v === 'object' && 'lat' in v && 'lng' in v) return v
            if (typeof v === 'string') {
              const parts = v.split(',').map(Number)
              if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return {lat: parts[0], lng: parts[1]}
            }
            return null
          }
          // Replace fills from sheet (prevent duplicates)
          console.log('[LoadData] Raw fills sample:', data.fills?.slice(0, 2).map((f: any) => ({ rawId: f.id, rawOwnerId: f.ownerId })))
          const cleanFills = data.fills.map((f: any) => {
            const nf = normalizeKeys(f, FILL_KEYS)
            // Keep original ID from sheet, don't regenerate
            const id = nf.id || 'fill_' + Date.now() + '_' + Math.random().toString(36).slice(2,8)
            return {
              ...nf, id,
              videoUrl: nf.videoUrl && typeof nf.videoUrl === 'string' && !nf.videoUrl.startsWith('data:') ? nf.videoUrl : '',
              pumpPhotoUrl: nf.pumpPhotoUrl && typeof nf.pumpPhotoUrl === 'string' && !nf.pumpPhotoUrl.startsWith('data:') ? nf.pumpPhotoUrl : '',
              receiptPhotoUrl: nf.receiptPhotoUrl && typeof nf.receiptPhotoUrl === 'string' && !nf.receiptPhotoUrl.startsWith('data:') ? nf.receiptPhotoUrl : '',
              odoPhotoUrl: nf.odoPhotoUrl && typeof nf.odoPhotoUrl === 'string' && !nf.odoPhotoUrl.startsWith('data:') ? nf.odoPhotoUrl : '',
              pumpGPS: parseGPS(nf.pumpGPS),
              receiptGPS: parseGPS(nf.receiptGPS),
              odoGPS: parseGPS(nf.odoGPS),
              pendingVehicleApproval: nf.pendingVehicleApproval === true || nf.pendingVehicleApproval === 'true' || nf.pendingVehicleApproval === 'TRUE',
            }
          })
          // Merge fills from sheet (prevent overwriting local-only unsynced/offline fills)
          const localFills = storage.getFills()
          const backendIds = new Set(cleanFills.map((f: any) => f.id))
          const unsyncedFills = localFills.filter((f: any) => !backendIds.has(f.id))
          storage.saveFills([...cleanFills, ...unsyncedFills])
        }
        // Replace owners from sheet (complete replacement)
        if (data.owners?.length > 0) {
          const sheetOwners = data.owners
            .filter((o: any) => o.id && String(o.id).trim() !== '')
            .map((o: any) => normalizeKeys(o, OWNER_KEYS))
          storage.saveOwners(sheetOwners)
        }
        // Load payment entries from backend (Phase 1) - prevent duplicates
        if (data.paymentEntries?.length > 0) {
          const localPayments = storage.getPaymentEntries()
          const sheetPayments = data.paymentEntries.map((p: any) => ({
            id: p.id || 'pay_' + Date.now(),
            ownerId: p.ownerId,
            amount: parseFloat(p.amount) || 0,
            type: p.type || 'payment',
            timestamp: p.createdAt || p.date || new Date().toISOString(),
            adminName: 'Admin',
            note: p.notes || p.note || ''
          }))
          
          // Replace payment entries (complete replacement)
          storage.savePaymentEntries(sheetPayments)
        }
        // Load alerts from backend
        if (data.alerts?.length > 0) {
          const sheetAlerts = data.alerts.map((a: any) => ({
            id: a.id || 'alert_' + Date.now(),
            time: a.time || new Date().toISOString(),
            event: a.event || 'Alert',
            user: a.user || '',
            type: a.type || 'other',
            ownerId: a.ownerId,
            resolved: a.resolved === true || a.resolved === 'true' || a.resolved === 'TRUE' || a.resolved === 1
          }))
          storage.saveAlerts(sheetAlerts)
        }
        // Load credit actions from backend
        if (data.creditActions?.length > 0) {
          const sheetCreditActions = data.creditActions.map((ca: any) => ({
            id: ca.id || 'ca_' + Date.now(),
            ownerId: ca.ownerId,
            type: ca.type === 'issue' ? 'issued' : ca.type || 'issued',
            amount: parseFloat(ca.amount) || 0,
            timestamp: ca.createdAt || ca.timestamp || new Date().toISOString(),
            notes: ca.reason || ca.notes || '',
            status: ca.status || 'approved',
            requestedBy: ca.requestedBy || '',
            approvedBy: ca.approvedBy || ''
          }))
          storage.saveCreditActions(sheetCreditActions)
        }
        window.sessionStorage.setItem('synced', 'true')
        setSyncStatus('synced')
        setSyncKey(k => k + 1)
      } else {
        setSyncStatus('failed')
      }
    } catch (e) {
      setSyncStatus('failed')
    }
  }

  useEffect(() => {
    // Check if we are resuming an active tab session (survives F5 refresh)
    const sessionToken = window.sessionStorage.getItem('session_token')
    if (sessionToken === 'active') {
      const savedSession = storage.getSession()
      if (savedSession) {
        setSession(savedSession)
        if (savedSession.role === 'driver') setView('driver-dash')
        else if (savedSession.role === 'owner') setView('owner-dash')
        else if (savedSession.role === 'admin') setView('admin-dash')
      }
    } else {
      // Clear localStorage session on new tab/clean start for security
      storage.clearSession()
    }
    window.sessionStorage.setItem('session_token', 'active')

    const savedLang = storage.getLanguage() as Language
    setLang(savedLang)

    loadDataFromBackend()

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Sync offline queue when online
    if (navigator.onLine) {
      const queue = storage.getOfflineQueue()
      if (queue.length > 0) {
        const fills = storage.getFills()
        storage.saveFills([...fills, ...queue])
        Promise.all(queue.map(f => googleSync.saveFill(f).catch(() => false))).then(results => {
          if (results.every(Boolean)) storage.clearOfflineQueue()
        })
      }
    }

    setLoading(false)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const changeLang = (l: Language) => {
    setLang(l)
    storage.setLanguage(l)
  }

  const logout = () => {
    storage.clearSession()
    setSession(null)
    setView('welcome')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F6F8] flex items-center justify-center">
        <div className="text-center">
          <img src="logo.jpg" alt="Techinnovate" className="h-12 mx-auto mb-3" />
          <p className="text-[13px] text-[#6B7280]">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F6F8] text-[#111827] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100">
        <div className={`mx-auto px-4 h-14 flex items-center justify-between ${view === 'admin-dash' || view === 'owner-dash' ? 'max-w-full px-6' : 'max-w-[480px]'}`}>
          <img src="logo.jpg" alt="Techinnovate" className="h-8" />
          
          <div className="flex items-center gap-2">
            {syncStatus === 'syncing' && (
              <div className="px-2.5 py-1 rounded-full bg-[#DBEAFE] border border-[#93C5FD]">
                <span className="text-[10px] font-semibold text-[#1E40AF]">SYNCING</span>
              </div>
            )}
            {syncStatus === 'failed' && (
              <div className="px-2.5 py-1 rounded-full bg-[#FEE2E2] border border-[#FCA5A5]">
                <span className="text-[10px] font-semibold text-[#991B1B]">SYNC FAILED</span>
              </div>
            )}
            {!isOnline && (
              <div className="px-2.5 py-1 rounded-full bg-[#FEF3C7] border border-[#FCD34D]">
                <span className="text-[10px] font-semibold text-[#92400E]">OFFLINE</span>
              </div>
            )}
            <div className="flex bg-[#F5F6F8] rounded-lg p-0.5 border border-[#E2E6EB]">
              {(['en', 'hi', 'gu'] as Language[]).map(l => (
                <button
                  key={l}
                  onClick={() => changeLang(l)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                    lang === l ? 'bg-white text-[#111827] shadow-sm' : 'text-[#6B7280] hover:text-[#111827]'
                  }`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            {session && (
              <button onClick={logout} className="p-2 hover:bg-[#F5F6F8] rounded-lg transition-colors">
                <LogOut className="w-4 h-4 text-[#6B7280]" />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className={`flex-1 w-full mx-auto ${view === 'admin-dash' || view === 'owner-dash' ? '' : 'max-w-[480px]'}`}>
        <AnimatePresence mode="wait">
          {view === 'welcome' && <WelcomeView lang={lang} setView={setView} />}
          {view === 'driver-login' && (
            <DriverLogin 
              lang={lang} 
              setView={setView} 
              setSession={(s) => {
                setSession(s)
                loadDataFromBackend()
              }} 
            />
          )}
          {view === 'owner-login' && (
            <OwnerLogin 
              lang={lang} 
              setView={setView} 
              setSession={(s) => {
                setSession(s)
                loadDataFromBackend()
              }} 
            />
          )}
          {view === 'owner-register' && (
            <OwnerRegister 
              lang={lang} 
              setView={setView} 
              setSession={(s) => {
                setSession(s)
                loadDataFromBackend()
              }} 
            />
          )}
          {view === 'admin-login' && (
            <AdminLogin 
              lang={lang} 
              setView={setView} 
              setSession={(s) => {
                setSession(s)
                loadDataFromBackend()
              }} 
            />
          )}
          {view === 'driver-dash' && session && <DriverDashboard lang={lang} session={session} setView={setView} syncKey={syncKey} key={'dd'+syncKey} />}
          {view === 'wizard' && session && <FillWizard lang={lang} session={session} setView={setView} syncKey={syncKey} key={'fw'+syncKey} />}
          {view === 'owner-dash' && session && <OwnerDashboard lang={lang} session={session} syncKey={syncKey} key={'od'+syncKey} loadData={loadDataFromBackend} />}
          {view === 'admin-dash' && <AdminDashboard lang={lang} syncKey={syncKey} syncStatus={syncStatus} loadData={loadDataFromBackend} />}
        </AnimatePresence>
      </main>
    </div>
  )
}

function WelcomeView({ lang, setView }: { lang: Language; setView: (v: View) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="p-6 pt-8 flex flex-col min-h-[calc(100vh-3.5rem)]"
    >
      <div className="text-center mb-10">
        <img src="logo.jpg" alt="Techinnovate" className="w-48 mx-auto mb-6" />
        <p className="text-[#6B7280] text-[15px]">Fleet CNG Monitoring System</p>
      </div>

      <div className="space-y-3">
        <span className="block text-[13px] font-medium text-[#6B7280] tracking-wide uppercase text-center">
          {lang === 'hi' ? 'ड्राइवर लॉगिन' : lang === 'gu' ? 'ડ્રાઇવર લૉગિન' : 'Driver Login'}
        </span>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setView('driver-login')}
          className="w-full"
        >
          <div className="flex items-center gap-4 p-6 rounded-2xl bg-[#E10600] text-white shadow-lg shadow-[#E10600]/25 transition-all hover:brightness-110">
            <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center">
              <Gauge className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 text-left">
              <div className="font-bold text-[19px]">{lang === 'hi' ? 'ड्राइवर' : lang === 'gu' ? 'ડ્રાઇવર' : 'Driver'}</div>
              <div className="text-[13px] text-white/80">Record fuel fills</div>
            </div>
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
          </div>
        </motion.button>
      </div>

      <div className="flex-1" />

      <div className="text-center pb-4">
        <button onClick={() => setView('owner-login')} className="text-[#9CA3AF] hover:text-[#6B7280] text-[11px] transition-colors">
          {lang === 'hi' ? 'मालिक लॉगिन' : lang === 'gu' ? 'માલિક લૉગિન' : 'Owner Login'}
        </button>
        <span className="text-[#D1D5DB] mx-1.5 text-[10px]">|</span>
        <button onClick={() => setView('admin-login')} className="text-[#9CA3AF] hover:text-[#6B7280] text-[11px] transition-colors">
          {lang === 'hi' ? 'एडमिन लॉगिन' : lang === 'gu' ? 'એડમિન લૉગિન' : 'Admin Login'}
        </button>
      </div>
    </motion.div>
  )
}

function DriverLogin({ lang, setView, setSession }: { lang: Language; setView: (v: View) => void; setSession: (s: any) => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  const handleLogin = () => {
    const drivers = storage.getDrivers()
    console.log('Login attempt, code:', code, 'drivers:', drivers)
    const driver = drivers.find(d => String(d.code) === String(code))
    
    if (driver) {
      const session = { role: 'driver' as Role, userId: driver.id, ownerId: driver.ownerId, name: driver.name }
      storage.setSession(session)
      setSession(session)
      setView('driver-dash')
    } else {
      setError('Invalid code')
      setTimeout(() => setError(''), 2000)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-6 pt-12">
      <button onClick={() => setView('welcome')} className="mb-8 text-[#6B7280] hover:text-[#111827]">← Back</button>
      
      <div className="text-center mb-10">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#10B981] flex items-center justify-center shadow-lg shadow-[#10B981]/20">
          <Gauge className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-[24px] font-bold mb-1 text-[#111827]">{t('driver', lang)} {t('login', lang)}</h2>
        <p className="text-[#6B7280] text-[14px]">{t('enterCode', lang)}</p>
      </div>

      <div className="space-y-4">
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="••••"
            className="w-full h-[64px] bg-white border-2 border-[#E2E6EB] rounded-2xl text-center text-[32px] font-mono tracking-[0.5em] text-[#111827] placeholder-[#9CA3AF] focus:border-[#10B981] focus:outline-none transition-all"
            autoFocus
          />
        </div>
        
        {error && (
          <motion.p initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-[#DC2626] text-[13px] text-center">
            {error}
          </motion.p>
        )}

        <button
          onClick={handleLogin}
          disabled={code.length !== 4}
          className="w-full h-[56px] bg-[#10B981] disabled:bg-[#E2E6EB] disabled:text-[#9CA3AF] text-white font-semibold rounded-2xl text-[17px] transition-all hover:bg-[#059669] active:scale-[0.98]"
        >
          {t('login', lang)}
        </button>
      </div>
    </motion.div>
  )
}

function OwnerLogin({ lang, setView, setSession }: { lang: Language; setView: (v: View) => void; setSession: (s: any) => void }) {
  // BUG-041 FIX: Removed pre-filled demo credentials ('owner@demo.com' / 'demo123')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    const cleanEmail = sanitizeInput(email)
    const cleanPassword = sanitizeInput(password)
    console.log('[OwnerLogin] Attempting login with email:', cleanEmail)
    
    setLoading(true)
    setError('')
    try {
      const res = await googleSync.loginOwner(cleanEmail, cleanPassword)
      if (res.success && res.owner) {
        const owner = res.owner
        const session = { role: 'owner' as Role, userId: owner.id, ownerId: owner.id, name: owner.name }
        console.log('[OwnerLogin] Backend login success:', session)
        
        // Cache owner details locally but blank out password
        const owners = storage.getOwners().filter(o => o.id !== owner.id)
        storage.saveOwners([...owners, { ...owner, password: '' }])
        
        storage.setSession(session)
        setSession(session)
        setView('owner-dash')
      } else {
        // Fallback for offline validation using cached local data
        const owners = storage.getOwners()
        const validOwners = owners.filter(o => o.id && o.id !== '')
        const cachedOwner = validOwners.find(o => o.email === cleanEmail && o.password === cleanPassword)
        if (cachedOwner) {
          const session = { role: 'owner' as Role, userId: cachedOwner.id, ownerId: cachedOwner.id, name: cachedOwner.name }
          storage.setSession(session)
          setSession(session)
          setView('owner-dash')
        } else {
          setError(res.error || 'Invalid credentials')
        }
      }
    } catch (e: any) {
      // Offline fallback
      const owners = storage.getOwners()
      const validOwners = owners.filter(o => o.id && o.id !== '')
      const cachedOwner = validOwners.find(o => o.email === cleanEmail && o.password === cleanPassword)
      if (cachedOwner) {
        const session = { role: 'owner' as Role, userId: cachedOwner.id, ownerId: cachedOwner.id, name: cachedOwner.name }
        storage.setSession(session)
        setSession(session)
        setView('owner-dash')
      } else {
        setError('Login failed: ' + e.toString())
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-6 pt-12">
      <button onClick={() => setView('welcome')} className="mb-8 text-[#6B7280] hover:text-[#111827]">← Back</button>
      
      <div className="text-center mb-10">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#3B82F6] flex items-center justify-center shadow-lg shadow-[#3B82F6]/20">
          <BarChart3 className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-[24px] font-bold text-[#111827]">{t('owner', lang)} {t('login', lang)}</h2>
      </div>

      <div className="space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full h-[52px] px-4 bg-white border border-[#E2E6EB] rounded-xl text-[15px] focus:border-[#3B82F6] focus:outline-none"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full h-[52px] px-4 bg-white border border-[#E2E6EB] rounded-xl text-[15px] focus:border-[#3B82F6] focus:outline-none"
        />
        {error && <p className="text-[#DC2626] text-[13px]">{error}</p>}
        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full h-[52px] bg-[#3B82F6] text-white font-semibold rounded-xl mt-2 hover:bg-[#2563EB] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Signing In...
            </>
          ) : (
            t('login', lang)
          )}
        </button>
        
        <div className="mt-6 pt-6 border-t border-[#E2E6EB] text-center">
          <p className="text-[14px] text-[#6B7280]">
            Don't have an account?{' '}
            <button onClick={() => setView('owner-register')} className="text-[#3B82F6] hover:text-[#2563EB] font-medium">
              Register
            </button>
          </p>
        </div>
      </div>
    </motion.div>
  )
}

function AdminLogin({ lang, setView, setSession }: { lang: Language; setView: (v: View) => void; setSession: (s: any) => void }) {
  // BUG-001/042 FIX: Removed pre-filled admin credentials.
  // Admin password check remains server-side verifiable via Google Apps Script.
  // For production: replace the hardcoded check below with a backend auth call.
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  // Admin credentials should be configured in Google Apps Script, not hardcoded here.
  // For now, we read from localStorage so admin can be set without redeploying frontend.
  const handleLogin = () => {
    const cleanEmail = sanitizeInput(email)
    const cleanPassword = sanitizeInput(password)
    const storedAdminEmail = localStorage.getItem('cng_admin_email') || 'admin@cng.com'
    const storedAdminPass = localStorage.getItem('cng_admin_pass') || 'admin123'
    if (cleanEmail === storedAdminEmail && cleanPassword === storedAdminPass) {
      const session = { role: 'admin' as Role, userId: 'admin1', name: 'Admin' }
      storage.setSession(session)
      setSession(session)
      setView('admin-dash')
    } else {
      setError('Invalid admin credentials')
    }
  }

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-6 pt-12">
      <button onClick={() => setView('welcome')} className="mb-8 text-[#6B7280] hover:text-[#111827]">← Back</button>
      
      <div className="text-center mb-10">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#8B5CF6] flex items-center justify-center shadow-lg shadow-[#8B5CF6]/20">
          <Shield className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-[24px] font-bold text-[#111827]">{t('admin', lang)} {t('login', lang)}</h2>
      </div>

      <div className="space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full h-[52px] px-4 bg-white border border-[#E2E6EB] rounded-xl text-[15px] focus:border-[#8B5CF6] focus:outline-none"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full h-[52px] px-4 bg-white border border-[#E2E6EB] rounded-xl text-[15px] focus:border-[#8B5CF6] focus:outline-none"
        />
        {error && <p className="text-[12px] text-[#991B1B] text-center">{error}</p>}
        <button
          onClick={handleLogin}
          className="w-full h-[52px] bg-[#8B5CF6] text-white font-semibold rounded-xl mt-2 hover:bg-[#7C3AED] active:scale-[0.98] transition-all"
        >
          {t('login', lang)}
        </button>
      </div>
    </motion.div>
  )
}

function DriverDashboard({ lang, session, setView, syncKey }: { lang: Language; session: any; setView: (v: View) => void; syncKey?: number }) {
  const drivers = storage.getDrivers()
  const driver = drivers.find(d => String(d.id) === String(session.userId))
  const vehicles = storage.getVehicles()
  // BUG-012 FIX: Vehicle lookup checks plate first (default), then internal ID
  // driver.assignedVehicleId may store a plate OR an internal ID depending on how driver was added
  const vehicle = driver?.assignedVehicleId
    ? vehicles.find(v => v.plate === driver.assignedVehicleId || String(v.id) === String(driver.assignedVehicleId))
    : null
  const fills = storage.getFills().filter(f => f.driverId === session.userId)

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-5">
      <div className="mb-6">
        <p className="text-[#6B7280] text-[13px] mb-1">{t('welcome', lang)},</p>
        <h1 className="text-[28px] font-bold tracking-tight text-[#111827]">{session.name}</h1>
      </div>

      {vehicle && (
        <div className="mb-6 p-5 rounded-[20px] bg-white border border-[#E2E6EB] shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-[11px] text-[#6B7280] uppercase tracking-wider mb-1">Assigned Vehicle</p>
              <p className="text-[20px] font-bold font-mono text-[#111827]">{vehicle.plate}</p>
              <p className="text-[14px] text-[#6B7280]">{vehicle.model}</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-[#FDE8E8] flex items-center justify-center">
              <Car className="w-5 h-5 text-[#E10600]" />
            </div>
          </div>
          <div className="flex items-center gap-4 pt-3 border-t border-[#E2E6EB]">
            <div>
              <p className="text-[11px] text-[#6B7280]">Odometer</p>
              <p className="text-[15px] font-medium text-[#111827]">{vehicle.currentOdo.toLocaleString()} km</p>
            </div>
            <div>
              <p className="text-[11px] text-[#6B7280]">Capacity</p>
              <p className="text-[15px] font-medium text-[#111827]">{vehicle.capacity} kg</p>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setView('wizard')}
        className="w-full mb-6"
      >
        <div className="bg-[#E10600] rounded-[20px] shadow-lg shadow-[#E10600]/25 hover:shadow-xl hover:shadow-[#E10600]/30 transition-all p-4 flex items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <Fuel className="w-5 h-5 text-white" />
          </div>
          <span className="text-[18px] font-bold text-white">{t('startFill', lang)}</span>
        </div>
      </button>

      <div>
        <h3 className="text-[13px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">Recent Fills</h3>
        <div className="space-y-2.5">
          {fills.slice(0, 5).map(fill => {
            const v = vehicles.find(veh => veh.plate === fill.vehicleId || String(veh.id) === String(fill.vehicleId))
            return (
              <div key={fill.id} className="p-4 rounded-2xl bg-white border border-[#E2E6EB]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono text-[14px] font-medium text-[#111827]">{v?.plate}</p>
                    <p className="text-[12px] text-[#6B7280] mt-0.5">
                      {new Date(fill.time).toLocaleDateString()} • {fill.kgs} kg
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[16px] font-semibold text-[#111827]">₹{fill.total.toFixed(0)}</p>
                    <div className="flex flex-col items-end gap-1 mt-1">
                      {fill.pendingVehicleApproval && (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#FEF3C7] text-[#92400E]">
                          <AlertTriangle className="w-3 h-3" /> Pending Approval
                        </div>
                      )}
                      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        fill.verified ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#F5F6F8] text-[#6B7280]'
                      }`}>
                        {fill.verified ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                        {fill.verified ? t('verified', lang) : t('pending', lang)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          {fills.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-[#9CA3AF] text-[14px]">No fills yet</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// Camera Component - Critical
function CameraModal({ 
  mode, 
  title, 
  onCapture, 
  onClose,
  lang
}: { 
  mode: 'photo' | 'video'
  title: string
  onCapture: (capture: CameraCapture) => void
  onClose: () => void
  lang: Language
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [gps, setGps] = useState<{lat: number; lng: number} | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const capturedBlobRef = useRef<Blob | null>(null)
  // BUG-009 FIX: Use a ref for stream so cleanup always has the current stream
  const streamRef = useRef<MediaStream | null>(null)
  const [isBlobReady, setIsBlobReady] = useState(false)  // BUG-010 FIX

  useEffect(() => {
    startCamera()
    getLocation()
    return () => {
      // BUG-009 FIX: cleanup uses ref — always gets the current stream
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  const getLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { enableHighAccuracy: true, timeout: 5000 }
      )
    }
  }

  const startCamera = async () => {
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: mode === 'video'
      }
      
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints)
      // BUG-009 FIX: store in both state and ref
      streamRef.current = mediaStream
      setStream(mediaStream)
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
        await videoRef.current.play()
      }
    } catch (err: any) {
      setError(err.name === 'NotAllowedError' ? 'Camera permission denied' : 'Camera not available. Use HTTPS.')
    }
  }

  useEffect(() => {
    let interval: any
    if (isRecording) {
      interval = setInterval(() => setRecordingTime(t => t + 1), 1000)
    }
    return () => clearInterval(interval)
  }, [isRecording])

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return
    
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(video, 0, 0)
    
    // Get data URL first
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    setPreview(dataUrl)
    setIsBlobReady(false)  // BUG-010 FIX: mark as not ready until blob callback fires
    
    // Then get blob and store in ref
    canvas.toBlob((blob) => {
      if (blob) {
        capturedBlobRef.current = blob
        setIsBlobReady(true)  // BUG-010 FIX: now safe to confirm
        streamRef.current?.getTracks().forEach(t => t.stop())
      }
    }, 'image/jpeg', 0.85)
  }

  const startRecording = () => {
    if (!stream) return
    
    chunksRef.current = []
    // BUG-008 FIX: Detect supported MIME type for Safari/iOS compatibility
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/mp4')
      ? 'video/mp4'
      : MediaRecorder.isTypeSupported('video/webm')
      ? 'video/webm'
      : ''
    const recorderOptions = mimeType ? { mimeType } : {}
    const recorder = new MediaRecorder(stream, recorderOptions)
    const actualMime = mimeType || 'video/mp4'
    mediaRecorderRef.current = recorder
    
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: actualMime })
      const url = URL.createObjectURL(blob)
      setPreview(url)
      setIsBlobReady(true)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
    
    recorder.start()
    setIsRecording(true)
    setRecordingTime(0)
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
  }

  const handleConfirm = () => {
    if (!preview) return
    
    if (mode === 'photo') {
      const blob = capturedBlobRef.current
      if (blob) {
        onCapture({ blob, dataUrl: preview, timestamp: Date.now(), gps: gps || undefined })
      } else {
        // BUG-010 FIX: Show user-visible error instead of silent console.error
        alert('Photo is still processing. Please wait a moment and try again.')
      }
    } else {
      // For video, create blob from chunks
      const mimeType = chunksRef.current[0]?.type || 'video/mp4'
      const blob = new Blob(chunksRef.current, { type: mimeType })
      onCapture({ blob, dataUrl: preview, timestamp: Date.now(), gps: gps || undefined })
    }
  }

  const handleRetry = () => {
    // BUG-034 FIX: Stop previous stream before restarting camera
    streamRef.current?.getTracks().forEach(t => t.stop())
    setPreview(null)
    setRecordingTime(0)
    setIsBlobReady(false)
    capturedBlobRef.current = null
    chunksRef.current = []
    startCamera()
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <h2 className="text-white font-medium">{title}</h2>
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Camera View */}
      <div className="relative w-full h-full">
        {!preview ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />
            
            {error && (
              <div className="absolute inset-0 flex items-center justify-center p-6 bg-black/90">
                <div className="text-center">
                  <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                  <p className="text-white mb-2">{error}</p>
                  <p className="text-[#6B7280] text-sm">Please allow camera access and use HTTPS</p>
                </div>
              </div>
            )}

            {isRecording && (
              <div className="absolute top-20 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-red-500">
                <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                <span className="text-white font-mono text-sm">{recordingTime}s</span>
              </div>
            )}

            {/* Capture Button */}
            <div className="absolute bottom-0 left-0 right-0 p-8 pb-12 bg-gradient-to-t from-black/80 to-transparent">
              <div className="flex items-center justify-center">
                {mode === 'photo' ? (
                  <button
                    onClick={capturePhoto}
                    disabled={!!error}
                    className="w-[72px] h-[72px] rounded-full bg-white p-1.5 active:scale-95 transition-transform disabled:opacity-50"
                  >
                    <div className="w-full h-full rounded-full border-[3px] border-black" />
                  </button>
                ) : (
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={!!error || (isRecording && recordingTime < 10)}
                    className={`w-[72px] h-[72px] rounded-full active:scale-95 transition-all disabled:opacity-50 ${
                      isRecording ? 'bg-red-500 p-2' : 'bg-white p-1.5'
                    }`}
                  >
                    <div className={`w-full h-full ${isRecording ? 'bg-white rounded-md' : 'bg-red-500 rounded-full border-[3px] border-white'}`} />
                  </button>
                )}
              </div>
              {mode === 'video' && !isRecording && (
                <p className="text-center text-[#6B7280] text-[13px] mt-4">Hold for minimum 10 seconds</p>
              )}
            </div>
          </>
        ) : (
          /* Preview */
          <div className="w-full h-full flex flex-col bg-black">
            <div className="flex-1 relative flex items-center justify-center p-4">
              {mode === 'photo' ? (
                <img src={preview} alt="Preview" className="max-w-full max-h-full object-contain rounded-xl" />
              ) : (
                <video src={preview} controls autoPlay className="max-w-full max-h-full rounded-xl" />
              )}
            </div>
            
            <div className="p-6 pb-10 flex gap-3">
              <button
                onClick={handleRetry}
                className="flex-1 h-[52px] rounded-2xl bg-white/10 backdrop-blur text-white font-medium flex items-center justify-center gap-2 hover:bg-white/20 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                {t('retry', lang)}
              </button>
              <button
                onClick={handleConfirm}
                // BUG-010 FIX: disable OK until photo blob is ready (async canvas.toBlob)
                disabled={mode === 'photo' && !isBlobReady}
                className="flex-1 h-[52px] rounded-2xl bg-[#EE2726] text-white font-semibold flex items-center justify-center gap-2 hover:bg-[#d41f1f] transition-colors disabled:opacity-60"
              >
                <Check className="w-5 h-5" />
                {t('ok', lang)}
              </button>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

function FillWizard({ lang, session, setView, syncKey }: { lang: Language; session: any; setView: (v: View) => void; syncKey?: number }) {
  const [step, setStep] = useState(1)
  const [showCamera, setShowCamera] = useState<'video' | 'pump' | 'receipt' | 'odo' | null>(null)
  const [captures, setCaptures] = useState<Record<string, CameraCapture>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showVehicleWarning, setShowVehicleWarning] = useState(false)
  const [pendingVehicleSelection, setPendingVehicleSelection] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const vehicles = storage.getVehicles().filter(v => String(v.ownerId) === String(session.ownerId))
  const drivers = storage.getDrivers()
  const driver = drivers.find(d => String(d.id) === String(session.userId))
  // assignedVehicleId may store a plate OR an ID - find the vehicle and get its plate
  const assignedVehicle = driver?.assignedVehicleId 
    ? vehicles.find(v => String(v.plate) === String(driver.assignedVehicleId) || String(v.id) === String(driver.assignedVehicleId)) 
    : null
  const assignedPlate = assignedVehicle?.plate?.trim() || ''
  const defaultVeh = assignedVehicle || null

  console.log('[FillWizard] vehicles:', vehicles.map(v => ({ id: v.id, plate: v.plate })))
  console.log('[FillWizard] driver:', driver)
  console.log('[FillWizard] assignedPlate:', assignedPlate)
  console.log('[FillWizard] defaultVeh:', defaultVeh)
  console.log('[FillWizard] session.userId:', session.userId)

  const [form, setForm] = useState({
    vehicleId: defaultVeh ? String(defaultVeh.plate) : '', // Use plate, not ID
    station: 'VGL',
    kgs: '',
    rate: '',
    odoReading: '',
  })

  const handleCapture = (type: string, capture: CameraCapture) => {
    setCaptures(prev => ({ ...prev, [type]: capture }))
    setShowCamera(null)
    if (step < 5) setStep(step + 1)
  }

  const total = parseFloat(form.kgs) * parseFloat(form.rate) || 0

  const handleSubmit = () => {
    if (isSubmitting) return
    if (!form.kgs || !form.rate || !form.odoReading) {
      alert('Please fill in KGs, Rate, and Odometer reading before submitting.')
      return
    }
    const kgsNum = parseFloat(form.kgs)
    const rateNum = parseFloat(form.rate)
    const odoNum = parseInt(form.odoReading)
    if (isNaN(kgsNum) || kgsNum <= 0 || isNaN(rateNum) || rateNum <= 0 || isNaN(odoNum)) {
      alert('Please enter valid KGs, Rate, and Odometer values.')
      return
    }

    // BUG-003 FIX: Intercept driver fill submits in the wizard to enforce credit limits and frozen accounts
    const owners = storage.getOwners()
    const owner = owners.find(o => String(o.id) === String(session.ownerId))
    if (owner) {
      const isFrozen = owner.creditFrozen === true || String(owner.creditFrozen).toLowerCase() === 'true'
      if (isFrozen) {
        alert('Submission failed: Credit is frozen. Please contact administrator.')
        return
      }

      // Calculate total spent for this owner (using ownerId directly)
      const allFills = storage.getFills()
      const ownerFills = allFills.filter(f => String(f.ownerId) === String(session.ownerId))
      const totalSpent = ownerFills.reduce((sum, f) => sum + f.total, 0)
      const creditLimit = owner.creditLimit || 0
      const totalPaid = owner.totalPaid || 0
      const creditUsed = totalSpent - totalPaid
      
      const newFillCost = total
      if (creditUsed + newFillCost > creditLimit) {
        alert(`Submission failed: Fill cost would exceed your credit limit. Remaining credit: ₹${(creditLimit - creditUsed).toFixed(2)}.`)
        return
      }
    }

    const vehicle = vehicles.find(v => String(v.plate) === String(form.vehicleId) || String(v.id) === String(form.vehicleId))
    if (!vehicle) { 
      setIsSubmitting(false)
      alert('Please select a vehicle. Available: ' + vehicles.map(v => v.plate).join(', '))
      return 
    }

    // BUG-019 FIX: Prevent odometer going backwards (tampering/data entry error)
    if (odoNum < vehicle.currentOdo) {
      alert(`Odometer reading (${odoNum} km) cannot be less than current reading (${vehicle.currentOdo} km). Please check the value.`)
      return
    }

    setIsSubmitting(true)

    const selPlate = vehicle.plate?.trim() || ''
    const isDifferentVehicle = assignedPlate !== '' && selPlate !== '' && assignedPlate !== selPlate

    // Get admin settings for fraud thresholds
    const adminSettings = storage.getSettings()
    const locationMismatchDist = adminSettings.locationMismatchDist || 500
    const fuelDropThreshold = adminSettings.fuelDropThreshold || 20

    let distanceDiff = 0
    let mismatch = false
    // BUG-008 FIX: Treat missing GPS coordinates as location mismatch fraud (setting mismatch = true and distanceDiff = -1)
    if (captures.pump?.gps && captures.receipt?.gps) {
      distanceDiff = calculateDistance(
        captures.pump.gps.lat, captures.pump.gps.lng,
        captures.receipt.gps.lat, captures.receipt.gps.lng
      )
      mismatch = distanceDiff > locationMismatchDist
    } else {
      mismatch = true
      distanceDiff = -1
    }

    // BUG-026 FIX: Compare against actual last fill KGs, not arbitrary 80% of capacity
    const allFillsForVehicle = storage.getFills().filter(f => f.vehicleId === vehicle.plate || f.vehicleId === vehicle.id)
    const lastFill = allFillsForVehicle.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0]
    let fuelDropPercent = 0
    if (lastFill && lastFill.kgs > 0) {
      fuelDropPercent = ((lastFill.kgs - kgsNum) / lastFill.kgs) * 100
    }

    const fillId = 'fill' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
    const fillDate = new Date().toISOString().split('T')[0]
    const folderName = `${vehicle.plate}_${fillDate}`
    const timestamp = Date.now()

    // Save fill to localStorage (instant)
    // BUG-013 FIX: always store plate in vehicleId for consistency (user instruction: vehicle = plate)
    const fill: Fill = {
      id: fillId,
      vehicleId: vehicle.plate, // Always use plate as vehicle identifier
      driverId: session.userId,
      time: new Date().toISOString(),
      station: form.station || 'Unknown',
      kgs: kgsNum,
      rate: rateNum,
      total,
      videoUrl: '', pumpPhotoUrl: '', receiptPhotoUrl: '', odoPhotoUrl: '',
      pumpGPS: captures.pump?.gps || null,
      receiptGPS: captures.receipt?.gps || null,
      odoGPS: captures.odo?.gps || null,
      odoReading: parseInt(form.odoReading),
      distanceDiff, mismatch, fuelDropPercent,
      ownerId: session.ownerId,
      verified: false,
      pendingVehicleApproval: isDifferentVehicle,
    }
    const pendingApproval = fill.pendingVehicleApproval
    console.log('[Submit] fill created:', { id: fill.id, vehicleId: fill.vehicleId, plate: vehicle.plate, pendingApproval })

    const existingFills = storage.getFills()
    storage.saveFills([...existingFills, fill])

    // Redirect instantly (driver must see dash immediately)
    setView('driver-dash')
    setIsSubmitting(false)

    // --- Background: upload media, update fill URLs, sync to Sheets, create alerts ---
    // Alerts and sheet sync run in a separate try/catch from media upload so upload failures
    // cannot prevent alerts from being saved.
    const runBackground = async () => {
      let videoUrl = '', pumpUrl = '', receiptUrl = '', odoUrl = ''
      try {
        const uploads = [
          captures.video && googleSync.uploadMedia(captures.video.blob, `video_${timestamp}.webm`, folderName).then(url => { videoUrl = url }).catch(() => {}),
          captures.pump && googleSync.uploadMedia(captures.pump.blob, `pump_${timestamp}.jpg`, folderName).then(url => { pumpUrl = url }).catch(() => {}),
          captures.receipt && googleSync.uploadMedia(captures.receipt.blob, `receipt_${timestamp}.jpg`, folderName).then(url => { receiptUrl = url }).catch(() => {}),
          captures.odo && googleSync.uploadMedia(captures.odo.blob, `odo_${timestamp}.jpg`, folderName).then(url => { odoUrl = url }).catch(() => {}),
        ].filter(Boolean) as Promise<void>[]
        if (uploads.length > 0) await Promise.all(uploads)
      } catch (e) {
        console.error('Media upload error:', e)
      }

      // Always sync + create alerts, regardless of upload success
      try {
        const updatedFill = { ...fill, videoUrl, pumpPhotoUrl: pumpUrl, receiptPhotoUrl: receiptUrl, odoPhotoUrl: odoUrl }
        const allFills = storage.getFills().map(f => f.id === fillId ? updatedFill : f)
        storage.saveFills(allFills)

        // Sheet sync — Always sync, including vehicle-override fills (pending approval)
        const sheetPayload = {
          action: 'addFill',
          id: updatedFill.id,
          vehicleId: vehicle.plate,
          driverId: updatedFill.driverId,
          time: updatedFill.time,
          station: updatedFill.station,
          kgs: updatedFill.kgs,
          rate: updatedFill.rate,
          total: updatedFill.total,
          videoUrl: updatedFill.videoUrl,
          pumpPhotoUrl: updatedFill.pumpPhotoUrl,
          receiptPhotoUrl: updatedFill.receiptPhotoUrl,
          odoPhotoUrl: updatedFill.odoPhotoUrl,
          pumpGPS: updatedFill.pumpGPS ? `${updatedFill.pumpGPS.lat},${updatedFill.pumpGPS.lng}` : '',
          receiptGPS: updatedFill.receiptGPS ? `${updatedFill.receiptGPS.lat},${updatedFill.receiptGPS.lng}` : '',
          odoGPS: updatedFill.odoGPS ? `${updatedFill.odoGPS.lat},${updatedFill.odoGPS.lng}` : '',
          odoReading: updatedFill.odoReading,
          distanceDiff: updatedFill.distanceDiff,
          mismatch: updatedFill.mismatch,
          fuelDropPercent: updatedFill.fuelDropPercent,
          ownerId: updatedFill.ownerId,
          verified: updatedFill.verified,
          pendingVehicleApproval: pendingApproval,
        }
        console.log('[SheetSync] SYNCING to sheets:', sheetPayload.vehicleId, 'pendingApproval:', pendingApproval)
        fetch(APPS_SCRIPT_URL, {
          method: 'POST',
          mode: 'cors',
          redirect: 'follow',
          headers: {'Content-Type': 'text/plain;charset=utf-8'},
          body: JSON.stringify(sheetPayload),
        })
        .then(async (r) => {
          const t = await r.text()
          console.log('[SheetSync] response:', t.substring(0, 100))
          try {
            const res = JSON.parse(t)
            if (!res.success) {
              console.warn('[SheetSync] Backend reported failure, adding to offline queue:', res.error)
              storage.addToOfflineQueue(updatedFill)
            }
          } catch (e) {
            console.error('[SheetSync] Failed to parse backend response')
          }
        })
        .catch(e => {
          console.error('[SheetSync] Network/CORS error, queueing offline:', e)
          storage.addToOfflineQueue(updatedFill)
        })

        // Alerts — always created regardless of upload/sync outcome
        const alertsList = storage.getAlerts()
        if (mismatch) {
          // BUG-008 FIX: Update alerts payload event text to print "GPS coordinates missing" if distanceDiff === -1
          const eventText = distanceDiff === -1
            ? 'GPS coordinates missing'
            : `Location mismatch: ${Math.round(distanceDiff)}m (threshold: ${locationMismatchDist}m)`
          alertsList.push({ id: 'alert_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), time: new Date().toISOString(), event: eventText, user: session.name, type: 'location_mismatch', ownerId: session.ownerId, resolved: false })
        }
        // BUG-029 FIX: use admin fuelDropThreshold setting instead of hardcoded 20
        if (fuelDropPercent > fuelDropThreshold) {
          alertsList.push({ id: 'alert_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), time: new Date().toISOString(), event: `Fuel drop ${fuelDropPercent.toFixed(1)}% vs last fill (threshold: ${fuelDropThreshold}%)`, user: session.name, type: 'fuel_drop', ownerId: session.ownerId, resolved: false })
        }
        if (pendingApproval) {
          alertsList.push({ id: 'alert_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), time: new Date().toISOString(), event: `Vehicle override: ${driver?.name || session.name} used ${vehicle.plate} instead of assigned vehicle (${assignedPlate})`, user: session.name, type: 'vehicle_override', ownerId: session.ownerId, resolved: false })
        }
        if (mismatch || fuelDropPercent > fuelDropThreshold || pendingApproval) {
          storage.saveAlerts(alertsList)
        }

        // Update vehicle odo
        const allVehicles = storage.getVehicles()
        storage.saveVehicles(allVehicles.map(v => String(v.plate) === String(form.vehicleId) || String(v.id) === String(form.vehicleId) ? { ...v, currentOdo: parseInt(form.odoReading) } : v))
        googleSync.updateOdometer(String(vehicle.id), parseInt(form.odoReading)).catch(() => {})
      } catch (e) {
        console.error('Background sync error:', e)
      }
    }
    setTimeout(runBackground, 0)
  }

  const steps = [
    { id: 1, title: t('recordVideo', lang), icon: Video, key: 'video', done: !!captures.video },
    { id: 2, title: t('pumpPhoto', lang), icon: Camera, key: 'pump', done: !!captures.pump },
    { id: 3, title: t('receiptPhoto', lang), icon: Receipt, key: 'receipt', done: !!captures.receipt },
    { id: 4, title: t('manualDetails', lang), icon: Fuel, key: 'details', done: !!form.kgs && !!form.vehicleId },
    { id: 5, title: t('odometerPhoto', lang), icon: Gauge, key: 'odo', done: !!captures.odo },
  ]

  return (
    <>
      <div className="min-h-screen bg-[#F5F6F8] p-5">
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => setView('driver-dash')} className="text-[#6B7280] hover:text-[#111827]">← Cancel</button>
          <div className="text-center">
            <p className="text-[12px] text-[#6B7280]">Step {step} of 5</p>
            <div className="flex gap-1 mt-1.5">
              {steps.map(s => (
                <div key={s.id} className={`h-1 w-8 rounded-full transition-all ${s.id <= step ? 'bg-[#E10600]' : 'bg-[#E2E6EB]'}`} />
              ))}
            </div>
          </div>
          <div className="w-12" />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            {step === 1 && (
              <div className="text-center py-8">
                <div className="w-20 h-20 mx-auto mb-6 rounded-[24px] bg-[#FDE8E8] border border-[#FECACA] flex items-center justify-center">
                  <Video className="w-10 h-10 text-[#E10600]" />
                </div>
                <h2 className="text-[24px] font-bold mb-2 text-[#111827]">{t('recordVideo', lang)}</h2>
                <p className="text-[#6B7280] mb-8 px-6">Record the complete CNG filling process. Minimum 10 seconds required.</p>
                <button
                  onClick={() => setShowCamera('video')}
                  className="w-full max-w-[280px] h-[56px] bg-[#E10600] rounded-2xl font-semibold flex items-center justify-center gap-2 mx-auto"
                >
                  <Play className="w-5 h-5" />
                  Start Recording
                </button>
                {captures.video && (
                  <div className="mt-6 p-4 rounded-2xl bg-[#DCFCE7] border border-[#BBF7D0]">
                    <CheckCircle2 className="w-5 h-5 text-[#166534] mx-auto mb-1" />
                    <p className="text-[13px] text-[#166534]">Video captured</p>
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="text-center py-8">
                <div className="w-20 h-20 mx-auto mb-6 rounded-[24px] bg-[#DBEAFE] border border-[#BFDBFE] flex items-center justify-center">
                  <Camera className="w-10 h-10 text-[#3B82F6]" />
                </div>
                <h2 className="text-[24px] font-bold mb-2 text-[#111827]">{t('pumpPhoto', lang)}</h2>
                <p className="text-[#6B7280] mb-8 px-6">Capture the pump meter showing KGs and price clearly.</p>
                <button
                  onClick={() => setShowCamera('pump')}
                  className="w-full max-w-[280px] h-[56px] bg-[#3B82F6] rounded-2xl font-semibold flex items-center justify-center gap-2 mx-auto"
                >
                  <Camera className="w-5 h-5" />
                  Take Photo
                </button>
                {captures.pump && (
                  <div className="mt-4">
                    <img src={captures.pump.dataUrl} alt="Pump" className="w-full max-w-[300px] mx-auto rounded-xl" />
                    {captures.pump.gps && (
                      <p className="text-[11px] text-[#6B7280] mt-2 flex items-center justify-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {captures.pump.gps.lat.toFixed(4)}, {captures.pump.gps.lng.toFixed(4)}
                        <a href={`https://www.google.com/maps/dir/?api=1&destination=${captures.pump.gps.lat},${captures.pump.gps.lng}`} target="_blank" rel="noopener noreferrer" className="text-[#E10600] hover:underline ml-1">View</a>
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="text-center py-8">
                <div className="w-20 h-20 mx-auto mb-6 rounded-[24px] bg-[#FEF3C7] border border-[#FDE68A] flex items-center justify-center">
                  <Receipt className="w-10 h-10 text-[#92400E]" />
                </div>
                <h2 className="text-[24px] font-bold mb-2 text-[#111827]">{t('receiptPhoto', lang)}</h2>
                <p className="text-[#6B7280] mb-8 px-6">Take clear photo of the payment receipt.</p>
                <button
                  onClick={() => setShowCamera('receipt')}
                  className="w-full max-w-[280px] h-[56px] bg-[#F59E0B] rounded-2xl font-semibold text-white flex items-center justify-center gap-2 mx-auto"
                >
                  <Receipt className="w-5 h-5" />
                  Take Photo
                </button>
                {captures.receipt && (
                  <div className="mt-4">
                    <img src={captures.receipt.dataUrl} alt="Receipt" className="w-full max-w-[300px] mx-auto rounded-xl" />
                    {captures.receipt.gps && (
                      <p className="text-[11px] text-[#6B7280] mt-2 flex items-center justify-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {captures.receipt.gps.lat.toFixed(4)}, {captures.receipt.gps.lng.toFixed(4)}
                        <a href={`https://www.google.com/maps/dir/?api=1&destination=${captures.receipt.gps.lat},${captures.receipt.gps.lng}`} target="_blank" rel="noopener noreferrer" className="text-[#E10600] hover:underline ml-1">View</a>
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {step === 4 && (
              <div className="py-4">
                <h2 className="text-[24px] font-bold mb-6 text-center text-[#111827]">{t('manualDetails', lang)}</h2>
                <div className="space-y-4">
                  <div>
                    <label className="text-[12px] text-[#6B7280] uppercase tracking-wider mb-1.5 block">{t('vehicle', lang)}</label>
                    <select
                      value={form.vehicleId}
                       onChange={e => {
                        const val = e.target.value // This is now the plate
                        const selPlate = val?.trim() || ''
                        console.log('[VehicleSelect] selected:', selPlate, 'assigned:', assignedPlate, 'match:', selPlate === assignedPlate)
                        if (assignedPlate && selPlate && selPlate !== assignedPlate) {
                          console.log('[VehicleSelect] MISMATCH - showing warning')
                          setPendingVehicleSelection(val)
                          setShowVehicleWarning(true)
                        } else {
                          console.log('[VehicleSelect] OK - setting form value')
                          setForm(f => ({...f, vehicleId: val}))
                        }
                      }}
                      className="w-full h-[52px] px-4 bg-white border border-[#E2E6EB] rounded-xl text-[15px] focus:border-[#3B82F6] focus:outline-none"
                    >
                       <option value="">Select vehicle</option>
                      {vehicles.map(v => <option key={v.id} value={String(v.plate)}>{v.plate}</option>)}
                    </select>
                    {driver?.assignedVehicleId && form.vehicleId && (() => { const sv = vehicles.find(v => String(v.plate) === String(form.vehicleId)); return sv && sv.plate !== assignedPlate })() && (
                      <p className="text-[11px] text-[#E10600] mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Not your assigned vehicle — owner approval required
                      </p>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[12px] text-[#6B7280] uppercase tracking-wider mb-1.5 block">{t('station', lang)}</label>
                      <select
                        value={['VGL', 'Adani', 'Gujarat Gas', 'Other'].includes(form.station) ? form.station : 'Other'}
                        onChange={e => {
                          const val = e.target.value
                          if (val === 'Other') setForm(f => ({...f, station: ''}))
                          else setForm(f => ({...f, station: val}))
                        }}
                        className="w-full h-[52px] px-4 bg-white border border-[#E2E6EB] rounded-xl text-[15px] focus:border-[#3B82F6] focus:outline-none"
                      >
                        {['VGL', 'Adani', 'Gujarat Gas', 'Other'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      {!['VGL', 'Adani', 'Gujarat Gas'].includes(form.station) && (
                        <input
                          value={form.station}
                          onChange={e => setForm(f => ({...f, station: e.target.value}))}
                          placeholder="Enter station name"
                          className="w-full h-[52px] px-4 mt-2 bg-white border border-[#E2E6EB] rounded-xl text-[15px] focus:border-[#3B82F6] focus:outline-none"
                        />
                      )}
                    </div>
                    <div>
                      <label className="text-[12px] text-[#6B7280] uppercase tracking-wider mb-1.5 block">{t('kgs', lang)}</label>
                      <input
                        type="number"
                        value={form.kgs}
                        onChange={e => setForm(f => ({...f, kgs: e.target.value}))}
                        placeholder="0.0"
                        className="w-full h-[52px] px-4 bg-white border border-[#E2E6EB] rounded-xl text-[20px] font-mono text-center focus:border-[#3B82F6] focus:outline-none"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[12px] text-[#6B7280] uppercase tracking-wider mb-1.5 block">{t('rate', lang)}</label>
                      <input
                        type="number"
                        value={form.rate}
                        onChange={e => setForm(f => ({...f, rate: e.target.value}))}
                        placeholder="0.0"
                        className="w-full h-[52px] px-4 bg-white border border-[#E2E6EB] rounded-xl text-[20px] font-mono text-center focus:border-[#3B82F6] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[12px] text-[#6B7280] uppercase tracking-wider mb-1.5 block">{t('odo', lang)}</label>
                      <input
                        type="number"
                        value={form.odoReading}
                        onChange={e => setForm(f => ({...f, odoReading: e.target.value}))}
                        placeholder="0"
                        className="w-full h-[52px] px-4 bg-white border border-[#E2E6EB] rounded-xl text-[20px] font-mono text-center focus:border-[#3B82F6] focus:outline-none"
                      />
                    </div>
                  </div>
                  
                  <div className="mt-6 p-5 rounded-2xl bg-white border border-[#E2E6EB]">
                    <div className="flex items-center justify-between">
                      <span className="text-[15px] text-[#6B7280]">Total Amount</span>
                      <span className="text-[28px] font-bold text-[#111827]">₹{total.toFixed(2)}</span>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => setStep(5)}
                    disabled={!form.kgs || !form.rate || !form.vehicleId}
                    className="w-full h-[56px] bg-[#3B82F6] text-white font-semibold rounded-2xl mt-4 disabled:opacity-50"
                  >
                    Continue to Odometer
                  </button>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="text-center py-8">
                <div className="w-20 h-20 mx-auto mb-6 rounded-[24px] bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                  <Gauge className="w-10 h-10 text-violet-400" />
                </div>
                <h2 className="text-[24px] font-bold mb-2">{t('odometerPhoto', lang)}</h2>
                <p className="text-[#6B7280] mb-6 px-6">Capture odometer reading clearly.</p>
                
                <div className="max-w-[280px] mx-auto mb-4">
                  <input
                    type="number"
                    value={form.odoReading}
                    onChange={(e) => setForm({ ...form, odoReading: e.target.value })}
                    placeholder="Enter KM reading"
                    className="w-full h-[52px] px-4 bg-white/5 border border-white/10 rounded-xl text-center text-[18px] font-mono focus:border-violet-500 focus:outline-none"
                  />
                </div>

                <button
                  onClick={() => setShowCamera('odo')}
                  className="w-full max-w-[280px] h-[52px] bg-violet-500 rounded-2xl font-semibold flex items-center justify-center gap-2 mx-auto mb-3"
                >
                  <Camera className="w-5 h-5" />
                  Take Photo
                </button>
                
                {captures.odo && (
                  <div className="mt-4">
                    <img src={captures.odo.dataUrl} alt="Odo" className="w-full max-w-[300px] mx-auto rounded-xl" />
                    {captures.odo.gps && (
                      <p className="text-[11px] text-[#6B7280] mt-2 flex items-center justify-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {captures.odo.gps.lat.toFixed(4)}, {captures.odo.gps.lng.toFixed(4)}
                        <a href={`https://www.google.com/maps/dir/?api=1&destination=${captures.odo.gps.lat},${captures.odo.gps.lng}`} target="_blank" rel="noopener noreferrer" className="text-[#E10600] hover:underline ml-1">View</a>
                      </p>
                    )}
                  </div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={!captures.odo || !form.odoReading || !form.rate || isSubmitting}
                  className="w-full max-w-[280px] h-[56px] bg-[#10B981] disabled:bg-[#E2E6EB] disabled:text-[#9CA3AF] rounded-2xl font-bold text-[17px] mt-8 mx-auto flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <><RotateCcw className="w-4 h-4 animate-spin" /> Saving...</>
                  ) : (
                    <><CheckCircle2 className="w-5 h-5" /> {t('submit', lang)}</>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Step indicators */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
          {steps.map(s => (
            <div key={s.id} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
              s.done ? 'bg-emerald-500' : s.id === step ? 'bg-white/20' : 'bg-white/5'
            }`}>
              {s.done ? <Check className="w-4 h-4 text-black" /> : <s.icon className="w-4 h-4 text-white/60" />}
            </div>
          ))}
        </div>
      </div>

      {showCamera && (
        <CameraModal
          mode={showCamera === 'video' ? 'video' : 'photo'}
          title={steps.find(s => s.key === showCamera)?.title || ''}
          onCapture={(cap) => handleCapture(showCamera, cap)}
          onClose={() => setShowCamera(null)}
          lang={lang}
        />
      )}

      {showVehicleWarning && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowVehicleWarning(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="w-14 h-14 rounded-full bg-[#FEF3C7] flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-[#92400E]" />
            </div>
            <h3 className="text-[18px] font-bold text-center text-[#111827] mb-2">Vehicle Mismatch Warning</h3>
            <p className="text-[14px] text-center text-[#6B7280] mb-4">
              You are selecting a vehicle that is <strong className="text-[#E10600]">NOT assigned to you</strong>.
            </p>
            <div className="bg-[#FEF3C7] border border-[#FDE68A] rounded-xl p-3 mb-4">
              <p className="text-[13px] text-[#92400E] text-center">
                This fill will require <strong>owner approval</strong> before it is recorded in the system. The owner will be notified.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowVehicleWarning(false); setPendingVehicleSelection('') }}
                className="flex-1 h-[48px] rounded-xl bg-[#F5F6F8] text-[#6B7280] font-medium text-[14px]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setForm(f => ({...f, vehicleId: pendingVehicleSelection}))
                  setShowVehicleWarning(false)
                  setPendingVehicleSelection('')
                }}
                className="flex-1 h-[48px] rounded-xl bg-[#E10600] text-white font-medium text-[14px]"
              >
                Continue Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function OwnerDashboard({ lang, session, syncKey, loadData }: { lang: Language; session: any; syncKey: number; loadData?: () => Promise<void> }) {
  const [tab, setTab] = useState<'dashboard' | 'fills' | 'vehicles' | 'drivers' | 'payments' | 'alerts' | 'media' | 'reports'>('dashboard')
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
  
  // Media tab filters
  const [mediaFilterDriver, setMediaFilterDriver] = useState<string>('all')
  const [mediaFilterVehicle, setMediaFilterVehicle] = useState<string>('all')
  const [mediaFilterVerified, setMediaFilterVerified] = useState<'all' | 'verified' | 'pending'>('all')

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
  const driverIds = drivers.map(d => String(d.id))
  const allFills = storage.getFills()
  console.log('[OwnerDashboard] All fills:', allFills.length)
  console.log('[OwnerDashboard] Sample fills:', allFills.slice(0, 3).map(f => ({ id: f.id, vehicleId: f.vehicleId, driverId: f.driverId })))
  const fills = allFills.filter(f => String(f.ownerId) === ownerIdStr || vehicleIds.includes(String(f.vehicleId)) || driverIds.includes(String(f.driverId)))
  console.log('[OwnerDashboard] Fills for owner:', fills.length, 'by', vehicleIds.length, 'vehicles and', driverIds.length, 'drivers')
  
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

  const nav = [
    { key: 'dashboard', label: 'Dashboard', icon: '📊' },
    { key: 'fills', label: 'Fills', icon: '⛽' },
    { key: 'reports', label: 'Reports', icon: '📋' },
    { key: 'vehicles', label: 'Vehicles', icon: '🚛' },
    { key: 'drivers', label: 'Drivers', icon: '👷' },
    { key: 'media', label: 'Media', icon: '📷' },
    { key: 'payments', label: 'Payments', icon: '💳' },
    { key: 'alerts', label: 'Alerts', icon: '🔔' },
  ]

  const KPI = (label: string, value: string, sub?: string, color?: string) => (
    <div className="p-3 sm:p-4 rounded-xl bg-white border border-[#E2E6EB]">
      <p className={`text-lg sm:text-xl font-bold ${color || 'text-[#111827]'}`}>{value}</p>
      <p className="text-[11px] text-[#6B7280] mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-[#9CA3AF] mt-0.5">{sub}</p>}
    </div>
  )

  const MiniBar = ({ data }: { data: { label: string; value: number; color: string }[] }) => {
    if (!data || data.length === 0) return <div className="h-16 flex items-center justify-center text-[11px] text-[#9CA3AF]">No data</div>
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
            <h3>Fleet Owner</h3>
            <p>${owner?.business || owner?.name || 'N/A'}</p>
          </div>
          <div class="meta-block">
            <h3>Date Range</h3>
            <p>${filterInfo.range}</p>
          </div>
          <div class="meta-block">
            <h3>Vehicle Filter</h3>
            <p>${filterInfo.vehicle}</p>
          </div>
          <div class="meta-block">
            <h3>Driver Filter</h3>
            <p>${filterInfo.driver}</p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>Vehicle</th>
              <th>Driver</th>
              <th>Station</th>
              <th style="text-align: right;">KGs</th>
              <th style="text-align: right;">Rate</th>
              <th style="text-align: right;">Total</th>
              <th style="text-align: center;">Verified</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr class="summary-row">
              <td colspan="4">TOTALS</td>
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
    <div className="min-h-screen bg-[#F5F6F8]">
      {/* Mobile nav */}
      <div className="flex sm:hidden gap-1 p-3 bg-white border-b border-[#E2E6EB] overflow-x-auto">
        {nav.map(item => (
          <button key={item.key} onClick={() => setTab(item.key as any)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-medium ${tab === item.key ? 'bg-[#E10600] text-white' : 'bg-[#F5F6F8] text-[#6B7280]'}`}
          >{item.icon} {item.label}</button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row">
        {/* Desktop sidebar */}
        <div className="hidden sm:flex sm:flex-col w-[200px] shrink-0 bg-white border-r border-[#E2E6EB] p-3 gap-0.5">
          <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider px-3 pb-3 pt-2">Owner Panel</p>
          <p className="px-3 pb-2 text-[12px] font-medium text-[#111827] truncate">{owner?.business || session.name}</p>
          {nav.map(item => (
            <button key={item.key} onClick={() => setTab(item.key as any)}
              className={`w-full text-left px-3 py-2 rounded-lg text-[12px] font-medium flex items-center gap-2 ${tab === item.key ? 'bg-[#FDE8E8] text-[#E10600]' : 'text-[#6B7280] hover:bg-[#F5F6F8]'}`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
          <div className="mt-auto pt-4 border-t border-[#E2E6EB]">
            <button onClick={async () => { setRefreshKey(k => k + 1); if (typeof loadData === 'function') await loadData(); }} className="w-full text-left px-3 py-2 rounded-lg text-[12px] text-[#6B7280] hover:bg-[#F5F6F8] flex items-center gap-2">
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

          {/* DASHBOARD TAB */}
          {tab === 'dashboard' && (
            <>
              <h1 className="text-xl sm:text-[22px] font-bold mb-4 text-[#111827]">Dashboard</h1>
              
              {/* Credit Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-5">
                {KPI('Credit Limit', `₹${(creditLimit/1000).toFixed(1)}k`)}
                {KPI('Credit Used', `₹${(creditUsed/1000).toFixed(1)}k`, undefined, creditUsed > creditLimit * 0.8 ? 'text-[#991B1B]' : 'text-[#1E40AF]')}
                {KPI('Remaining', `₹${(creditRemaining/1000).toFixed(1)}k`, undefined, creditRemaining < creditLimit * 0.2 ? 'text-[#991B1B]' : 'text-[#166534]')}
                {KPI('Total Paid', `₹${(totalPaid/1000).toFixed(1)}k`)}
                {KPI('Outstanding', `₹${(outstanding/1000).toFixed(1)}k`, undefined, outstanding > 0 ? 'text-[#991B1B]' : 'text-[#166534]')}
                {KPI("Today's Fuel", `₹${(todaySpent/1000).toFixed(1)}k`)}
                {KPI('Total Fills', String(fills.length))}
                {KPI('Pending Verify', String(pendingVerifications.length), undefined, pendingVerifications.length > 0 ? 'text-[#92400E]' : undefined)}
              </div>

              {/* Request Credit Button */}
              <div className="mb-5">
                <button onClick={() => setShowCreditRequest(true)} disabled={creditFrozen}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg bg-[#E10600] text-white text-[12px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creditFrozen ? 'Credit Frozen' : 'Request Credit Increase'}
                </button>
                {lastPaymentDate && (
                  <p className="text-[11px] text-[#6B7280] mt-2">Last payment: {new Date(lastPaymentDate).toLocaleDateString()}</p>
                )}
              </div>

              {/* 7-Day Trend */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                  <p className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">Fuel Spending (7 days)</p>
                  <MiniBar data={last7Days.map((d, i) => ({ 
                    label: new Date(d).toLocaleDateString('en', { weekday: 'short' }), 
                    value: dailySpent[i], 
                    color: '#E10600' 
                  }))} />
                </div>
                <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                  <p className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">Quick Stats</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#6B7280]">Vehicles</span>
                      <span className="font-medium text-[#111827]">{vehicles.length}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#6B7280]">Drivers</span>
                      <span className="font-medium text-[#111827]">{drivers.length}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#6B7280]">Credit Utilization</span>
                      <span className={`font-medium ${creditLimit > 0 ? (creditUsed / creditLimit > 0.8 ? 'text-[#991B1B]' : 'text-[#166534]') : 'text-[#111827]'}`}>
                        {creditLimit > 0 ? Math.round((creditUsed / creditLimit) * 100) : 0}%
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#6B7280]">Risk Score</span>
                      <span className={`font-medium ${riskScore === 'red' ? 'text-[#991B1B]' : riskScore === 'yellow' ? 'text-[#92400E]' : 'text-[#166534]'}`}>
                        {riskScore === 'red' ? 'High' : riskScore === 'yellow' ? 'Medium' : 'Low'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Monthly Summary */}
              <div className="mb-5">
                <h3 className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">📅 Monthly Summary</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  <div className="p-4 rounded-xl bg-white border border-[#E2E6EB] text-center">
                    <p className="text-[11px] text-[#6B7280] mb-1">Total Fills</p>
                    <p className="text-[22px] font-bold text-[#111827]">{monthFillsCount}</p>
                    <p className="text-[9px] text-[#9CA3AF]">this month</p>
                  </div>
                  <div className="p-4 rounded-xl bg-white border border-[#E2E6EB] text-center">
                    <p className="text-[11px] text-[#6B7280] mb-1">Total Spent</p>
                    <p className="text-[18px] font-bold text-[#991B1B]">₹{(monthSpent/1000).toFixed(1)}k</p>
                    <p className="text-[9px] text-[#9CA3AF]">this month</p>
                  </div>
                  <div className="p-4 rounded-xl bg-white border border-[#E2E6EB] text-center">
                    <p className="text-[11px] text-[#6B7280] mb-1">Avg per Fill</p>
                    <p className="text-[18px] font-bold text-[#1E40AF]">₹{Math.round(avgFillCost)}</p>
                    <p className="text-[9px] text-[#9CA3AF]">lifetime avg</p>
                  </div>
                  <div className="p-4 rounded-xl bg-white border border-[#E2E6EB] text-center">
                    <p className="text-[11px] text-[#6B7280] mb-1">Avg Daily</p>
                    <p className="text-[18px] font-bold text-[#166534]">₹{Math.round(avgDailySpent)}</p>
                    <p className="text-[9px] text-[#9CA3AF]">per day</p>
                  </div>
                </div>
              </div>

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
                    <h3 className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">Top Performing Drivers</h3>
                    <div className="grid grid-cols-3 gap-2">
                      {topDrivers.map((d, i) => (
                        <div key={d.id} className="p-3 rounded-xl bg-white border border-[#E2E6EB] text-center">
                          <div className={`w-8 h-8 mx-auto mb-2 rounded-full flex items-center justify-center text-[11px] font-bold ${i === 0 ? 'bg-[#FCD34D] text-[#92400E]' : i === 1 ? 'bg-[#E2E8F0] text-[#475569]' : 'bg-[#FECACA] text-[#991B1B]'}`}>
                            {i + 1}
                          </div>
                          <p className="text-[12px] font-medium text-[#111827] truncate">{d.name}</p>
                          <p className="text-[10px] text-[#6B7280]">{d.fills} fills</p>
                          <p className="text-[11px] font-bold text-[#166534]">₹{d.totalCost.toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* Recent Activity */}
              <div>
                <h3 className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">Recent Fills</h3>
                <div className="space-y-1.5">
                  {fills.slice(-5).reverse().map(f => {
                    const v = vehicles.find(veh => String(veh.id) === String(f.vehicleId) || veh.plate === f.vehicleId)
                    const d = drivers.find(drv => String(drv.id) === String(f.driverId))
                    return (
                      <div key={f.id} className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-[#E2E6EB] text-[11px]">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-[#111827]">{v?.plate || 'Unknown'}</span>
                          <span className="text-[#6B7280] ml-2">₹{f.total}</span>
                          <span className="text-[#9CA3AF] ml-2">• {d?.name || 'Unknown'}</span>
                        </div>
                        <span className="text-[#9CA3AF] shrink-0">{new Date(f.time).toLocaleDateString()}</span>
                      </div>
                    )
                  })}
                  {fills.length === 0 && <p className="text-[12px] text-[#6B7280]">No fills yet</p>}
                </div>
              </div>
            </>
          )}

          {/* FILLS TAB */}
          {tab === 'fills' && (
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
                      <button onClick={() => {
                        // BUG-024 FIX: Read ALL fills, update the one record, save all back
                        // Previously only saved owner-filtered 'fills', deleting other owners' fill records
                        const allFillsGlobal = storage.getFills()
                        const updated = allFillsGlobal.map(f => f.id === fill.id ? { ...f, verified: !f.verified, verifiedBy: owner?.name || 'Owner', verifiedAt: new Date().toISOString() } : f)
                        storage.saveFills(updated)
                        setRefreshKey(k => k + 1)
                      }} className={`px-3 py-1.5 rounded-lg text-[12px] font-medium ${fill.verified ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#F5F6F8] text-[#6B7280]'}`}>
                        {fill.verified ? 'Verified' : 'Verify'}
                      </button>
                    </div>
                  </div>
                )
              })}
              {fills.length === 0 && <p className="text-[12px] text-[#6B7280] text-center py-8">No fills yet</p>}
            </div>
          )}

          {/* VEHICLES TAB */}
          {tab === 'vehicles' && (
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
                      <p className="text-[10px] text-[#6B7280]">Total Vehicles</p>
                      <p className="text-[18px] font-bold text-[#111827]">{vehicles.length}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-white border border-[#E2E6EB] text-center">
                      <p className="text-[10px] text-[#6B7280]">Total KM</p>
                      <p className="text-[16px] font-bold text-[#1E40AF]">{(totalKmTraveled/1000).toFixed(1)}k</p>
                    </div>
                    <div className="p-3 rounded-xl bg-white border border-[#E2E6EB] text-center">
                      <p className="text-[10px] text-[#6B7280]">Total Fuel</p>
                      <p className="text-[16px] font-bold text-[#92400E]">{totalFuel.toFixed(0)} kg</p>
                    </div>
                    <div className="p-3 rounded-xl bg-white border border-[#E2E6EB] text-center">
                      <p className="text-[10px] text-[#6B7280]">Efficiency</p>
                      <p className="text-[16px] font-bold text-[#166534]">{overallEfficiency} km/kg</p>
                    </div>
                  </div>
                )
              })()}

              <button onClick={() => setShowAddVehicle(true)} className="w-full h-10 rounded-lg bg-white border border-[#E2E6EB] flex items-center justify-center gap-2 hover:bg-[#F5F6F8]">
                <Plus className="w-4 h-4 text-[#E10600]" />
                <span className="text-[12px] font-medium">{t('addVehicle', lang)}</span>
              </button>

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
                              <p className="text-[9px] text-[#6B7280]">Fills</p>
                            </div>
                            <div className="text-center p-2 rounded-lg bg-[#F5F6F8]">
                              <p className="text-[13px] font-bold text-[#991B1B]">₹{(spent/1000).toFixed(1)}k</p>
                              <p className="text-[9px] text-[#6B7280]">Cost</p>
                            </div>
                            <div className="text-center p-2 rounded-lg bg-[#F5F6F8]">
                              <p className="text-[13px] font-bold text-[#1E40AF]">{(kmTraveled/1000).toFixed(0)}k</p>
                              <p className="text-[9px] text-[#6B7280]">KM</p>
                            </div>
                            <div className="text-center p-2 rounded-lg bg-[#F5F6F8]">
                              <p className="text-[13px] font-bold text-[#166534]">{efficiency}</p>
                              <p className="text-[9px] text-[#6B7280]">km/kg</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3 text-[10px] text-[#6B7280]">
                            <span>Odometer: {v.currentOdo.toLocaleString()}</span>
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
                          storage.saveVehicles(allVehicles.filter(x => x.id !== v.id))
                          await googleSync.deleteVehicle(v.id)
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

          {/* DRIVERS TAB */}
          {tab === 'drivers' && (
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
                    return <p className="text-[12px] text-[#6B7280] text-center py-4">No drivers yet</p>
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
                            {d.mismatches > 0 && <p className="text-[10px] text-[#991B1B]">{d.mismatches} alerts</p>}
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
                  <p className="text-[12px] font-semibold text-[#6B7280] uppercase">Driver Performance</p>
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
                          <p className="text-[12px] text-[#6B7280]">No drivers yet</p>
                        </div>
                      )
                    }
                    
                    return driverAnalytics.map(d => (
                      <div key={d.id} className="p-3 rounded-xl bg-white border border-[#E2E6EB] hover:border-[#E10600] transition-colors">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium text-[14px] text-[#111827]">{d.name}</p>
                              <span className="px-2 py-0.5 rounded-full bg-[#F5F6F8] text-[10px] text-[#6B7280]">{d.code}</span>
                              {d.mismatches > 0 && <span className="px-2 py-0.5 rounded-full bg-[#FEE2E2] text-[10px] text-[#991B1B]">{d.mismatches} alerts</span>}
                            </div>
                            <p className="text-[11px] text-[#6B7280] mb-2">{d.vehicle?.plate || 'No vehicle assigned'}</p>
                            <div className="grid grid-cols-4 gap-2">
                              <div className="text-center p-2 rounded-lg bg-[#F5F6F8]">
                                <p className="text-[13px] font-bold text-[#111827]">{d.fills}</p>
                                <p className="text-[9px] text-[#6B7280]">Total Fills</p>
                              </div>
                              <div className="text-center p-2 rounded-lg bg-[#F5F6F8]">
                                <p className="text-[13px] font-bold text-[#111827]">{d.thisMonthFills}</p>
                                <p className="text-[9px] text-[#6B7280]">This Month</p>
                              </div>
                              <div className="text-center p-2 rounded-lg bg-[#F5F6F8]">
                                <p className="text-[13px] font-bold text-[#166534]">{d.verificationRate}%</p>
                                <p className="text-[9px] text-[#6B7280]">Verified</p>
                              </div>
                              <div className="text-center p-2 rounded-lg bg-[#F5F6F8]">
                                <p className="text-[13px] font-bold text-[#1E40AF]">₹{Math.round(d.avgCost)}</p>
                                <p className="text-[9px] text-[#6B7280]">Avg Fill</p>
                              </div>
                            </div>
                          </div>
                          <button onClick={async () => {
                            // BUG-023 FIX: Delete from allDrivers (global), not filtered 'drivers'
                            // Previously saving filtered 'drivers' deleted all other owners' drivers
                            storage.saveDrivers(allDrivers.filter(x => x.id !== d.id))
                            await googleSync.deleteDriver(d.id)
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
                          {d.fuelDrops > 0 && <span className="px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[10px] text-[#92400E]">{d.fuelDrops} fuel drops</span>}
                        </div>
                      </div>
                    ))
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* PAYMENTS TAB */}
          {tab === 'payments' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                <p className="text-[12px] font-semibold text-[#6B7280] uppercase mb-3">Credit Summary</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-[#F5F6F8]">
                    <p className="text-[11px] text-[#6B7280]">Credit Limit</p>
                    <p className="text-[16px] font-bold text-[#111827]">₹{creditLimit.toLocaleString()}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-[#F5F6F8]">
                    <p className="text-[11px] text-[#6B7280]">Credit Used</p>
                    <p className={`text-[16px] font-bold ${creditUsed > creditLimit * 0.8 ? 'text-[#991B1B]' : 'text-[#111827]'}`}>₹{creditUsed.toLocaleString()}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-[#F5F6F8]">
                    <p className="text-[11px] text-[#6B7280]">Total Paid</p>
                    <p className="text-[16px] font-bold text-[#166534]">₹{totalPaid.toLocaleString()}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-[#F5F6F8]">
                    <p className="text-[11px] text-[#6B7280]">Outstanding</p>
                    <p className={`text-[16px] font-bold ${outstanding > 0 ? 'text-[#991B1B]' : 'text-[#166534]'}`}>₹{outstanding.toLocaleString()}</p>
                  </div>
                </div>
              </div>
              
              <div>
                <p className="text-[12px] font-semibold text-[#6B7280] uppercase mb-3">Payment History</p>
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
                  {paymentEntries.length === 0 && <p className="text-[12px] text-[#6B7280] text-center py-4">No payment records</p>}
                </div>
              </div>
            </div>
          )}

          {/* ALERTS TAB */}
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
                    <p className="text-[12px] font-semibold text-[#6B7280] uppercase mb-3">⚠️ Drivers with Alerts</p>
                    <div className="space-y-2">
                      {driverAlertCounts.map(d => (
                        <div key={d.id} className="flex items-center justify-between p-2.5 rounded-lg bg-[#F5F6F8]">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-[#FEE2E2] text-[#991B1B] flex items-center justify-center text-[10px] font-bold">{d.totalAlerts}</span>
                            <span className="text-[13px] font-medium text-[#111827]">{d.name}</span>
                          </div>
                          <div className="flex gap-1.5">
                            {d.mismatches > 0 && <span className="px-2 py-0.5 rounded-full bg-[#FEE2E2] text-[10px] text-[#991B1B]">{d.mismatches} loc</span>}
                            {d.fuelDrops > 0 && <span className="px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[10px] text-[#92400E]">{d.fuelDrops} fuel</span>}
                            {d.overrides > 0 && <span className="px-2 py-0.5 rounded-full bg-[#DBEAFE] text-[10px] text-[#1E40AF]">{d.overrides} vehicle</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* All Alerts */}
              <div>
                <p className="text-[12px] font-semibold text-[#6B7280] uppercase mb-3">All Alerts</p>
                <div className="space-y-2">
                  {alerts.length === 0 ? (
                    <div className="py-12 text-center">
                      <CheckCircle2 className="w-10 h-10 text-[#10B981] mx-auto mb-2" />
                      <p className="text-[12px] text-[#6B7280]">No active alerts</p>
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

          {/* MEDIA VERIFICATION TAB */}
          {tab === 'media' && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                <p className="text-[12px] font-semibold text-[#6B7280] uppercase mb-3">Filters</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <select 
                    value={mediaFilterDriver} 
                    onChange={e => setMediaFilterDriver(e.target.value)}
                    className="h-10 px-3 bg-[#F5F6F8] border border-[#E2E6EB] rounded-lg text-[12px]"
                  >
                    <option value="all">All Drivers</option>
                    {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <select 
                    value={mediaFilterVehicle} 
                    onChange={e => setMediaFilterVehicle(e.target.value)}
                    className="h-10 px-3 bg-[#F5F6F8] border border-[#E2E6EB] rounded-lg text-[12px]"
                  >
                    <option value="all">All Vehicles</option>
                    {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate}</option>)}
                  </select>
                  <select 
                    value={mediaFilterVerified} 
                    onChange={e => setMediaFilterVerified(e.target.value as 'all' | 'verified' | 'pending')}
                    className="h-10 px-3 bg-[#F5F6F8] border border-[#E2E6EB] rounded-lg text-[12px]"
                  >
                    <option value="all">All Status</option>
                    <option value="verified">Verified</option>
                    <option value="pending">Pending</option>
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
                      <p className="text-[12px] text-[#6B7280]">No fills found with media</p>
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
                            await googleSync.updateFill(fill.id, { verified: true, verifiedBy: owner?.name || 'Owner', verifiedAt: new Date().toISOString() })
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

          {/* REPORTS & EXPORT TAB */}
          {tab === 'reports' && (() => {
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
                    <h2 className="text-[16px] font-bold text-[#111827]">Reports & Export</h2>
                    <p className="text-[12px] text-[#6B7280]">Select date range and filters to export fuel fills</p>
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
                  <p className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider">Configure Report</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium text-[#4B5563]">Time Range</label>
                      <select 
                        value={reportRange} 
                        onChange={e => setReportRange(e.target.value as any)}
                        className="h-10 px-3 bg-[#F5F6F8] border border-[#E2E6EB] rounded-lg text-[12px] focus:outline-none focus:border-[#E10600]"
                      >
                        <option value="weekly">Weekly (Last 7 Days)</option>
                        <option value="monthly">Monthly (Last 30 Days)</option>
                        <option value="all">All Time</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium text-[#4B5563]">Filter by Vehicle</label>
                      <select 
                        value={reportVehicle} 
                        onChange={e => setReportVehicle(e.target.value)}
                        className="h-10 px-3 bg-[#F5F6F8] border border-[#E2E6EB] rounded-lg text-[12px] focus:outline-none focus:border-[#E10600]"
                      >
                        <option value="all">All Vehicles</option>
                        {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium text-[#4B5563]">Filter by Driver</label>
                      <select 
                        value={reportDriver} 
                        onChange={e => setReportDriver(e.target.value)}
                        className="h-10 px-3 bg-[#F5F6F8] border border-[#E2E6EB] rounded-lg text-[12px] focus:outline-none focus:border-[#E10600]"
                      >
                        <option value="all">All Drivers</option>
                        {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Selection Summary KPI Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-3.5 rounded-xl bg-white border border-[#E2E6EB]">
                    <p className="text-[10px] text-[#6B7280] uppercase tracking-wider font-semibold">Total Cost</p>
                    <p className="text-[16px] sm:text-[18px] font-bold text-[#111827] mt-1">
                      ₹{filteredFillsForReports.reduce((s, f) => s + f.total, 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-white border border-[#E2E6EB]">
                    <p className="text-[10px] text-[#6B7280] uppercase tracking-wider font-semibold">Total Fuel</p>
                    <p className="text-[16px] sm:text-[18px] font-bold text-[#1E40AF] mt-1">
                      {filteredFillsForReports.reduce((s, f) => s + f.kgs, 0).toFixed(1)} kg
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-white border border-[#E2E6EB]">
                    <p className="text-[10px] text-[#6B7280] uppercase tracking-wider font-semibold">Avg Rate</p>
                    <p className="text-[16px] sm:text-[18px] font-bold text-[#92400E] mt-1">
                      ₹{(() => {
                        const totalKgs = filteredFillsForReports.reduce((s, f) => s + f.kgs, 0);
                        const totalCost = filteredFillsForReports.reduce((s, f) => s + f.total, 0);
                        return totalKgs > 0 ? (totalCost / totalKgs).toFixed(2) : '0.00';
                      })()}/kg
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-white border border-[#E2E6EB]">
                    <p className="text-[10px] text-[#6B7280] uppercase tracking-wider font-semibold">Fills Count</p>
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
                          <th className="p-3">Date</th>
                          <th className="p-3">Vehicle</th>
                          <th className="p-3">Driver</th>
                          <th className="p-3">Station</th>
                          <th className="p-3 text-right">KGs</th>
                          <th className="p-3 text-right">Rate</th>
                          <th className="p-3 text-right font-bold">Total</th>
                          <th className="p-3 text-center">Verified</th>
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
        </div>
      </div>

      {/* Vehicle Detail Modal */}
      {selectedVehicle && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur flex items-center justify-center p-4" onClick={() => setSelectedVehicle(null)}>
          <div className="bg-white rounded-[24px] border border-[#E2E6EB] p-6 w-full max-w-[500px] shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {(() => {
              const v = selectedVehicle
              const vFills = fills.filter(f => String(f.vehicleId) === String(v.id) || f.vehicleId === v.plate)
              const spent = vFills.reduce((s, f) => s + f.total, 0)
              const totalFuel = vFills.reduce((s, f) => s + f.kgs, 0)
              const kmTraveled = v.currentOdo - v.initialOdo
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
                      <p className="text-[11px] text-[#6B7280]">Total Fills</p>
                      <p className="text-[20px] font-bold text-[#111827]">{vFills.length}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F5F6F8]">
                      <p className="text-[11px] text-[#6B7280]">Total Cost</p>
                      <p className="text-[20px] font-bold text-[#991B1B]">₹{spent.toLocaleString()}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F5F6F8]">
                      <p className="text-[11px] text-[#6B7280]">KM Traveled</p>
                      <p className="text-[20px] font-bold text-[#1E40AF]">{kmTraveled.toLocaleString()}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F5F6F8]">
                      <p className="text-[11px] text-[#6B7280]">Efficiency</p>
                      <p className="text-[20px] font-bold text-[#166534]">{efficiency} <span className="text-[12px]">km/kg</span></p>
                    </div>
                  </div>

                  {/* Efficiency Analysis */}
                  <div className="p-4 rounded-xl bg-white border border-[#E2E6EB] mb-5">
                    <p className="text-[12px] font-semibold text-[#6B7280] uppercase mb-3">Efficiency Analysis</p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-[12px]">
                        <span className="text-[#6B7280]">Average per Fill</span>
                        <span className="font-medium">₹{Math.round(avgCost)} • {avgFuel.toFixed(1)} kg</span>
                      </div>
                      <div className="flex justify-between text-[12px]">
                        <span className="text-[#6B7280]">Cost per KM</span>
                        <span className="font-medium">₹{kmTraveled > 0 ? (spent / kmTraveled).toFixed(2) : '0'}</span>
                      </div>
                      <div className="flex justify-between text-[12px]">
                        <span className="text-[#6B7280]">This Month</span>
                        <span className="font-medium">{monthFills.length} fills • ₹{monthSpent.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-[12px]">
                        <span className="text-[#6B7280]">Odometer</span>
                        <span className="font-medium">{v.currentOdo.toLocaleString()} km</span>
                      </div>
                    </div>
                  </div>

                  {/* Recent Fills Mini Chart */}
                  {lastFills.length > 0 && (
                    <div className="mb-5">
                      <p className="text-[12px] font-semibold text-[#6B7280] uppercase mb-3">Recent Fills (Last {lastFills.length})</p>
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
                    <p className="text-[12px] font-semibold text-[#6B7280] uppercase mb-3">Recent Fills</p>
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
                              <span className="text-[#6B7280]">{d?.name || 'Unknown'}</span>
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
            <h3 className="text-[20px] font-bold mb-2 text-[#111827]">Request Credit Increase</h3>
            <p className="text-[14px] text-[#6B7280] mb-5">Current limit: ₹{creditLimit.toLocaleString()}</p>
            <div className="space-y-4">
              <div>
                <label className="text-[12px] text-[#6B7280] mb-1 block">Requested Amount (₹)</label>
                <input 
                  type="number" 
                  value={creditReqAmount} 
                  onChange={e => setCreditReqAmount(e.target.value)}
                  placeholder="50000"
                  className="w-full h-12 px-4 bg-[#F5F6F8] border border-[#E2E6EB] rounded-xl text-[15px]"
                />
              </div>
              <div>
                <label className="text-[12px] text-[#6B7280] mb-1 block">Reason</label>
                <textarea 
                  value={creditReqNote} 
                  onChange={e => setCreditReqNote(e.target.value)}
                  placeholder="Business expansion, more vehicles, etc."
                  className="w-full h-24 px-4 py-3 bg-[#F5F6F8] border border-[#E2E6EB] rounded-xl text-[15px] resize-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowCreditRequest(false)} className="flex-1 h-12 rounded-xl bg-[#F5F6F8] font-medium text-[#6B7280]">Cancel</button>
                <button 
                  onClick={() => {
                    const amountVal = parseFloat(creditReqAmount)
                    if (isNaN(amountVal) || amountVal <= 0) {
                      alert('Please enter a valid amount.')
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

                    // Trigger sync to backend
                    googleSync.addCreditAction({
                      ownerId: newAction.ownerId,
                      type: 'emergency',
                      amount: newAction.amount,
                      reason: newAction.notes,
                      requestedBy: newAction.requestedBy,
                      status: 'pending'
                    }).then(res => {
                      if (res.success && res.id) {
                        // Update local action ID to match the sheet row ID
                        const actions = storage.getCreditActions()
                        const updated = actions.map(act => act.id === actionId ? { ...act, id: res.id! } : act)
                        storage.saveCreditActions(updated)
                        setRefreshKey(k => k + 1)
                      }
                    }).catch(e => console.error('[CreditSync] Error syncing credit action request:', e))

                    alert('Credit request submitted to admin')
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
            <h3 className="text-[16px] font-semibold text-[#111827] mb-1">Change Driver Code</h3>
            <p className="text-[13px] text-[#6B7280] mb-4">{editingDriver.name}</p>
            <input
              value={editCode}
              onChange={e => setEditCode(e.target.value)}
              placeholder="New code"
              maxLength={10}
              className="w-full px-4 py-2.5 rounded-xl border border-[#E2E6EB] text-[14px] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600] mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditingDriver(null)} className="px-4 py-2 rounded-xl bg-[#F5F6F8] text-[#6B7280] text-[13px] font-medium">Cancel</button>
              <button onClick={() => {
                if (!editCode.trim()) return
                const updated = drivers.map(d => d.id === editingDriver.id ? { ...d, code: editCode.trim() } : d)
                storage.saveDrivers(updated)
                googleSync.updateDriver({ id: editingDriver.id, code: editCode.trim() }).catch(() => {})
                setEditingDriver(null)
              }} className="px-4 py-2 rounded-xl bg-[#E10600] text-white text-[13px] font-medium">Save</button>
            </div>
          </div>
        </div>
      )}
      {editingDriverVehicle && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur flex items-center justify-center p-4" onClick={() => setEditingDriverVehicle(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-[16px] font-semibold text-[#111827] mb-1">Change Assigned Vehicle</h3>
            <p className="text-[13px] text-[#6B7280] mb-4">{editingDriverVehicle.name}</p>
            <select
              value={editVehicleId}
              onChange={e => setEditVehicleId(e.target.value)}
              className="w-full h-[52px] px-4 bg-white border border-[#E2E6EB] rounded-xl text-[15px] focus:border-[#E10600] focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 mb-4"
            >
              <option value="">No vehicle</option>
              {vehicles.map(v => <option key={v.id} value={v.plate}>{v.plate}</option>)}
            </select>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditingDriverVehicle(null)} className="px-4 py-2 rounded-xl bg-[#F5F6F8] text-[#6B7280] text-[13px] font-medium">Cancel</button>
              <button onClick={() => {
                const plate = editVehicleId || null
                const updated = drivers.map(d => String(d.id) === String(editingDriverVehicle.id) ? { ...d, assignedVehicleId: plate } : d)
                storage.saveDrivers(updated)
                googleSync.updateDriver({ id: editingDriverVehicle.id, assignedVehicleId: plate }).catch(() => {})
                setEditingDriverVehicle(null)
              }} className="px-4 py-2 rounded-xl bg-[#E10600] text-white text-[13px] font-medium">Save</button>
            </div>
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
  const [vehicleId, setVehicleId] = useState('')

  const handleSave = () => {
    const plate = vehicleId || null  // vehicleId already stores plate (from select options)
    const newDriver = {
      id: 'drv' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name: sanitizeInput(name),
      code,
      // BUG-014 FIX: Store plate in assignedVehicleId (vehicle = plate per user instruction)
      assignedVehicleId: plate,
      ownerId,
      status: 'active' as const,
      createdAt: new Date().toISOString(),
    }
    
    const drivers = storage.getDrivers()
    drivers.push(newDriver)
    storage.saveDrivers(drivers)
    
    googleSync.addDriver({
      id: newDriver.id,
      name: newDriver.name,
      code: newDriver.code,
      assignedVehicleId: plate,
      ownerId: newDriver.ownerId,
    }).catch(() => {})
    
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-[400px] bg-white rounded-[24px] border border-[#E2E6EB] p-6 shadow-xl">
        <h3 className="text-[20px] font-bold mb-5 text-[#111827]">{t('addDriver', lang)}</h3>
        <div className="space-y-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder={t('name', lang)} className="w-full h-12 px-4 bg-[#F5F6F8] border border-[#E2E6EB] rounded-xl" />
          <input value={code} onChange={e => setCode(e.target.value)} placeholder={t('code', lang) + ' (4 digits)'} maxLength={4} className="w-full h-12 px-4 bg-[#F5F6F8] border border-[#E2E6EB] rounded-xl font-mono" />
          <select value={vehicleId} onChange={e => setVehicleId(e.target.value)} className="w-full h-12 px-4 bg-[#F5F6F8] border border-[#E2E6EB] rounded-xl">
            <option value="">No vehicle</option>
            {vehicles.map(v => <option key={v.id} value={v.plate}>{v.plate}</option>)}
          </select>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 h-12 rounded-xl bg-[#F5F6F8] font-medium text-[#6B7280]">{t('cancel', lang)}</button>
          <button onClick={handleSave} disabled={!name || code.length !== 4} className="flex-1 h-12 rounded-xl bg-[#E10600] font-medium text-white disabled:opacity-50">{t('save', lang)}</button>
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

  const handleSave = async () => {
    const initialOdo = parseInt(odo)
    const capacityNum = parseInt(capacity)
    if (isNaN(initialOdo) || initialOdo < 0 || isNaN(capacityNum) || capacityNum <= 0) {
      alert('Please enter valid, non-negative odometer and positive capacity values.')
      return
    }

    const newVehicle = {
      id: 'veh' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      plate: sanitizeInput(plate).toUpperCase(),
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
    
    await googleSync.addVehicle({
      id: newVehicle.id,
      plate: newVehicle.plate,
      model: newVehicle.model,
      initialOdo: newVehicle.initialOdo,
      currentOdo: newVehicle.currentOdo,
      capacity: newVehicle.capacity,
      ownerId: newVehicle.ownerId,
    })
    
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-[400px] bg-white rounded-[24px] border border-[#E2E6EB] p-6 shadow-xl">
        <h3 className="text-[20px] font-bold mb-5 text-[#111827]">{t('addVehicle', lang)}</h3>
        <div className="space-y-3">
          <input value={plate} onChange={e => setPlate(e.target.value.toUpperCase())} placeholder={t('plate', lang)} className="w-full h-12 px-4 bg-[#F5F6F8] border border-[#E2E6EB] rounded-xl font-mono" />
          <input value={model} onChange={e => setModel(e.target.value)} placeholder={t('model', lang)} className="w-full h-12 px-4 bg-[#F5F6F8] border border-[#E2E6EB] rounded-xl" />
          <input value={odo} onChange={e => setOdo(e.target.value)} placeholder="Initial Odometer" type="number" className="w-full h-12 px-4 bg-[#F5F6F8] border border-[#E2E6EB] rounded-xl" />
          <input value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="Capacity (kg)" type="number" className="w-full h-12 px-4 bg-[#F5F6F8] border border-[#E2E6EB] rounded-xl" />
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 h-12 rounded-xl bg-[#F5F6F8] font-medium text-[#6B7280]">{t('cancel', lang)}</button>
          <button onClick={handleSave} disabled={!plate || !model || !odo || !capacity} className="flex-1 h-12 rounded-xl bg-[#E10600] font-medium text-white disabled:opacity-50">{t('save', lang)}</button>
        </div>
      </div>
    </div>
  )
}

function AdminDashboard({ lang, syncKey, syncStatus, loadData }: { lang: Language; syncKey: number; syncStatus: string; loadData?: () => Promise<void> }) {
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
    const oDrivers = drivers.filter(d => d.ownerId === ownerId)
    const oVehicles = vehicles.filter(v => v.ownerId === ownerId)
    const oFills = fills.filter(f => oVehicles.some(v => v.id === f.vehicleId) || f.ownerId === ownerId)
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
    { key: 'dashboard', label: 'Dashboard', icon: '▦' },
    { key: 'owners', label: 'Owners', icon: '👥' },
    { key: 'credit', label: 'Credit', icon: '💰' },
    { key: 'payments', label: 'Payments', icon: '💳' },
    { key: 'transactions', label: 'Transactions', icon: '📋' },
    { key: 'fraud', label: 'Fraud Center', icon: '🛡' },
    { key: 'reports', label: 'Reports', icon: '📊' },
    { key: 'notifications', label: 'Notifications', icon: '🔔' },
    { key: 'audit', label: 'Audit Logs', icon: '📜' },
    { key: 'settings', label: 'Settings', icon: '⚙' },
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
              <span>↻</span> <span>Refresh</span>
            </button>
            <div className="px-3 pt-2 text-[10px] text-[#9CA3AF]">
              {syncStatus === 'synced' && <span className="text-[#059669]">● Data synced</span>}
              {syncStatus === 'failed' && <span className="text-[#991B1B]">● Sync failed — reload to retry</span>}
              {syncStatus === 'syncing' && <span className="text-[#1E40AF]">● Syncing...</span>}
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
                {KPI('Total Outstanding', `₹${(totalPending/1000).toFixed(1)}k`)}
                {KPI("Today's Fuel Value", `₹${(todayFuelValue/1000).toFixed(1)}k`)}
                {KPI('Blocked Owners', String(blockedOwners.length), blockedOwners.length > 0 ? 'Requires review' : undefined)}
                {KPI('Overdue Owners', String(overdueOwners.length), overdueOwners.length > 0 ? 'Payment overdue' : undefined)}
                {KPI('Fraud Alerts', String(fraudAlerts.length), fraudAlerts.length > 0 ? 'Needs investigation' : undefined)}
                {KPI('Total Collections', `₹${(totalPaidAmt/1000).toFixed(1)}k`, `${totalDue > 0 ? ((totalPaidAmt/totalDue)*100).toFixed(0) : '0'}% recovery`)}
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
                              <span className="font-medium">₹{(o.stats.used/1000).toFixed(1)}k</span>
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
                          <p className="text-[11px] text-[#6B7280]">{o.name} • {o.email} • {o.phone}</p>
                          <div className="flex gap-3 mt-1 text-[11px] text-[#6B7280] flex-wrap">
                            <span>{stats.drivers} drivers</span>
                            <span>{stats.vehicles} vehicles</span>
                            <span>{stats.fills} fills</span>
                            <span>Limit: ₹{((o.creditLimit || 0)/1000).toFixed(1)}k</span>
                            <span>Used: ₹{(stats.used/1000).toFixed(1)}k</span>
                            <span className={stats.pending > 0 ? 'text-[#991B1B] font-medium' : 'text-[#166534]'}>Pending: ₹{(stats.pending/1000).toFixed(1)}k</span>
                          </div>
                        </div>
                        <div className="shrink-0 flex flex-wrap gap-1">
                          {o.status === 'active' ? (
                            <button onClick={async () => { 
                              storage.saveOwners(owners.map(x => x.id === o.id ? { ...x, status: 'inactive' as const } : x)); 
                              // BUG-025 FIX: sync status change to Google Sheets
                              await googleSync.updateOwner(o.id, { status: 'inactive' });
                              addAuditLog('block_owner', `Blocked ${o.business}`); 
                              addNotification('owner', `${o.business} blocked`, 'warning'); 
                              setRefreshKey(k => k + 1) 
                            }}
                              className="px-2.5 py-1 rounded-lg bg-[#FEE2E2] text-[#991B1B] text-[10px] font-medium">Block</button>
                          ) : (
                            <button onClick={async () => { 
                              storage.saveOwners(owners.map(x => x.id === o.id ? { ...x, status: 'active' as const } : x)); 
                              // BUG-025 FIX: sync status change to Google Sheets
                              await googleSync.updateOwner(o.id, { status: 'active' });
                              addAuditLog('unblock_owner', `Unblocked ${o.business}`); 
                              setRefreshKey(k => k + 1) 
                            }}
                              className="px-2.5 py-1 rounded-lg bg-[#DCFCE7] text-[#166534] text-[10px] font-medium">Unblock</button>
                          )}
                          {o.creditFrozen ? (
                            <button onClick={async () => {
                              storage.saveOwners(owners.map(x => x.id === o.id ? { ...x, creditFrozen: false } : x));
                              await googleSync.updateOwner(o.id, { creditFrozen: false });
                              addAuditLog('unfreeze_credit', `Unfroze credit for ${o.business}`);
                              setRefreshKey(k => k + 1);
                            }} className="px-2.5 py-1 rounded-lg bg-[#DBEAFE] text-[#1E40AF] text-[10px] font-medium">Unfreeze</button>
                          ) : (
                            <button onClick={async () => {
                              storage.saveOwners(owners.map(x => x.id === o.id ? { ...x, creditFrozen: true } : x));
                              await googleSync.updateOwner(o.id, { creditFrozen: true });
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
                            <div className="p-2.5 rounded-lg bg-[#F5F6F8]"><p className="text-[#6B7280]">Credit Limit</p><p className="font-semibold text-[#111827]">₹{((o.creditLimit || 0)/1000).toFixed(1)}k</p></div>
                            <div className="p-2.5 rounded-lg bg-[#F5F6F8]"><p className="text-[#6B7280]">Credit Used</p><p className="font-semibold text-[#1E40AF]">₹{(stats.creditUsedAmount/1000).toFixed(1)}k</p></div>
                            <div className="p-2.5 rounded-lg bg-[#F5F6F8]"><p className="text-[#6B7280]">Remaining</p><p className={`font-semibold ${stats.creditRemaining > 0 ? 'text-[#166534]' : 'text-[#991B1B]'}`}>₹{(stats.creditRemaining/1000).toFixed(1)}k</p></div>
                            <div className="p-2.5 rounded-lg bg-[#F5F6F8]"><p className="text-[#6B7280]">Last Payment</p><p className="font-semibold text-[#111827]">{o.lastPaymentDate ? new Date(o.lastPaymentDate).toLocaleDateString() : 'Never'}</p></div>
                          </div>
                          {editCredit?.id === o.id && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] text-[#6B7280]">₹</span>
                              <input value={editCredit.val} onChange={e => setEditCredit({ ...editCredit, val: e.target.value })}
                                className="flex-1 min-w-[120px] h-9 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px]" placeholder="Credit limit" />
                              <button onClick={async () => {
                                const newLimit = parseInt(editCredit.val) || 0;
                                storage.saveOwners(owners.map(x => x.id === o.id ? { ...x, creditLimit: newLimit } : x));
                                await googleSync.updateOwner(o.id, { creditLimit: newLimit });
                                setEditCredit(null);
                                addAuditLog('set_credit_limit', `Set limit ₹${editCredit.val} for ${o.business}`);
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
                                await googleSync.updateOwner(o.id, { notes: editNotes.val });
                                setEditNotes(null);
                                addAuditLog('add_note', `Added note to ${o.business}`);
                                setRefreshKey(k => k + 1);
                              }}
                                className="px-3 h-9 rounded-lg bg-[#E10600] text-white text-[11px] font-medium">Save</button>
                              <button onClick={() => setEditNotes(null)} className="px-3 h-9 rounded-lg bg-[#F5F6F8] text-[#6B7280] text-[11px]">Cancel</button>
                            </div>
                          )}
                          {o.adminNotes && editNotes?.id !== o.id && (
                            <p className="text-[11px] text-[#6B7280] italic bg-[#FFFBEB] p-2 rounded-lg border border-[#FDE68A]">📝 {o.adminNotes}</p>
                          )}
                          <div>
                            <p className="text-[11px] font-semibold text-[#6B7280] mb-1">Payment History</p>
                            {paymentEntries.filter(p => p.ownerId === o.id).slice(-5).reverse().map(p => (
                              <div key={p.id} className="flex items-center justify-between py-1.5 text-[11px] border-b border-[#F5F6F8] last:border-0">
                                <span className="text-[#111827]">₹{p.amount} ({p.type})</span>
                                <span className="text-[#6B7280]">{new Date(p.timestamp).toLocaleDateString()} • {p.adminName}</span>
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
                    <input value={creditAmount} onChange={e => setCreditAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Amount (₹)" type="text"
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
                      addAuditLog('issue_credit', `${creditType} credit ₹${amt} to ${o?.business || creditOwner}`)
                      addNotification('credit', `₹${amt} ${creditType} credit issued to ${o?.business || creditOwner}`, 'info')
                      setCreditOwner(''); setCreditAmount(''); setCreditNote('')
                      setRefreshKey(k => k + 1)
                      
                      // Sync to Sheets
                      const backendType = creditType === 'issued' ? 'issue' : creditType
                      await googleSync.addCreditAction({
                        ownerId: creditOwner,
                        type: backendType,
                        amount: amt,
                        reason: creditNote || undefined,
                        status: 'approved',
                        approvedBy: 'Admin'
                      })
                    }} disabled={!creditOwner || !creditAmount}
                      className="w-full h-10 rounded-lg bg-[#059669] text-white text-[12px] font-medium disabled:opacity-50">Issue Credit</button>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-white border border-[#E2E6EB]">
                  <p className="font-semibold text-[13px] text-[#111827] mb-3">Credit Rules</p>
                  <div className="space-y-2.5 text-[12px]">
                    <div className="flex justify-between p-2.5 rounded-lg bg-[#F5F6F8]">
                      <span className="text-[#6B7280]">Max Daily Usage</span>
                      <span className="font-medium">₹{((settings.maxDailyUsage || 50000)/1000).toFixed(1)}k</span>
                    </div>
                    <div className="flex justify-between p-2.5 rounded-lg bg-[#F5F6F8]">
                      <span className="text-[#6B7280]">Max Transaction</span>
                      <span className="font-medium">₹{((settings.maxTransaction || 10000)/1000).toFixed(1)}k</span>
                    </div>
                    <div className="flex justify-between p-2.5 rounded-lg bg-[#F5F6F8]">
                      <span className="text-[#6B7280]">Monthly Limit</span>
                      <span className="font-medium">₹{((settings.monthlyLimit || 200000)/1000).toFixed(1)}k</span>
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
                              <span className="font-bold text-[#111827]">₹{ca.amount.toLocaleString()}</span>
                              <span className="text-[#6B7280]">for {o?.business || ca.ownerId}</span>
                            </div>
                            {ca.notes && <p className="text-[#4B5563] text-[11px] italic">Reason: {ca.notes}</p>}
                            <p className="text-[#9CA3AF] text-[10px]">Requested by: {ca.requestedBy || 'Owner'} on {new Date(ca.timestamp).toLocaleString()}</p>
                          </div>
                          <div className="flex gap-2">
                            <button 
                              onClick={async () => {
                                // Sync backend first
                                const ok = await googleSync.updateCreditAction(ca.id, 'approved', 'Admin')
                                if (ok) {
                                  // Update status to approved
                                  const updatedActions = creditActions.map(act => 
                                    act.id === ca.id ? { ...act, status: 'approved' as const, approvedBy: 'Admin' } : act
                                  )
                                  storage.saveCreditActions(updatedActions)

                                  // Update owner credit limit
                                  const updatedOwners = owners.map(x => 
                                    x.id === ca.ownerId ? { ...x, creditLimit: (x.creditLimit || 0) + ca.amount } : x
                                  )
                                  storage.saveOwners(updatedOwners)

                                  addAuditLog('approve_credit', `Approved ₹${ca.amount} credit request for ${o?.business || ca.ownerId}`)
                                  addNotification('credit', `₹${ca.amount} credit request approved for ${o?.business || ca.ownerId}`, 'info')
                                  
                                  if (typeof loadData === 'function') {
                                    await loadData()
                                  }
                                  setRefreshKey(k => k + 1)
                                } else {
                                  alert('Failed to update credit request on backend sheet. Please try again.')
                                }
                              }}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-medium text-[11px] hover:bg-emerald-700"
                            >
                              Approve
                            </button>
                            <button 
                              onClick={async () => {
                                // Sync backend first
                                const ok = await googleSync.updateCreditAction(ca.id, 'rejected', 'Admin')
                                if (ok) {
                                  // Reject action:
                                  // Update status to rejected
                                  const updatedActions = creditActions.map(act => 
                                    act.id === ca.id ? { ...act, status: 'rejected' as const, approvedBy: 'Admin' } : act
                                  )
                                  storage.saveCreditActions(updatedActions)

                                  addAuditLog('reject_credit', `Rejected ₹${ca.amount} credit request for ${o?.business || ca.ownerId}`)
                                  addNotification('credit', `₹${ca.amount} credit request rejected for ${o?.business || ca.ownerId}`, 'warning')
                                  
                                  if (typeof loadData === 'function') {
                                    await loadData()
                                  }
                                  setRefreshKey(k => k + 1)
                                } else {
                                  alert('Failed to update credit request on backend sheet. Please try again.')
                                }
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
                          <span className="font-medium text-[#111827]">₹{ca.amount}</span>
                          <span className="text-[#6B7280]">→ {o?.business || ca.ownerId}</span>
                          {ca.notes && <span className="text-[#6B7280] italic">— {ca.notes}</span>}
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
                {KPI('Total Due', `₹${(totalDue/1000).toFixed(1)}k`)}
                {KPI('Total Paid', `₹${(totalPaidAmt/1000).toFixed(1)}k`, `${totalDue > 0 ? ((totalPaidAmt/totalDue)*100).toFixed(0) : '0'}%`)}
                {KPI('Pending', `₹${(totalPending/1000).toFixed(1)}k`)}
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
                          <p className="text-[11px] text-[#6B7280]">{o.name} • {stats.vehicles} vehicles • {stats.drivers} drivers</p>
                          <div className="flex gap-3 mt-1.5 text-[11px] flex-wrap">
                            <span>Used: <strong>₹{(stats.used/1000).toFixed(1)}k</strong></span>
                            <span className="text-[#166534]">Paid: <strong>₹{(stats.paid/1000).toFixed(1)}k</strong></span>
                            <span className={stats.pending > 0 ? 'text-[#991B1B]' : 'text-[#166534]'}>Pending: <strong>₹{(stats.pending/1000).toFixed(1)}k</strong></span>
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
                                  <span className="text-[11px] text-[#6B7280]">₹</span>
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
                                      addAuditLog('mark_paid', `₹${amt} payment from ${o.business}`)
                                      addNotification('payment', `₹${amt} received from ${o.business}`, 'info')
                                      setRefreshKey(k => k + 1)
                                      
                                      // Sync to Sheets
                                      await googleSync.addPaymentEntry({
                                        ownerId: o.id,
                                        amount: amt,
                                        notes: payNote || undefined
                                      })
                                    }
                                  }} className="px-2.5 h-8 rounded-lg bg-[#059669] text-white text-[11px] font-medium">Confirm</button>
                                  <button onClick={() => setPayOwner(null)} className="px-2 h-8 rounded-lg bg-[#F5F6F8] text-[#6B7280] text-[11px]">✕</button>
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
                          <span className="font-medium text-[#111827]">₹{pe.amount}</span>
                          <span className="text-[#6B7280]">from {o?.business || pe.ownerId}</span>
                          {pe.note && <span className="text-[#6B7280] italic">— {pe.note}</span>}
                        </div>
                        <span className="text-[#9CA3AF]">{new Date(pe.timestamp).toLocaleDateString()} • {pe.adminName}</span>
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
                            <span className="text-[#991B1B]">₹{(stats.pending/1000).toFixed(1)}k due</span>
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
                            <span className="text-[#6B7280]">•</span>
                            <span className="text-[#6B7280]">{new Date(f.time).toLocaleDateString()}</span>
                            <span className="text-[#6B7280]">•</span>
                            <span className="text-[#6B7280]">{f.station}</span>
                          </div>
                          <div className="flex gap-3 text-[11px] flex-wrap">
                            <span>{f.kgs}kg × ₹{f.rate} = <strong>₹{f.total}</strong></span>
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
                <div className="p-4 rounded-xl bg-[#DCFCE7] border border-[#BBF7D0] text-[12px] font-medium text-[#166534]">All clear — no unresolved alerts</div>
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
                          <p className="text-[10px] text-[#6B7280] mt-0.5">{a.user} • {o?.business || ''} • {new Date(a.time).toLocaleString()}</p>
                        </div>
                        <div className="shrink-0 flex gap-1.5 flex-wrap">
                          {!a.resolved && (
                            <>
                              <button onClick={async () => { 
                                storage.saveAlerts(alerts.map(x => x.id === a.id ? { ...x, resolved: true } : x)); 
                                await googleSync.resolveAlert(a.id, { 
                                  resolvedBy: 'Admin', 
                                  resolutionNote: `Resolved via Admin Dashboard` 
                                }); 
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
                  <p className="font-semibold text-[13px] text-[#111827]">📋 Export Owners</p>
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
                  <p className="font-semibold text-[13px] text-[#111827]">⛽ Export All Fills</p>
                  <p className="text-[10px] text-[#6B7280] mt-0.5">All fill entries with fraud flags</p>
                </button>
                <button onClick={() => expCSV('pending_payments.csv', ['Owner', 'Business', 'Total Used', 'Total Paid', 'Pending', 'Vehicles', 'Last Fill'],
                  owners.map(o => { const s = getOwnerStats(o.id); return s.pending > 0 ? [o.name, o.business, s.used, s.paid, s.pending, s.vehicles, s.lastFill ? new Date(s.lastFill).toLocaleDateString() : 'N/A'] : null }).filter((x): x is any[] => x !== null)
                )} className="p-4 rounded-xl bg-white border border-[#E2E6EB] text-left hover:bg-[#F9FAFB]">
                  <p className="font-semibold text-[13px] text-[#111827]">📊 Export Pending Payments</p>
                  <p className="text-[10px] text-[#6B7280] mt-0.5">Owners with outstanding amounts</p>
                </button>
                <button onClick={() => expCSV('payment_summary.csv', ['Owner', 'Business', 'Total Used', 'Total Paid', 'Pending', 'Collection %'],
                  owners.map(o => { const s = getOwnerStats(o.id); return [o.name, o.business, s.used, s.paid, s.pending, s.used > 0 ? ((s.paid/s.used)*100).toFixed(0) + '%' : '0%'] })
                )} className="p-4 rounded-xl bg-white border border-[#E2E6EB] text-left hover:bg-[#F9FAFB]">
                  <p className="font-semibold text-[13px] text-[#111827]">💰 Payment Summary</p>
                  <p className="text-[10px] text-[#6B7280] mt-0.5">Per-owner payment breakdown with collection rate</p>
                </button>
                <button onClick={() => expCSV('fraud_alerts.csv', ['ID', 'Event', 'Type', 'Risk', 'User', 'Owner', 'Time', 'Resolved'],
                  alerts.map(a => { const o = owners.find(ow => ow.id === a.ownerId); const risk = a.type === 'fuel_drop' ? 'Critical' : a.type === 'vehicle_override' ? 'High' : 'Medium'; return [a.id, a.event, a.type, risk, a.user, o?.business || '', new Date(a.time).toLocaleString(), a.resolved ? 'Yes' : 'No'] })
                )} className="p-4 rounded-xl bg-white border border-[#E2E6EB] text-left hover:bg-[#F9FAFB]">
                  <p className="font-semibold text-[13px] text-[#111827]">🛡 Export Fraud Alerts</p>
                  <p className="text-[10px] text-[#6B7280] mt-0.5">All fraud alerts with risk levels and resolution status</p>
                </button>
                <button onClick={() => expCSV('credit_actions.csv', ['ID', 'Type', 'Amount', 'Owner', 'Notes', 'Date'],
                  creditActions.map(ca => { const o = owners.find(ow => ow.id === ca.ownerId); return [ca.id, ca.type, ca.amount, o?.business || ca.ownerId, ca.notes || '', new Date(ca.timestamp).toLocaleDateString()] })
                )} className="p-4 rounded-xl bg-white border border-[#E2E6EB] text-left hover:bg-[#F9FAFB]">
                  <p className="font-semibold text-[13px] text-[#111827]">💰 Export Credit Actions</p>
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
                          <p className="text-[10px] text-[#6B7280]">{new Date(n.timestamp).toLocaleString()} • {n.type}</p>
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
                      <p className="text-[#9CA3AF] text-[10px]">{a.adminName} • {new Date(a.timestamp).toLocaleString()}</p>
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
                      <label className="text-[11px] text-[#6B7280] block mb-1">Max Daily Usage (₹)</label>
                      <input defaultValue={settings.maxDailyUsage || 50000} onBlur={e => { storage.saveSettings({ ...settings, maxDailyUsage: parseInt(e.target.value) || 50000 }) }}
                        className="w-full h-9 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px]" type="number" />
                    </div>
                    <div>
                      <label className="text-[11px] text-[#6B7280] block mb-1">Max Transaction (₹)</label>
                      <input defaultValue={settings.maxTransaction || 10000} onBlur={e => { storage.saveSettings({ ...settings, maxTransaction: parseInt(e.target.value) || 10000 }) }}
                        className="w-full h-9 px-3 bg-white border border-[#E2E6EB] rounded-lg text-[12px]" type="number" />
                    </div>
                    <div>
                      <label className="text-[11px] text-[#6B7280] block mb-1">Default Monthly Limit (₹)</label>
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