import { firestoreService } from '../services/firestoreService.js';
import { alertController } from './alertController.js';

export const fillController = {
  async handleAddFill(data) {
    const fillId = data.id || 'fill_' + Date.now();
    const fillData = {
      ...data,
      id: fillId,
      kgs: parseFloat(data.kgs) || 0,
      rate: parseFloat(data.rate) || 0,
      total: parseFloat(data.total) || 0,
      odoReading: parseInt(data.odoReading) || 0,
      distanceDiff: parseFloat(data.distanceDiff) || 0,
      mismatch: data.mismatch === true || data.mismatch === 'true',
      fuelDropPercent: parseFloat(data.fuelDropPercent) || 0,
      verified: data.verified === true || data.verified === 'true'
    };
    
    // Check owner credit status and limits before allowing refueling
    const ownerId = data.ownerId;
    if (ownerId) {
      const owner = await firestoreService.getDocument('owners', ownerId);
      if (owner) {
        if (owner.creditFrozen === true || owner.creditFrozen === 'true') {
          return { success: false, error: 'Credit is frozen for this owner. Refueling denied.' };
        }
        
        const creditLimit = parseFloat(owner.creditLimit) || 0;
        const creditUsed = parseFloat(owner.creditUsed) || 0;
        const fillTotal = parseFloat(data.total) || 0;
        
        if (creditUsed + fillTotal > creditLimit) {
          return { success: false, error: `Credit limit exceeded. Limit: ₹${creditLimit.toLocaleString()}, Used: ₹${creditUsed.toLocaleString()}, Attempted Refuel: ₹${fillTotal.toLocaleString()}. Refueling denied.` };
        }
      }
    }

    // 1. Write fill entry to Firestore
    await firestoreService.setDocument('fills', fillId, fillData);
    
    // 2. Update vehicle currentOdo
    try {
      const vehicles = await firestoreService.getCollectionData('vehicles');
      const targetVehicle = vehicles.find(v => 
        String(v.id || '').trim() === String(data.vehicleId || '').trim() ||
        String(v.plate || '').trim() === String(data.vehicleId || '').trim()
      );
      
      if (targetVehicle) {
        const currentOdoVal = parseInt(targetVehicle.currentOdo) || 0;
        const newOdoVal = parseInt(data.odoReading) || 0;
        if (newOdoVal >= currentOdoVal) {
          await firestoreService.updateDocument('vehicles', targetVehicle.id, { currentOdo: newOdoVal });
        }
      }
    } catch (err) {
      console.error('Error updating vehicle odometer in Firestore:', err.message);
    }
    
    // 3. Add alert if mismatch or fuel drop
    const fuelDrop = parseFloat(data.fuelDropPercent || 0);
    if (data.mismatch || fuelDrop > 20) {
      try {
        const alertData = {
          id: 'alert_' + Date.now(),
          time: data.time || new Date().toISOString(),
          event: data.mismatch ? 'Location mismatch' : 'Fuel drop',
          user: data.driverId || '',
          type: data.mismatch ? 'location_mismatch' : 'fuel_drop',
          ownerId: data.ownerId || '',
          resolved: false,
          resolvedBy: '',
          resolvedAt: '',
          resolutionNote: '',
          severity: 'high'
        };
        await alertController.handleAddAlert(alertData);
      } catch (err) {
        console.error('Error creating automatic alert in Firestore:', err.message);
      }
    }
    
    // 4. Recalculate credit limits
    try {
      if (data.ownerId) {
        await firestoreService.recalculateOwnerCredit(data.ownerId);
      }
    } catch (err) {
      console.error('Error recalculating owner credits in Firestore:', err.message);
    }
    
    return { success: true, id: fillId };
  },

  async handleUpdateFill(data) {
    const fillId = data.fillId;
    if (!fillId) {
      return { success: false, error: 'fillId is required.' };
    }
    
    const updates = {};
    const allowedFields = ['verified', 'verifiedBy', 'verifiedAt', 'adminNotes'];
    allowedFields.forEach(field => {
      if (data[field] !== undefined) {
        let val = data[field];
        if (field === 'verified') val = val === true || val === 'true';
        updates[field] = val;
      }
    });
    
    try {
      await firestoreService.updateDocument('fills', fillId, updates);
      return { success: true, updated: Object.keys(updates) };
    } catch (err) {
      return { success: false, error: 'Fill not found: ' + fillId };
    }
  }
};
