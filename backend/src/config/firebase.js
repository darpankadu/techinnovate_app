import admin from 'firebase-admin';
import dotenv from 'dotenv';
import { getServiceAccountKey } from './envLoader.js';

dotenv.config();

let db = null;

try {
  const parsedKey = getServiceAccountKey('FIREBASE_SERVICE_ACCOUNT_KEY');
  if (parsedKey) {
    admin.initializeApp({
      credential: admin.credential.cert(parsedKey),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    });
    
    db = admin.firestore();
    console.log('Firebase Admin SDK initialized successfully.');
  } else {
    console.warn('WARNING: FIREBASE_SERVICE_ACCOUNT_KEY could not be loaded or parsed.');
  }
} catch (error) {
  console.error('ERROR: Failed to initialize Firebase Admin SDK:', error.message);
}

export { admin, db };
