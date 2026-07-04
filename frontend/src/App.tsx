import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Fuel, Video, Camera, Receipt, Gauge, 
  MapPin, AlertTriangle, CheckCircle2, 
  Car, Users, BarChart3, Shield, 
  LogOut, Plus, Trash2, X, Play,
  Pause, RotateCcw, Check, Globe, Upload,
  Eye, EyeOff
} from 'lucide-react'
import { storage, calculateDistance } from './lib/storage'
import { seedDemoData } from './lib/seedDemo'
import { firestoreSync, BACKEND_API_URL } from './lib/firestoreSync'
import { t } from './lib/translations'
import type { Language, Role, Driver, Owner, Vehicle, Fill, Alert, CameraCapture, CreditAction, PaymentEntry } from './lib/types'
import { OwnerRegister } from './components/OwnerRegister'
import { DriverDashboard } from './components/DriverDashboard'
import { FillWizard } from './components/FillWizard'
import { OwnerDashboard } from './components/OwnerDashboard'
import { AdminDashboard } from './components/AdminDashboard'

type View = 'welcome' | 'driver-login' | 'driver-signup' | 'owner-login' | 'owner-register' | 'admin-login' | 'driver-dash' | 'owner-dash' | 'admin-dash' | 'wizard'

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
  const [liveLocations, setLiveLocations] = useState<any[]>([])

  const getLiveLocationsFromStorage = (): any[] => {
    const locations: any[] = []
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith('cng_driver_location_')) {
          const raw = localStorage.getItem(key)
          if (raw) {
            const loc = JSON.parse(raw)
            if (loc && loc.driverId) {
              locations.push(loc)
            }
          }
        }
      }
    } catch (e) {
      console.error('Error reading live locations from storage:', e)
    }
    return locations
  }

  useEffect(() => {
    const loadLocations = () => {
      const locs = getLiveLocationsFromStorage()
      setLiveLocations(locs)
    }
    loadLocations()
    const interval = setInterval(loadLocations, 5000)
    return () => clearInterval(interval)
  }, [syncKey])

  // Listeners list to unsubscribe when view changes or session ends
  const unsubscribers = useRef<Array<() => void>>([])

  // Sync backoff — after repeated failures, pause retries instead of hammering an unreachable backend
  const syncFailures = useRef(0)
  const nextSyncRetryAt = useRef(0)

  const loadDataFromBackend = async () => {
    if (!session) {
      setSyncStatus('synced')
      setSyncKey(k => k + 1)
      return
    }

    // Respect backoff window while backend is unreachable
    if (syncFailures.current >= 2 && Date.now() < nextSyncRetryAt.current) {
      return
    }

    setSyncStatus('syncing')
    try {
      const result = await firestoreSync.fetchAllData()
      if (result && result.success) {
        if (result.owners) storage.saveOwners(result.owners)
        if (result.drivers) storage.saveDrivers(result.drivers)
        if (result.vehicles) storage.saveVehicles(result.vehicles)
        if (result.fills) storage.saveFills(result.fills)
        if (result.alerts) storage.saveAlerts(result.alerts)
        if (result.paymentEntries) storage.savePaymentEntries(result.paymentEntries)
        if (result.creditActions) storage.saveCreditActions(result.creditActions)
        if (result.trips) storage.saveTrips(result.trips)
        if (result.notifications) storage.saveNotifications(result.notifications)
        
        // Sync live locations from backend
        if (result.locations) {
          // Clear old driver location keys first
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i)
            if (key && key.startsWith('cng_driver_location_')) {
              localStorage.removeItem(key)
            }
          }
          // Save updated driver locations
          result.locations.forEach((loc: any) => {
            localStorage.setItem(`cng_driver_location_${loc.driverId}`, JSON.stringify(loc))
          })
        }
        
        syncFailures.current = 0
        setSyncStatus('synced')
        setSyncKey(k => k + 1)
      } else {
        syncFailures.current += 1
        // Back off: 2 min after repeated failures — data keeps working from local storage
        nextSyncRetryAt.current = Date.now() + 120000
        setSyncStatus('failed')
      }
    } catch (err) {
      syncFailures.current += 1
      nextSyncRetryAt.current = Date.now() + 120000
      setSyncStatus('failed')
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)

    // DEV ONLY: seed demo accounts for offline testing — http://localhost:5177/?seed=demo
    // Stripped from production builds by the DEV guard.
    if (import.meta.env.DEV && params.get('seed') === 'demo') {
      seedDemoData()
      window.location.replace(window.location.origin + '/')
      return
    }

    // Secret admin entry point — not linked anywhere in the app UI.
    // Access via a private URL only: https://yourapp.com/?portal=techadmin2026
    if (params.get('portal') === 'techadmin2026') {
      setView('admin-login')
      setLoading(false)
      return
    }

    // Rely exclusively on localStorage for persistent sessions across tabs
    const savedSession = storage.getSession()
    if (savedSession) {
      setSession(savedSession)
      if (savedSession.role === 'driver') setView('driver-dash')
      else if (savedSession.role === 'owner') setView('owner-dash')
      else if (savedSession.role === 'admin') setView('admin-dash')
      
      // Sync from backend immediately on launch if active session exists
      loadDataFromBackend()
    }

    const savedLang = storage.getLanguage() as Language
    setLang(savedLang)



    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    const handleStorage = () => setSyncKey(k => k + 1)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('storage', handleStorage)

    // Merge offline queue into main fills (localStorage-only)
    const queue = storage.getOfflineQueue()
    if (queue.length > 0) {
      const fills = storage.getFills()
      const existingIds = new Set(fills.map(f => f.id))
      const newFills = queue.filter(f => !existingIds.has(f.id))
      storage.saveFills([...fills, ...newFills])
      storage.clearOfflineQueue()
    }

    setLoading(false)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('storage', handleStorage)
      unsubscribers.current.forEach(unsub => unsub())
    }
  }, [])

  // Periodic sync effect for all active sessions
  useEffect(() => {
    if (!session) return

    loadDataFromBackend()
    // Owners/admins sync every 15s; drivers sync every 30s
    const intervalTime = (session.role === 'owner' || session.role === 'admin') ? 15000 : 30000
    const interval = setInterval(() => {
      loadDataFromBackend()
    }, intervalTime)

    return () => clearInterval(interval)
  }, [session])

  useEffect(() => {
    const savedLang = storage.getLanguage() as Language
    if (savedLang && savedLang !== lang) {
      setLang(savedLang)
    }
  }, [syncKey])

  // Synchronize history state with current view to enable back-button support
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (event.state && event.state.view) {
        setView(event.state.view);
      } else {
        setView('welcome');
      }
    };

    window.addEventListener('popstate', handlePopState);
    
    // Replace the initial history entry with the active view
    history.replaceState({ view }, '');

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    // Only push to the history stack if the active view changes and is different from current history state
    if (history.state?.view !== view) {
      history.pushState({ view }, '');
    }
  }, [view]);

  // Real-time Driver Tracking (only active during a trip)
  useEffect(() => {
    if (!session || session.role !== 'driver' || !navigator.geolocation) return

    let watchId: number = 0

    const updateLocation = (latitude: number, longitude: number) => {
      const currentDrivers = storage.getDrivers()
      const currentDriver = currentDrivers.find(d => String(d.id) === String(session.userId))
      const ownerId = currentDriver?.ownerId || session.ownerId
      const locKey = `cng_driver_location_${session.userId}`
      const locObj = {
        driverId: session.userId,
        driverName: session.name,
        ownerId,
        lat: latitude,
        lng: longitude,
        lastUpdated: new Date().toISOString()
      }
      localStorage.setItem(locKey, JSON.stringify(locObj))
      // Dispatch storage event so other tabs detect the update
      window.dispatchEvent(new Event('storage'))
      
      // Update local state
      setLiveLocations(prev => {
        const filtered = prev.filter((l: any) => l.driverId !== session.userId)
        return [...filtered, locObj]
      })

      // Sync live location to database via backend
      firestoreSync.updateDriverLocation(locObj).catch(err => {
        console.error('Failed to sync live location to server:', err)
      })
    }

    const startTracking = () => {
      const hasActiveTrip = localStorage.getItem(`cng_active_trip_${session.userId}`) !== null
      
      if (!hasActiveTrip) {
        if (watchId) {
          navigator.geolocation.clearWatch(watchId)
          watchId = 0
        }
        return
      }

      // 1. Get initial position immediately
      navigator.geolocation.getCurrentPosition(
        (position) => {
          updateLocation(position.coords.latitude, position.coords.longitude)
        },
        (error) => {
          console.warn('Initial GPS query failed:', error.message)
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      )

      if (watchId) return

      // 2. Start watching position with high accuracy
      try {
        watchId = navigator.geolocation.watchPosition(
          (position) => {
            updateLocation(position.coords.latitude, position.coords.longitude)
          },
          (error) => {
            console.warn('Driver tracking error, resetting watch:', error.message)
            if (watchId) {
              navigator.geolocation.clearWatch(watchId)
              watchId = 0
            }
          },
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
          }
        )
      } catch (err) {
        console.error('Failed to initiate driver tracking:', err)
      }
    }

    startTracking()
    const checkInterval = setInterval(startTracking, 10000)
    
    // Listen to local changes instantly
    window.addEventListener('trip_state_changed', startTracking)

    return () => {
      clearInterval(checkInterval)
      window.removeEventListener('trip_state_changed', startTracking)
      if (watchId) {
        navigator.geolocation.clearWatch(watchId)
      }
    }
  }, [session])

  const changeLang = (l: Language) => {
    setLang(l)
    storage.setLanguage(l)
  }

  const logout = () => {
    unsubscribers.current.forEach(unsub => unsub())
    unsubscribers.current = []
    storage.clearSession()
    sessionStorage.removeItem('cng_jwt_token')
    setSession(null)
    setView('welcome')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F6F8] flex items-center justify-center">
        <div className="text-center">
          <img src="/icon-512.png" alt="CNG Fleet Tracker" className="h-16 w-16 mx-auto mb-4 object-contain" />
          <p className="text-[13px] text-[#6B7280]">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-[#F5F6F8] text-[#111827] flex flex-col ${view === 'welcome' ? 'h-dvh overflow-hidden' : 'min-h-screen'}`}>
      {/* Header */}
      {view !== 'driver-dash' && (
        <header className="sticky top-0 z-40 bg-[#F5F6F8] border-b border-[#E2E6EB]">
        <div className={`mx-auto px-4 h-14 flex items-center justify-between ${view === 'admin-dash' || view === 'owner-dash' ? 'max-w-full px-6' : 'max-w-[480px]'}`}>
          <img src="/logo.png" alt="CNG Fleet Tracker" className="h-8" />
          
          <div className="flex items-center gap-2">
            {syncStatus === 'failed' && (
              <div className="px-2.5 py-1 rounded-full bg-[#F3F4F6] border border-[#E5E7EB] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#9CA3AF]" />
                <span className="text-[10px] font-semibold text-[#6B7280]">{lang === 'hi' ? 'लोकल मोड' : lang === 'gu' ? 'લોકલ મોડ' : 'LOCAL MODE'}</span>
              </div>
            )}
            {!isOnline && (
              <div className="px-2.5 py-1 rounded-full bg-[#FEF3C7] border border-[#FCD34D]">
                <span className="text-[10px] font-semibold text-[#92400E]">OFFLINE</span>
              </div>
            )}
            <div className="flex bg-white rounded-lg p-0.5 border border-[#E2E6EB]">
              {(['en', 'hi', 'gu'] as Language[]).map(l => (
                <button
                  key={l}
                  onClick={() => changeLang(l)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                    lang === l ? 'bg-[#F5F6F8] text-[#111827] shadow-sm' : 'text-[#6B7280] hover:text-[#111827]'
                  }`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            {session && (
              <button onClick={logout} className="p-2 hover:bg-white rounded-lg transition-colors">
                <LogOut className="w-4 h-4 text-[#6B7280]" />
              </button>
            )}
          </div>
        </div>
      </header>
      )}

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
          {view === 'driver-signup' && (
            <DriverSignup
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
          {view === 'driver-dash' && session && <DriverDashboard lang={lang} setLang={changeLang} session={session} setView={setView} setSession={setSession} syncKey={syncKey} key="driver-dashboard" />}
          {view === 'wizard' && session && <FillWizard lang={lang} session={session} setView={setView} syncKey={syncKey} key="fill-wizard" />}
          {view === 'owner-dash' && session && <OwnerDashboard lang={lang} session={session} syncKey={syncKey} key="owner-dashboard" loadData={loadDataFromBackend} liveLocations={liveLocations} />}
          {view === 'admin-dash' && <AdminDashboard lang={lang} syncKey={syncKey} syncStatus={syncStatus} loadData={loadDataFromBackend} key="admin-dashboard" />}
        </AnimatePresence>
      </main>
    </div>
  )
}

function WelcomeView({ lang, setView }: { lang: Language; setView: (v: View) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col h-[calc(100dvh-3.5rem)] overflow-hidden bg-[#F5F6F8]"
    >
      {/* Hero section — dark with brand red accent */}
      <div className="relative bg-[#111827] flex-1 flex flex-col items-center justify-center px-6 pb-10 overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        {/* Red glow */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-64 h-32 rounded-full blur-3xl opacity-20" style={{ background: '#E10600' }} />

        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="relative z-10 text-center">
          <img src="/only_logo-removebg-preview.png" alt="TechInnovate" className="w-20 h-20 mx-auto mb-5 object-contain" />
          <h1 className="text-white font-black leading-none mb-2" style={{ fontFamily: "'Archivo', sans-serif", fontSize: 28, letterSpacing: '-0.03em' }}>
            TECHINNOVATE<br />MOBILITY
          </h1>
          <p className="text-white/50 text-[13px] font-medium tracking-wide mt-3">
            {lang === 'hi' ? 'फ्लीट सीएनजी मॉनिटरिंग सिस्टम' : lang === 'gu' ? 'ફ્લીટ સીએનજી મોનિટરિંગ સિસ્ટમ' : 'Fleet CNG Monitoring System'}
          </p>
        </motion.div>

        {/* Stats strip */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="relative z-10 mt-8 flex gap-6">
          {[
            { label: lang === 'hi' ? 'चालक' : lang === 'gu' ? 'ચાલક' : 'Drivers', value: '500+' },
            { label: lang === 'hi' ? 'वाहन' : lang === 'gu' ? 'વાહન' : 'Vehicles', value: '200+' },
            { label: lang === 'hi' ? 'सुरक्षित' : lang === 'gu' ? 'સુરક્ષિત' : 'Fills Tracked', value: '10K+' },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <p className="text-white font-black text-lg leading-none" style={{ fontFamily: "'Archivo', sans-serif" }}>{value}</p>
              <p className="text-white/40 text-[10px] font-medium mt-0.5">{label}</p>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Bottom card */}
      <div className="bg-white px-5 pt-6 pb-6 rounded-t-[32px] -mt-6 shadow-[0_-8px_32px_rgba(0,0,0,0.08)]">
        <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-[3px] text-center mb-4">
          {lang === 'hi' ? 'लॉगिन करें' : lang === 'gu' ? 'લૉગ ઇન કરો' : 'Get Started'}
        </p>

        <motion.button whileTap={{ scale: 0.97 }} onClick={() => setView('driver-login')} className="w-full mb-3">
          <div className="flex items-center gap-4 p-4 rounded-2xl text-white shadow-lg active:scale-[0.98] transition-transform"
            style={{ background: '#E10600', boxShadow: '0 8px 24px rgba(225,6,0,0.3)' }}>
            <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Gauge className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 text-left">
              <div className="font-black text-[16px]" style={{ fontFamily: "'Archivo', sans-serif" }}>
                {lang === 'hi' ? 'चालक लॉगिन' : lang === 'gu' ? 'ડ્રાઇવર લૉગિન' : 'Driver Login'}
              </div>
              <div className="text-[12px] text-white/75">
                {lang === 'hi' ? 'ईंधन भरना रिकॉर्ड करें' : lang === 'gu' ? 'ઇંધણ ભરવાનું રેકોર્ડ કરો' : 'Record fuel fills & track trips'}
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          </div>
        </motion.button>

        <motion.button whileTap={{ scale: 0.97 }} onClick={() => setView('owner-login')} className="w-full mb-3">
          <div className="flex items-center gap-4 p-4 rounded-2xl text-white shadow-lg active:scale-[0.98] transition-transform"
            style={{ background: '#111827', boxShadow: '0 8px 24px rgba(17,24,39,0.3)' }}>
            <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 text-left">
              <div className="font-black text-[16px]" style={{ fontFamily: "'Archivo', sans-serif" }}>
                {lang === 'hi' ? 'मालिक लॉगिन' : lang === 'gu' ? 'માલિક લૉગિન' : 'Owner Login'}
              </div>
              <div className="text-[12px] text-white/70">
                {lang === 'hi' ? 'फ्लीट प्रबंधन और क्रेडिट' : lang === 'gu' ? 'ફ્લીટ મેનેજમેન્ટ અને ક્રેડિટ' : 'Manage fleet, credit & reports'}
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          </div>
        </motion.button>

        <div className="flex items-center justify-center gap-1.5 mt-1">
          <p className="text-[12px] text-[#6B7280]">
            {lang === 'hi' ? 'नए चालक हैं?' : lang === 'gu' ? 'નવા ડ્રાઇવર છો?' : 'New driver?'}
          </p>
          <button onClick={() => setView('driver-signup')} className="text-[#E10600] hover:text-[#c20000] text-[12px] font-bold transition-colors py-2">
            {lang === 'hi' ? 'खाता बनाएं' : lang === 'gu' ? 'એકાઉન્ટ બનાવો' : 'Create free account'}
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function DriverLogin({ lang, setView, setSession }: { lang: Language; setView: (v: View) => void; setSession: (s: any) => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)

  const handleLogin = async (pinOverride?: string) => {
    const pin = pinOverride ?? code
    if (!pin || pin.length !== 4) {
      setError(lang === 'hi' ? '4-अंक का पिन दर्ज करें' : lang === 'gu' ? '4-અંકનો પિન દાખલ કરો' : 'Enter your 4-digit PIN')
      setShake(true)
      setTimeout(() => { setError(''); setShake(false) }, 2500)
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await firestoreSync.loginDriver(pin)
      if (res.success && res.driver) {
        if (res.token) {
          sessionStorage.setItem('cng_jwt_token', res.token)
        }
        const sessionObj = { role: 'driver' as Role, userId: res.driver.id, ownerId: res.driver.ownerId, name: res.driver.name }
        storage.setSession(sessionObj)
        setSession(sessionObj)
        setView('driver-dash')
        return
      } else {
        // Try local fallback if backend unavailable
        const localDrivers = storage.getDrivers()
        const localMatch = localDrivers.find((d: any) => String(d.code) === String(pin))
        if (localMatch) {
          const sessionObj = { role: 'driver' as Role, userId: localMatch.id, ownerId: localMatch.ownerId, name: localMatch.name }
          storage.setSession(sessionObj)
          setSession(sessionObj)
          setView('driver-dash')
          return
        }
        setError(res.error || t('invalidCode', lang))
        setShake(true)
        setCode('')
        setTimeout(() => { setError(''); setShake(false) }, 2500)
      }
    } catch (err) {
      // Backend down — try local drivers
      const localDrivers = storage.getDrivers()
      const localMatch = localDrivers.find((d: any) => String(d.code) === String(pin))
      if (localMatch) {
        const sessionObj = { role: 'driver' as Role, userId: localMatch.id, ownerId: localMatch.ownerId, name: localMatch.name }
        storage.setSession(sessionObj)
        setSession(sessionObj)
        setView('driver-dash')
        return
      }
      setError(t('connectionFailed', lang))
      setShake(true)
      setCode('')
      setTimeout(() => { setError(''); setShake(false) }, 2500)
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (digit: string) => {
    if (code.length < 4) {
      const next = code + digit
      setCode(next)
      if (next.length === 4) {
        setTimeout(() => handleLogin(next), 120)
      }
    }
  }

  const handleDelete = () => {
    setCode(prev => prev.slice(0, -1))
  }

  const keys: { d: string; sub?: string }[] = [
    { d: '1', sub: '' }, { d: '2', sub: 'ABC' }, { d: '3', sub: 'DEF' },
    { d: '4', sub: 'GHI' }, { d: '5', sub: 'JKL' }, { d: '6', sub: 'MNO' },
    { d: '7', sub: 'PQRS' }, { d: '8', sub: 'TUV' }, { d: '9', sub: 'WXYZ' },
    { d: 'blank' }, { d: '0' }, { d: 'del' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col h-[calc(100dvh-3.5rem)] overflow-hidden bg-[#F5F6F8]"
    >
      {/* Dark top section */}
      <div className="bg-[#111827] flex-1 flex flex-col items-center justify-center px-6 pb-6 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '20px 20px', pointerEvents: 'none' }} />
        <button
          onClick={() => setView('welcome')}
          className="absolute top-6 left-5 text-white/50 hover:text-white/80 text-sm font-medium flex items-center gap-1.5 transition-colors"
        >
          ← {lang === 'hi' ? 'वापस' : lang === 'gu' ? 'પાછળ' : 'Back'}
        </button>

        <div className="relative z-10 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#E10600] flex items-center justify-center mx-auto mb-5 shadow-lg shadow-[#E10600]/30">
            <Gauge className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-white font-black text-2xl mb-1" style={{ fontFamily: "'Archivo', sans-serif", letterSpacing: '-0.02em' }}>
            {lang === 'hi' ? 'चालक लॉगिन' : lang === 'gu' ? 'ડ્રાઇવર લૉગિન' : 'Driver Login'}
          </h2>
          <p className="text-white/50 text-sm font-medium">
            {lang === 'hi' ? '4-अंक का कोड दर्ज करें' : lang === 'gu' ? '4-અંકનો કોડ દાખલ કરો' : 'Enter your 4-digit PIN'}
          </p>

          {/* PIN dot indicators */}
          <motion.div
            animate={shake ? { x: [0, -8, 8, -8, 8, 0] } : {}}
            transition={{ duration: 0.4 }}
            className="flex items-center justify-center gap-4 mt-8"
          >
            {[0,1,2,3].map(i => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                  i < code.length
                    ? 'bg-[#E10600] border-[#E10600] scale-110'
                    : 'bg-transparent border-white/30'
                }`}
              />
            ))}
          </motion.div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-[#ff6b6b] text-[12px] font-semibold mt-3"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* White PIN pad */}
      <div className="bg-white rounded-t-[32px] -mt-6 shadow-[0_-8px_32px_rgba(0,0,0,0.08)] px-8 pt-7 pb-6">
        <div className="grid grid-cols-3 gap-x-6 gap-y-3.5 mb-5 max-w-[300px] mx-auto">
          {keys.map((key, i) => {
            if (key.d === 'blank') return <div key={i} />
            const isDelete = key.d === 'del'
            return (
              <motion.button
                key={i}
                onClick={() => isDelete ? handleDelete() : handleKey(key.d)}
                disabled={loading}
                whileTap={{ scale: 0.82 }}
                transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                className={`h-[68px] w-[68px] mx-auto rounded-full flex flex-col items-center justify-center select-none transition-colors ${
                  isDelete
                    ? 'bg-transparent text-[#6B7280] active:bg-[#F5F6F8]'
                    : 'bg-[#F5F6F8] text-[#111827] active:bg-[#FDE8E8] active:text-[#E10600]'
                }`}
              >
                {isDelete ? (
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                    <line x1="18" y1="9" x2="12" y2="15" /><line x1="12" y1="9" x2="18" y2="15" />
                  </svg>
                ) : (
                  <>
                    <span className="text-[26px] font-bold leading-none" style={{ fontFamily: "'Archivo', sans-serif" }}>{key.d}</span>
                    {key.sub !== undefined && (
                      <span className="text-[8px] font-semibold tracking-[0.15em] text-[#9CA3AF] mt-0.5 h-2">{key.sub}</span>
                    )}
                  </>
                )}
              </motion.button>
            )
          })}
        </div>

        <button
          onClick={() => handleLogin()}
          disabled={loading}
          className="w-full h-14 text-white font-black text-base rounded-2xl transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
          style={{
            fontFamily: "'Archivo', sans-serif",
            background: '#E10600',
            color: 'white',
            boxShadow: '0 4px 16px rgba(225,6,0,0.3)'
          }}
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {lang === 'hi' ? 'जाँच हो रही है...' : lang === 'gu' ? 'ચકાસી રહ્યા છીએ...' : 'Verifying...'}
            </>
          ) : (
            lang === 'hi' ? 'लॉगिन करें' : lang === 'gu' ? 'લૉગ ઇન કરો' : 'Login'
          )}
        </button>
      </div>
    </motion.div>
  )
}

function DriverSignup({ lang, setView, setSession }: { lang: Language; setView: (v: View) => void; setSession: (s: any) => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)
  const [devOtp, setDevOtp] = useState('')   // DEV builds only: on-screen code when backend is unreachable
  const timerRef = useRef<any>(null)

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  const startResendTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setResendTimer(60)
    timerRef.current = setInterval(() => {
      setResendTimer(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); timerRef.current = null; return 0 }
        return prev - 1
      })
    }, 1000)
  }

  const tx = (en: string, hi: string, gu: string) => lang === 'hi' ? hi : lang === 'gu' ? gu : en

  // Step 1 → send verification email
  const handleSendOTP = async () => {
    setError('')
    const cleanName = sanitizeInput(name)
    const cleanEmail = sanitizeInput(email).toLowerCase()
    const cleanPhone = sanitizeInput(phone).replace(/\D/g, '')
    if (!cleanName || cleanName.length < 3) { setError(tx('Enter your full name', 'अपना पूरा नाम दर्ज करें', 'તમારું પૂરું નામ દાખલ કરો')); return }
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) { setError(tx('Enter a valid 10-digit mobile number', 'मान्य 10-अंकीय मोबाइल नंबर दर्ज करें', 'માન્ય 10-અંકનો મોબાઇલ નંબર દાખલ કરો')); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { setError(tx('Enter a valid email address', 'मान्य ईमेल पता दर्ज करें', 'માન્ય ઇમેઇલ સરનામું દાખલ કરો')); return }
    // Duplicate check (local)
    const existing = storage.getDrivers()
    if (existing.some((d: any) => (d.email || '').toLowerCase() === cleanEmail)) {
      setError(tx('An account with this email already exists', 'इस ईमेल से खाता पहले से मौजूद है', 'આ ઇમેઇલ સાથે એકાઉન્ટ પહેલેથી અસ્તિત્વમાં છે')); return
    }
    // DEV builds only: backend unreachable → generate an on-screen code so the flow stays testable.
    // Production builds always require the real verification email.
    const tryDevFallback = (): boolean => {
      if (!import.meta.env.DEV) return false
      const code = String(Math.floor(100000 + Math.random() * 900000))
      setDevOtp(code)
      startResendTimer()
      setStep(2)
      return true
    }

    setLoading(true)
    try {
      const res = await firestoreSync.sendOTP(cleanEmail)
      if (res.success) {
        setDevOtp('')
        startResendTimer()
        setStep(2)
      } else {
        if ((res as any).offline && tryDevFallback()) return
        setError(res.error || tx('Could not send verification email. Try again.', 'सत्यापन ईमेल नहीं भेजा जा सका। पुनः प्रयास करें।', 'ચકાસણી ઇમેઇલ મોકલી શકાયો નથી. ફરી પ્રયાસ કરો.'))
      }
    } catch {
      if (tryDevFallback()) return
      setError(tx('Connection failed. Check your internet.', 'कनेक्शन विफल। अपना इंटरनेट जांचें।', 'કનેક્શન નિષ્ફળ. તમારું ઇન્ટરનેટ તપાસો.'))
    } finally {
      setLoading(false)
    }
  }

  // Step 2 → verify email code
  const handleVerifyOTP = async () => {
    setError('')
    if (otp.length !== 6) { setError(tx('Enter the 6-digit code from your email', 'अपने ईमेल से 6-अंकीय कोड दर्ज करें', 'તમારા ઇમેઇલમાંથી 6-અંકનો કોડ દાખલ કરો')); return }
    // DEV builds only: verify against the on-screen code
    if (import.meta.env.DEV && devOtp) {
      if (otp === devOtp) { setStep(3) } else { setError(tx('Invalid or expired code', 'अमान्य या समाप्त कोड', 'અમાન્ય અથવા સમાપ્ત કોડ')) }
      return
    }
    setLoading(true)
    try {
      const res = await firestoreSync.verifyOTP(sanitizeInput(email).toLowerCase(), otp)
      if (res.success) {
        setStep(3)
      } else {
        setError(res.error || tx('Invalid or expired code', 'अमान्य या समाप्त कोड', 'અમાન્ય અથવા સમાપ્ત કોડ'))
      }
    } catch {
      setError(tx('Verification failed. Try again.', 'सत्यापन विफल। पुनः प्रयास करें।', 'ચકાસણી નિષ્ફળ. ફરી પ્રયાસ કરો.'))
    } finally {
      setLoading(false)
    }
  }

  // Step 3 → set PIN, create account
  const handleCreateAccount = () => {
    setError('')
    if (!/^\d{4}$/.test(pin)) { setError(tx('PIN must be exactly 4 digits', 'पिन ठीक 4 अंकों का होना चाहिए', 'પિન બરાબર 4 અંકનો હોવો જોઈએ')); return }
    if (pin !== pinConfirm) { setError(tx('PINs do not match', 'पिन मेल नहीं खाते', 'પિન મેળ ખાતા નથી')); return }
    const existing = storage.getDrivers()
    if (existing.some((d: any) => String(d.code) === pin)) {
      setError(tx('This PIN is taken. Choose another.', 'यह पिन लिया गया है। दूसरा चुनें।', 'આ પિન લેવાયો છે. બીજો પસંદ કરો.')); return
    }
    const newDriver: any = {
      id: 'd_' + Date.now(),
      name: sanitizeInput(name),
      phone: sanitizeInput(phone).replace(/\D/g, ''),
      email: sanitizeInput(email).toLowerCase(),
      emailVerified: true,
      code: pin,
      ownerId: null,            // independent driver — no fleet yet
      assignedVehicleId: null,
      selfSignup: true,
      createdAt: new Date().toISOString(),
    }
    storage.saveDrivers([...existing, newDriver])
    firestoreSync.post({ action: 'registerDriver', ...newDriver }).catch(() => {})
    const sessionObj = { role: 'driver' as Role, userId: newDriver.id, ownerId: newDriver.ownerId, name: newDriver.name }
    storage.setSession(sessionObj)
    setSession(sessionObj)
    setView('driver-dash')
  }

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-6 pt-12 max-w-[480px] mx-auto w-full">
      <button onClick={() => { if (step > 1) { setStep((step - 1) as any); setError('') } else { setView('welcome') } }} className="mb-8 text-[#6B7280] hover:text-[#111827]">← {t('back', lang)}</button>

      <div className="text-center mb-6">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#E10600] flex items-center justify-center shadow-lg shadow-[#E10600]/20">
          <Users className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-[24px] font-bold text-[#111827]">
          {tx('Create Driver Account', 'चालक खाता बनाएं', 'ડ્રાઇવર એકાઉન્ટ બનાવો')}
        </h2>
        <div className="flex items-center justify-center gap-2 mt-3">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step >= s ? 'bg-[#E10600] text-white' : 'bg-[#E5E7EB] text-[#9CA3AF]'}`}>{s}</div>
              {s < 3 && <div className={`w-6 h-0.5 transition-all ${step > s ? 'bg-[#E10600]' : 'bg-[#E5E7EB]'}`} />}
            </div>
          ))}
        </div>
        <p className="text-xs text-[#6B7280] mt-2">
          {step === 1 ? tx('Your details', 'आपका विवरण', 'તમારી વિગતો')
            : step === 2 ? tx('Verify your email', 'अपना ईमेल सत्यापित करें', 'તમારો ઇમેઇલ ચકાસો')
            : tx('Set your login PIN', 'अपना लॉगिन पिन सेट करें', 'તમારો લૉગિન પિન સેટ કરો')}
        </p>
      </div>

      {error && <p className="text-[#DC2626] bg-[#FEE2E2] p-3 rounded-xl text-[12px] font-medium mb-3">{error}</p>}

      <div className="space-y-3">
        {step === 1 && (
          <>
            <input value={name} onChange={e => setName(e.target.value)} placeholder={tx('Full name', 'पूरा नाम', 'પૂરું નામ')} disabled={loading}
              className="w-full h-[52px] px-4 bg-white border border-[#E2E6EB] rounded-xl text-[15px] focus:border-[#E10600] focus:outline-none disabled:opacity-60" />
            <input value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" placeholder={tx('Mobile number', 'मोबाइल नंबर', 'મોબાઇલ નંબર')} disabled={loading}
              className="w-full h-[52px] px-4 bg-white border border-[#E2E6EB] rounded-xl text-[15px] focus:border-[#E10600] focus:outline-none disabled:opacity-60" />
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('emailAddress', lang)} disabled={loading}
              className="w-full h-[52px] px-4 bg-white border border-[#E2E6EB] rounded-xl text-[15px] focus:border-[#E10600] focus:outline-none disabled:opacity-60" />
            <button onClick={handleSendOTP} disabled={loading}
              className="w-full h-[52px] bg-[#E10600] text-white font-semibold rounded-xl mt-2 hover:bg-[#c20000] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{tx('Sending code...', 'कोड भेजा जा रहा है...', 'કોડ મોકલી રહ્યા છીએ...')}</>
              ) : (
                `${t('continue', lang)} →`
              )}
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-xl p-3 text-center">
              <p className="text-[13px] text-[#B91C1C] font-medium">{tx('Verification code sent to', 'सत्यापन कोड भेजा गया', 'ચકાસણી કોડ મોકલવામાં આવ્યો')}</p>
              <p className="text-[13px] text-[#991B1B] font-bold">{email}</p>
            </div>
            {import.meta.env.DEV && devOtp && (
              <div className="bg-[#FEF3C7] border border-[#FCD34D] rounded-xl p-3 text-center">
                <p className="text-[11px] text-[#92400E] font-bold uppercase tracking-wide">Dev mode — backend offline</p>
                <p className="text-[18px] text-[#92400E] font-black font-mono tracking-[0.3em] mt-1">{devOtp}</p>
              </div>
            )}
            <input type="text" inputMode="numeric" maxLength={6} value={otp} autoFocus
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && handleVerifyOTP()}
              placeholder={t('enterOtp', lang)}
              className="w-full h-[52px] px-4 bg-white border border-[#E2E6EB] rounded-xl text-[20px] text-center tracking-[0.4em] font-mono focus:border-[#E10600] focus:outline-none" />
            <button onClick={handleVerifyOTP} disabled={loading || otp.length !== 6}
              className="w-full h-[52px] bg-[#E10600] text-white font-semibold rounded-xl mt-2 hover:bg-[#c20000] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{t('verifying', lang)}</>
              ) : (
                tx('Verify Email', 'ईमेल सत्यापित करें', 'ઇમેઇલ ચકાસો')
              )}
            </button>
            <div className="text-center mt-1">
              {resendTimer > 0 ? (
                <p className="text-xs text-[#6B7280]">{t('resendCodeIn', lang).replace('{time}', resendTimer.toString())}</p>
              ) : (
                <button onClick={handleSendOTP} disabled={loading} className="text-xs text-[#E10600] hover:text-[#c20000] font-semibold disabled:opacity-50">
                  {t('didNotReceiveOtp', lang)}
                </button>
              )}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl p-3 text-center">
              <p className="text-[13px] text-[#166534] font-medium">✓ {tx('Email verified', 'ईमेल सत्यापित', 'ઇમેઇલ ચકાસાયેલ')}</p>
            </div>
            <input type="password" inputMode="numeric" maxLength={4} value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder={tx('Choose 4-digit PIN', '4-अंकीय पिन चुनें', '4-અંકનો પિન પસંદ કરો')}
              className="w-full h-[52px] px-4 bg-white border border-[#E2E6EB] rounded-xl text-[20px] text-center tracking-[0.4em] font-mono focus:border-[#E10600] focus:outline-none" />
            <input type="password" inputMode="numeric" maxLength={4} value={pinConfirm}
              onChange={e => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onKeyDown={e => e.key === 'Enter' && handleCreateAccount()}
              placeholder={tx('Confirm PIN', 'पिन की पुष्टि करें', 'પિનની પુષ્ટિ કરો')}
              className="w-full h-[52px] px-4 bg-white border border-[#E2E6EB] rounded-xl text-[20px] text-center tracking-[0.4em] font-mono focus:border-[#E10600] focus:outline-none" />
            <button onClick={handleCreateAccount} disabled={loading || pin.length !== 4 || pinConfirm.length !== 4}
              className="w-full h-[52px] bg-[#E10600] text-white font-semibold rounded-xl mt-2 hover:bg-[#c20000] active:scale-[0.98] transition-all disabled:opacity-50">
              {tx('Create Account', 'खाता बनाएं', 'એકાઉન્ટ બનાવો')}
            </button>
            <p className="text-[11px] text-[#9CA3AF] text-center leading-relaxed">
              {tx('You will use this PIN to log in as a driver.', 'आप इस पिन से चालक के रूप में लॉगिन करेंगे।', 'તમે આ પિનથી ડ્રાઇવર તરીકે લૉગિન કરશો.')}
            </p>
          </>
        )}

        <div className="mt-6 pt-6 border-t border-[#E2E6EB] text-center">
          <p className="text-[14px] text-[#6B7280]">
            {tx('Already have an account?', 'पहले से खाता है?', 'પહેલેથી એકાઉન્ટ છે?')}{' '}
            <button onClick={() => setView('driver-login')} className="text-[#E10600] hover:text-[#c20000] font-medium">
              {t('login', lang)}
            </button>
          </p>
        </div>
      </div>
    </motion.div>
  )
}

function OwnerLogin({ lang, setView, setSession }: { lang: Language; setView: (v: View) => void; setSession: (s: any) => void }) {
  const [step, setStep] = useState<1 | 2>(1)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [otp, setOtp] = useState('')
  const [resendTimer, setResendTimer] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<any>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const startResendTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setResendTimer(60)
    timerRef.current = setInterval(() => {
      setResendTimer(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          timerRef.current = null
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const handleVerifyCredentials = async () => {
    const cleanEmail = sanitizeInput(email).toLowerCase()
    const cleanPassword = sanitizeInput(password)
    if (!cleanEmail || !cleanPassword) {
      setError(t('emailPassRequired', lang))
      return
    }
    // Local fallback — backend unreachable: verify credentials against locally stored owner record.
    // Real credential check (email + password must match); OTP is skipped because email cannot be sent offline.
    const tryLocalLogin = (): boolean => {
      const owners = storage.getOwners()
      const match = owners.find((o: any) =>
        (o.email || '').toLowerCase() === cleanEmail && o.password === cleanPassword
      )
      if (match) {
        const sessionObj = { role: 'owner' as Role, userId: match.id, ownerId: match.id, name: match.name }
        storage.setSession(sessionObj)
        setSession(sessionObj)
        setView('owner-dash')
        return true
      }
      return false
    }

    setLoading(true)
    setError('')
    try {
      const credRes = await firestoreSync.loginOwner(cleanEmail, cleanPassword)
      if (!credRes.success) {
        if ((credRes as any).offline && tryLocalLogin()) return
        setError(credRes.error || t('invalidCredentials', lang))
        return
      }
      const otpRes = await firestoreSync.sendLoginOTP(cleanEmail)
      if (!otpRes.success) {
        if ((otpRes as any).offline && tryLocalLogin()) return
        setError(otpRes.error || t('failedSendOtp', lang))
        return
      }
      startResendTimer()
      setStep(2)
    } catch (e: any) {
      if (tryLocalLogin()) return
      setError(t('login', lang) + ' error: ' + e.toString())
    } finally {
      setLoading(false)
    }
  }

  const handleResendOTP = async () => {
    const cleanEmail = sanitizeInput(email).toLowerCase()
    setLoading(true)
    setError('')
    try {
      const res = await firestoreSync.sendLoginOTP(cleanEmail)
      if (res.success) {
        startResendTimer()
      } else {
        setError(res.error || t('failedResendOtp', lang))
      }
    } catch (e: any) {
      setError('Error: ' + e.toString())
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOTP = async () => {
    const cleanEmail = sanitizeInput(email).toLowerCase()
    if (!otp || otp.length !== 6) {
      setError(t('enterOtpSent', lang))
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await firestoreSync.loginOwnerWithOTP(cleanEmail, otp)
      if (res.success && res.owner) {
        if (res.token) {
          sessionStorage.setItem('cng_jwt_token', res.token)
        }
        const sessionObj = { role: 'owner' as Role, userId: res.owner.id, ownerId: res.owner.id, name: res.owner.name }
        storage.setSession(sessionObj)
        setSession(sessionObj)
        setView('owner-dash')
      } else {
        setError(res.error || t('otpInvalidError', lang))
      }
    } catch (e: any) {
      setError(t('verificationFailed', lang) + e.toString())
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-6 pt-12">
      <button onClick={() => { if (step === 2) { setStep(1); setOtp(''); setError('') } else { setView('welcome') } }} className="mb-8 text-[#6B7280] hover:text-[#111827]">← {t('back', lang)}</button>

      <div className="text-center mb-6">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#3B82F6] flex items-center justify-center shadow-lg shadow-[#3B82F6]/20">
          <BarChart3 className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-[24px] font-bold text-[#111827]">
          {t('owner', lang)} {t('login', lang)}
        </h2>
        <div className="flex items-center justify-center gap-2 mt-3">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step >= 1 ? 'bg-[#3B82F6] text-white' : 'bg-[#E5E7EB] text-[#9CA3AF]'}`}>1</div>
          <div className={`w-8 h-0.5 transition-all ${step >= 2 ? 'bg-[#3B82F6]' : 'bg-[#E5E7EB]'}`} />
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step >= 2 ? 'bg-[#3B82F6] text-white' : 'bg-[#E5E7EB] text-[#9CA3AF]'}`}>2</div>
        </div>
        <p className="text-xs text-[#6B7280] mt-1">
          {step === 1 ? t('enterCredentials', lang) : t('otpSentTo', lang).replace('{email}', email)}
        </p>
      </div>

      {error && <p className="text-[#DC2626] bg-[#FEE2E2] p-3 rounded-xl text-[12px] font-medium mb-3">{error}</p>}

      <div className="space-y-3">
        {step === 1 && (
          <>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleVerifyCredentials()}
              placeholder={t('emailAddress', lang)}
              disabled={loading}
              className="w-full h-[52px] px-4 bg-white border border-[#E2E6EB] rounded-xl text-[15px] focus:border-[#3B82F6] focus:outline-none disabled:opacity-60"
            />
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleVerifyCredentials()}
                placeholder={t('password', lang)}
                disabled={loading}
                className="w-full h-[52px] pl-4 pr-12 bg-white border border-[#E2E6EB] rounded-xl text-[15px] focus:border-[#3B82F6] focus:outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#111827] focus:outline-none disabled:opacity-50"
                disabled={loading}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <button
              onClick={handleVerifyCredentials}
              disabled={loading}
              className="w-full h-[52px] bg-[#3B82F6] text-white font-semibold rounded-xl mt-2 hover:bg-[#2563EB] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t('verifyingAndSending', lang)}
                </>
              ) : (
                `${t('continue', lang)} →`
              )}
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl p-3 text-center">
              <p className="text-[13px] text-[#1D4ED8] font-medium">
                {t('otpSentToText', lang)}
              </p>
              <p className="text-[13px] text-[#1E40AF] font-bold">{email}</p>
            </div>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && handleVerifyOTP()}
              placeholder={t('enterOtp', lang)}
              autoFocus
              className="w-full h-[52px] px-4 bg-white border border-[#E2E6EB] rounded-xl text-[20px] text-center tracking-[0.4em] font-mono focus:border-[#3B82F6] focus:outline-none"
            />
            <button
              onClick={handleVerifyOTP}
              disabled={loading || otp.length !== 6}
              className="w-full h-[52px] bg-[#3B82F6] text-white font-semibold rounded-xl mt-2 hover:bg-[#2563EB] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t('verifying', lang)}
                </>
              ) : (
                t('verifySignIn', lang)
              )}
            </button>
            <div className="text-center mt-1">
              {resendTimer > 0 ? (
                <p className="text-xs text-[#6B7280]">
                  {t('resendCodeIn', lang).replace('{time}', resendTimer.toString())}
                </p>
              ) : (
                <button
                  onClick={handleResendOTP}
                  disabled={loading}
                  className="text-xs text-[#3B82F6] hover:text-[#2563EB] font-semibold disabled:opacity-50"
                >
                  {t('didNotReceiveOtp', lang)}
                </button>
              )}
            </div>
          </>
        )}

        <div className="mt-6 pt-6 border-t border-[#E2E6EB] text-center">
          <p className="text-[14px] text-[#6B7280]">
            {t('dontHaveAccount', lang)}{' '}
            <button onClick={() => setView('owner-register')} className="text-[#3B82F6] hover:text-[#2563EB] font-medium">
              {t('register', lang)}
            </button>
          </p>
        </div>
      </div>
    </motion.div>
  )
}

function AdminLogin({ lang, setView, setSession }: { lang: Language; setView: (v: View) => void; setSession: (s: any) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    const cleanEmail = sanitizeInput(email).trim().toLowerCase()
    const cleanPassword = sanitizeInput(password)
    if (!cleanEmail || !cleanPassword) {
      setError(t('emailPassRequired', lang))
      return
    }
    // Local fallback — backend unreachable: verify against locally stored admin record (seeded in dev)
    const tryLocalAdminLogin = (): boolean => {
      try {
        const admins = JSON.parse(localStorage.getItem('cng_admins') || '[]')
        const match = admins.find((a: any) =>
          (a.email || '').toLowerCase() === cleanEmail && a.password === cleanPassword
        )
        if (match) {
          const sessionObj = { role: 'admin' as Role, userId: match.id, ownerId: 'admin', name: match.name }
          storage.setSession(sessionObj)
          setSession(sessionObj)
          setView('admin-dash')
          return true
        }
      } catch {}
      return false
    }

    setLoading(true)
    setError('')
    try {
      const res = await firestoreSync.loginAdmin(cleanEmail, cleanPassword)
      if (res.success && res.admin) {
        if (res.token) {
          sessionStorage.setItem('cng_jwt_token', res.token)
        }
        const sessionObj = { role: 'admin' as Role, userId: res.admin.id, ownerId: 'admin', name: res.admin.name }
        storage.setSession(sessionObj)
        setSession(sessionObj)
        setView('admin-dash')
      } else {
        if ((res as any).offline && tryLocalAdminLogin()) return
        setError(res.error || t('invalidAdminCredentials', lang))
      }
    } catch (err) {
      if (tryLocalAdminLogin()) return
      setError(t('connectionFailed', lang))
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-6 pt-12">
      <button onClick={() => setView('welcome')} className="mb-8 text-[#6B7280] hover:text-[#111827]">← {t('back', lang)}</button>
      
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
          placeholder={t('adminEmailPlaceholder', lang)}
          disabled={loading}
          className="w-full h-[52px] px-4 bg-white border border-[#E2E6EB] rounded-xl text-[15px] focus:border-[#8B5CF6] focus:outline-none disabled:opacity-60"
        />
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder={t('password', lang)}
            disabled={loading}
            className="w-full h-[52px] pl-4 pr-12 bg-white border border-[#E2E6EB] rounded-xl text-[15px] focus:border-[#8B5CF6] focus:outline-none disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#111827] focus:outline-none disabled:opacity-50"
            disabled={loading}
          >
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>
        {error && <p className="text-[12px] text-[#991B1B] text-center font-medium">{error}</p>}
        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full h-[52px] bg-[#8B5CF6] text-white font-semibold rounded-xl mt-2 hover:bg-[#7C3AED] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {t('loggingIn', lang)}
            </>
          ) : (
            t('login', lang)
          )}
        </button>
      </div>
    </motion.div>
  )
}
