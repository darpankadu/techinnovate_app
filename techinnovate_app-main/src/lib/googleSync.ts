import type { Fill } from './types'
import { storage } from './storage'

// Your deployed Apps Script - UPDATE THIS URL after deploying v3.0 backend
export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzUpsxThHu-3tE509FcKe6TyMRsqXX2k6t7_F-FPjN7P6dD6j4ZWyBmCwNxjUX59tu2gA/exec'

export const googleSync = {
  enabled: true,
  
  async uploadMedia(blob: Blob, fileName: string, folderName: string): Promise<string> {
    const localUrl = await blobToBase64(blob)
    
    if (!this.enabled) return localUrl

    try {
      const base64Data = localUrl.split(',')[1] || localUrl
      const parts = folderName.split('_')
      const vehiclePlate = parts.slice(0, -1).join('_') || parts[0] || 'Unassigned'
      const fillDate = parts[parts.length - 1] || new Date().toISOString().split('T')[0]
      
      const payload = {
        action: 'uploadMedia',
        fileName: fileName,
        vehiclePlate: vehiclePlate,
        fillDate: fillDate,
        mimeType: blob.type || 'image/jpeg',
        base64Data: base64Data,
      }
      
      console.log('Uploading to Drive:', fileName, Math.round(base64Data.length/1024)+'KB', 'type:', blob.type)
      
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify(payload),
      })
      
      const text = await response.text()
      console.log('Raw response for', fileName, ':', text.substring(0, 200))
      
      const result = JSON.parse(text)
      
      if (result.success && result.fileUrl) {
        console.log('✓ Uploaded:', fileName, '→', result.fileUrl)
        return result.fileUrl
      } else {
        console.error('Upload failed for', fileName, ':', result)
        return localUrl
      }
    } catch (error) {
      console.error('Upload error for', fileName, ':', error)
      return localUrl
    }
  },

  async saveFill(fill: Fill): Promise<boolean> {
    if (!this.enabled) return true

    try {
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
      
      console.log('Saving fill to Sheets:', payload.id, payload.kgs + 'kg')
      
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(payload),
      })
      
      const text = await response.text()
      console.log('Fill save response:', text.substring(0, 200))
      
      if (fill.mismatch || fill.fuelDropPercent > 20) {
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
        
        fetch(APPS_SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors',
          body: JSON.stringify(alertPayload),
        }).catch(() => {})
      }
      
      return true
    } catch (error) {
      console.error('Sheets sync error:', error)
      return false  // BUG-006 FIX: was returning true, masking failures
    }
  },

  async syncOfflineQueue(): Promise<void> {
    if (!this.enabled || !navigator.onLine) return
    
    const queue = storage.getOfflineQueue()
    if (queue.length === 0) return

    // BUG-007 FIX: Track which fills synced successfully, only remove those
    const failed: Fill[] = []
    for (const fill of queue) {
      const success = await this.saveFill(fill)
      if (!success) failed.push(fill)
    }
    
    if (navigator.onLine) {
      if (failed.length === 0) {
        storage.clearOfflineQueue()
      } else {
        // Keep only the failed ones
        localStorage.setItem('cng_offline_queue', JSON.stringify(failed))
      }
    }
  },

  async fetchAllData(): Promise<any> {
    if (!this.enabled) return null
    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify({ action: 'getData' }),
      })
      const text = await response.text()
      try {
        return JSON.parse(text)
      } catch (e) {
        console.log('Parse error:', text.substring(0, 200))
        return { success: false }
      }
    } catch (error) {
      console.error('Fetch failed:', error)
      return { success: false }
    }
  },
  
  async sendOTP(email: string): Promise<{ success: boolean; error?: string }> {
    if (!this.enabled) return { success: true }
    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify({ action: 'sendOTP', email }),
      })
      const result = await response.json()
      return { success: result.success === true, error: result.error }
    } catch (err: any) {
      return { success: false, error: err.toString() }
    }
  },

  async verifyOTP(email: string, otp: string): Promise<{ success: boolean; error?: string }> {
    if (!this.enabled) return { success: true }
    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify({ action: 'verifyOTP', email, otp }),
      })
      const result = await response.json()
      return { success: result.success === true, error: result.error }
    } catch (err: any) {
      return { success: false, error: err.toString() }
    }
  },

  async registerOwner(owner: any): Promise<boolean> {
    if (!this.enabled) return true
    try {
      // BUG-020 FIX: use cors mode so we can detect errors
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify({ action: 'registerOwner', ...owner }),
      })
      const result = await response.json()
      return result.success === true
    } catch { return false }
  },
  
  async addDriver(driver: any): Promise<boolean> {
    if (!this.enabled) return true
    try {
      // BUG-021 FIX: use cors mode
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify({ action: 'addDriver', ...driver }),
      })
      const result = await response.json()
      return result.success !== false
    } catch { return false }
  },
  
  async updateDriver(driver: any): Promise<boolean> {
    if (!this.enabled) return true
    try {
      const payload: any = { action: 'updateDriver', id: driver.id }
      if (driver.code !== undefined) payload.code = driver.code
      if (driver.assignedVehicleId !== undefined) payload.assignedVehicleId = driver.assignedVehicleId
      await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify(payload),
      })
      return true
    } catch { return false }
  },

  async addVehicle(vehicle: any): Promise<boolean> {
    if (!this.enabled) return true
    try {
      // BUG-021 FIX: use cors mode
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify({ action: 'addVehicle', ...vehicle }),
      })
      const result = await response.json()
      return result.success !== false
    } catch { return false }
  },
  
  async updateOdometer(vehicleId: string, odo: number): Promise<boolean> {
    if (!this.enabled) return true
    try {
      await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({ 
          action: 'updateVehicleOdometer', 
          vehicleId, 
          odometer: odo 
        }),
      })
      return true
    } catch { return false }
  },

  async deleteDriver(driverId: string): Promise<boolean> {
    if (!this.enabled) return true
    try {
      // BUG-021 FIX: use cors mode
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify({ action: 'deleteDriver', id: driverId }),
      })
      const result = await response.json()
      return result.success !== false
    } catch { return false }
  },

  async deleteVehicle(vehicleId: string): Promise<boolean> {
    if (!this.enabled) return true
    try {
      // BUG-021 FIX: use cors mode
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify({ action: 'deleteVehicle', id: vehicleId }),
      })
      const result = await response.json()
      return result.success !== false
    } catch { return false }
  },

  // ============= PHASE 1: OWNER CREDIT MANAGEMENT =============

  async updateOwner(ownerId: string, updates: {
    creditLimit?: number
    creditUsed?: number
    creditFrozen?: boolean
    totalPaid?: number
    lastPaymentDate?: string
    notes?: string
    status?: string
  }): Promise<boolean> {
    if (!this.enabled) return true
    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify({ 
          action: 'updateOwner', 
          ownerId,
          ...updates
        }),
      })
      const result = await response.json()
      return result.success === true
    } catch (error) {
      console.error('Update owner error:', error)
      return false
    }
  },

  async addPaymentEntry(entry: {
    ownerId: string
    amount: number
    date?: string
    method?: 'cash' | 'bank' | 'upi'
    notes?: string
  }): Promise<{ success: boolean; id?: string }> {
    if (!this.enabled) return { success: false }
    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify({ 
          action: 'addPaymentEntry',
          ...entry,
          date: entry.date || new Date().toISOString().split('T')[0]
        }),
      })
      const result = await response.json()
      return { success: result.success === true, id: result.id }
    } catch (error) {
      console.error('Add payment error:', error)
      return { success: false }
    }
  },

  async getOwnerPayments(ownerId: string): Promise<any[]> {
    if (!this.enabled) return []
    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify({ 
          action: 'getOwnerPayments',
          ownerId
        }),
      })
      const result = await response.json()
      return result.success ? result.payments || [] : []
    } catch (error) {
      console.error('Get payments error:', error)
      return []
    }
  },

  // ============= PHASE 2: ALERT MANAGEMENT =============

  async addAlert(alert: {
    id?: string
    time?: string
    event: string
    user?: string
    type: 'mismatch' | 'fuel_drop' | 'info' | 'critical'
    ownerId: string
    severity?: 'low' | 'medium' | 'high' | 'critical'
  }): Promise<{ success: boolean; id?: string }> {
    if (!this.enabled) return { success: false }
    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify({ 
          action: 'addAlert',
          ...alert,
          time: alert.time || new Date().toISOString()
        }),
      })
      const result = await response.json()
      return { success: result.success === true, id: result.id }
    } catch (error) {
      console.error('Add alert error:', error)
      return { success: false }
    }
  },

  async resolveAlert(alertId: string, data: {
    resolvedBy: string
    resolutionNote?: string
  }): Promise<boolean> {
    if (!this.enabled) return false
    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify({ 
          action: 'resolveAlert',
          alertId,
          ...data
        }),
      })
      const result = await response.json()
      return result.success === true
    } catch (error) {
      console.error('Resolve alert error:', error)
      return false
    }
  },

  // ============= PHASE 3: FILL VERIFICATION =============

  async updateFill(fillId: string, updates: {
    verified?: boolean
    verifiedBy?: string
    verifiedAt?: string
    adminNotes?: string
  }): Promise<boolean> {
    if (!this.enabled) return false
    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify({ 
          action: 'updateFill',
          fillId,
          ...updates
        }),
      })
      const result = await response.json()
      return result.success === true
    } catch (error) {
      console.error('Update fill error:', error)
      return false
    }
  },

  // ============= PHASE 4: VEHICLE UPDATES =============

  async updateVehicle(vehicleId: string, updates: {
    plate?: string
    model?: string
    initialOdo?: number
    currentOdo?: number
    capacity?: number
    status?: string
    ownerId?: string
  }): Promise<boolean> {
    if (!this.enabled) return false
    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify({ 
          action: 'updateVehicle',
          vehicleId,
          ...updates
        }),
      })
      const result = await response.json()
      return result.success === true
    } catch (error) {
      console.error('Update vehicle error:', error)
      return false
    }
  },

  // ============= PHASE 5: CREDIT ACTIONS =============

  async addCreditAction(action: {
    ownerId: string
    type: 'issue' | 'emergency' | 'bonus' | 'reduction'
    amount: number
    reason?: string
    requestedBy?: string
    approvedBy?: string
    status?: 'pending' | 'approved' | 'rejected'
  }): Promise<{ success: boolean; id?: string }> {
    if (!this.enabled) return { success: false }
    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify({ 
          action: 'addCreditAction',
          ...action
        }),
      })
      const result = await response.json()
      return { success: result.success === true, id: result.id }
    } catch (error) {
      console.error('Add credit action error:', error)
      return { success: false }
    }
  },

  async updateCreditAction(actionId: string, status: 'approved' | 'rejected', approvedBy: string): Promise<boolean> {
    if (!this.enabled) return true
    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify({ 
          action: 'updateCreditAction',
          actionId,
          status,
          approvedBy
        }),
      })
      const result = await response.json()
      return result.success === true
    } catch (error) {
      console.error('Update credit action error:', error)
      return false
    }
  },

  // ============= PHASE 6: STATISTICS =============

  async getOwnerStats(ownerId: string, period: 'today' | 'week' | 'month' = 'month'): Promise<any> {
    if (!this.enabled) return null
    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify({ 
          action: 'getOwnerStats',
          ownerId,
          period
        }),
      })
      const result = await response.json()
      return result.success ? result.stats : null
    } catch (error) {
      console.error('Get owner stats error:', error)
      return null
    }
  },

  async getVehicleStats(vehicleId: string): Promise<any> {
    if (!this.enabled) return null
    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify({ 
          action: 'getVehicleStats',
          vehicleId
        }),
      })
      const result = await response.json()
      return result.success ? result.stats : null
    } catch (error) {
      console.error('Get vehicle stats error:', error)
      return null
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

// Auto-sync when online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    googleSync.syncOfflineQueue()
  })
}

// googleSync is already exported above
