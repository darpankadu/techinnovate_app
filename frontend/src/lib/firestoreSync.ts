import type { Fill } from './types'
import { storage } from './storage'
import { translations } from './translations'

export const BACKEND_API_URL = (() => {
  const envUrl = import.meta.env.VITE_BACKEND_URL;
  const defaultUrl = 'http://localhost:8080/api/sync';
  
  if (typeof window === 'undefined' || !window.location) {
    return envUrl || defaultUrl;
  }

  const hostname = window.location.hostname;
  
  if (envUrl) {
    if ((envUrl.includes('localhost') || envUrl.includes('127.0.0.1')) && hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return envUrl.replace('localhost', hostname).replace('127.0.0.1', hostname);
    }
    return envUrl;
  }
  
  if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return `http://${hostname}:8080/api/sync`;
  }
  
  return defaultUrl;
})();

function getOfflineErrorMessage(): string {
  const lang = (storage.getLanguage() || 'en') as 'en' | 'hi' | 'gu';
  const t = translations[lang] || translations.en;
  return t.networkOffline || 'You are offline. Please check your internet connection.';
}

export const firestoreSync = {
  enabled: true,
  isSyncingQueue: false,
  // Backend outage tracking — log once per outage instead of spamming the console
  _outageLogged: false,

  async post(payload: any): Promise<any> {
    if (!this.enabled) return { success: false, error: 'Sync disabled' }

    // Check if browser is offline before attempting network request
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { success: false, error: getOfflineErrorMessage(), offline: true }
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'text/plain;charset=utf-8' };
      const token = sessionStorage.getItem('cng_jwt_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(BACKEND_API_URL, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers,
        body: JSON.stringify({
          clientId: storage.getClientId(),
          ...payload
        })
      })
      const text = await response.text()
      this._outageLogged = false
      return JSON.parse(text)
    } catch (err: any) {
      // Intercept network failures / fetch errors due to offline state
      const isOfflineErr = typeof navigator !== 'undefined' && (
        !navigator.onLine ||
        err.message?.includes('Failed to fetch') ||
        err.toString().includes('Failed to fetch') ||
        err.message?.includes('network') ||
        err.message?.includes('NetworkError')
      );

      // Log once per outage — not on every retry
      if (!this._outageLogged) {
        console.warn('[sync] Backend unreachable — app running in local mode. Will retry in background.')
        this._outageLogged = true
      }

      const errorMessage = isOfflineErr ? getOfflineErrorMessage() : err.toString();
      return { success: false, error: errorMessage, offline: true }
    }
  },

  async uploadMedia(blobOrBase64: Blob | string, fileName: string, folderName: string): Promise<string> {
    if (!this.enabled) {
      if (typeof blobOrBase64 === 'string') return blobOrBase64;
      return await blobToBase64(blobOrBase64);
    }

    try {
      let base64Data = '';
      let mimeType = 'image/jpeg';

      if (typeof blobOrBase64 === 'string') {
        base64Data = blobOrBase64.split(',')[1] || blobOrBase64;
        const mimeMatch = blobOrBase64.match(/^data:(.*?);base64,/);
        if (mimeMatch) mimeType = mimeMatch[1];
      } else {
        const localUrl = await blobToBase64(blobOrBase64);
        base64Data = localUrl.split(',')[1] || localUrl;
        mimeType = blobOrBase64.type || 'image/jpeg';
      }

      const parts = folderName.split('_');
      const vehiclePlate = parts.slice(0, -1).join('_') || parts[0] || 'Unassigned';
      const fillDate = parts[parts.length - 1] || new Date().toISOString().split('T')[0];

      const result = await this.post({
        action: 'uploadMedia',
        fileName,
        vehiclePlate,
        fillDate,
        mimeType,
        base64Data
      });

      if (result.success && result.fileUrl) {
        return result.fileUrl;
      }
      
      if (typeof blobOrBase64 === 'string') return blobOrBase64;
      return await blobToBase64(blobOrBase64);
    } catch (err) {
      console.error('Media upload failed, using local fallback:', err);
      if (typeof blobOrBase64 === 'string') return blobOrBase64;
      return await blobToBase64(blobOrBase64);
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

  async saveTrip(trip: any): Promise<boolean> {
    const result = await this.post({ action: 'saveTrip', ...trip })
    return result.success === true
  },

  async updateDriverLocation(loc: { driverId: string; driverName: string; ownerId: string; lat: number; lng: number }): Promise<boolean> {
    const result = await this.post({ action: 'updateDriverLocation', ...loc })
    return result.success === true
  },

  async deleteDriverLocation(driverId: string): Promise<boolean> {
    const result = await this.post({ action: 'deleteDriverLocation', driverId })
    return result.success === true
  },

  async sendOTP(email: string): Promise<{ success: boolean; error?: string; offline?: boolean }> {
    const result = await this.post({ action: 'sendOTP', email })
    return { success: result.success === true, error: result.error, offline: result.offline }
  },

  async verifyOTP(email: string, otp: string): Promise<{ success: boolean; error?: string }> {
    const result = await this.post({ action: 'verifyOTP', email, otp })
    return { success: result.success === true, error: result.error }
  },

  async sendLoginOTP(email: string): Promise<{ success: boolean; error?: string; offline?: boolean }> {
    const result = await this.post({ action: 'sendLoginOTP', email })
    return { success: result.success === true, error: result.error, offline: result.offline }
  },

  async loginOwnerWithOTP(email: string, otp: string): Promise<{ success: boolean; owner?: any; token?: string; error?: string }> {
    const result = await this.post({ action: 'loginOwnerWithOTP', email, otp })
    return { success: result.success === true, owner: result.owner, token: result.token, error: result.error }
  },

  async registerOwner(owner: any): Promise<{ success: boolean; id?: string; error?: string }> {
    const result = await this.post({ action: 'registerOwner', ...owner })
    return { success: result.success === true, id: result.id, error: result.error }
  },

  async loginOwner(email: string, password: string): Promise<{ success: boolean; owner?: any; token?: string; error?: string; offline?: boolean }> {
    const result = await this.post({ action: 'loginOwner', email, password })
    return { success: result.success === true, owner: result.owner, token: result.token, error: result.error, offline: result.offline }
  },

  async loginDriver(code: string): Promise<{ success: boolean; driver?: any; token?: string; error?: string }> {
    const result = await this.post({ action: 'loginDriver', code })
    return { success: result.success === true, driver: result.driver, token: result.token, error: result.error }
  },

  async loginAdmin(email: string, password: string): Promise<{ success: boolean; admin?: any; token?: string; error?: string; offline?: boolean }> {
    const result = await this.post({ action: 'loginAdmin', email, password })
    return { success: result.success === true, admin: result.admin, token: result.token, error: result.error, offline: result.offline }
  },

  async sendResetOTP(email: string): Promise<{ success: boolean; error?: string }> {
    const result = await this.post({ action: 'sendResetOTP', email })
    return { success: result.success === true, error: result.error }
  },

  async resetPassword(email: string, otp: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    const result = await this.post({ action: 'resetPassword', email, otp, newPassword })
    return { success: result.success === true, error: result.error }
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

  async addNotification(notif: any): Promise<boolean> {
    const result = await this.post({ action: 'addNotification', ...notif })
    return result.success === true
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
  },

  async performOCR(blob: Blob, type: 'odometer' | 'receipt'): Promise<any> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { success: false, error: getOfflineErrorMessage() }
    }
    try {
      const base64Data = await blobToBase64(blob).then(res => res.split(',')[1] || res);
      const url = BACKEND_API_URL.replace('/sync', '/ocr');
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data, type })
      });
      return await response.json();
    } catch (err: any) {
      console.error('OCR request failed:', err);
      const isOfflineErr = typeof navigator !== 'undefined' && (
        !navigator.onLine || 
        err.message?.includes('Failed to fetch') || 
        err.toString().includes('Failed to fetch') ||
        err.message?.includes('network') ||
        err.message?.includes('NetworkError')
      );
      const errorMessage = isOfflineErr ? getOfflineErrorMessage() : err.toString();
      return { success: false, error: errorMessage };
    }
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
    firestoreSync.syncOfflineQueue()
  })
}
