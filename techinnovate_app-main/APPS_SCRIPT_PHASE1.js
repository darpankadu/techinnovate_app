// CNG FUEL TRACKER - AUTO SETUP v2.0 (Phase 1 Backend)
// Adds: PaymentEntries sheet, Credit fields for Owners, updateOwner, addPaymentEntry, getOwnerPayments
// Paste this in Apps Script, run setup(), then deploy

function restoreDemoData() {
  const props = PropertiesService.getScriptProperties();
  const SHEET_ID = props.getProperty('SHEET_ID');
  if (!SHEET_ID) return 'Run setup() first';
  
  const ss = SpreadsheetApp.openById(SHEET_ID);
  
  // Clear and restore Owners (with credit fields)
  const ownersSheet = ss.getSheetByName('Owners');
  ownersSheet.clear();
  ownersSheet.appendRow(['id', 'name', 'email', 'phone', 'business', 'password', 'status', 'createdAt', 'creditLimit', 'creditUsed', 'creditFrozen', 'totalPaid', 'lastPaymentDate', 'notes']);
  ownersSheet.appendRow(['own1', 'Rajesh Patel', 'owner@demo.com', '9876543210', 'Patel Transport', 'demo123', 'active', new Date().toISOString(), 50000, 0, false, 0, '', 'Demo owner']);
  
  // Clear and restore Drivers
  const driversSheet = ss.getSheetByName('Drivers');
  driversSheet.clear();
  driversSheet.appendRow(['id', 'name', 'code', 'assignedVehicleId', 'ownerId', 'status', 'createdAt']);
  driversSheet.appendRow(['drv1', 'Amit Kumar', '1234', 'veh1', 'own1', 'active', new Date().toISOString()]);
  driversSheet.appendRow(['drv2', 'Suresh Singh', '5678', 'veh2', 'own1', 'active', new Date().toISOString()]);
  
  // Clear and restore Vehicles
  const vehiclesSheet = ss.getSheetByName('Vehicles');
  vehiclesSheet.clear();
  vehiclesSheet.appendRow(['id', 'plate', 'model', 'initialOdo', 'currentOdo', 'capacity', 'ownerId', 'status']);
  vehiclesSheet.appendRow(['veh1', 'GJ-01-AB-1234', 'Tata Ace CNG', 45000, 47820, 60, 'own1', 'active']);
  vehiclesSheet.appendRow(['veh2', 'GJ-05-XY-5678', 'Ashok Leyland Dost', 32000, 34150, 75, 'own1', 'active']);
  
  // Clear PaymentEntries if exists
  const paymentSheet = ss.getSheetByName('PaymentEntries');
  if (paymentSheet) {
    paymentSheet.clear();
    paymentSheet.appendRow(['id', 'ownerId', 'amount', 'date', 'method', 'notes', 'createdAt']);
  }
  
  return 'Demo data restored!';
}

function setup() {
  Logger.log('=== CNG TRACKER AUTO SETUP v2.0 ===');
  
  // 1. Create Spreadsheet
  const ss = SpreadsheetApp.create('CNG Fuel Tracker DB v2');
  const sheetId = ss.getId();
  Logger.log('Sheet created: ' + ss.getUrl());
  Logger.log('SHEET ID: ' + sheetId);
  
  // 2. Create sheets with headers
  const sheets = [
    {
      name: 'Owners',
      headers: ['id', 'name', 'email', 'phone', 'business', 'password', 'status', 'createdAt', 'creditLimit', 'creditUsed', 'creditFrozen', 'totalPaid', 'lastPaymentDate', 'notes']
    },
    {
      name: 'Drivers', 
      headers: ['id', 'name', 'code', 'assignedVehicleId', 'ownerId', 'status', 'createdAt']
    },
    {
      name: 'Vehicles',
      headers: ['id', 'plate', 'model', 'initialOdo', 'currentOdo', 'capacity', 'ownerId', 'status']
    },
    {
      name: 'Fills',
      headers: ['id', 'vehicleId', 'driverId', 'time', 'station', 'kgs', 'rate', 'total', 'videoUrl', 'pumpPhotoUrl', 'receiptPhotoUrl', 'odoPhotoUrl', 'pumpGPS', 'receiptGPS', 'odoGPS', 'odoReading', 'distanceDiff', 'mismatch', 'fuelDropPercent', 'ownerId', 'verified']
    },
    {
      name: 'Alerts',
      headers: ['id', 'time', 'event', 'user', 'type', 'ownerId', 'resolved']
    },
    {
      name: 'PaymentEntries',
      headers: ['id', 'ownerId', 'amount', 'date', 'method', 'notes', 'createdAt']
    }
  ];
  
  // Delete default Sheet1 (after creating others)
  sheets.forEach(s => {
    const sheet = ss.insertSheet(s.name);
    sheet.getRange(1, 1, 1, s.headers.length).setValues([s.headers]);
    sheet.getRange(1, 1, 1, s.headers.length).setFontWeight('bold').setBackground('#EE2726').setFontColor('white');
    sheet.setFrozenRows(1);
    Logger.log('Created tab: ' + s.name);
  });
  
  // Now delete default Sheet1
  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet) {
    ss.deleteSheet(defaultSheet);
    Logger.log('Removed default Sheet1');
  }
  
  // 3. Add demo data (with credit fields)
  const ownersSheet = ss.getSheetByName('Owners');
  ownersSheet.appendRow(['own1', 'Rajesh Patel', 'owner@demo.com', '9876543210', 'Patel Transport', 'demo123', 'active', new Date().toISOString(), 50000, 0, false, 0, '', 'Demo owner']);
  
  const driversSheet = ss.getSheetByName('Drivers');
  driversSheet.appendRow(['drv1', 'Amit Kumar', '1234', 'veh1', 'own1', 'active', new Date().toISOString()]);
  driversSheet.appendRow(['drv2', 'Suresh Singh', '5678', 'veh2', 'own1', 'active', new Date().toISOString()]);
  
  const vehiclesSheet = ss.getSheetByName('Vehicles');
  vehiclesSheet.appendRow(['veh1', 'GJ-01-AB-1234', 'Tata Ace CNG', 45000, 47820, 60, 'own1', 'active']);
  vehiclesSheet.appendRow(['veh2', 'GJ-05-XY-5678', 'Ashok Leyland Dost', 32000, 34150, 75, 'own1', 'active']);
  
  Logger.log('Demo data added');
  
  // 4. Create Drive folder
  const driveFolder = DriveApp.createFolder('CNG Fuel Media');
  const folderId = driveFolder.getId();
  driveFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  Logger.log('Drive folder created: ' + driveFolder.getUrl());
  Logger.log('FOLDER ID: ' + folderId);
  
  // 5. Save config to script properties
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SHEET_ID', sheetId);
  props.setProperty('DRIVE_FOLDER_ID', folderId);
  
  Logger.log('');
  Logger.log('=== SETUP COMPLETE ===');
  Logger.log('');
  Logger.log('COPY THESE VALUES:');
  Logger.log('SHEET_ID = ' + sheetId);
  Logger.log('DRIVE_FOLDER_ID = ' + folderId);
  Logger.log('');
  Logger.log('Next: Deploy as Web App');
  
  // Show popup
  SpreadsheetApp.getUi().alert(
    'Setup Complete!',
    'Sheet ID: ' + sheetId + ' | Folder ID: ' + folderId + ' | These are saved automatically. Now deploy as Web App.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
  
  return { sheetId, folderId };
}

// ============= MAIN API =============

function doPost(e) {
  try {
    const props = PropertiesService.getScriptProperties();
    const SHEET_ID = props.getProperty('SHEET_ID');
    const DRIVE_FOLDER_ID = props.getProperty('DRIVE_FOLDER_ID');
    
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    // UPLOAD MEDIA TO DRIVE
    if (action === 'uploadMedia') {
      const mainFolder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
      const plate = (data.vehiclePlate || 'Unknown').replace(/[^a-zA-Z0-9-_]/g, '_');
      const vehicleFolder = getOrCreateFolder(mainFolder, plate);
      const dateFolder = getOrCreateFolder(vehicleFolder, data.fillDate || new Date().toISOString().split('T')[0]);
      
      const bytes = Utilities.base64Decode(data.base64Data);
      const blob = Utilities.newBlob(bytes, data.mimeType, data.fileName);
      const file = dateFolder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      
      return json({
        success: true,
        fileUrl: 'https://drive.google.com/uc?export=download&id=' + file.getId(),
        fileId: file.getId()
      });
    }
    
    // SAVE FILL TO SHEET
    if (action === 'addFill') {
      const ss = SpreadsheetApp.openById(SHEET_ID);
      const sheet = ss.getSheetByName('Fills');
      
      sheet.appendRow([
        data.id,
        data.vehicleId,
        data.driverId,
        data.time,
        data.station,
        parseFloat(data.kgs) || 0,
        parseFloat(data.rate) || 0,
        parseFloat(data.total) || 0,
        data.videoUrl || '',
        data.pumpPhotoUrl || '',
        data.receiptPhotoUrl || '',
        data.odoPhotoUrl || '',
        data.pumpGPS || '',
        data.receiptGPS || '',
        data.odoGPS || '',
        parseInt(data.odoReading) || 0,
        parseFloat(data.distanceDiff) || 0,
        data.mismatch === true || data.mismatch === 'true',
        parseFloat(data.fuelDropPercent) || 0,
        data.ownerId,
        data.verified === true || data.verified === 'true'
      ]);
      
      // Update vehicle odometer
      try {
        const vSheet = ss.getSheetByName('Vehicles');
        const dataRange = vSheet.getDataRange().getValues();
        for (let i = 1; i < dataRange.length; i++) {
          if (dataRange[i][0] === data.vehicleId) {
            vSheet.getRange(i + 1, 5).setValue(parseInt(data.odoReading) || 0);
            break;
          }
        }
      } catch(err) {}
      
      // Add alert if needed
      if (data.mismatch || parseFloat(data.fuelDropPercent) > 20) {
        const aSheet = ss.getSheetByName('Alerts');
        aSheet.appendRow([
          'alert_' + Date.now(),
          data.time,
          data.mismatch ? 'Location mismatch' : 'Fuel drop',
          data.driverId,
          data.mismatch ? 'location_mismatch' : 'fuel_drop',
          data.ownerId,
          false
        ]);
      }
      
      return json({success: true, id: data.id});
    }
    
    // =================== PHASE 1: OWNER CREDIT MANAGEMENT ===================
    
    // UPDATE OWNER (Credit management, status, notes)
    if (action === 'updateOwner') {
      const ss = SpreadsheetApp.openById(SHEET_ID);
      const sheet = ss.getSheetByName('Owners');
      const values = sheet.getDataRange().getValues();
      const headers = values[0];
      
      // Find column indices for new fields
      const colIndices = {
        creditLimit: headers.indexOf('creditLimit'),
        creditUsed: headers.indexOf('creditUsed'),
        creditFrozen: headers.indexOf('creditFrozen'),
        totalPaid: headers.indexOf('totalPaid'),
        lastPaymentDate: headers.indexOf('lastPaymentDate'),
        notes: headers.indexOf('notes'),
        status: headers.indexOf('status')
      };
      
      for (let i = 1; i < values.length; i++) {
        if (values[i][0] === data.ownerId) {
          const rowNum = i + 1;
          const updates = [];
          
          if (data.creditLimit !== undefined && colIndices.creditLimit >= 0) {
            sheet.getRange(rowNum, colIndices.creditLimit + 1).setValue(parseFloat(data.creditLimit) || 0);
            updates.push('creditLimit');
          }
          if (data.creditUsed !== undefined && colIndices.creditUsed >= 0) {
            sheet.getRange(rowNum, colIndices.creditUsed + 1).setValue(parseFloat(data.creditUsed) || 0);
            updates.push('creditUsed');
          }
          if (data.creditFrozen !== undefined && colIndices.creditFrozen >= 0) {
            sheet.getRange(rowNum, colIndices.creditFrozen + 1).setValue(data.creditFrozen === true || data.creditFrozen === 'true');
            updates.push('creditFrozen');
          }
          if (data.totalPaid !== undefined && colIndices.totalPaid >= 0) {
            sheet.getRange(rowNum, colIndices.totalPaid + 1).setValue(parseFloat(data.totalPaid) || 0);
            updates.push('totalPaid');
          }
          if (data.lastPaymentDate !== undefined && colIndices.lastPaymentDate >= 0) {
            sheet.getRange(rowNum, colIndices.lastPaymentDate + 1).setValue(data.lastPaymentDate);
            updates.push('lastPaymentDate');
          }
          if (data.notes !== undefined && colIndices.notes >= 0) {
            sheet.getRange(rowNum, colIndices.notes + 1).setValue(data.notes);
            updates.push('notes');
          }
          if (data.status !== undefined && colIndices.status >= 0) {
            sheet.getRange(rowNum, colIndices.status + 1).setValue(data.status);
            updates.push('status');
          }
          
          return json({success: true, updated: updates});
        }
      }
      
      return json({success: false, error: 'Owner not found: ' + data.ownerId});
    }
    
    // ADD PAYMENT ENTRY
    if (action === 'addPaymentEntry') {
      const ss = SpreadsheetApp.openById(SHEET_ID);
      
      // Add to PaymentEntries sheet
      const paymentSheet = ss.getSheetByName('PaymentEntries');
      const paymentId = 'pay_' + Date.now();
      
      paymentSheet.appendRow([
        paymentId,
        data.ownerId,
        parseFloat(data.amount) || 0,
        data.date || new Date().toISOString().split('T')[0],
        data.method || 'cash',
        data.notes || '',
        new Date().toISOString()
      ]);
      
      // Update owner's totalPaid and lastPaymentDate
      const ownerSheet = ss.getSheetByName('Owners');
      const ownerValues = ownerSheet.getDataRange().getValues();
      const ownerHeaders = ownerValues[0];
      const totalPaidCol = ownerHeaders.indexOf('totalPaid');
      const lastPaymentCol = ownerHeaders.indexOf('lastPaymentDate');
      
      if (totalPaidCol >= 0) {
        for (let i = 1; i < ownerValues.length; i++) {
          if (ownerValues[i][0] === data.ownerId) {
            const currentPaid = parseFloat(ownerValues[i][totalPaidCol]) || 0;
            ownerSheet.getRange(i + 1, totalPaidCol + 1).setValue(currentPaid + (parseFloat(data.amount) || 0));
            if (lastPaymentCol >= 0) {
              ownerSheet.getRange(i + 1, lastPaymentCol + 1).setValue(data.date || new Date().toISOString().split('T')[0]);
            }
            break;
          }
        }
      }
      
      return json({success: true, id: paymentId});
    }
    
    // =================== END PHASE 1 ===================
    
    // REGISTER OWNER
    if (action === 'registerOwner') {
      const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Owners');
      sheet.appendRow([
        data.id, 
        data.name, 
        data.email, 
        data.phone, 
        data.business, 
        data.password, 
        'active', 
        new Date().toISOString(),
        50000, // creditLimit default
        0,     // creditUsed
        false, // creditFrozen
        0,     // totalPaid
        '',    // lastPaymentDate
        ''     // notes
      ]);
      return json({success: true});
    }
    
    // ADD DRIVER
    if (action === 'addDriver') {
      const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Drivers');
      sheet.appendRow([data.id, data.name, data.code, data.assignedVehicleId || '', data.ownerId, 'active', new Date().toISOString()]);
      return json({success: true});
    }
    
    // ADD VEHICLE
    if (action === 'addVehicle') {
      const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Vehicles');
      sheet.appendRow([data.id, data.plate, data.model, parseInt(data.initialOdo) || 0, parseInt(data.currentOdo) || 0, parseInt(data.capacity) || 60, data.ownerId, 'active']);
      return json({success: true});
    }
    
    // UPDATE DRIVER
    if (action === 'updateDriver') {
      const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Drivers');
      const values = sheet.getDataRange().getValues();
      for (let i = 1; i < values.length; i++) {
        if (values[i][0] === data.id) {
          if (data.code !== undefined) sheet.getRange(i + 1, 3).setValue(data.code);
          if (data.assignedVehicleId !== undefined) sheet.getRange(i + 1, 4).setValue(data.assignedVehicleId || '');
          break;
        }
      }
      return json({success: true});
    }
    
    // DELETE DRIVER
    if (action === 'deleteDriver') {
      const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Drivers');
      const values = sheet.getDataRange().getValues();
      for (let i = 1; i < values.length; i++) {
        if (values[i][0] === data.id) {
          sheet.deleteRow(i + 1);
          break;
        }
      }
      return json({success: true});
    }
    
    // DELETE VEHICLE
    if (action === 'deleteVehicle') {
      const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Vehicles');
      const values = sheet.getDataRange().getValues();
      for (let i = 1; i < values.length; i++) {
        if (values[i][0] === data.id) {
          sheet.deleteRow(i + 1);
          break;
        }
      }
      return json({success: true});
    }
    
    // GET DATA
    if (action === 'getFills') {
      const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Fills');
      const values = sheet.getDataRange().getValues();
      const headers = values[0];
      const dataRows = values.slice(1).map(row => {
        const obj = {};
        headers.forEach((h, i) => obj[h] = row[i]);
        return obj;
      });
      return json({success: true, fills: dataRows});
    }
    
    // GET ALL DATA (Enhanced for Phase 1)
    if (action === 'getData') {
      const ss = SpreadsheetApp.openById(SHEET_ID);
      const getSheetData = (name) => {
        const sheet = ss.getSheetByName(name);
        if (!sheet) return [];
        const values = sheet.getDataRange().getValues();
        const headers = values[0];
        return values.slice(1).map(row => {
          const obj = {};
          headers.forEach((h, i) => {
            // Parse booleans and numbers properly
            let val = row[i];
            if (val === 'true') val = true;
            else if (val === 'false') val = false;
            else if (typeof val === 'string' && !isNaN(val) && val !== '') val = parseFloat(val);
            obj[h] = val;
          });
          return obj;
        });
      };
      
      return json({
        success: true,
        fills: getSheetData('Fills'),
        drivers: getSheetData('Drivers'),
        vehicles: getSheetData('Vehicles'),
        owners: getSheetData('Owners'),
        alerts: getSheetData('Alerts'),
        paymentEntries: getSheetData('PaymentEntries') // Phase 1: Added payment entries
      });
    }
    
    // GET OWNER PAYMENTS (Phase 1)
    if (action === 'getOwnerPayments') {
      const ss = SpreadsheetApp.openById(SHEET_ID);
      const sheet = ss.getSheetByName('PaymentEntries');
      if (!sheet) return json({success: true, payments: []});
      
      const values = sheet.getDataRange().getValues();
      const headers = values[0];
      const payments = [];
      
      for (let i = 1; i < values.length; i++) {
        if (values[i][1] === data.ownerId) { // ownerId is column 1
          const obj = {};
          headers.forEach((h, idx) => {
            let val = values[i][idx];
            if (typeof val === 'string' && !isNaN(val) && val !== '') val = parseFloat(val);
            obj[h] = val;
          });
          payments.push(obj);
        }
      }
      
      return json({success: true, payments: payments});
    }
    
    return json({success: false, error: 'Unknown action: ' + action});
    
  } catch(err) {
    return json({success: false, error: err.toString(), stack: err.stack});
  }
}

function doGet(e) {
  const action = e.parameter.action;
  
  // Handle getData action via GET
  if (action === 'getData') {
    try {
      const SHEET_ID = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
      const ss = SpreadsheetApp.openById(SHEET_ID);
      const getSheetData = (name) => {
        const sheet = ss.getSheetByName(name);
        if (!sheet) return [];
        const values = sheet.getDataRange().getValues();
        const headers = values[0];
        return values.slice(1).map(row => {
          const obj = {};
          headers.forEach((h, i) => {
            let val = row[i];
            if (val === 'true') val = true;
            else if (val === 'false') val = false;
            else if (typeof val === 'string' && !isNaN(val) && val !== '') val = parseFloat(val);
            obj[h] = val;
          });
          return obj;
        });
      };
      return json({
        success: true,
        fills: getSheetData('Fills'),
        drivers: getSheetData('Drivers'),
        vehicles: getSheetData('Vehicles'),
        owners: getSheetData('Owners'),
        alerts: getSheetData('Alerts'),
        paymentEntries: getSheetData('PaymentEntries')
      });
    } catch(err) {
      return json({success: false, error: err.toString()});
    }
  }
  
  return json({
    status: 'CNG Fuel Tracker API',
    version: '2.0',
    phase: 'Phase 1 - Owner Credit Management',
    time: new Date().toISOString(),
    setup: PropertiesService.getScriptProperties().getProperty('SHEET_ID') ? 'complete' : 'run setup() first'
  });
}

// Helper functions
function getOrCreateFolder(parent, name) {
  const folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// Test function
function testSetup() {
  const props = PropertiesService.getScriptProperties();
  Logger.log('Sheet ID: ' + props.getProperty('SHEET_ID'));
  Logger.log('Folder ID: ' + props.getProperty('DRIVE_FOLDER_ID'));
  
  // Test upload
  const testData = {
    action: 'uploadMedia',
    fileName: 'test.txt',
    vehiclePlate: 'TEST-123',
    fillDate: '2024-01-15',
    mimeType: 'text/plain',
    base64Data: Utilities.base64Encode('Hello World')
  };
  
  const result = doPost({postData: {contents: JSON.stringify(testData)}});
  Logger.log('Test result: ' + result.getContent());
}
