import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';

const app = express();

// Enable CORS
app.use(cors());

// Parse incoming payloads. 
// Important: the React frontend fetches with content-type 'text/plain;charset=utf-8' to avoid CORS preflights in Apps Script.
// We configure the JSON parser to match both application/json and text/plain.
app.use(express.json({ 
  limit: '50mb', 
  type: ['application/json', 'text/plain'] 
}));

// Register routing sub-system
app.use('/api', routes);

// Default Route
app.get('/', (req, res) => {
  res.send('CNG Fleet Tracker Backend running. Use POST /api/sync for database sync operations.');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Express Exception:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal Server Error', 
    message: err.message 
  });
});

export default app;
