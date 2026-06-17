import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Car, Camera, Fuel, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { storage } from '../lib/storage'
import { googleSync } from '../lib/googleSync'
import { t } from '../lib/translations'
import type { Language } from '../lib/types'
import { CameraModal } from './CameraModal'

export function DriverDashboard({ 
  lang, 
  session, 
  setView, 
  syncKey 
}: { 
  lang: Language; 
  session: any; 
  setView: (v: any) => void; 
  syncKey?: number 
}) {
  const drivers = storage.getDrivers()
  const driver = drivers.find(d => String(d.id) === String(session.userId))
  const vehicles = storage.getVehicles()
  const vehicle = driver?.assignedVehicleId
    ? vehicles.find(v => v.plate === driver.assignedVehicleId || String(v.id) === String(driver.assignedVehicleId))
    : null
  const fills = storage.getFills().filter(f => f.driverId === session.userId)

  // Trip Tracking States
  const [activeTrip, setActiveTrip] = useState<any>(() => {
    try {
      return JSON.parse(localStorage.getItem(`cng_active_trip_${session.userId}`) || 'null')
    } catch {
      return null
    }
  })

  const hasCompletedTripToday = (() => {
    try {
      const allTrips = storage.getTrips()
      return allTrips.some((t: any) => 
        t.driverId === session.userId && 
        t.status === 'completed' && 
        new Date(t.end.time).toDateString() === new Date().toDateString()
      )
    } catch { return false }
  })()

  const [odoInput, setOdoInput] = useState('')
  const [odoPhoto, setOdoPhoto] = useState<string>('')
  const [isSubmittingTrip, setIsSubmittingTrip] = useState(false)
  const [tripFormMode, setTripFormMode] = useState<'idle' | 'start' | 'end'>('idle')
  const [showTripCamera, setShowTripCamera] = useState<'start' | 'end' | null>(null)

  // Listen to trip state changes from refueling wizard or other actions
  useEffect(() => {
    const handleTripStateChange = () => {
      try {
        const active = JSON.parse(localStorage.getItem(`cng_active_trip_${session.userId}`) || 'null')
        setActiveTrip(active)
      } catch (e) {
        console.error('Error loading active trip state:', e)
      }
    }
    window.addEventListener('trip_state_changed', handleTripStateChange)
    return () => window.removeEventListener('trip_state_changed', handleTripStateChange)
  }, [session.userId])

  const handleStartTrip = async () => {
    if (!vehicle) return
    const odoNum = parseInt(odoInput)
    if (isNaN(odoNum) || odoNum < vehicle.currentOdo) {
      alert(`Odometer reading must be at least ${vehicle.currentOdo} km`)
      return
    }

    setIsSubmittingTrip(true)
    const tripId = 'trip_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
    
    // Attempt to get GPS coordinates
    let startGPS = null
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) => {
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 })
      })
      startGPS = { lat: pos.coords.latitude, lng: pos.coords.longitude }
    } catch (err) {
      console.warn('GPS reading failed for trip start', err)
    }

    // Upload odometer photo to Google Drive
    let odoPhotoUrl = odoPhoto || '';
    if (odoPhoto && odoPhoto.startsWith('data:')) {
      try {
        const timestamp = Date.now();
        const fillDate = new Date().toISOString().split('T')[0];
        const folderName = `${vehicle.plate}_${fillDate}`;
        odoPhotoUrl = await googleSync.uploadMedia(odoPhoto, `trip_start_odo_${timestamp}.jpg`, folderName);
      } catch (err) {
        console.error('Failed to upload start trip odometer photo:', err);
      }
    }

    const tripObj = {
      id: tripId,
      driverId: session.userId,
      driverName: session.name,
      vehicleId: vehicle.plate,
      ownerId: session.ownerId,
      status: 'active',
      start: {
        time: new Date().toISOString(),
        odoReading: odoNum,
        odoPhotoUrl: odoPhotoUrl,
        gps: startGPS
      },
      end: null,
      refuelIds: [],
      distanceKms: 0,
      fuelConsumedKgs: 0
    }

    // Save trip to localStorage
    const allTrips = storage.getTrips()
    allTrips.push(tripObj)
    storage.saveTrips(allTrips)
    
    // GPS location stored in localStorage for owner GPS tab
    if (startGPS) {
      localStorage.setItem(`cng_driver_location_${session.userId}`, JSON.stringify({
        driverId: session.userId,
        driverName: session.name,
        ownerId: session.ownerId,
        lat: startGPS.lat,
        lng: startGPS.lng,
        lastUpdated: new Date().toISOString()
      }))
      window.dispatchEvent(new Event('storage'))
    }

    localStorage.setItem(`cng_active_trip_${session.userId}`, JSON.stringify(tripObj))
    window.dispatchEvent(new Event('trip_state_changed'))
    setActiveTrip(tripObj)
    setTripFormMode('idle')
    setOdoInput('')
    setOdoPhoto('')
    setIsSubmittingTrip(false)
  }

  const handleEndTrip = async () => {
    if (!vehicle || !activeTrip) return
    const odoNum = parseInt(odoInput)
    if (isNaN(odoNum) || odoNum <= activeTrip.start.odoReading) {
      alert(`Ending odometer must be greater than starting odometer (${activeTrip.start.odoReading} km)`)
      return
    }

    setIsSubmittingTrip(true)

    // Attempt to get GPS coordinates
    let endGPS = null
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) => {
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 })
      })
      endGPS = { lat: pos.coords.latitude, lng: pos.coords.longitude }
    } catch (err) {
      console.warn('GPS reading failed for trip end', err)
    }

    // Upload odometer photo to Google Drive
    let odoPhotoUrl = odoPhoto || '';
    if (odoPhoto && odoPhoto.startsWith('data:')) {
      try {
        const timestamp = Date.now();
        const fillDate = new Date().toISOString().split('T')[0];
        const folderName = `${vehicle.plate}_${fillDate}`;
        odoPhotoUrl = await googleSync.uploadMedia(odoPhoto, `trip_end_odo_${timestamp}.jpg`, folderName);
      } catch (err) {
        console.error('Failed to upload end trip odometer photo:', err);
      }
    }

    // Accumulate total fuel consumed during this trip
    const tripFills = fills.filter(f => f.time >= activeTrip.start.time)
    const fuelConsumed = tripFills.reduce((sum, f) => sum + f.kgs, 0)
    const distance = odoNum - activeTrip.start.odoReading

    const completedTrip = {
      ...activeTrip,
      status: 'completed',
      end: {
        time: new Date().toISOString(),
        odoReading: odoNum,
        odoPhotoUrl: odoPhotoUrl,
        gps: endGPS
      },
      refuelIds: tripFills.map(f => f.id),
      distanceKms: distance,
      fuelConsumedKgs: fuelConsumed
    }

    // Save completed trip to localStorage
    const allTrips = storage.getTrips()
    const tripIdx = allTrips.findIndex((t: any) => t.id === completedTrip.id)
    if (tripIdx >= 0) allTrips[tripIdx] = completedTrip
    else allTrips.push(completedTrip)
    storage.saveTrips(allTrips)

    // Update Odometer in localStorage
    const allVehicles = storage.getVehicles()
    storage.saveVehicles(allVehicles.map(v => String(v.id) === String(vehicle.id) ? { ...v, currentOdo: odoNum } : v))

    localStorage.removeItem(`cng_driver_location_${session.userId}`)
    window.dispatchEvent(new Event('storage'))

    localStorage.removeItem(`cng_active_trip_${session.userId}`)
    window.dispatchEvent(new Event('trip_state_changed'))
    setActiveTrip(null)
    setTripFormMode('idle')
    setOdoInput('')
    setOdoPhoto('')
    setIsSubmittingTrip(false)
  }

  const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-5">
      <div className="mb-6 flex justify-between items-start">
        <div>
          <p className="text-[#6B7280] text-[13px] mb-1">{t('welcome', lang)},</p>
          <h1 className="text-[28px] font-bold tracking-tight text-[#111827]">{session.name}</h1>
        </div>
      </div>

      {/* Driver Assignment Checks */}
      {!vehicle ? (
        <div className="p-6 rounded-[20px] bg-[#FEF3C7] border border-[#FDE68A] text-center mb-6">
          <Car className="w-10 h-10 text-[#D97706] mx-auto mb-3" />
          <h3 className="font-bold text-[16px] text-[#92400E] mb-1">No Assigned Vehicle</h3>
          <p className="text-[13px] text-[#B45309]">Please wait for the Fleet Owner to assign a vehicle to your account.</p>
        </div>
      ) : tripFormMode === 'start' ? (
        /* START TRIP FORM MODE */
        <div className="p-5 rounded-[20px] bg-white border border-[#E2E6EB] shadow-sm mb-6 space-y-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-[18px] text-[#111827]">🏁 Start New Trip</h3>
            <button onClick={() => { setTripFormMode('idle'); setOdoInput(''); setOdoPhoto('') }} className="text-[12px] text-[#6B7280] hover:text-[#111827]">Cancel</button>
          </div>
          <div>
            <label className="text-[11px] text-[#6B7280] uppercase tracking-wider block mb-1">Starting Odometer (KM)</label>
            <input
              type="number"
              value={odoInput}
              onChange={e => setOdoInput(e.target.value)}
              placeholder={`Min ${vehicle.currentOdo} km`}
              className="w-full h-12 px-4 border border-[#E2E6EB] rounded-xl text-[16px]"
            />
          </div>
          <div>
            <label className="text-[11px] text-[#6B7280] uppercase tracking-wider block mb-1.5">Odometer Photo</label>
            <button
              type="button"
              onClick={() => setShowTripCamera('start')}
              className="w-full h-11 bg-white border border-[#E2E6EB] hover:bg-[#F5F6F8] rounded-xl text-[13px] font-medium text-[#4B5563] flex items-center justify-center gap-2"
            >
              <Camera className="w-4 h-4 text-[#6B7280]" />
              Capture Odometer (Live Photo)
            </button>
            {odoPhoto && (
              <img src={odoPhoto} alt="Odo preview" className="w-32 h-20 object-cover rounded-lg border border-[#E2E6EB] mt-2" />
            )}
          </div>
          <button
            onClick={handleStartTrip}
            disabled={!odoInput || !odoPhoto || isSubmittingTrip}
            className="w-full h-12 bg-[#E10600] text-white font-bold rounded-xl disabled:opacity-50 text-[14px]"
          >
            {isSubmittingTrip ? 'Starting Trip...' : 'Confirm Start Trip'}
          </button>
        </div>
      ) : tripFormMode === 'end' ? (
        /* END TRIP FORM MODE */
        <div className="p-5 rounded-[20px] bg-white border border-[#E2E6EB] shadow-sm mb-6 space-y-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-[18px] text-[#111827]">🛑 End Active Trip</h3>
            <button onClick={() => { setTripFormMode('idle'); setOdoInput(''); setOdoPhoto('') }} className="text-[12px] text-[#6B7280] hover:text-[#111827]">Cancel</button>
          </div>
          <div>
            <label className="text-[11px] text-[#6B7280] uppercase tracking-wider block mb-1">Ending Odometer (KM)</label>
            <input
              type="number"
              value={odoInput}
              onChange={e => setOdoInput(e.target.value)}
              placeholder={`Min ${activeTrip.start.odoReading + 1} km`}
              className="w-full h-12 px-4 border border-[#E2E6EB] rounded-xl text-[16px]"
            />
          </div>
          <div>
            <label className="text-[11px] text-[#6B7280] uppercase tracking-wider block mb-1.5">Odometer Photo</label>
            <button
              type="button"
              onClick={() => setShowTripCamera('end')}
              className="w-full h-11 bg-white border border-[#E2E6EB] hover:bg-[#F5F6F8] rounded-xl text-[13px] font-medium text-[#4B5563] flex items-center justify-center gap-2"
            >
              <Camera className="w-4 h-4 text-[#6B7280]" />
              Capture Odometer (Live Photo)
            </button>
            {odoPhoto && (
              <img src={odoPhoto} alt="Odo preview" className="w-32 h-20 object-cover rounded-lg border border-[#E2E6EB] mt-2" />
            )}
          </div>
          <button
            onClick={handleEndTrip}
            disabled={!odoInput || !odoPhoto || isSubmittingTrip}
            className="w-full h-12 bg-[#111827] text-white font-bold rounded-xl disabled:opacity-50 text-[14px]"
          >
            {isSubmittingTrip ? 'Ending Trip...' : 'Confirm End Trip'}
          </button>
        </div>
      ) : !activeTrip ? (
        /* NO ACTIVE TRIP - IDLE DASHBOARD */
        <div className="space-y-6">
          <div className="p-5 rounded-[20px] bg-white border border-[#E2E6EB] shadow-sm">
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

          {/* START TRIP BUTTON */}
          {hasCompletedTripToday && (
            <div className="p-4 rounded-[20px] bg-emerald-50 border border-emerald-200 text-center">
              <h3 className="text-emerald-800 font-bold text-[16px] mb-1">Trip Completed</h3>
              <p className="text-emerald-700 text-[13px]">You have completed a trip today. You can start a new trip below if needed.</p>
            </div>
          )}
          
          <button
            onClick={() => setTripFormMode('start')}
            className="w-full bg-[#E10600] text-white rounded-[20px] shadow-lg shadow-[#E10600]/25 hover:shadow-xl transition-all p-4 flex items-center justify-center gap-3 mt-3"
          >
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <span className="text-[18px]">🏁</span>
            </div>
            <span className="text-[18px] font-bold">Start New Trip</span>
          </button>
        </div>
      ) : (
        /* TRIP IS ACTIVE STATE */
        <div className="space-y-6">
          {/* Trip Status Card */}
          <div className="p-5 rounded-[20px] bg-emerald-50 border border-emerald-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-emerald-800 uppercase tracking-wider font-semibold">🟢 Trip in Progress</span>
              <span className="text-[11px] text-emerald-700">{new Date(activeTrip.start.time).toLocaleTimeString()}</span>
            </div>
            <p className="text-[18px] font-mono font-bold text-[#111827]">{vehicle.plate}</p>
            <p className="text-[13px] text-emerald-800 mt-1">Started at: <strong>{activeTrip.start.odoReading} km</strong></p>
          </div>

          {/* Action Buttons: Fuel Wizard & End Trip */}
          <div className="space-y-3">
            {/* CNG Refuel Button */}
            <button
              onClick={() => setView('wizard')}
              className="w-full bg-[#E10600] text-white rounded-[20px] shadow-lg shadow-[#E10600]/25 hover:shadow-xl transition-all p-4 flex items-center justify-center gap-3"
            >
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <Fuel className="w-5 h-5 text-white" />
              </div>
              <span className="text-[18px] font-bold">{t('startFill', lang)}</span>
            </button>

            {/* End Trip Button */}
            <button
              onClick={() => setTripFormMode('end')}
              className="w-full bg-[#111827] text-white rounded-[20px] shadow-lg hover:shadow-xl transition-all p-4 flex items-center justify-center gap-3"
            >
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <span className="text-[18px]">🛑</span>
              </div>
              <span className="text-[18px] font-bold">End Trip</span>
            </button>
          </div>
        </div>
      )}

      <div className="mt-8">
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

      {showTripCamera && (
        <CameraModal
          mode="photo"
          title="Odometer Capture"
          onCapture={(cap) => {
            setOdoPhoto(cap.dataUrl)
            setShowTripCamera(null)
          }}
          onClose={() => setShowTripCamera(null)}
          lang={lang}
        />
      )}
    </motion.div>
  )
}
