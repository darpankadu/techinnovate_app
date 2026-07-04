// Demo data seeder — DEV BUILDS ONLY.
// Open http://localhost:5177/?seed=demo to load test accounts for offline testing.
// This module is never triggered in production builds (guarded by import.meta.env.DEV in App.tsx).

export function seedDemoData() {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000

  const owners = [
    {
      id: 'o1',
      name: 'Demo Owner',
      business: 'TechInnovate Fleet',
      email: 'owner@demo.com',
      password: 'demo123',
      phone: '9800000001',
      creditLimit: 100000,
      totalPaid: 5000,
      lastPaymentDate: new Date(now - 10 * day).toISOString(),
      creditFrozen: false,
      riskScore: 'green',
    },
  ]

  const drivers = [
    { id: 'd1', name: 'Raju Patel', code: '1234', phone: '9800000002', email: 'raju@demo.com', ownerId: 'o1', assignedVehicleId: 'GJ06AB1234' },
    { id: 'd2', name: 'Suresh Yadav', code: '5678', phone: '9800000003', email: 'suresh@demo.com', ownerId: 'o1', assignedVehicleId: 'GJ06CD5678' },
  ]

  const vehicles = [
    { id: 'v1', plate: 'GJ06AB1234', model: 'Tata Ace', fuelType: 'CNG', ownerId: 'o1', initialOdo: 10000, currentOdo: 12500 },
    { id: 'v2', plate: 'GJ06CD5678', model: 'Tata Intra', fuelType: 'CNG', ownerId: 'o1', initialOdo: 22000, currentOdo: 24100 },
  ]

  const fills = [
    { id: 'f1', driverId: 'd1', vehicleId: 'GJ06AB1234', ownerId: 'o1', kgs: 12.0, rate: 96, total: 1152, station: 'HP CNG — Alkapuri', time: new Date(now - 5 * day).toISOString(), verified: true },
    { id: 'f2', driverId: 'd1', vehicleId: 'GJ06AB1234', ownerId: 'o1', kgs: 11.2, rate: 96, total: 1075, station: 'GAIL CNG — Karelibaug', time: new Date(now - 3 * day).toISOString(), verified: false },
    { id: 'f3', driverId: 'd1', vehicleId: 'GJ06AB1234', ownerId: 'o1', kgs: 8.5, rate: 96, total: 816, station: 'HP CNG — Alkapuri', time: new Date(now - 1 * day).toISOString(), verified: false },
    { id: 'f4', driverId: 'd2', vehicleId: 'GJ06CD5678', ownerId: 'o1', kgs: 10.4, rate: 96, total: 998, station: 'Adani CNG — Manjalpur', time: new Date(now - 2 * day).toISOString(), verified: true },
  ]

  // Local admin record — used ONLY by the dev fallback login when backend is unreachable
  const admins = [
    { id: 'a1', name: 'Demo Admin', email: 'admin@demo.com', password: 'admin123' },
  ]

  localStorage.setItem('cng_owners', JSON.stringify(owners))
  localStorage.setItem('cng_drivers', JSON.stringify(drivers))
  localStorage.setItem('cng_vehicles', JSON.stringify(vehicles))
  localStorage.setItem('cng_fills', JSON.stringify(fills))
  localStorage.setItem('cng_admins', JSON.stringify(admins))
}
