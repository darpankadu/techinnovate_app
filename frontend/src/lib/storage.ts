import type { Owner, Driver, Vehicle, Fill, Alert, AuditLog, Notification, CreditAction, PaymentEntry } from './types'

const KEYS = {
  OWNERS: 'cng_owners',
  DRIVERS: 'cng_drivers',
  VEHICLES: 'cng_vehicles',
  FILLS: 'cng_fills',
  ALERTS: 'cng_alerts',
  OFFLINE_QUEUE: 'cng_offline_queue',
  SESSION: 'cng_session',
  LANGUAGE: 'cng_language',
  AUDIT_LOGS: 'cng_audit_logs',
  NOTIFICATIONS: 'cng_notifications',
  CREDIT_ACTIONS: 'cng_credit_actions',
  PAYMENT_ENTRIES: 'cng_payment_entries',
  SETTINGS: 'cng_admin_settings',
}

function safeParse<T>(raw: string | null, fallback: T): T {
  try { return JSON.parse(raw || '') as T } catch { return fallback }
}


export const storage = {
  getOwners: (): Owner[] => safeParse(localStorage.getItem(KEYS.OWNERS), []),
  saveOwners: (owners: Owner[]) => localStorage.setItem(KEYS.OWNERS, JSON.stringify(owners)),
  
  getDrivers: (): Driver[] => safeParse(localStorage.getItem(KEYS.DRIVERS), []),
  saveDrivers: (drivers: Driver[]) => localStorage.setItem(KEYS.DRIVERS, JSON.stringify(drivers)),
  
  getVehicles: (): Vehicle[] => safeParse(localStorage.getItem(KEYS.VEHICLES), []),
  saveVehicles: (vehicles: Vehicle[]) => localStorage.setItem(KEYS.VEHICLES, JSON.stringify(vehicles)),
  
  getFills: (): Fill[] => {
    const fills: Fill[] = safeParse<Fill[]>(localStorage.getItem(KEYS.FILLS), [])
    return fills.map(f => ({
      ...f,
      kgs: typeof f.kgs === 'number' && !isNaN(f.kgs) ? f.kgs : (Number(f.kgs) || 0),
      rate: typeof f.rate === 'number' && !isNaN(f.rate) ? f.rate : (Number(f.rate) || 0),
      total: typeof f.total === 'number' && !isNaN(f.total) ? f.total : (Number(f.total) || 0),
      time: f.time || new Date().toISOString(),
      mismatch: typeof f.mismatch === 'boolean' ? f.mismatch : false,
      fuelDropPercent: typeof f.fuelDropPercent === 'number' && !isNaN(f.fuelDropPercent) ? f.fuelDropPercent : (Number(f.fuelDropPercent) || 0),
      verified: typeof f.verified === 'boolean' ? f.verified : false,
      odoReading: typeof f.odoReading === 'number' && !isNaN(f.odoReading) ? f.odoReading : (Number(f.odoReading) || 0),
      distanceDiff: typeof f.distanceDiff === 'number' && !isNaN(f.distanceDiff) ? f.distanceDiff : (Number(f.distanceDiff) || 0),
      pumpGPS: parseGPS(f.pumpGPS),
      receiptGPS: parseGPS(f.receiptGPS),
      odoGPS: parseGPS(f.odoGPS),
    }))
  },
  saveFills: (fills: Fill[]) => {
    try {
      localStorage.setItem(KEYS.FILLS, JSON.stringify(fills))
    } catch (e) {
      const trimmed = fills.map(f => ({
        ...f,
        videoUrl: f.videoUrl?.startsWith('data:') ? '' : f.videoUrl,
        pumpPhotoUrl: f.pumpPhotoUrl?.startsWith('data:') ? '' : f.pumpPhotoUrl,
        receiptPhotoUrl: f.receiptPhotoUrl?.startsWith('data:') ? '' : f.receiptPhotoUrl,
        odoPhotoUrl: f.odoPhotoUrl?.startsWith('data:') ? '' : f.odoPhotoUrl,
      }))
      try {
        localStorage.setItem(KEYS.FILLS, JSON.stringify(trimmed.slice(-50)))
      } catch (e2) {
        localStorage.setItem(KEYS.FILLS, JSON.stringify(trimmed.slice(-10)))
      }
    }
  },
  
  getAlerts: (): Alert[] => safeParse(localStorage.getItem(KEYS.ALERTS), []),
  saveAlerts: (alerts: Alert[]) => localStorage.setItem(KEYS.ALERTS, JSON.stringify(alerts)),
  
  getOfflineQueue: (): Fill[] => {
    const queue = safeParse<Fill[]>(localStorage.getItem(KEYS.OFFLINE_QUEUE), [])
    return queue.map(f => ({
      ...f,
      kgs: typeof f.kgs === 'number' && !isNaN(f.kgs) ? f.kgs : (Number(f.kgs) || 0),
      rate: typeof f.rate === 'number' && !isNaN(f.rate) ? f.rate : (Number(f.rate) || 0),
      total: typeof f.total === 'number' && !isNaN(f.total) ? f.total : (Number(f.total) || 0),
      time: f.time || new Date().toISOString(),
      mismatch: typeof f.mismatch === 'boolean' ? f.mismatch : false,
      fuelDropPercent: typeof f.fuelDropPercent === 'number' && !isNaN(f.fuelDropPercent) ? f.fuelDropPercent : (Number(f.fuelDropPercent) || 0),
      verified: typeof f.verified === 'boolean' ? f.verified : false,
      odoReading: typeof f.odoReading === 'number' && !isNaN(f.odoReading) ? f.odoReading : (Number(f.odoReading) || 0),
      distanceDiff: typeof f.distanceDiff === 'number' && !isNaN(f.distanceDiff) ? f.distanceDiff : (Number(f.distanceDiff) || 0),
      pumpGPS: parseGPS(f.pumpGPS),
      receiptGPS: parseGPS(f.receiptGPS),
      odoGPS: parseGPS(f.odoGPS),
    }))
  },
  addToOfflineQueue: (fill: Fill) => {
    const queue = safeParse<Fill[]>(localStorage.getItem(KEYS.OFFLINE_QUEUE), [])
    queue.push(fill)
    localStorage.setItem(KEYS.OFFLINE_QUEUE, JSON.stringify(queue))
  },
  clearOfflineQueue: () => localStorage.setItem(KEYS.OFFLINE_QUEUE, '[]'),
  
  getSession: (): any => safeParse<any>(sessionStorage.getItem(KEYS.SESSION), null),
  setSession: (session: any) => sessionStorage.setItem(KEYS.SESSION, JSON.stringify(session)),
  clearSession: () => sessionStorage.removeItem(KEYS.SESSION),
  
  getLanguage: (): string => localStorage.getItem(KEYS.LANGUAGE) || 'en',
  setLanguage: (lang: string) => localStorage.setItem(KEYS.LANGUAGE, lang),

  getTrips: (): any[] => safeParse<any[]>(localStorage.getItem('cng_trips'), []),
  saveTrips: (trips: any[]) => {
    try {
      localStorage.setItem('cng_trips', JSON.stringify(trips))
    } catch (e) {
      console.warn('Trips save failed, trimming base64 media:', e)
      const trimmed = trips.map((t, idx) => {
        if (t.status === 'completed' && idx < trips.length - 5) {
          return {
            ...t,
            start: { ...t.start, odoPhotoUrl: t.start.odoPhotoUrl?.startsWith('data:') ? '' : t.start.odoPhotoUrl },
            end: t.end ? { ...t.end, odoPhotoUrl: t.end.odoPhotoUrl?.startsWith('data:') ? '' : t.end.odoPhotoUrl } : null
          }
        }
        return t
      })
      try {
        localStorage.setItem('cng_trips', JSON.stringify(trimmed))
      } catch (e2) {
        localStorage.setItem('cng_trips', JSON.stringify(trimmed.slice(-10)))
      }
    }
  },

  getAuditLogs: (): AuditLog[] => safeParse(localStorage.getItem(KEYS.AUDIT_LOGS), []),
  saveAuditLogs: (logs: AuditLog[]) => localStorage.setItem(KEYS.AUDIT_LOGS, JSON.stringify(logs)),
  addAuditLog: (log: AuditLog) => {
    const logs = safeParse<AuditLog[]>(localStorage.getItem(KEYS.AUDIT_LOGS), [])
    logs.push(log)
    if (logs.length > 500) logs.splice(0, logs.length - 500)
    localStorage.setItem(KEYS.AUDIT_LOGS, JSON.stringify(logs))
  },

  getNotifications: (): Notification[] => safeParse(localStorage.getItem(KEYS.NOTIFICATIONS), []),
  saveNotifications: (notifs: Notification[]) => localStorage.setItem(KEYS.NOTIFICATIONS, JSON.stringify(notifs)),
  addNotification: (n: Notification) => {
    const notifs = safeParse<Notification[]>(localStorage.getItem(KEYS.NOTIFICATIONS), [])
    notifs.push(n)
    if (notifs.length > 200) notifs.splice(0, notifs.length - 200)
    localStorage.setItem(KEYS.NOTIFICATIONS, JSON.stringify(notifs))
  },

  getCreditActions: (): CreditAction[] => safeParse(localStorage.getItem(KEYS.CREDIT_ACTIONS), []),
  saveCreditActions: (actions: CreditAction[]) => localStorage.setItem(KEYS.CREDIT_ACTIONS, JSON.stringify(actions)),

  getPaymentEntries: (): PaymentEntry[] => safeParse(localStorage.getItem(KEYS.PAYMENT_ENTRIES), []),
  savePaymentEntries: (entries: PaymentEntry[]) => localStorage.setItem(KEYS.PAYMENT_ENTRIES, JSON.stringify(entries)),

  getSettings: (): Record<string, any> => safeParse<Record<string, any>>(localStorage.getItem(KEYS.SETTINGS), {}),
  saveSettings: (s: Record<string, any>) => localStorage.setItem(KEYS.SETTINGS, JSON.stringify(s)),
  getClientId: (): string => {
    let id = localStorage.getItem('cng_client_id')
    if (!id) {
      id = 'client_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
      localStorage.setItem('cng_client_id', id)
    }
    return id
  },
}

function parseGPS(v: any): {lat: number; lng: number} | null {
  if (!v) return null
  if (typeof v === 'object' && 'lat' in v && 'lng' in v) return v
  if (typeof v === 'string') {
    const parts = v.split(',').map(Number)
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return {lat: parts[0], lng: parts[1]}
  }
  return null
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3
  const φ1 = lat1 * Math.PI/180
  const φ2 = lat2 * Math.PI/180
  const Δφ = (lat2-lat1) * Math.PI/180
  const Δλ = (lon2-lon1) * Math.PI/180

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))

  return R * c
}