import { Router } from 'express';
import { syncController } from '../controllers/syncController.js';
import { ocrController } from '../controllers/ocrController.js';
import { spreadsheetId } from '../config/google.js';

const router = Router();

// Single unified route matching Apps Script POST
router.post('/sync', syncController.dispatchSync);

// OCR processing endpoint
router.post('/ocr', ocrController.performOCR);

// Status route matching Apps Script GET
router.get('/status', (req, res) => {
  res.json({
    status: 'CNG Fuel Tracker API',
    version: '3.0',
    phase: 'Complete - All Phases (NodeJS)',
    time: new Date().toISOString(),
    setup: spreadsheetId ? 'complete' : 'missing GOOGLE_SPREADSHEET_ID'
  });
});

export default router;
