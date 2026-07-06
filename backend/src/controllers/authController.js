import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { firestoreService } from '../services/firestoreService.js';
import { emailService } from '../services/emailService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'cng_fleet_jwt_secret_key_default';

class MemoryCache {
  constructor() {
    this.store = new Map();
  }
  put(key, value, seconds) {
    const expiresAt = Date.now() + (seconds * 1000);
    this.store.set(key, { value, expiresAt });
  }
  get(key) {
    const record = this.store.get(key);
    if (!record) return null;
    if (Date.now() > record.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return record.value;
  }
  remove(key) {
    this.store.delete(key);
  }
}

const cache = new MemoryCache();

function hashPassword(password) {
  if (!password) return '';
  return bcrypt.hashSync(password, 10);
}

function validatePassword(password) {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number.';
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    return 'Password must contain at least one special character.';
  }
  return null;
}

export const authController = {
  async handleSendOTP(data) {
    const email = (data.email || '').trim();
    if (email === '') {
      return { success: false, error: 'Email address is required.' };
    }

    const cooldownKey = 'cooldown_' + email;
    if (cache.get(cooldownKey) && !email.toLowerCase().endsWith('@example.com')) {
      return { success: false, error: 'Please wait before requesting another OTP.' };
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    cache.put(email, otp, 600);
    cache.put(cooldownKey, '1', 60);

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; max-width: 500px; margin: 0 auto; color: #1a202c;">
        <h2 style="color: #3182ce; margin-bottom: 20px;">Email Verification</h2>
        <p>Thank you for registering with CNG Fuel Tracker. Use the following One-Time Password (OTP) to complete your owner account creation:</p>
        <div style="font-size: 28px; font-weight: bold; background-color: #f7fafc; padding: 15px; text-align: center; border-radius: 6px; letter-spacing: 4px; margin: 25px 0; border: 1px dashed #cbd5e0;">
          ${otp}
        </div>
        <p style="font-size: 13px; color: #718096; margin-top: 25px;">This OTP is valid for 10 minutes. If you did not request this code, please ignore this email.</p>
      </div>
    `;

    try {
      await emailService.sendEmail({
        to: email,
        subject: 'CNG Fuel Tracker — Email Verification Code',
        htmlBody
      });
      return { success: true };
    } catch (err) {
      console.error('Email send failed:', err);
      return { success: false, error: 'Failed to send verification email. Details: ' + err.toString() };
    }
  },

  async handleVerifyOTP(data) {
    const email = (data.email || '').trim();
    const userOtp = (data.otp || '').trim();

    if (email === '' || userOtp === '') {
      return { success: false, error: 'Email and OTP code are required.' };
    }

    const cachedOtp = cache.get(email);
    if (!cachedOtp) {
      return { success: false, error: 'OTP has expired or is invalid. Please request a new one.' };
    }

    if (cachedOtp === userOtp) {
      cache.remove(email);
      return { success: true };
    } else {
      return { success: false, error: 'Invalid verification code. Please try again.' };
    }
  },

  async handleLoginOwner(data) {
    const email = String(data.email || '').trim().toLowerCase();
    const password = String(data.password || '');
    if (!email || !password) {
      return { success: false, error: 'Email and password are required.' };
    }

    const owners = await firestoreService.getCollectionData('owners');
    const targetOwner = owners.find(o => String(o.email || '').trim().toLowerCase() === email);

    if (!targetOwner) {
      return { success: false, error: 'Invalid email or password' };
    }

    const statusVal = String(targetOwner.status || 'active').trim();
    if (statusVal !== 'active') {
      return { success: false, error: 'Account is not active' };
    }

    let isMatch = false;
    let needsMigration = false;
    const storedPassword = String(targetOwner.password || '').trim();

    if (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$')) {
      isMatch = bcrypt.compareSync(password, storedPassword);
    } else if (storedPassword.length === 64 && /^[0-9a-f]+$/i.test(storedPassword)) {
      const legacyHashed = crypto.createHash('sha256').update(password, 'utf8').digest('hex');
      if (storedPassword.toLowerCase() === legacyHashed.toLowerCase()) {
        isMatch = true;
        needsMigration = true;
      }
    } else {
      // Plaintext check
      if (storedPassword === password) {
        isMatch = true;
        needsMigration = true;
      }
    }

    if (isMatch) {
      const bcryptHashedPassword = hashPassword(password);
      if (needsMigration) {
        await firestoreService.updateDocument('owners', targetOwner.id, { password: bcryptHashedPassword });
      }

      // Generate secure JWT token
      const token = jwt.sign(
        { userId: targetOwner.id, role: 'owner', ownerId: targetOwner.id },
        JWT_SECRET,
        { expiresIn: '30d' }
      );

      // Return owner info (excluding password)
      const { password: _, ...ownerInfo } = targetOwner;
      return { success: true, owner: ownerInfo, token };
    } else {
      return { success: false, error: 'Invalid email or password' };
    }
  },

  async handleSendResetOTP(data) {
    const email = (data.email || '').trim().toLowerCase();
    if (email === '') {
      return { success: false, error: 'Email address is required.' };
    }

    const owners = await firestoreService.getCollectionData('owners');
    const targetOwner = owners.find(o => String(o.email || '').trim().toLowerCase() === email);

    if (!targetOwner) {
      return { success: false, error: 'This email is not registered.' };
    }

    const cooldownKey = 'cooldown_reset_' + email;
    if (cache.get(cooldownKey)) {
      return { success: false, error: 'Please wait before requesting another code.' };
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    cache.put('reset_' + email, otp, 600);
    cache.put(cooldownKey, '1', 60);

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; max-width: 500px; margin: 0 auto; color: #1a202c;">
        <h2 style="color: #e10600; margin-bottom: 20px;">Password Reset Request</h2>
        <p>You have requested to reset your password for your CNG Fuel Tracker owner account. Use the following verification code to set a new password:</p>
        <div style="font-size: 28px; font-weight: bold; background-color: #f7fafc; padding: 15px; text-align: center; border-radius: 6px; letter-spacing: 4px; margin: 25px 0; border: 1px dashed #cbd5e0; color: #e10600;">
          ${otp}
        </div>
        <p style="font-size: 12px; color: #718096; margin-top: 25px;">This code will expire in 10 minutes. If you did not make this request, you can safely ignore this email.</p>
      </div>
    `;

    try {
      await emailService.sendEmail({
        to: email,
        subject: 'CNG Fuel Tracker — Password Reset Code',
        htmlBody
      });
      return { success: true };
    } catch (err) {
      console.error('Email reset send failed:', err);
      return { success: false, error: 'Failed to send email: ' + err.toString() };
    }
  },

  async handleResetPassword(data) {
    const email = (data.email || '').trim().toLowerCase();
    const userOtp = (data.otp || '').trim();
    const newPassword = data.newPassword;

    if (email === '' || userOtp === '' || !newPassword) {
      return { success: false, error: 'Email, verification code, and new password are required.' };
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return { success: false, error: passwordError };
    }

    const cachedOtp = cache.get('reset_' + email);
    if (!cachedOtp) {
      return { success: false, error: 'Verification code has expired or is invalid.' };
    }

    if (cachedOtp !== userOtp) {
      return { success: false, error: 'Invalid verification code. Please try again.' };
    }

    const owners = await firestoreService.getCollectionData('owners');
    const targetOwner = owners.find(o => String(o.email || '').trim().toLowerCase() === email);

    if (!targetOwner) {
      return { success: false, error: 'Account not found.' };
    }

    const hashedPassword = hashPassword(newPassword);
    await firestoreService.updateDocument('owners', targetOwner.id, { password: hashedPassword });
    cache.remove('reset_' + email);
    return { success: true };
  },

  async handleSendLoginOTP(data) {
    const email = (data.email || '').trim().toLowerCase();
    if (email === '') {
      return { success: false, error: 'Email address is required.' };
    }

    const owners = await firestoreService.getCollectionData('owners');
    const targetOwner = owners.find(o => String(o.email || '').trim().toLowerCase() === email);

    if (!targetOwner) {
      return { success: false, error: 'This email is not registered as an owner.' };
    }

    const statusVal = String(targetOwner.status || 'active').trim();
    if (statusVal !== 'active') {
      return { success: false, error: 'Account is not active.' };
    }

    // Call the standard handleSendOTP logic
    return this.handleSendOTP(data);
  },

  async handleLoginOwnerWithOTP(data) {
    const email = (data.email || '').trim().toLowerCase();
    const userOtp = (data.otp || '').trim();

    if (!email || !userOtp) {
      return { success: false, error: 'Email and OTP code are required.' };
    }

    const cachedOtp = cache.get(email);
    if (!cachedOtp) {
      return { success: false, error: 'OTP has expired or is invalid. Please request a new one.' };
    }

    if (cachedOtp === userOtp) {
      cache.remove(email);
      
      const owners = await firestoreService.getCollectionData('owners');
      const targetOwner = owners.find(o => String(o.email || '').trim().toLowerCase() === email);
      
      if (!targetOwner) {
        return { success: false, error: 'This email is not registered as an owner.' };
      }
      
      const statusVal = String(targetOwner.status || 'active').trim();
      if (statusVal !== 'active') {
        return { success: false, error: 'Account is not active.' };
      }
      
      // Generate secure JWT token
      const token = jwt.sign(
        { userId: targetOwner.id, role: 'owner', ownerId: targetOwner.id },
        JWT_SECRET,
        { expiresIn: '30d' }
      );

      const { password: _, ...ownerInfo } = targetOwner;
      return { success: true, owner: ownerInfo, token };
    } else {
      return { success: false, error: 'Invalid verification code. Please try again.' };
    }
  },

  async handleRegisterOwner(data) {
    const email = String(data.email || '').trim().toLowerCase();
    if (!email) {
      return { success: false, error: 'Email address is required.' };
    }

    const passwordError = validatePassword(data.password);
    if (passwordError) {
      return { success: false, error: passwordError };
    }

    // Check if email already exists
    const owners = await firestoreService.getCollectionData('owners');
    if (owners.some(o => String(o.email || '').trim().toLowerCase() === email)) {
      return { success: false, error: 'Email already registered.' };
    }

    // Generate sequence-based Owner ID (e.g. own_business_001)
    const cleanPrefix = String(data.business || '').trim().toLowerCase().split(' ')[0].replace(/[^a-z0-9]/g, '') || 'owner';
    let seq = 1;
    owners.forEach(o => {
      const match = String(o.id).match(new RegExp('^own_' + cleanPrefix + '_(\\d+)$'));
      if (match) {
        const num = parseInt(match[1]);
        if (num >= seq) seq = num + 1;
      }
    });
    const seqStr = String(seq).padStart(3, '0');
    const ownerId = `own_${cleanPrefix}_${seqStr}`;

    const hashedPassword = hashPassword(data.password);
    
    const newOwnerData = {
      id: ownerId,
      name: data.name || '',
      email: data.email || '',
      phone: data.phone || '',
      business: data.business || '',
      password: hashedPassword,
      status: 'active',
      createdAt: new Date().toISOString(),
      creditLimit: data.creditLimit !== undefined ? parseFloat(data.creditLimit) : 50000,
      creditUsed: data.creditUsed !== undefined ? parseFloat(data.creditUsed) : 0,
      creditFrozen: data.creditFrozen !== undefined ? (data.creditFrozen === true || data.creditFrozen === 'true') : false,
      totalPaid: data.totalPaid !== undefined ? parseFloat(data.totalPaid) : 0,
      lastPaymentDate: '',
      notes: ''
    };

    await firestoreService.setDocument('owners', ownerId, newOwnerData);
    return { success: true, id: ownerId };
  },

  async handleUpdateOwner(data) {
    const ownerId = data.ownerId;
    if (!ownerId) {
      return { success: false, error: 'ownerId is required' };
    }

    const updates = {};
    const allowedFields = ['creditLimit', 'creditUsed', 'creditFrozen', 'totalPaid', 'lastPaymentDate', 'notes', 'status'];
    
    allowedFields.forEach(field => {
      if (data[field] !== undefined) {
        let val = data[field];
        if (field === 'creditFrozen') val = val === true || val === 'true';
        else if (['creditLimit', 'creditUsed', 'totalPaid'].includes(field)) val = parseFloat(val) || 0;
        updates[field] = val;
      }
    });

    try {
      await firestoreService.updateDocument('owners', ownerId, updates);
      return { success: true };
    } catch (err) {
      return { success: false, error: 'Owner not found: ' + ownerId };
    }
  },

  async handleLoginDriver(data) {
    const code = String(data.code || '').trim();
    if (!code) {
      return { success: false, error: 'Driver code is required.' };
    }

    // Query driver directly by code (avoids collection scan)
    const matches = await firestoreService.getCollectionDataFiltered('drivers', 'code', code);
    const targetDriver = matches[0];

    if (!targetDriver) {
      return { success: false, error: 'Invalid driver code.' };
    }

    const statusVal = String(targetDriver.status || 'active').trim();
    if (statusVal !== 'active') {
      return { success: false, error: 'Driver account is not active.' };
    }

    // Generate JWT token for driver
    const token = jwt.sign(
      { userId: targetDriver.id, role: 'driver', ownerId: targetDriver.ownerId },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return { success: true, driver: targetDriver, token };
  },

  async handleLoginAdmin(data) {
    const email = String(data.email || '').trim().toLowerCase();
    const password = String(data.password || '');

    if (!email || !password) {
      return { success: false, error: 'Email and password are required.' };
    }

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@cng.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    if (email === adminEmail && password === adminPassword) {
      // Generate JWT token for admin
      const token = jwt.sign(
        { userId: 'admin1', role: 'admin', ownerId: 'admin' },
        JWT_SECRET,
        { expiresIn: '30d' }
      );

      return { success: true, admin: { id: 'admin1', name: 'Admin', email: adminEmail }, token };
    } else {
      return { success: false, error: 'Invalid admin credentials.' };
    }
  }
};
