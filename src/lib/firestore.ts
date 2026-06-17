import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from './firebase';
import type { Owner, Driver, Vehicle, Fill, Alert, PaymentEntry, CreditAction } from './types';

// Helper to convert Google Drive download URLs to view URLs
export function convertToDriveViewerUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('data:')) return url; // Keep base64 placeholder if any
  
  // If already a view link, return it
  if (url.includes('/file/d/') && url.includes('/view')) {
    return url;
  }
  
  // Extract Google Drive File ID using regex
  // Matches standard ID parameters: id=FILE_ID or /d/FILE_ID/
  const idMatch = url.match(/[?&]id=([^&]+)/) || url.match(/\/d\/([^/]+)/);
  if (idMatch && idMatch[1]) {
    const fileId = idMatch[1];
    return `https://drive.google.com/file/d/${fileId}/view`;
  }
  
  return url;
}

// ----------------------------------------------------
// OWNERS
// ----------------------------------------------------
export async function getOwners(): Promise<Owner[]> {
  const querySnapshot = await getDocs(collection(db, 'owners'));
  const owners: Owner[] = [];
  querySnapshot.forEach((doc) => {
    owners.push({ id: doc.id, ...doc.data() } as Owner);
  });
  return owners;
}

export async function saveOwner(owner: Owner): Promise<void> {
  await setDoc(doc(db, 'owners', owner.id), owner);
}

export async function updateOwner(ownerId: string, updates: Partial<Owner>): Promise<void> {
  await updateDoc(doc(db, 'owners', ownerId), updates);
}

export async function deleteOwner(ownerId: string): Promise<void> {
  await deleteDoc(doc(db, 'owners', ownerId));
}

// ----------------------------------------------------
// DRIVERS
// ----------------------------------------------------
export async function getDrivers(): Promise<Driver[]> {
  const querySnapshot = await getDocs(collection(db, 'drivers'));
  const drivers: Driver[] = [];
  querySnapshot.forEach((doc) => {
    drivers.push({ id: doc.id, ...doc.data() } as Driver);
  });
  return drivers;
}

export async function saveDriver(driver: Driver): Promise<void> {
  await setDoc(doc(db, 'drivers', driver.id), driver);
}

export async function updateDriver(driverId: string, updates: Partial<Driver>): Promise<void> {
  await updateDoc(doc(db, 'drivers', driverId), updates);
}

export async function deleteDriver(driverId: string): Promise<void> {
  await deleteDoc(doc(db, 'drivers', driverId));
}

export async function updateDriverLocation(driverId: string, name: string, ownerId: string, lat: number, lng: number): Promise<void> {
  await setDoc(doc(db, 'driverLocations', driverId), {
    driverId,
    driverName: name,
    ownerId,
    lat,
    lng,
    lastUpdated: new Date().toISOString()
  }, { merge: true });
}

export async function deleteDriverLocation(driverId: string): Promise<void> {
  await deleteDoc(doc(db, 'driverLocations', driverId));
}

// ----------------------------------------------------
// VEHICLES
// ----------------------------------------------------
export async function getVehicles(): Promise<Vehicle[]> {
  const querySnapshot = await getDocs(collection(db, 'vehicles'));
  const vehicles: Vehicle[] = [];
  querySnapshot.forEach((doc) => {
    vehicles.push({ id: doc.id, ...doc.data() } as Vehicle);
  });
  return vehicles;
}

export async function saveVehicle(vehicle: Vehicle): Promise<void> {
  await setDoc(doc(db, 'vehicles', vehicle.id), vehicle);
}

export async function updateVehicle(vehicleId: string, updates: Partial<Vehicle>): Promise<void> {
  await updateDoc(doc(db, 'vehicles', vehicleId), updates);
}

export async function deleteVehicle(vehicleId: string): Promise<void> {
  await deleteDoc(doc(db, 'vehicles', vehicleId));
}

// ----------------------------------------------------
// FILLS (FUEL LOGS)
// ----------------------------------------------------
export async function saveFill(fill: Fill): Promise<void> {
  // Convert any Google Drive media links to view links before saving
  const formattedFill = {
    ...fill,
    videoUrl: convertToDriveViewerUrl(fill.videoUrl),
    pumpPhotoUrl: convertToDriveViewerUrl(fill.pumpPhotoUrl),
    receiptPhotoUrl: convertToDriveViewerUrl(fill.receiptPhotoUrl),
    odoPhotoUrl: convertToDriveViewerUrl(fill.odoPhotoUrl),
  };
  await setDoc(doc(db, 'fills', fill.id), formattedFill);
}

export async function updateFill(fillId: string, updates: Partial<Fill>): Promise<void> {
  const formattedUpdates = { ...updates };
  if (formattedUpdates.videoUrl) formattedUpdates.videoUrl = convertToDriveViewerUrl(formattedUpdates.videoUrl);
  if (formattedUpdates.pumpPhotoUrl) formattedUpdates.pumpPhotoUrl = convertToDriveViewerUrl(formattedUpdates.pumpPhotoUrl);
  if (formattedUpdates.receiptPhotoUrl) formattedUpdates.receiptPhotoUrl = convertToDriveViewerUrl(formattedUpdates.receiptPhotoUrl);
  if (formattedUpdates.odoPhotoUrl) formattedUpdates.odoPhotoUrl = convertToDriveViewerUrl(formattedUpdates.odoPhotoUrl);

  await updateDoc(doc(db, 'fills', fillId), formattedUpdates);
}

// ----------------------------------------------------
// ALERTS
// ----------------------------------------------------
export async function saveAlert(alert: Alert): Promise<void> {
  await setDoc(doc(db, 'alerts', alert.id), alert);
}

export async function resolveAlert(alertId: string, data: Partial<Alert>): Promise<void> {
  await updateDoc(doc(db, 'alerts', alertId), {
    ...data,
    resolved: true
  });
}

// ----------------------------------------------------
// PAYMENTS & CREDIT
// ----------------------------------------------------
export async function savePaymentEntry(entry: PaymentEntry): Promise<void> {
  await setDoc(doc(db, 'payments', entry.id), entry);
}

export async function saveCreditAction(action: CreditAction): Promise<void> {
  await setDoc(doc(db, 'creditActions', action.id), action);
}

export async function updateCreditAction(actionId: string, updates: Partial<CreditAction>): Promise<void> {
  await updateDoc(doc(db, 'creditActions', actionId), updates);
}

export async function saveTrip(trip: any): Promise<void> {
  await setDoc(doc(db, 'trips', trip.id), trip);
}

// ----------------------------------------------------
// REAL-TIME LISTENERS (SNAPSHOTS)
// ----------------------------------------------------
export function listenToCollection<T>(
  collectionName: string, 
  callback: (data: T[]) => void,
  ownerId?: string
) {
  let q = query(collection(db, collectionName));
  if (ownerId && collectionName !== 'owners') {
    q = query(collection(db, collectionName), where('ownerId', '==', ownerId));
  }
  
  return onSnapshot(q, (snapshot) => {
    const items: T[] = [];
    snapshot.forEach((doc) => {
      items.push({ id: doc.id, ...doc.data() } as unknown as T);
    });
    callback(items);
  }, (error) => {
    console.error(`Error listening to ${collectionName}:`, error);
  });
}
