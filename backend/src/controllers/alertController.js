import { firestoreService } from '../services/firestoreService.js';

export const alertController = {
  async handleAddAlert(data) {
    const alerts = await firestoreService.getCollectionData('alerts');
    const now = new Date(data.time || Date.now());
    
    // Check duplicates within 5 minutes
    for (const existing of alerts) {
      if (
        String(existing.ownerId || '').trim() === String(data.ownerId || '').trim() &&
        String(existing.type || '').trim() === String(data.type || '').trim() &&
        String(existing.event || '').trim() === String(data.event || '').trim()
      ) {
        const existingTime = new Date(existing.time);
        if (!isNaN(existingTime.getTime())) {
          const timeDiff = Math.abs(now.getTime() - existingTime.getTime());
          if (timeDiff < 300000) {
            return { success: true, id: existing.id || 'alert_dup', duplicate: true };
          }
        }
      }
    }
    
    const alertId = data.id || 'alert_' + Date.now();
    const newAlertData = {
      id: alertId,
      time: data.time || new Date().toISOString(),
      event: data.event || 'Alert',
      user: data.user || '',
      type: data.type || 'info',
      ownerId: data.ownerId || '',
      resolved: false,
      resolvedBy: '',
      resolvedAt: '',
      resolutionNote: '',
      severity: data.severity || 'medium'
    };
    
    await firestoreService.setDocument('alerts', alertId, newAlertData);
    return { success: true, id: alertId };
  },

  async handleResolveAlert(data) {
    const alertId = data.alertId;
    if (!alertId) {
      return { success: false, error: 'alertId is required.' };
    }
    
    const updates = {
      resolved: true,
      resolvedBy: data.resolvedBy || 'System',
      resolvedAt: new Date().toISOString(),
      resolutionNote: data.resolutionNote || ''
    };
    
    try {
      await firestoreService.updateDocument('alerts', alertId, updates);
      return { success: true, resolved: true };
    } catch (err) {
      return { success: false, error: 'Alert not found: ' + alertId };
    }
  }
};
