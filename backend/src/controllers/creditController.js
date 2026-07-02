import { firestoreService } from '../services/firestoreService.js';

export const creditController = {
  async handleAddPaymentEntry(data) {
    const payments = await firestoreService.getCollectionData('payments');
    const now = Date.now();
    
    // Check duplicates within 5 seconds
    for (const existing of payments) {
      const existingTime = new Date(existing.createdAt).getTime();
      const existingOwner = String(existing.ownerId || '').trim();
      const existingAmount = parseFloat(existing.amount) || 0;
      
      if (
        existingOwner === String(data.ownerId).trim() &&
        existingAmount === (parseFloat(data.amount) || 0) &&
        !isNaN(existingTime) && (now - existingTime) < 5000
      ) {
        return { success: true, id: existing.id || 'pay_dup', duplicate: true };
      }
    }
    
    const paymentId = 'pay_' + now;
    const newPaymentData = {
      id: paymentId,
      ownerId: data.ownerId,
      amount: parseFloat(data.amount) || 0,
      date: data.date || new Date().toISOString().split('T')[0],
      method: data.method || 'cash',
      notes: data.notes || '',
      createdAt: new Date().toISOString()
    };
    
    await firestoreService.setDocument('payments', paymentId, newPaymentData);
    
    // Update owner totalPaid
    try {
      const owner = await firestoreService.getDocument('owners', data.ownerId);
      if (owner) {
        const currentPaid = parseFloat(owner.totalPaid) || 0;
        await firestoreService.updateDocument('owners', data.ownerId, {
          totalPaid: currentPaid + (parseFloat(data.amount) || 0),
          lastPaymentDate: data.date || new Date().toISOString().split('T')[0]
        });
      }
    } catch (err) {
      console.error('Error updating owner payment totals in Firestore:', err.message);
    }
    
    // Recalculate
    try {
      if (data.ownerId) {
        await firestoreService.recalculateOwnerCredit(data.ownerId);
      }
    } catch (err) {
      console.error('Error recalculating owner credits in Firestore:', err.message);
    }
    
    return { success: true, id: paymentId };
  },

  async handleGetOwnerPayments(data) {
    const payments = await firestoreService.getCollectionData('payments');
    const ownerId = String(data.ownerId || '').trim();
    const filtered = payments.filter(p => String(p.ownerId || '').trim() === ownerId);
    return { success: true, payments: filtered };
  },

  async handleAddCreditAction(data) {
    const actionId = data.id || 'ca_' + Date.now();
    const newActionData = {
      id: actionId,
      ownerId: data.ownerId,
      type: data.type,
      amount: parseFloat(data.amount) || 0,
      reason: data.reason || '',
      requestedBy: data.requestedBy || '',
      approvedBy: data.approvedBy || '',
      status: data.status || 'pending',
      createdAt: new Date().toISOString()
    };
    
    await firestoreService.setDocument('creditActions', actionId, newActionData);
    
    const status = String(data.status || 'pending').toLowerCase();
    const type = String(data.type || '').toLowerCase();
    if (status === 'approved' && ['issue', 'emergency', 'bonus', 'issued'].includes(type)) {
      try {
        const owner = await firestoreService.getDocument('owners', data.ownerId);
        if (owner) {
          const currentLimit = parseFloat(owner.creditLimit) || 0;
          await firestoreService.updateDocument('owners', data.ownerId, {
            creditLimit: currentLimit + (parseFloat(data.amount) || 0)
          });
        }
      } catch (err) {
        console.error('Error updating owner credit limit in Firestore:', err.message);
      }
    }
    
    return { success: true, id: actionId };
  },

  async handleUpdateCreditAction(data, user) {
    if (!user || user.role !== 'admin') {
      return { success: false, error: 'Unauthorized. Only admins can approve or reject credit requests.' };
    }

    const actionId = data.actionId;
    if (!actionId) {
      return { success: false, error: 'actionId is required.' };
    }
    
    const targetAction = await firestoreService.getDocument('creditActions', actionId);
    if (!targetAction) {
      return { success: false, error: 'Credit action not found: ' + actionId };
    }
    
    const updates = {
      status: data.status,
      approvedBy: data.approvedBy || 'System'
    };
    
    try {
      await firestoreService.updateDocument('creditActions', actionId, updates);
      
      // If approved, update owner's credit limit
      if (data.status === 'approved') {
        const type = String(targetAction.type || '').toLowerCase();
        const amount = parseFloat(targetAction.amount) || 0;
        const ownerId = targetAction.ownerId;
        
        if (['issue', 'emergency', 'bonus', 'issued'].includes(type) && ownerId) {
          const owner = await firestoreService.getDocument('owners', ownerId);
          if (owner) {
            const currentLimit = parseFloat(owner.creditLimit) || 0;
            await firestoreService.updateDocument('owners', ownerId, {
              creditLimit: currentLimit + amount
            });
          }
        }
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: 'Credit action update failed: ' + err.message };
    }
  }
};
