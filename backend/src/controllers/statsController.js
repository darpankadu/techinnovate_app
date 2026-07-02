import { firestoreService } from '../services/firestoreService.js';

export const statsController = {
  async handleGetOwnerStats(data) {
    const ownerId = data.ownerId;
    const period = data.period || 'month';
    if (!ownerId) {
      return { success: false, error: 'ownerId is required.' };
    }

    const now = new Date();
    const startDate = new Date();
    if (period === 'today') {
      startDate.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
      startDate.setDate(now.getDate() - 7);
    } else if (period === 'month') {
      startDate.setMonth(now.getMonth() - 1);
    }

    // Get collections filtered by ownerId
    const [fills, vehicles, drivers, payments] = await Promise.all([
      firestoreService.getCollectionDataFiltered('fills', 'ownerId', ownerId),
      firestoreService.getCollectionDataFiltered('vehicles', 'ownerId', ownerId),
      firestoreService.getCollectionDataFiltered('drivers', 'ownerId', ownerId),
      firestoreService.getCollectionDataFiltered('payments', 'ownerId', ownerId)
    ]);

    // Filter fills by date range in-memory
    const ownerFills = [];
    let totalSpent = 0;
    let totalKgs = 0;

    for (const fill of fills) {
      const fillTime = new Date(fill.time);
      if (!isNaN(fillTime.getTime()) && fillTime >= startDate) {
        ownerFills.push(fill);
        totalSpent += parseFloat(fill.total) || 0;
        totalKgs += parseFloat(fill.kgs) || 0;
      }
    }

    // Get total paid
    let totalPaid = 0;
    for (const payment of payments) {
      totalPaid += parseFloat(payment.amount) || 0;
    }

    return {
      success: true,
      stats: {
        fills: ownerFills.length,
        totalSpent,
        totalPaid,
        outstanding: Math.max(0, totalSpent - totalPaid),
        totalKgs,
        vehicles: vehicles.length,
        drivers: drivers.length,
        avgFill: ownerFills.length > 0 ? totalSpent / ownerFills.length : 0,
        period
      }
    };
  },

  async handleGetVehicleStats(data) {
    const vehicleId = data.vehicleId;
    if (!vehicleId) {
      return { success: false, error: 'vehicleId is required.' };
    }

    // Retrieve vehicle by document ID first
    let vehicleInfo = await firestoreService.getDocument('vehicles', vehicleId);
    if (!vehicleInfo) {
      // Fallback: search by plate number
      const match = await firestoreService.getCollectionDataFiltered('vehicles', 'plate', vehicleId);
      if (match.length > 0) {
        vehicleInfo = match[0];
      }
    }

    if (!vehicleInfo) {
      return { success: false, error: 'Vehicle not found: ' + vehicleId };
    }

    // Get fills only for this specific vehicle plate/ID
    const fills = await firestoreService.getCollectionDataFiltered('fills', 'vehicleId', vehicleInfo.plate);
    let totalSpent = 0;
    let totalKgs = 0;

    for (const fill of fills) {
      totalSpent += parseFloat(fill.total) || 0;
      totalKgs += parseFloat(fill.kgs) || 0;
    }

    const initialOdo = parseInt(vehicleInfo.initialOdo) || 0;
    const currentOdo = parseInt(vehicleInfo.currentOdo) || 0;
    const kmTraveled = currentOdo - initialOdo;
    const efficiency = totalKgs > 0 ? (kmTraveled / totalKgs).toFixed(2) : 0;

    let lastFillTime = null;
    if (fills.length > 0) {
      fills.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
      lastFillTime = fills[fills.length - 1].time;
    }

    return {
      success: true,
      stats: {
        fills: fills.length,
        totalSpent,
        totalKgs,
        kmTraveled,
        efficiency,
        avgCost: fills.length > 0 ? totalSpent / fills.length : 0,
        lastFill: lastFillTime
      }
    };
  }
};
