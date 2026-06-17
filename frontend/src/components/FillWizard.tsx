import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Camera, Receipt, Fuel, Gauge, 
  MapPin, AlertTriangle, CheckCircle2, 
  Upload, Check, Loader2, XCircle, X
} from 'lucide-react'
import { storage, calculateDistance } from '../lib/storage'
import { googleSync } from '../lib/googleSync'
import { t } from '../lib/translations'
import type { Language, CameraCapture, Fill } from '../lib/types'
import { CameraModal } from './CameraModal'

interface UploadStep {
  id: string
  name: string
  status: 'waiting' | 'uploading' | 'done' | 'failed'
}

export function FillWizard({ 
  lang, 
  session, 
  setView, 
  syncKey 
}: { 
  lang: Language
  session: any
  setView: (v: any) => void
  syncKey?: number 
}) {
  const [step, setStep] = useState(1)
  const [showCamera, setShowCamera] = useState<'video' | 'pump' | 'receipt' | 'odo' | null>(null)
  const [captures, setCaptures] = useState<Record<string, CameraCapture>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showVehicleWarning, setShowVehicleWarning] = useState(false)
  const [pendingVehicleSelection, setPendingVehicleSelection] = useState('')
  const [isScanningOCR, setIsScanningOCR] = useState<string | null>(null)

  // Upload progress overlay state
  const [uploadState, setUploadState] = useState<{
    active: boolean
    steps: UploadStep[]
  }>({
    active: false,
    steps: []
  })

  const vehicles = storage.getVehicles().filter(v => String(v.ownerId) === String(session.ownerId))
  const drivers = storage.getDrivers()
  const driver = drivers.find(d => String(d.id) === String(session.userId))
  
  // assignedVehicleId may store a plate OR an ID - find the vehicle and get its plate
  const assignedVehicle = driver?.assignedVehicleId 
    ? vehicles.find(v => String(v.plate) === String(driver.assignedVehicleId) || String(v.id) === String(driver.assignedVehicleId)) 
    : null
  const assignedPlate = assignedVehicle?.plate?.trim() || ''
  const defaultVeh = assignedVehicle || null

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

    // Trigger OCR scanning asynchronously in the background
    if (type === 'receipt') {
      setIsScanningOCR('receipt')
      googleSync.performOCR(capture.blob, 'receipt')
        .then(res => {
          if (res.success && res.parsed) {
            setForm(prev => ({
              ...prev,
              kgs: res.parsed.kgs !== null && res.parsed.kgs !== undefined ? String(res.parsed.kgs) : prev.kgs,
              rate: res.parsed.rate !== null && res.parsed.rate !== undefined ? String(res.parsed.rate) : prev.rate,
              odoReading: res.parsed.odometer !== null && res.parsed.odometer !== undefined ? String(res.parsed.odometer) : prev.odoReading,
            }))
          }
        })
        .catch(err => {
          console.error('Receipt OCR failed:', err)
        })
        .finally(() => {
          setIsScanningOCR(null)
        })
    } else if (type === 'odo') {
      setIsScanningOCR('odometer')
      googleSync.performOCR(capture.blob, 'odometer')
        .then(res => {
          if (res.success && res.parsed && res.parsed.odometer) {
            setForm(prev => ({
              ...prev,
              odoReading: String(res.parsed.odometer)
            }))
          }
        })
        .catch(err => {
          console.error('Odometer OCR failed:', err)
        })
        .finally(() => {
          setIsScanningOCR(null)
        })
    }

    if (step < 4) setStep(step + 1)
  }

  const handleFileUpload = async (type: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 1. Get GPS coordinates at the moment of upload
    let gpsCoords: { lat: number; lng: number } | undefined = undefined
    try {
      if (navigator.geolocation) {
        gpsCoords = await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve(undefined),
            { enableHighAccuracy: true, timeout: 5000 }
          );
        })
      }
    } catch (err) {
      console.warn('GPS fetching failed for file upload:', err)
    }

    // 2. Read file as DataURL (base64 representation)
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      const capture: CameraCapture = {
        blob: file,
        dataUrl,
        gps: gpsCoords,
        timestamp: Date.now()
      }
      
      // 3. Process capture
      await handleCapture(type, capture)
    }
    reader.onerror = (err) => {
      console.error('File reading failed:', err)
      alert('Failed to read the file.')
    }
    reader.readAsDataURL(file)
  }

  const total = parseFloat(form.kgs) * parseFloat(form.rate) || 0

  const handleSubmit = async () => {
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

    // Enforce credit limits and frozen accounts
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

    // Prevent odometer going backwards (tampering/data entry error)
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

    // Compare against actual last fill KGs, not arbitrary 80% of capacity
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

    // Create base Fill record
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
      odoReading: odoNum,
      distanceDiff, mismatch, fuelDropPercent,
      ownerId: session.ownerId,
      verified: false,
      pendingVehicleApproval: isDifferentVehicle,
    }
    const pendingApproval = fill.pendingVehicleApproval

    // Save initial fill record to localStorage immediately (safety first)
    const existingFills = storage.getFills()
    storage.saveFills([...existingFills, fill])

    // Set up step-by-step progress tracking
    const stepsToUpload: UploadStep[] = []
    if (captures.pump) stepsToUpload.push({ id: 'pump', name: 'Uploading Pump Photo', status: 'waiting' })
    if (captures.receipt) stepsToUpload.push({ id: 'receipt', name: 'Uploading Receipt Photo', status: 'waiting' })
    if (captures.odo) stepsToUpload.push({ id: 'odo', name: 'Uploading Odometer Photo', status: 'waiting' })
    if (captures.video) stepsToUpload.push({ id: 'video', name: 'Uploading Video Proof', status: 'waiting' })
    stepsToUpload.push({ id: 'save', name: 'Saving & Syncing', status: 'waiting' })

    setUploadState({
      active: true,
      steps: stepsToUpload
    })

    const updateStepStatus = (id: string, status: 'waiting' | 'uploading' | 'done' | 'failed') => {
      setUploadState(prev => ({
        ...prev,
        steps: prev.steps.map(s => s.id === id ? { ...s, status } : s)
      }))
    }

    // Process background steps sequentially, updating the user on progress
    let videoUrl = '', pumpUrl = '', receiptUrl = '', odoUrl = ''

    // 1. Pump Photo Upload
    if (captures.pump) {
      updateStepStatus('pump', 'uploading')
      try {
        pumpUrl = await googleSync.uploadMedia(captures.pump.blob, `pump_${timestamp}.jpg`, folderName)
        updateStepStatus('pump', 'done')
      } catch (err) {
        console.error('Pump upload error:', err)
        updateStepStatus('pump', 'failed')
      }
    }

    // 2. Receipt Photo Upload
    if (captures.receipt) {
      updateStepStatus('receipt', 'uploading')
      try {
        receiptUrl = await googleSync.uploadMedia(captures.receipt.blob, `receipt_${timestamp}.jpg`, folderName)
        updateStepStatus('receipt', 'done')
      } catch (err) {
        console.error('Receipt upload error:', err)
        updateStepStatus('receipt', 'failed')
      }
    }

    // 3. Odometer Photo Upload
    if (captures.odo) {
      updateStepStatus('odo', 'uploading')
      try {
        odoUrl = await googleSync.uploadMedia(captures.odo.blob, `odo_${timestamp}.jpg`, folderName)
        updateStepStatus('odo', 'done')
      } catch (err) {
        console.error('Odo upload error:', err)
        updateStepStatus('odo', 'failed')
      }
    }

    // 4. Video Upload
    if (captures.video) {
      updateStepStatus('video', 'uploading')
      try {
        videoUrl = await googleSync.uploadMedia(captures.video.blob, `video_${timestamp}.webm`, folderName)
        updateStepStatus('video', 'done')
      } catch (err) {
        console.error('Video upload error:', err)
        updateStepStatus('video', 'failed')
      }
    }

    // 5. Save fill updates, alert processing & sheet synchronization
    updateStepStatus('save', 'uploading')
    try {
      const updatedFill = { 
        ...fill, 
        videoUrl, 
        pumpPhotoUrl: pumpUrl, 
        receiptPhotoUrl: receiptUrl, 
        odoPhotoUrl: odoUrl 
      }
      const allFills = storage.getFills().map(f => f.id === fillId ? updatedFill : f)
      storage.saveFills(allFills)

      // Alert generation
      const alertsList = storage.getAlerts()
      if (mismatch) {
        const eventText = distanceDiff === -1
          ? 'GPS coordinates missing'
          : `Location mismatch: ${Math.round(distanceDiff)}m (threshold: ${locationMismatchDist}m)`
        alertsList.push({ 
          id: 'alert_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), 
          time: new Date().toISOString(), 
          event: eventText, 
          user: session.name, 
          type: 'location_mismatch', 
          ownerId: session.ownerId, 
          resolved: false 
        })
      }
      if (fuelDropPercent > fuelDropThreshold) {
        alertsList.push({ 
          id: 'alert_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), 
          time: new Date().toISOString(), 
          event: `Fuel drop ${fuelDropPercent.toFixed(1)}% vs last fill (threshold: ${fuelDropThreshold}%)`, 
          user: session.name, 
          type: 'fuel_drop', 
          ownerId: session.ownerId, 
          resolved: false 
        })
      }
      if (pendingApproval) {
        alertsList.push({ 
          id: 'alert_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), 
          time: new Date().toISOString(), 
          event: `Vehicle override: ${driver?.name || session.name} used ${vehicle.plate} instead of assigned vehicle (${assignedPlate})`, 
          user: session.name, 
          type: 'vehicle_override', 
          ownerId: session.ownerId, 
          resolved: false 
        })
      }
      storage.saveAlerts(alertsList)

      // Update vehicle odometer in storage
      const allVehicles = storage.getVehicles()
      storage.saveVehicles(allVehicles.map(v => 
        String(v.plate) === String(form.vehicleId) || String(v.id) === String(form.vehicleId) 
          ? { ...v, currentOdo: odoNum } 
          : v
      ))

      // Trigger sync
      try {
        await googleSync.saveFill(updatedFill)
      } catch (syncErr) {
        console.warn('Silent sync fills fail (will retry later):', syncErr)
      }

      updateStepStatus('save', 'done')
      setIsSubmitting(false)

      // Short delay for user satisfaction
      setTimeout(() => {
        setUploadState({ active: false, steps: [] })
        setView('driver-dash')
      }, 1500)

    } catch (err) {
      console.error('Submission finalization failed:', err)
      updateStepStatus('save', 'failed')
      setIsSubmitting(false)
      alert('Error saving details locally. Will proceed back to dashboard.')
      setTimeout(() => {
        setUploadState({ active: false, steps: [] })
        setView('driver-dash')
      }, 2500)
    }
  }

  const steps = [
    { id: 1, title: t('pumpPhoto', lang), icon: Camera, key: 'pump', done: !!captures.pump },
    { id: 2, title: t('receiptPhoto', lang), icon: Receipt, key: 'receipt', done: !!captures.receipt },
    { id: 3, title: t('manualDetails', lang), icon: Fuel, key: 'details', done: !!form.kgs && !!form.vehicleId },
    { id: 4, title: t('odometerPhoto', lang), icon: Gauge, key: 'odo', done: !!captures.odo },
  ]

  return (
    <>
      <div className="min-h-screen bg-[#F5F6F8] p-5">
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => setView('driver-dash')} className="text-[#6B7280] hover:text-[#111827]">← Cancel</button>
          <div className="text-center">
            <p className="text-[12px] text-[#6B7280]">Step {step} of 4</p>
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
                <div className="w-20 h-20 mx-auto mb-6 rounded-[24px] bg-[#DBEAFE] border border-[#BFDBFE] flex items-center justify-center">
                  <Camera className="w-10 h-10 text-[#3B82F6]" />
                </div>
                <h2 className="text-[24px] font-bold mb-2 text-[#111827]">{t('pumpPhoto', lang)}</h2>
                <p className="text-[#6B7280] mb-8 px-6">Capture the pump meter showing KGs and price clearly.</p>
                <button
                  onClick={() => setShowCamera('pump')}
                  className="w-full max-w-[280px] h-[56px] bg-[#3B82F6] rounded-2xl font-semibold flex items-center justify-center gap-2 mx-auto text-white"
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

            {step === 2 && (
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
                <div className="mt-4 flex flex-col items-center gap-3">
                  <span className="text-xs text-[#9CA3AF] uppercase font-bold tracking-wider">Or</span>
                  <label className="w-full max-w-[280px] h-[56px] bg-white border border-[#E5E7EB] text-[#4B5563] rounded-2xl font-semibold flex items-center justify-center gap-2 mx-auto cursor-pointer shadow-sm hover:bg-[#F9FAFB] transition-colors">
                    <Upload className="w-5 h-5 text-[#4B5563]" />
                    Upload Photo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload('receipt', e)}
                      className="hidden"
                    />
                  </label>
                </div>
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

            {step === 3 && (
              <div className="py-4">
                <h2 className="text-[24px] font-bold mb-6 text-center text-[#111827]">{t('manualDetails', lang)}</h2>
                {isScanningOCR === 'receipt' && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-center gap-2 text-blue-700 text-sm">
                    <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                    Auto-filling details from receipt scan...
                  </div>
                )}
                {isScanningOCR === 'odometer' && (
                  <div className="mb-4 p-3 bg-violet-50 border border-violet-200 rounded-xl flex items-center justify-center gap-2 text-violet-700 text-sm">
                    <Loader2 className="w-4 h-4 text-violet-600 animate-spin" />
                    Scanning odometer photo...
                  </div>
                )}
                <div className="space-y-4">
                  <div>
                    <label className="text-[12px] text-[#6B7280] uppercase tracking-wider mb-1.5 block">{t('vehicle', lang)}</label>
                    <select
                      value={form.vehicleId}
                      onChange={e => {
                        const val = e.target.value // This is now the plate
                        const selPlate = val?.trim() || ''
                        if (assignedPlate && selPlate && selPlate !== assignedPlate) {
                          setPendingVehicleSelection(val)
                          setShowVehicleWarning(true)
                        } else {
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
                    onClick={() => setStep(4)}
                    disabled={!form.kgs || !form.rate || !form.vehicleId}
                    className="w-full h-[56px] bg-[#3B82F6] text-white font-semibold rounded-2xl mt-4 disabled:opacity-50"
                  >
                    Continue to Odometer
                  </button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="text-center py-8">
                <div className="w-20 h-20 mx-auto mb-6 rounded-[24px] bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                  <Gauge className="w-10 h-10 text-violet-400" />
                </div>
                <h2 className="text-[24px] font-bold mb-2 text-[#111827]">{t('odometerPhoto', lang)}</h2>
                <p className="text-[#6B7280] mb-6 px-6">Capture odometer reading clearly.</p>
                
                <div className="max-w-[280px] mx-auto mb-4">
                  <input
                    type="number"
                    value={form.odoReading}
                    onChange={(e) => setForm({ ...form, odoReading: e.target.value })}
                    placeholder="Enter KM reading"
                    className="w-full h-[52px] px-4 bg-white border border-[#E2E6EB] rounded-xl text-center text-[18px] font-mono text-[#111827] focus:border-violet-500 focus:outline-none"
                  />
                </div>

                {isScanningOCR === 'odometer' && (
                  <div className="mb-4 p-3 bg-violet-50 border border-violet-200 rounded-xl flex items-center justify-center gap-2 text-violet-700 text-sm max-w-[280px] mx-auto">
                    <Loader2 className="w-4 h-4 text-violet-600 animate-spin" />
                    Scanning odometer photo...
                  </div>
                )}

                <button
                  onClick={() => setShowCamera('odo')}
                  className="w-full max-w-[280px] h-[52px] bg-violet-500 rounded-2xl font-semibold flex items-center justify-center gap-2 mx-auto mb-3 text-white"
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
                  className="w-full max-w-[280px] h-[56px] bg-[#10B981] text-white disabled:bg-[#E2E6EB] disabled:text-[#9CA3AF] rounded-2xl font-bold text-[17px] mt-8 mx-auto flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</>
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

      {/* Premium Media Uploading Status Overlay */}
      <AnimatePresence>
        {uploadState.active && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#0f172a]/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-slate-100 flex flex-col items-center"
            >
              {/* Spinning Ring Header */}
              <div className="relative mb-6 flex items-center justify-center">
                <div className="w-20 h-20 rounded-full border-4 border-slate-100 flex items-center justify-center">
                  <Loader2 className="w-10 h-10 text-[#3B82F6] animate-spin" />
                </div>
              </div>

              <h3 className="text-xl font-bold text-slate-900 mb-2 text-center">Uploading Refueling Proof</h3>
              <p className="text-sm text-slate-500 mb-6 text-center">
                Processing and syncing your log with Google Sheets. Please keep this tab open.
              </p>

              {/* Progress Steps List */}
              <div className="w-full space-y-4 mb-6 bg-slate-50 p-5 rounded-2xl border border-slate-100">
                {uploadState.steps.map((s, idx) => (
                  <div key={s.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono font-medium text-slate-400">0{idx + 1}</span>
                      <span className={`text-[14px] font-medium transition-colors duration-200 ${
                        s.status === 'uploading' ? 'text-[#3B82F6]' : 
                        s.status === 'done' ? 'text-slate-600' : 'text-slate-400'
                      }`}>
                        {s.name}
                      </span>
                    </div>

                    {/* Step Status Indicator Icon */}
                    <div>
                      {s.status === 'waiting' && (
                        <div className="w-5 h-5 rounded-full border-2 border-slate-200 bg-white" />
                      )}
                      {s.status === 'uploading' && (
                        <Loader2 className="w-5 h-5 text-[#3B82F6] animate-spin" />
                      )}
                      {s.status === 'done' && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 fill-emerald-50" />
                      )}
                      {s.status === 'failed' && (
                        <XCircle className="w-5 h-5 text-rose-500 fill-rose-50" />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 text-xs font-semibold text-amber-600 bg-amber-50 px-4 py-2.5 rounded-xl border border-amber-100/50 w-full justify-center">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Do not close this page or lock your phone.</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
