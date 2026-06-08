import type { Fill } from './types'
import { storage } from './storage'

export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzUpsxThHu-3tE509FcKe6TyMRsqXX2k6t7_F-FPjN7P6dD6j4ZWyBmCwNxjUX59tu2gA/exec'

export const googleSync = {
  enabled: true,
  isSyncingQueue: false,

  async post(payload: any): Promise<any> {
    if (!this.enabled) return { success: false, error: 'Sync disabled' }
    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          clientId: storage.getClientId(),
          ...payload
        })
      })
      const text = await response.text()
      return JSON.parse(text)
    } catch (err: any) {
      console.error('Sync request failed:', err)
      return { success: false, error: err.toString() }
    }
  },

  async uploadMedia(blob: Blob, fileName: string, folderName: string): Promise<string> {
    const localUrl = await blobToBase64(blob)
    if (!this.enabled) return localUrl

    try {
      const base64Data = localUrl.split(',')[1] || localUrl
      const parts = folderName.split('_')
      const vehiclePlate = parts.slice(0, -1).join('_') || parts[0] || 'Unassigned'
      const fillDate = parts[parts.length - 1] || new Date().toISOString().split('T')[0]

      const result = await this.post({
        action: 'uploadMedia',
        fileName,
        vehiclePlate,
        fillDate,
        mimeType: blob.type || 'image/jpeg',
        base64Data
      })

      if (result.success && result.fileUrl) {
        return result.fileUrl
      }
      return localUrl
    } catch {
      return localUrl
    }
  },

  async saveFill(fill: Fill): Promise<boolean> {
    const payload = {
      action: 'addFill',
      id: fill.id,
      vehicleId: fill.vehicleId,
      driverId: fill.driverId,
      time: fill.time,
      station: fill.station,
      kgs: fill.kgs,
      rate: fill.rate,
      total: fill.total,
      videoUrl: fill.videoUrl,
      pumpPhotoUrl: fill.pumpPhotoUrl,
      receiptPhotoUrl: fill.receiptPhotoUrl,
      odoPhotoUrl: fill.odoPhotoUrl,
      pumpGPS: fill.pumpGPS ? `${fill.pumpGPS.lat},${fill.pumpGPS.lng}` : '',
      receiptGPS: fill.receiptGPS ? `${fill.receiptGPS.lat},${fill.receiptGPS.lng}` : '',
      odoGPS: fill.odoGPS ? `${fill.odoGPS.lat},${fill.odoGPS.lng}` : '',
      odoReading: fill.odoReading,
      distanceDiff: fill.distanceDiff,
      mismatch: fill.mismatch,
      fuelDropPercent: fill.fuelDropPercent,
      ownerId: fill.ownerId,
      verified: fill.verified,
      pendingVehicleApproval: fill.pendingVehicleApproval || false,
    }

    const result = await this.post(payload)

    if (result.success && (fill.mismatch || fill.fuelDropPercent > 20)) {
      const alertPayload = {
        action: 'addAlert',
        time: fill.time,
        event: fill.mismatch 
          ? (fill.distanceDiff === -1 ? 'GPS coordinates missing' : `Location mismatch: ${Math.round(fill.distanceDiff)}m`) 
          : `Fuel drop ${fill.fuelDropPercent.toFixed(1)}%`,
        user: fill.driverId,
        type: fill.mismatch ? 'location_mismatch' : 'fuel_drop',
        ownerId: fill.ownerId,
        severity: 'high'
      }
      await this.post(alertPayload).catch(() => {})
    }

    return result.success === true
  },

  async syncOfflineQueue(): Promise<void> {
    if (!this.enabled || !navigator.onLine || this.isSyncingQueue) return

    this.isSyncingQueue = true
    try {
      const queue = storage.getOfflineQueue()
      if (queue.length === 0) return

      const succeededIds = new Set<string>()
      for (const fill of queue) {
        const success = await this.saveFill(fill)
        if (success) succeededIds.add(fill.id)
      }

      const currentQueue = storage.getOfflineQueue()
      const remainingQueue = currentQueue.filter(fill => !succeededIds.has(fill.id))
      localStorage.setItem('cng_offline_queue', JSON.stringify(remainingQueue))
    } finally {
      this.isSyncingQueue = false
    }
  },

  async fetchAllData(): Promise<any> {
    return this.post({ action: 'getData' })
  },

  async sendOTP(email: string): Promise<{ success: boolean; error?: string }> {
    const result = await this.post({ action: 'sendOTP', email })
    return { success: result.success === true, error: result.error }
  },

  async verifyOTP(email: string, otp: string): Promise<{ success: boolean; error?: string }> {
    const result = await this.post({ action: 'verifyOTP', email, otp })
    return { success: result.success === true, error: result.error }
  },

  async registerOwner(owner: any): Promise<boolean> {
    const result = await this.post({ action: 'registerOwner', ...owner })
    return result.success === true
  },

  async loginOwner(email: string, password: string): Promise<{ success: boolean; owner?: any; error?: string }> {
    const result = await this.post({ action: 'loginOwner', email, password })
    return { success: result.success === true, owner: result.owner, error: result.error }
  },

  async addDriver(driver: any): Promise<boolean> {
    const result = await this.post({ action: 'addDriver', ...driver })
    return result.success !== false
  },

  async updateDriver(driver: any): Promise<boolean> {
    const payload: any = { action: 'updateDriver', id: driver.id }
    if (driver.code !== undefined) payload.code = driver.code
    if (driver.assignedVehicleId !== undefined) payload.assignedVehicleId = driver.assignedVehicleId
    const result = await this.post(payload)
    return result.success === true
  },

  async addVehicle(vehicle: any): Promise<boolean> {
    const result = await this.post({ action: 'addVehicle', ...vehicle })
    return result.success !== false
  },

  async updateOdometer(vehicleId: string, odo: number): Promise<boolean> {
    const result = await this.post({
      action: 'updateVehicleOdometer',
      vehicleId,
      odometer: odo
    })
    return result.success === true
  },

  async deleteDriver(driverId: string): Promise<boolean> {
    const result = await this.post({ action: 'deleteDriver', id: driverId })
    return result.success !== false
  },

  async deleteVehicle(vehicleId: string): Promise<boolean> {
    const result = await this.post({ action: 'deleteVehicle', id: vehicleId })
    return result.success !== false
  },

  async updateOwner(ownerId: string, updates: any): Promise<boolean> {
    const result = await this.post({
      action: 'updateOwner',
      ownerId,
      ...updates
    })
    return result.success === true
  },

  async addPaymentEntry(entry: any): Promise<{ success: boolean; id?: string }> {
    const result = await this.post({
      action: 'addPaymentEntry',
      ...entry,
      date: entry.date || new Date().toISOString().split('T')[0]
    })
    return { success: result.success === true, id: result.id }
  },

  async getOwnerPayments(ownerId: string): Promise<any[]> {
    const result = await this.post({
      action: 'getOwnerPayments',
      ownerId
    })
    return result.success ? result.payments || [] : []
  },

  async addAlert(alert: any): Promise<{ success: boolean; id?: string }> {
    const result = await this.post({
      action: 'addAlert',
      ...alert,
      time: alert.time || new Date().toISOString()
    })
    return { success: result.success === true, id: result.id }
  },

  async resolveAlert(alertId: string, data: any): Promise<boolean> {
    const result = await this.post({
      action: 'resolveAlert',
      alertId,
      ...data
    })
    return result.success === true
  },

  async updateFill(fillId: string, updates: any): Promise<boolean> {
    const result = await this.post({
      action: 'updateFill',
      fillId,
      ...updates
    })
    return result.success === true
  },

  async updateVehicle(vehicleId: string, updates: any): Promise<boolean> {
    const result = await this.post({
      action: 'updateVehicle',
      vehicleId,
      ...updates
    })
    return result.success === true
  },

  async addCreditAction(action: any): Promise<{ success: boolean; id?: string }> {
    const result = await this.post({
      action: 'addCreditAction',
      ...action
    })
    return { success: result.success === true, id: result.id }
  },

  async updateCreditAction(actionId: string, status: 'approved' | 'rejected', approvedBy: string): Promise<boolean> {
    const result = await this.post({
      action: 'updateCreditAction',
      actionId,
      status,
      approvedBy
    })
    return result.success === true
  },

  async getOwnerStats(ownerId: string, period: 'today' | 'week' | 'month' = 'month'): Promise<any> {
    const result = await this.post({
      action: 'getOwnerStats',
      ownerId,
      period
    })
    return result.success ? result.stats : null
  },

  async getVehicleStats(vehicleId: string): Promise<any> {
    const result = await this.post({
      action: 'getVehicleStats',
      vehicleId
    })
    return result.success ? result.stats : null
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    googleSync.syncOfflineQueue()
  })
}
