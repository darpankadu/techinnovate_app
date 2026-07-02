import { db } from '../config/firebase.js';

export const firestoreService = {
  async getCollectionData(collectionName) {
    if (!db) throw new Error('Firestore database is not initialized.');
    const snapshot = await db.collection(collectionName).get();
    const data = [];
    snapshot.forEach(doc => {
      data.push({ id: doc.id, ...doc.data() });
    });
    return data;
  },

  async getCollectionDataFiltered(collectionName, field, value) {
    if (!db) throw new Error('Firestore database is not initialized.');
    const snapshot = await db.collection(collectionName).where(field, '==', value).get();
    const data = [];
    snapshot.forEach(doc => {
      data.push({ id: doc.id, ...doc.data() });
    });
    return data;
  },

  async getDocument(collectionName, docId) {
    if (!db) throw new Error('Firestore database is not initialized.');
    const doc = await db.collection(collectionName).doc(docId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  },

  async setDocument(collectionName, docId, data) {
    if (!db) throw new Error('Firestore database is not initialized.');
    await db.collection(collectionName).doc(docId).set(data);
    return true;
  },

  async updateDocument(collectionName, docId, updates) {
    if (!db) throw new Error('Firestore database is not initialized.');
    await db.collection(collectionName).doc(docId).update(updates);
    return true;
  },

  async deleteDocument(collectionName, docId) {
    if (!db) throw new Error('Firestore database is not initialized.');
    await db.collection(collectionName).doc(docId).delete();
    return true;
  },

  async recalculateAllOwnersCredit() {
    if (!db) return;
    try {
      const owners = await this.getCollectionData('owners');
      const fills = await this.getCollectionData('fills');
      const payments = await this.getCollectionData('payments');

      for (const owner of owners) {
        const ownerId = owner.id;
        
        // Sum Fills
        const totalSpent = fills
          .filter(f => String(f.ownerId || '').trim() === String(ownerId).trim())
          .reduce((sum, f) => sum + (parseFloat(f.total) || 0), 0);
          
        // Sum Payments
        const totalPaid = payments
          .filter(p => String(p.ownerId || '').trim() === String(ownerId).trim())
          .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
          
        const creditUsed = totalSpent - totalPaid;
        
        // Only update if values are different
        const currentCreditUsed = parseFloat(owner.creditUsed) || 0;
        const currentTotalPaid = parseFloat(owner.totalPaid) || 0;
        
        if (
          Math.abs(currentCreditUsed - creditUsed) > 0.01 ||
          Math.abs(currentTotalPaid - totalPaid) > 0.01
        ) {
          await this.updateDocument('owners', ownerId, {
            creditUsed,
            totalPaid
          });
        }
      }
    } catch (err) {
      console.error('Error recalculating owner credits in Firestore:', err.message);
    }
  },

  async recalculateOwnerCredit(ownerId) {
    if (!db || !ownerId) return;
    try {
      const fills = await this.getCollectionDataFiltered('fills', 'ownerId', ownerId);
      const payments = await this.getCollectionDataFiltered('payments', 'ownerId', ownerId);
      
      const totalSpent = fills.reduce((sum, f) => sum + (parseFloat(f.total) || 0), 0);
      const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      const creditUsed = totalSpent - totalPaid;

      const owner = await this.getDocument('owners', ownerId);
      if (owner) {
        const currentCreditUsed = parseFloat(owner.creditUsed) || 0;
        const currentTotalPaid = parseFloat(owner.totalPaid) || 0;

        if (
          Math.abs(currentCreditUsed - creditUsed) > 0.01 ||
          Math.abs(currentTotalPaid - totalPaid) > 0.01
        ) {
          await this.updateDocument('owners', ownerId, {
            creditUsed,
            totalPaid
          });
        }
      }
    } catch (err) {
      console.error(`Error recalculating credit for owner ${ownerId}:`, err.message);
    }
  }
};
