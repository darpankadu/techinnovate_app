const activeRequests = new Map();
const requestCounts = new Map();

// Helper to generate a unique key for identifying the client/user
function getUserKey(req) {
  // 1. Identify by Authorization Header (Bearer Token)
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      return `auth:${parts[1]}`;
    }
  }

  // 2. Identify by Request Body fields
  if (req.body) {
    if (req.body.driverId) return `driver:${req.body.driverId}`;
    if (req.body.ownerId) return `owner:${req.body.ownerId}`;
    if (req.body.email) return `email:${req.body.email}`;
    if (req.body.username) return `username:${req.body.username}`;
  }

  // 3. Fallback to IP address
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
  return `ip:${ip}`;
}

// 1. Concurrency Limiter: prevents multiple mutating requests at the exact same time
export function concurrencyLimiter(req, res, next) {
  // List of actions that modify database and could cause duplicate data or race conditions
  const CRITICAL_MUTATING_ACTIONS = [
    'addFill',
    'addPaymentEntry',
    'addCreditAction',
    'registerOwner',
    'addVehicle',
    'addDriver',
    'saveTrip'
  ];

  const action = req.body?.action;
  const isOcr = req.path === '/ocr' || req.originalUrl?.endsWith('/ocr');
  const shouldLock = (action && CRITICAL_MUTATING_ACTIONS.includes(action)) || isOcr;

  // Bypass lock for all non-mutating/read-only requests to preserve smooth UX
  if (!shouldLock) {
    return next();
  }

  const key = getUserKey(req);

  // If a request is already in progress, reject subsequent ones
  if (activeRequests.has(key)) {
    console.warn(`[CONCURRENCY BLOCK] Locked concurrent request for key: ${key}`);
    return res.status(429).json({
      success: false,
      error: 'Your request is already in progress. Please wait a moment.'
    });
  }

  // Acquire lock with a safety timeout of 15 seconds to prevent permanent locking if a request hangs
  const timeout = setTimeout(() => {
    activeRequests.delete(key);
    console.warn(`[CONCURRENCY AUTO-RELEASE] Lock released after timeout for key: ${key}`);
  }, 15000);

  activeRequests.set(key, timeout);

  // Release the lock immediately when the request completes or is closed
  const releaseLock = () => {
    const storedTimeout = activeRequests.get(key);
    if (storedTimeout) {
      clearTimeout(storedTimeout);
      activeRequests.delete(key);
    }
  };

  res.on('finish', releaseLock);
  res.on('close', releaseLock);

  next();
}

// 2. Rate Limiter: limits request frequency per user/IP to max 60 requests per minute
export function rateLimiter(req, res, next) {
  const key = getUserKey(req);
  const now = Date.now();
  const oneMinuteAgo = now - 60000;

  // Get timestamps of previous requests for this client
  let timestamps = requestCounts.get(key) || [];
  
  // Filter out timestamps older than 1 minute
  timestamps = timestamps.filter(time => time > oneMinuteAgo);

  if (timestamps.length >= 60) {
    console.warn(`[RATE LIMIT EXCEEDED] Throttling requests for key: ${key}`);
    return res.status(429).json({
      success: false,
      error: 'Too many requests. Please wait a moment and try again.'
    });
  }

  timestamps.push(now);
  requestCounts.set(key, timestamps);

  next();
}
