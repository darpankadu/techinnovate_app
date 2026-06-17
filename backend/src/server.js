import app from './app.js';
import dotenv from 'dotenv';
import { firestoreService } from './services/firestoreService.js';

dotenv.config();

const PORT = process.env.PORT || 8080;

app.listen(PORT, async () => {
  console.log('================================================================');
  console.log(`CNG Fleet Tracker Backend started on http://localhost:${PORT}`);
  console.log('================================================================');

  console.log('Initiating database self-healing and credit auto-checks...');
  try {
    await firestoreService.recalculateAllOwnersCredit();
    console.log('Firestore database verification and credit recalculation completed.');
  } catch (err) {
    console.warn('Startup database checks failed. Make sure FIREBASE_SERVICE_ACCOUNT_KEY is configured:');
    console.warn(err.message);
  }
});
