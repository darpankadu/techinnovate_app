import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Fuel, Video, Camera, Receipt, Gauge, 
  MapPin, AlertTriangle, CheckCircle2, 
  Car, Users, BarChart3, Shield, 
  LogOut, Plus, Trash2, X, Play,
  Pause, RotateCcw, Check, Globe, Upload
} from 'lucide-react'
import { storage, calculateDistance } from './lib/storage'
import { googleSync, APPS_SCRIPT_URL } from './lib/googleSync'
import { t } from './lib/translations'
import type { Language, Role, Driver, Owner, Vehicle, Fill, Alert, CameraCapture, CreditAction, PaymentEntry } from './lib/types'
import { OwnerRegister } from './components/OwnerRegister'
import { DriverDashboard } from './components/DriverDashboard'
import { FillWizard } from './components/FillWizard'
import { OwnerDashboard } from './components/OwnerDashboard'
import { AdminDashboard } from './components/AdminDashboard'

type View = 'welcome' | 'driver-login' | 'owner-login' | 'owner-register' | 'admin-login' | 'driver-dash' | 'owner-dash' | 'admin-dash' | 'wizard'

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

  const loadDataFromBackend = async () => {
    if (!session || (session.role !== 'owner' && session.role !== 'admin')) {
      setSyncStatus('synced')
      setSyncKey(k => k + 1)
      return
    }
    
    setSyncStatus('syncing')
    try {
      const result = await googleSync.fetchAllData()
      if (result && result.success) {
        if (result.owners) storage.saveOwners(result.owners)
        if (result.drivers) storage.saveDrivers(result.drivers)
        if (result.vehicles) storage.saveVehicles(result.vehicles)
        if (result.fills) storage.saveFills(result.fills)
        if (result.alerts) storage.saveAlerts(result.alerts)
        if (result.paymentEntries) storage.savePaymentEntries(result.paymentEntries)
        if (result.creditActions) storage.saveCreditActions(result.creditActions)
        setSyncStatus('synced')
        setSyncKey(k => k + 1)
      } else {
        console.error('Fetch all data error:', result?.error)
        setSyncStatus('failed')
      }
    } catch (err) {
      console.error('Fetch all data exception:', err)
      setSyncStatus('failed')
    }
  }

  useEffect(() => {
    // Rely exclusively on localStorage for persistent sessions across tabs
    const savedSession = storage.getSession()
    if (savedSession) {
      setSession(savedSession)
      if (savedSession.role === 'driver') setView('driver-dash')
      else if (savedSession.role === 'owner') setView('owner-dash')
      else if (savedSession.role === 'admin') setView('admin-dash')
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

  // Periodic sync effect for owner/admin sessions
  useEffect(() => {
    if (!session || (session.role !== 'owner' && session.role !== 'admin')) return

    loadDataFromBackend()
    const interval = setInterval(() => {
      loadDataFromBackend()
    }, 15000)

    return () => clearInterval(interval)
  }, [session])

  useEffect(() => {
    const savedLang = storage.getLanguage() as Language
    if (savedLang && savedLang !== lang) {
      setLang(savedLang)
    }
  }, [syncKey])

  // Real-time Driver Tracking (only active during a trip)
  useEffect(() => {
    if (!session || session.role !== 'driver' || !navigator.geolocation) return

    let watchId: number = 0

    const updateLocation = (latitude: number, longitude: number) => {
      const currentDrivers = storage.getDrivers()
      const currentDriver = currentDrivers.find(d => String(d.id) === String(session.userId))
      const ownerId = currentDriver?.ownerId || session.ownerId
      const locKey = `cng_driver_location_${session.userId}`
      localStorage.setItem(locKey, JSON.stringify({
        driverId: session.userId,
        driverName: session.name,
        ownerId,
        lat: latitude,
        lng: longitude,
        lastUpdated: new Date().toISOString()
      }))
      // Dispatch storage event so other tabs detect the update
      window.dispatchEvent(new Event('storage'))
      // Update local state
      setLiveLocations(prev => {
        const filtered = prev.filter((l: any) => l.driverId !== session.userId)
        return [...filtered, { driverId: session.userId, driverName: session.name, ownerId, lat: latitude, lng: longitude, lastUpdated: new Date().toISOString() }]
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
  }, [session, syncKey])

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
          <img src="/logo-techinnovate.png" alt="Techinnovate" className="h-12 mx-auto mb-3" />
          <p className="text-[13px] text-[#6B7280]">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F6F8] text-[#111827] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#F5F6F8] border-b border-[#E2E6EB]">
        <div className={`mx-auto px-4 h-14 flex items-center justify-between ${view === 'admin-dash' || view === 'owner-dash' ? 'max-w-full px-6' : 'max-w-[480px]'}`}>
          <img src="/logo-techinnovate.png" alt="Techinnovate" className="h-8" />
          
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
          {view === 'driver-dash' && session && <DriverDashboard lang={lang} session={session} setView={setView} syncKey={syncKey} key="driver-dashboard" />}
          {view === 'wizard' && session && <FillWizard lang={lang} session={session} setView={setView} syncKey={syncKey} key="fill-wizard" />}
          {view === 'owner-dash' && session && <OwnerDashboard lang={lang} session={session} syncKey={syncKey} key="owner-dashboard" loadData={loadDataFromBackend} liveLocations={liveLocations} />}
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
        <img src="/logo-techinnovate.png" alt="Techinnovate" className="w-48 mx-auto mb-6" />
        <p className="text-[#6B7280] text-[15px]">Fleet CNG Monitoring System</p>
      </div>

      <div className="space-y-3">
        <span className="block text-[13px] font-medium text-[#6B7280] tracking-wide uppercase text-center">
          {lang === 'hi' ? 'à¤¡à¥à¤°à¤¾à¤‡à¤µà¤° à¤²à¥‰à¤—à¤¿à¤¨' : lang === 'gu' ? 'àª¡à«àª°àª¾àª‡àªµàª° àª²à«‰àª—àª¿àª¨' : 'Driver Login'}
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
              <div className="font-bold text-[19px]">{lang === 'hi' ? 'à¤¡à¥à¤°à¤¾à¤‡à¤µà¤°' : lang === 'gu' ? 'àª¡à«àª°àª¾àª‡àªµàª°' : 'Driver'}</div>
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
          {lang === 'hi' ? 'à¤®à¤¾à¤²à¤¿à¤• à¤²à¥‰à¤—à¤¿à¤¨' : lang === 'gu' ? 'àª®àª¾àª²àª¿àª• àª²à«‰àª—àª¿àª¨' : 'Owner Login'}
        </button>
        <span className="text-[#D1D5DB] mx-1.5 text-[10px]">|</span>
        <button onClick={() => setView('admin-login')} className="text-[#9CA3AF] hover:text-[#6B7280] text-[11px] transition-colors">
          {lang === 'hi' ? 'à¤à¤¡à¤®à¤¿à¤¨ à¤²à¥‰à¤—à¤¿à¤¨' : lang === 'gu' ? 'àªàª¡àª®àª¿àª¨ àª²à«‰àª—àª¿àª¨' : 'Admin Login'}
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
      <button onClick={() => setView('welcome')} className="mb-8 text-[#6B7280] hover:text-[#111827]">â† Back</button>
      
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
            placeholder="â€¢â€¢â€¢â€¢"
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
  const [step, setStep] = useState<1 | 2>(1)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
      setError('Email and password are required')
      return
    }
    setLoading(true)
    setError('')
    try {
      const credRes = await googleSync.loginOwner(cleanEmail, cleanPassword)
      if (!credRes.success) {
        setError(credRes.error || 'Invalid email or password')
        return
      }
      const otpRes = await googleSync.sendLoginOTP(cleanEmail)
      if (!otpRes.success) {
        setError(otpRes.error || 'Failed to send OTP. Please try again.')
        return
      }
      startResendTimer()
      setStep(2)
    } catch (e: any) {
      setError('Login error: ' + e.toString())
    } finally {
      setLoading(false)
    }
  }

  const handleResendOTP = async () => {
    const cleanEmail = sanitizeInput(email).toLowerCase()
    setLoading(true)
    setError('')
    try {
      const res = await googleSync.sendLoginOTP(cleanEmail)
      if (res.success) {
        startResendTimer()
      } else {
        setError(res.error || 'Failed to resend OTP')
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
      setError('Please enter the 6-digit OTP sent to your email')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await googleSync.loginOwnerWithOTP(cleanEmail, otp)
      if (res.success && res.owner) {
        if (res.token) {
          sessionStorage.setItem('cng_jwt_token', res.token)
        }
        const sessionObj = { role: 'owner' as Role, userId: res.owner.id, ownerId: res.owner.id, name: res.owner.name }
        storage.setSession(sessionObj)
        setSession(sessionObj)
        setView('owner-dash')
      } else {
        setError(res.error || 'Invalid or expired OTP. Please try again.')
      }
    } catch (e: any) {
      setError('Verification failed: ' + e.toString())
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-6 pt-12">
      <button onClick={() => { if (step === 2) { setStep(1); setOtp(''); setError('') } else { setView('welcome') } }} className="mb-8 text-[#6B7280] hover:text-[#111827]">â† Back</button>

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
          {step === 1 ? 'Enter your credentials' : `OTP sent to ${email}`}
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
              placeholder="Email Address"
              disabled={loading}
              className="w-full h-[52px] px-4 bg-white border border-[#E2E6EB] rounded-xl text-[15px] focus:border-[#3B82F6] focus:outline-none disabled:opacity-60"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleVerifyCredentials()}
              placeholder="Password"
              disabled={loading}
              className="w-full h-[52px] px-4 bg-white border border-[#E2E6EB] rounded-xl text-[15px] focus:border-[#3B82F6] focus:outline-none disabled:opacity-60"
            />
            <button
              onClick={handleVerifyCredentials}
              disabled={loading}
              className="w-full h-[52px] bg-[#3B82F6] text-white font-semibold rounded-xl mt-2 hover:bg-[#2563EB] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Verifying & Sending OTP...
                </>
              ) : (
                'Continue â†’'
              )}
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl p-3 text-center">
              <p className="text-[13px] text-[#1D4ED8] font-medium">
                ðŸ“§ A 6-digit OTP has been sent to
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
              placeholder="Enter 6-digit OTP"
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
                  Verifying...
                </>
              ) : (
                'Verify & Sign In ðŸ”“'
              )}
            </button>
            <div className="text-center mt-1">
              {resendTimer > 0 ? (
                <p className="text-xs text-[#6B7280]">Resend OTP in {resendTimer}s</p>
              ) : (
                <button
                  onClick={handleResendOTP}
                  disabled={loading}
                  className="text-xs text-[#3B82F6] hover:text-[#2563EB] font-semibold disabled:opacity-50"
                >
                  Didn't receive? Resend OTP
                </button>
              )}
            </div>
          </>
        )}

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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

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
      <button onClick={() => setView('welcome')} className="mb-8 text-[#6B7280] hover:text-[#111827]">â† Back</button>
      
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
