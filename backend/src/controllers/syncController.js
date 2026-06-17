import { firestoreService } from '../services/firestoreService.js';
import { googleDriveService } from '../services/googleDriveService.js';
import { authController } from './authController.js';
import { fillController } from './fillController.js';
import { alertController } from './alertController.js';
import { creditController } from './creditController.js';
import { statsController } from './statsController.js';
import { driveFolderId } from '../config/google.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'cng_fleet_jwt_secret_key_default';

export const syncController = {
  async dispatchSync(req, res) {
    try {
      const data = req.body;
      const action = data.action;

      if (!action) {
        return res.status(400).json({ success: false, error: 'No action parameter provided.' });
      }

      console.log(`[DISPATCH] Processing sync action: "${action}"`);
      
      const PUBLIC_ACTIONS = [
        'loginOwner',
        'loginOwnerWithOTP',
        'sendLoginOTP',
        'registerOwner',
        'sendOTP',
        'verifyOTP',
        'sendResetOTP',
        'resetPassword',
        
        // Driver actions
        'addFill', 
        'uploadMedia', 
        'updateVehicleOdometer', 
        'addAlert'
      ];

      if (!PUBLIC_ACTIONS.includes(action)) {
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
        } catch (err) {
          return res.status(401).json({ success: false, error: 'Session expired or invalid. Please sign in again.' });
        }
      }

      let result = { success: false, error: `Action "${action}" is not supported.` };

      // 1. Google Drive Media Upload
      if (action === 'uploadMedia') {
        if (!driveFolderId) {
          result = { success: false, error: 'Google Drive folder ID not configured on server.' };
        } else {
          result = await googleDriveService.uploadMedia(data, driveFolderId);
        }
      }
      // 2. Fills
      else if (action === 'addFill') {
        result = await fillController.handleAddFill(data);
      } else if (action === 'updateFill') {
        result = await fillController.handleUpdateFill(data);
      }
      // 3. Alerts
      else if (action === 'addAlert') {
        result = await alertController.handleAddAlert(data);
      } else if (action === 'resolveAlert') {
        result = await alertController.handleResolveAlert(data);
      }
      // 4. Owners
      else if (action === 'updateOwner') {
        result = await authController.handleUpdateOwner(data);
      } else if (action === 'registerOwner') {
        result = await authController.handleRegisterOwner(data);
      } else if (action === 'loginOwner') {
        result = await authController.handleLoginOwner(data);
      }
      // 5. Payments
      else if (action === 'addPaymentEntry') {
        result = await creditController.handleAddPaymentEntry(data);
      } else if (action === 'getOwnerPayments') {
        result = await creditController.handleGetOwnerPayments(data);
      }
      // 6. Credit Actions
      else if (action === 'addCreditAction') {
        result = await creditController.handleAddCreditAction(data);
      } else if (action === 'updateCreditAction') {
        result = await creditController.handleUpdateCreditAction(data, req.user);
      }
      // 7. Stats
      else if (action === 'getOwnerStats') {
        result = await statsController.handleGetOwnerStats(data);
      } else if (action === 'getVehicleStats') {
        result = await statsController.handleGetVehicleStats(data);
      }
      // 8. OTP / Auth Resets
      else if (action === 'sendOTP') {
        result = await authController.handleSendOTP(data);
      } else if (action === 'verifyOTP') {
        result = await authController.handleVerifyOTP(data);
      } else if (action === 'sendResetOTP') {
        result = await authController.handleSendResetOTP(data);
      } else if (action === 'resetPassword') {
        result = await authController.handleResetPassword(data);
      } else if (action === 'sendLoginOTP') {
        result = await authController.handleSendLoginOTP(data);
      } else if (action === 'loginOwnerWithOTP') {
        result = await authController.handleLoginOwnerWithOTP(data);
      }
      // 9. Vehicles CRUD
      else if (action === 'addVehicle') {
        const vehicleId = data.id || 'veh_' + Date.now();
        const newVehicleData = {
          id: vehicleId,
          plate: data.plate,
          model: data.model,
          initialOdo: parseInt(data.initialOdo) || 0,
          currentOdo: parseInt(data.currentOdo) || 0,
          capacity: parseInt(data.capacity) || 60,
          ownerId: data.ownerId,
          status: 'active'
        };
        await firestoreService.setDocument('vehicles', vehicleId, newVehicleData);
        result = { success: true };
      } else if (action === 'updateVehicle') {
        const updates = {};
        const fields = ['plate', 'model', 'initialOdo', 'currentOdo', 'capacity', 'status', 'ownerId'];
        fields.forEach(f => {
          if (data[f] !== undefined) updates[f] = data[f];
        });
        const success = await firestoreService.updateDocument('vehicles', data.vehicleId, updates);
        result = { success };
      } else if (action === 'updateVehicleOdometer') {
        const updates = { currentOdo: parseInt(data.odometer) || 0 };
        const success = await firestoreService.updateDocument('vehicles', data.vehicleId, updates);
        result = { success };
      } else if (action === 'deleteVehicle') {
        const success = await firestoreService.deleteDocument('vehicles', data.id);
        result = { success };
      }
      // 10. Drivers CRUD
      else if (action === 'addDriver') {
        const driverId = data.id || 'drv_' + Date.now();
        const newDriverData = {
          id: driverId,
          name: data.name,
          code: data.code,
          assignedVehicleId: data.assignedVehicleId || '',
          ownerId: data.ownerId,
          status: 'active',
          createdAt: new Date().toISOString()
        };
        await firestoreService.setDocument('drivers', driverId, newDriverData);
        result = { success: true };
      } else if (action === 'updateDriver') {
        const updates = {};
        if (data.code !== undefined) updates.code = data.code;
        if (data.assignedVehicleId !== undefined) updates.assignedVehicleId = data.assignedVehicleId || '';
        const success = await firestoreService.updateDocument('drivers', data.id, updates);
        result = { success };
      } else if (action === 'deleteDriver') {
        const success = await firestoreService.deleteDocument('drivers', data.id);
        result = { success };
      }
      // 11. Bundle Get Data
      else if (action === 'getData') {
        const role = req.user.role;
        const ownerId = req.user.ownerId;

        let fills, drivers, vehicles, owners, alerts, paymentEntries, creditActions;

        if (role === 'admin') {
          [fills, drivers, vehicles, owners, alerts, paymentEntries, creditActions] = await Promise.all([
            firestoreService.getCollectionData('fills'),
            firestoreService.getCollectionData('drivers'),
            firestoreService.getCollectionData('vehicles'),
            firestoreService.getCollectionData('owners'),
            firestoreService.getCollectionData('alerts'),
            firestoreService.getCollectionData('payments'),
            firestoreService.getCollectionData('creditActions')
          ]);
        } else {
          // Recalculate credit for this owner specifically
          await firestoreService.recalculateOwnerCredit(ownerId);

          const [f, d, v, oDoc, a, p, ca] = await Promise.all([
            firestoreService.getCollectionDataFiltered('fills', 'ownerId', ownerId),
            firestoreService.getCollectionDataFiltered('drivers', 'ownerId', ownerId),
            firestoreService.getCollectionDataFiltered('vehicles', 'ownerId', ownerId),
            firestoreService.getDocument('owners', ownerId),
            firestoreService.getCollectionDataFiltered('alerts', 'ownerId', ownerId),
            firestoreService.getCollectionDataFiltered('payments', 'ownerId', ownerId),
            firestoreService.getCollectionDataFiltered('creditActions', 'ownerId', ownerId)
          ]);

          fills = f;
          drivers = d;
          vehicles = v;
          owners = oDoc ? [oDoc] : [];
          alerts = a;
          paymentEntries = p;
          creditActions = ca;
        }

        result = {
          success: true,
          fills,
          drivers,
          vehicles,
          owners,
          alerts,
          paymentEntries,
          creditActions
        };
      }

      return res.json(result);

    } catch (error) {
      console.error('API Error in sync dispatch:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
};
