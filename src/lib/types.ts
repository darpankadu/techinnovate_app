export type Language = 'en' | 'hi' | 'gu'

export type Role = 'driver' | 'owner' | 'admin'

export type RiskScore = 'green' | 'yellow' | 'red'

export interface Owner {
  id: string
  name: string
  email: string
  phone: string
  business: string
  password: string
  status: 'active' | 'inactive'
  createdAt: string
  creditLimit?: number
  creditUsed?: number
  adminNotes?: string
  totalPaid?: number
  lastPaymentDate?: string
  riskScore?: RiskScore
  creditFrozen?: boolean
}

export interface Driver {
  id: string
  name: string
  code: string
  assignedVehicleId: string | null
  ownerId: string
  status: 'active' | 'inactive'
  createdAt: string
}

export interface Vehicle {
  id: string
  plate: string
  model: string
  initialOdo: number
  currentOdo: number
  capacity: number
  ownerId: string
  status: 'active' | 'inactive'
}

export interface Fill {
  id: string
  vehicleId: string
  driverId: string
  time: string
  station: string
  kgs: number
  rate: number
  total: number
  videoUrl: string
  pumpPhotoUrl: string
  receiptPhotoUrl: string
  odoPhotoUrl: string
  pumpGPS: { lat: number; lng: number } | null
  receiptGPS: { lat: number; lng: number } | null
  odoGPS: { lat: number; lng: number } | null
  odoReading: number
  distanceDiff: number
  mismatch: boolean
  fuelDropPercent: number
  ownerId: string
  verified: boolean
  verifiedBy?: string
  verifiedAt?: string
  pendingVehicleApproval?: boolean
  paid?: boolean
  paidAt?: string
  paidAmount?: number
}

export interface Alert {
  id: string
  time: string
  event: string
  user: string
  type: 'location_mismatch' | 'fuel_drop' | 'vehicle_override' | 'other'
  ownerId: string
  resolved: boolean
  resolvedBy?: string
  resolutionNote?: string
}

export interface CameraCapture {
  blob: Blob
  dataUrl: string
  timestamp: number
  gps?: { lat: number; lng: number }
}

export interface AuditLog {
  id: string
  action: string
  adminName: string
  targetId: string
  targetType: string
  details: string
  timestamp: string
}

export interface Notification {
  id: string
  type: string
  message: string
  severity: 'info' | 'warning' | 'critical'
  timestamp: string
  read: boolean
}

export interface CreditAction {
  id: string
  ownerId: string
  type: 'issued' | 'emergency' | 'bonus' | 'reversal'
  amount: number
  timestamp: string
  notes?: string
  status?: 'pending' | 'approved' | 'rejected'
  requestedBy?: string
  approvedBy?: string
}

export interface PaymentEntry {
  id: string
  ownerId: string
  amount: number
  type: 'payment' | 'partial' | 'reversal'
  timestamp: string
  adminName: string
  note?: string
}