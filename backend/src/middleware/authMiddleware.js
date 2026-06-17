import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'cng_fleet_jwt_secret_key_default';

export function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  
  if (!authHeader) {
    return res.status(401).json({ success: false, error: 'Authentication token is required.' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ success: false, error: 'Token format must be Bearer <token>.' });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { userId, role, ownerId }
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Session expired or invalid. Please sign in again.' });
  }
}
