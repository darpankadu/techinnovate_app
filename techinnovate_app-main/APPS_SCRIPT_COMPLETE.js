// CNG FUEL TRACKER - COMPLETE MIGRATION v2.0
// This single file handles: setup, migration, and all API endpoints
// Paste ALL of this into your Apps Script project
// Run: setupOrMigrate() - it will automatically detect and handle everything

// ============= CONFIGURATION =============
const CONFIG = {
  VERSION: '2.0',
  PHASE: 'Phase 1 - Owner Credit Management',
  SHEETS: {
    Owners: {
      required: true,
      headers: ['id', 'name', 'email', 'phone', 'business', 'password', 'status', 'createdAt', 'creditLimit', 'creditUsed', 'creditFrozen', 'totalPaid', 'lastPaymentDate', 'notes'],
      defaults: [50000, 0, false, 0, '', ''] // For columns 9-14
    },
    Drivers: {
      required: true,
      headers: ['id', 'name', 'code', 'assignedVehicleId', 'ownerId', 'status', 'createdAt']
    },
    Vehicles: {
      required: true,
      headers: ['id', 'plate', 'model', 'initialOdo', 'currentOdo', 'capacity', 'ownerId', 'status']
    },
    Fills: {
      required: true,
      headers: ['id', 'vehicleId', 'driverId', 'time', 'station', 'kgs', 'rate', 'total', 'videoUrl', 'pumpPhotoUrl', 'receiptPhotoUrl', 'odoPhotoUrl', 'pumpGPS', 'receiptGPS', 'odoGPS', 'odoReading', 'distanceDiff', 'mismatch', 'fuelDropPercent', 'ownerId', 'verified']
    },
    Alerts: {
      required: true,
      headers: ['id', 'time', 'event', 'user', 'type', 'ownerId', 'resolved']
    },
    PaymentEntries: {
      required: false,
      headers: ['id', 'ownerId', 'amount', 'date', 'method', 'notes', 'createdAt']
    }
  }
};

// ============= SETUP OR MIGRATE =============
function setupOrMigrate() {
  Logger.log('=== CNG FUEL TRACKER v' + CONFIG.VERSION + ' ===');
  Logger.log(CONFIG.PHASE);
  Logger.log('');
  
  const props = PropertiesService.getScriptProperties();
  let SHEET_ID = props.getProperty('SHEET_ID');
  let DRIVE_FOLDER_ID = props.getProperty('DRIVE_FOLDER_ID');
  
  // Step 1: Check if setup exists
  if (!SHEET_ID) {
    Logger.log('No existing setup found. Creating fresh database...');
    return freshSetup();
  }
  
  // Step 2: Check if migration needed
  Logger.log('Existing setup found. Checking migration status...');
  Logger.log('Sheet ID: ' + SHEET_ID);
  
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const migrationNeeded = checkMigrationNeeded(ss);
    
    if (migrationNeeded.needsMigration) {
      Logger.log('Migration required for: ' + migrationNeeded.sheetsToCreate.join(', '));
      Logger.log('New columns needed: ' + migrationNeeded.columnsToAdd.join(', '));
      return migrateExisting(ss, migrationNeeded);
    } else {
      Logger.log('No migration needed. Database is up to date!');
      showSuccess('Database Up to Date!', 'Your database is already at v' + CONFIG.VERSION);
      return { status: 'up_to_date', version: CONFIG.VERSION };
    }
  } catch (err) {
    Logger.log('Error accessing sheet: ' + err);
    return { success: false, error: err.toString() };
  }
}

// ============= FRESH SETUP =============
function freshSetup() {
  Logger.log('\\n--- Creating Fresh Database ---');
  
  // Create Spreadsheet
  const ss = SpreadsheetApp.create('CNG Fuel Tracker DB v' + CONFIG.VERSION);
  const SHEET_ID = ss.getId();
  Logger.log('Created sheet: ' + ss.getUrl());
  
  // Create Drive folder
  const driveFolder = DriveApp.createFolder('CNG Fuel Media');
  const DRIVE_FOLDER_ID = driveFolder.getId();
  driveFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  Logger.log('Created Drive folder: ' + driveFolder.getUrl());
  
  // Create all sheets with headers
  Object.keys(CONFIG.SHEETS).forEach(sheetName => {
    const config = CONFIG.SHEETS[sheetName];
    createSheetWithHeaders(ss, sheetName, config.headers);
  });
  
  // Delete default Sheet1
  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet) {
    ss.deleteSheet(defaultSheet);
  }
  
  // Add demo data
  addDemoData(ss);
  
  // Save properties
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SHEET_ID', SHEET_ID);
  props.setProperty('DRIVE_FOLDER_ID', DRIVE_FOLDER_ID);
  props.setProperty('DB_VERSION', CONFIG.VERSION);
  
  Logger.log('\\n=== SETUP COMPLETE ===');
  Logger.log('SHEET_ID: ' + SHEET_ID);
  Logger.log('FOLDER_ID: ' + DRIVE_FOLDER_ID);
  
  showSuccess(
    'Setup Complete!',
    'Database v' + CONFIG.VERSION + ' created successfully!\\n\\n' +
    'Sheet ID: ' + SHEET_ID + '\\n' +
    'Folder ID: ' + DRIVE_FOLDER_ID + '\\n\\n' +
    'Next: Deploy as Web App'
  );
  
  return { success: true, SHEET_ID, DRIVE_FOLDER_ID, action: 'fresh_setup' };
}

// ============= MIGRATE EXISTING =============
function migrateExisting(ss, migrationInfo) {
  Logger.log('\\n--- Running Migration ---');
  const changes = [];
  
  // Create missing sheets
  migrationInfo.sheetsToCreate.forEach(sheetName => {
    const config = CONFIG.SHEETS[sheetName];
    createSheetWithHeaders(ss, sheetName, config.headers);
    changes.push('Created sheet: ' + sheetName);
    Logger.log('Created sheet: ' + sheetName);
  });
  
  // Add missing columns
  migrationInfo.columnsToAdd.forEach(({ sheetName, colName, defaultValue, colIndex }) => {
    const sheet = ss.getSheetByName(sheetName);
    const newColNum = sheet.getLastColumn() + 1;
    
    // Add header
    sheet.getRange(1, newColNum).setValue(colName);
    sheet.getRange(1, newColNum).setFontWeight('bold').setBackground('#EE2726').setFontColor('white');
    
    // Set defaults for existing rows
    const lastRow = sheet.getLastRow();
    if (lastRow > 1 && defaultValue !== undefined) {
      for (let row = 2; row <= lastRow; row++) {
        sheet.getRange(row, newColNum).setValue(defaultValue);
      }
    }
    
    changes.push('Added ' + colName + ' to ' + sheetName);
    Logger.log('Added column ' + colName + ' to ' + sheetName);
  });
  
  // Update version
  const props = PropertiesService.getScriptProperties();
  props.setProperty('DB_VERSION', CONFIG.VERSION);
  
  Logger.log('\\n=== MIGRATION COMPLETE ===');
  Logger.log('Changes made:');
  changes.forEach(c => Logger.log('  - ' + c));
  
  showSuccess(
    'Migration Complete!',
    'Database migrated to v' + CONFIG.VERSION + '\\n\\n' +
    'Changes made:\\n' + changes.join('\\n') + '\\n\\n' +
    'Next: Re-deploy as Web App'
  );
  
  return { success: true, action: 'migrated', changes };
}

// ============= HELPER FUNCTIONS =============
function checkMigrationNeeded(ss) {
  const sheetsToCreate = [];
  const columnsToAdd = [];
  
  Object.keys(CONFIG.SHEETS).forEach(sheetName => {
    const config = CONFIG.SHEETS[sheetName];
    const sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      if (config.required) {
        Logger.log('ERROR: Required sheet missing: ' + sheetName);
        throw new Error('Required sheet missing: ' + sheetName);
      } else {
        sheetsToCreate.push(sheetName);
      }
      return;
    }
    
    // Check columns
    const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const expectedHeaders = config.headers;
    
    expectedHeaders.forEach((header, index) => {
      if (!currentHeaders.includes(header)) {
        const defaultValue = config.defaults ? config.defaults[index - 8] : undefined;
        columnsToAdd.push({
          sheetName,
          colName: header,
          defaultValue,
          colIndex: index
        });
      }
    });
  });
  
  return {
    needsMigration: sheetsToCreate.length > 0 || columnsToAdd.length > 0,
    sheetsToCreate,
    columnsToAdd
  };
}

function createSheetWithHeaders(ss, name, headers) {
  const sheet = ss.insertSheet(name);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#EE2726').setFontColor('white');
  sheet.setFrozenRows(1);
  Logger.log('Created ' + name + ' with ' + headers.length + ' columns');
  return sheet;
}

function addDemoData(ss) {
  Logger.log('\\n--- Adding Demo Data ---');
  
  // Owners
  const ownersSheet = ss.getSheetByName('Owners');
  ownersSheet.appendRow([
    'own1', 'Rajesh Patel', 'owner@demo.com', '9876543210', 'Patel Transport',
    'demo123', 'active', new Date().toISOString(), 50000, 0, false, 0, '', 'Demo owner'
  ]);
  
  // Drivers
  const driversSheet = ss.getSheetByName('Drivers');
  driversSheet.appendRow(['drv1', 'Amit Kumar', '1234', 'veh1', 'own1', 'active', new Date().toISOString()]);
  driversSheet.appendRow(['drv2', 'Suresh Singh', '5678', 'veh2', 'own1', 'active', new Date().toISOString()]);
  
  // Vehicles
  const vehiclesSheet = ss.getSheetByName('Vehicles');
  vehiclesSheet.appendRow(['veh1', 'GJ-01-AB-1234', 'Tata Ace CNG', 45000, 47820, 60, 'own1', 'active']);
  vehiclesSheet.appendRow(['veh2', 'GJ-05-XY-5678', 'Ashok Leyland Dost', 32000, 34150, 75, 'own1', 'active']);
  
  Logger.log('Demo data added');
}

function showSuccess(title, message) {
  try {
    SpreadsheetApp.getUi().alert(title, message, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    Logger.log('Popup not available (running in editor)');
  }
}

// ============= RESTORE DEMO DATA =============
function restoreDemoData() {
  const props = PropertiesService.getScriptProperties();
  const SHEET_ID = props.getProperty('SHEET_ID');
  if (!SHEET_ID) return 'Run setupOrMigrate() first';
  
  const ss = SpreadsheetApp.openById(SHEET_ID);
  
  // Clear sheets
  ['Owners', 'Drivers', 'Vehicles', 'Fills', 'Alerts', 'PaymentEntries'].forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet) {
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.deleteRows(2, lastRow - 1);
      }
    }
  });
  
  // Add demo data
  addDemoData(ss);
  
  return 'Demo data restored!';
}

// ============= MAIN API =============
function doPost(e) {
  try {
    const props = PropertiesService.getScriptProperties();
    const SHEET_ID = props.getProperty('SHEET_ID');
    const DRIVE_FOLDER_ID = props.getProperty('DRIVE_FOLDER_ID');
    
    if (!SHEET_ID) {
      return json({ success: false, error: 'Database not set up. Run setupOrMigrate() first.' });
    }
    
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    // UPLOAD MEDIA
    if (action === 'uploadMedia') {
      return handleUploadMedia(data, DRIVE_FOLDER_ID);
    }
    
    // ADD FILL
    if (action === 'addFill') {
      return handleAddFill(data, SHEET_ID);
    }
    
    // UPDATE OWNER (PHASE 1)
    if (action === 'updateOwner') {
      return handleUpdateOwner(data, SHEET_ID);
    }
    
    // ADD PAYMENT ENTRY (PHASE 1)
    if (action === 'addPaymentEntry') {
      return handleAddPaymentEntry(data, SHEET_ID);
    }
    
    // REGISTER OWNER
    if (action === 'registerOwner') {
      return handleRegisterOwner(data, SHEET_ID);
    }
    
    // ADD DRIVER
    if (action === 'addDriver') {
      return handleAddDriver(data, SHEET_ID);
    }
    
    // ADD VEHICLE
    if (action === 'addVehicle') {
      return handleAddVehicle(data, SHEET_ID);
    }
    
    // UPDATE DRIVER
    if (action === 'updateDriver') {
      return handleUpdateDriver(data, SHEET_ID);
    }
    
    // DELETE DRIVER
    if (action === 'deleteDriver') {
      return handleDeleteDriver(data, SHEET_ID);
    }
    
    // DELETE VEHICLE
    if (action === 'deleteVehicle') {
      return handleDeleteVehicle(data, SHEET_ID);
    }
    
    // GET DATA
    if (action === 'getData') {
      return handleGetData(SHEET_ID);
    }
    
    // GET OWNER PAYMENTS (PHASE 1)
    if (action === 'getOwnerPayments') {
      return handleGetOwnerPayments(data, SHEET_ID);
    }
    
    return json({ success: false, error: 'Unknown action: ' + action });
    
  } catch (err) {
    return json({ success: false, error: err.toString(), stack: err.stack });
  }
}

function doGet(e) {
  const action = e.parameter.action;
  
  if (action === 'getData') {
    try {
      const SHEET_ID = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
      if (!SHEET_ID) {
        return json({ success: false, error: 'Database not set up' });
      }
      return handleGetData(SHEET_ID);
    } catch (err) {
      return json({ success: false, error: err.toString() });
    }
  }
  
  const version = PropertiesService.getScriptProperties().getProperty('DB_VERSION') || '1.0';
  
  return json({
    status: 'CNG Fuel Tracker API',
    version: version,
    phase: CONFIG.PHASE,
    time: new Date().toISOString(),
    setup: PropertiesService.getScriptProperties().getProperty('SHEET_ID') ? 'complete' : 'run setupOrMigrate()'
  });
}

// ============= HANDLER FUNCTIONS =============
function handleUploadMedia(data, DRIVE_FOLDER_ID) {
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

function handleAddFill(data, SHEET_ID) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Fills');
  
  sheet.appendRow([
    data.id, data.vehicleId, data.driverId, data.time, data.station,
    parseFloat(data.kgs) || 0, parseFloat(data.rate) || 0, parseFloat(data.total) || 0,
    data.videoUrl || '', data.pumpPhotoUrl || '', data.receiptPhotoUrl || '', data.odoPhotoUrl || '',
    data.pumpGPS || '', data.receiptGPS || '', data.odoGPS || '',
    parseInt(data.odoReading) || 0, parseFloat(data.distanceDiff) || 0,
    data.mismatch === true || data.mismatch === 'true', parseFloat(data.fuelDropPercent) || 0,
    data.ownerId, data.verified === true || data.verified === 'true'
  ]);
  
  // Update vehicle odometer
  try {
    const vSheet = ss.getSheetByName('Vehicles');
    const vData = vSheet.getDataRange().getValues();
    for (let i = 1; i < vData.length; i++) {
      if (vData[i][0] === data.vehicleId) {
        vSheet.getRange(i + 1, 5).setValue(parseInt(data.odoReading) || 0);
        break;
      }
    }
  } catch (err) {}
  
  // Add alert if needed
  if (data.mismatch || parseFloat(data.fuelDropPercent) > 20) {
    const aSheet = ss.getSheetByName('Alerts');
    aSheet.appendRow([
      'alert_' + Date.now(), data.time,
      data.mismatch ? 'Location mismatch' : 'Fuel drop',
      data.driverId, data.mismatch ? 'location_mismatch' : 'fuel_drop',
      data.ownerId, false
    ]);
  }
  
  return json({ success: true, id: data.id });
}

function handleUpdateOwner(data, SHEET_ID) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Owners');
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  
  const colMap = {};
  headers.forEach((h, i) => colMap[h] = i);
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === data.ownerId) {
      const rowNum = i + 1;
      const updates = [];
      
      const updateFields = ['creditLimit', 'creditUsed', 'creditFrozen', 'totalPaid', 'lastPaymentDate', 'notes', 'status'];
      
      updateFields.forEach(field => {
        if (data[field] !== undefined && colMap[field] !== undefined) {
          let value = data[field];
          if (field === 'creditFrozen') {
            value = value === true || value === 'true';
          } else if (['creditLimit', 'creditUsed', 'totalPaid'].includes(field)) {
            value = parseFloat(value) || 0;
          }
          sheet.getRange(rowNum, colMap[field] + 1).setValue(value);
          updates.push(field);
        }
      });
      
      return json({ success: true, updated: updates });
    }
  }
  
  return json({ success: false, error: 'Owner not found: ' + data.ownerId });
}

function handleAddPaymentEntry(data, SHEET_ID) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  
  // Check for duplicate payment (same owner, amount, date, within 5 seconds)
  const paymentSheet = ss.getSheetByName('PaymentEntries');
  const existingData = paymentSheet.getDataRange().getValues();
  const now = Date.now();
  
  for (let i = 1; i < existingData.length; i++) {
    const existingTime = new Date(existingData[i][6]).getTime(); // createdAt column
    const existingOwner = existingData[i][1]; // ownerId column
    const existingAmount = parseFloat(existingData[i][2]) || 0; // amount column
    
    // Check if same owner, same amount, within 5 seconds
    if (existingOwner === data.ownerId && 
        existingAmount === (parseFloat(data.amount) || 0) && 
        (now - existingTime) < 5000) {
      Logger.log('Duplicate payment detected, skipping. ID: ' + existingData[i][0]);
      return json({ success: true, id: existingData[i][0], duplicate: true });
    }
  }
  
  // Add to PaymentEntries
  const paymentId = 'pay_' + now;
  
  paymentSheet.appendRow([
    paymentId, data.ownerId, parseFloat(data.amount) || 0,
    data.date || new Date().toISOString().split('T')[0],
    data.method || 'cash', data.notes || '', new Date().toISOString()
  ]);
  
  // Update owner's totalPaid and lastPaymentDate
  const ownerSheet = ss.getSheetByName('Owners');
  const ownerData = ownerSheet.getDataRange().getValues();
  const ownerHeaders = ownerData[0];
  const totalPaidIdx = ownerHeaders.indexOf('totalPaid');
  const lastPaymentIdx = ownerHeaders.indexOf('lastPaymentDate');
  
  if (totalPaidIdx >= 0) {
    for (let i = 1; i < ownerData.length; i++) {
      if (ownerData[i][0] === data.ownerId) {
        const currentPaid = parseFloat(ownerData[i][totalPaidIdx]) || 0;
        ownerSheet.getRange(i + 1, totalPaidIdx + 1).setValue(currentPaid + (parseFloat(data.amount) || 0));
        if (lastPaymentIdx >= 0) {
          ownerSheet.getRange(i + 1, lastPaymentIdx + 1).setValue(data.date || new Date().toISOString().split('T')[0]);
        }
        break;
      }
    }
  }
  
  return json({ success: true, id: paymentId });
}

function handleRegisterOwner(data, SHEET_ID) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Owners');
  sheet.appendRow([
    data.id, data.name, data.email, data.phone, data.business, data.password,
    'active', new Date().toISOString(), 50000, 0, false, 0, '', ''
  ]);
  return json({ success: true });
}

function handleAddDriver(data, SHEET_ID) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Drivers');
  sheet.appendRow([data.id, data.name, data.code, data.assignedVehicleId || '', data.ownerId, 'active', new Date().toISOString()]);
  return json({ success: true });
}

function handleAddVehicle(data, SHEET_ID) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Vehicles');
  sheet.appendRow([
    data.id, data.plate, data.model,
    parseInt(data.initialOdo) || 0, parseInt(data.currentOdo) || 0,
    parseInt(data.capacity) || 60, data.ownerId, 'active'
  ]);
  return json({ success: true });
}

function handleUpdateDriver(data, SHEET_ID) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Drivers');
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === data.id) {
      if (data.code !== undefined) sheet.getRange(i + 1, 3).setValue(data.code);
      if (data.assignedVehicleId !== undefined) sheet.getRange(i + 1, 4).setValue(data.assignedVehicleId || '');
      break;
    }
  }
  return json({ success: true });
}

function handleDeleteDriver(data, SHEET_ID) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Drivers');
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === data.id) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  return json({ success: true });
}

function handleDeleteVehicle(data, SHEET_ID) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Vehicles');
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === data.id) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  return json({ success: true });
}

function handleGetData(SHEET_ID) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  
  const parseValue = (val) => {
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (typeof val === 'string' && !isNaN(val) && val !== '') return parseFloat(val);
    return val;
  };
  
  const getSheetData = (name) => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return [];
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    return values.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = parseValue(row[i]));
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
}

function handleGetOwnerPayments(data, SHEET_ID) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('PaymentEntries');
  if (!sheet) return json({ success: true, payments: [] });
  
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const payments = [];
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][1] === data.ownerId) {
      const obj = {};
      headers.forEach((h, idx) => {
        let val = values[i][idx];
        if (typeof val === 'string' && !isNaN(val) && val !== '') val = parseFloat(val);
        obj[h] = val;
      });
      payments.push(obj);
    }
  }
  
  return json({ success: true, payments: payments });
}

// ============= UTILITIES =============
function getOrCreateFolder(parent, name) {
  const folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============= TEST FUNCTIONS =============
function testSetup() {
  const props = PropertiesService.getScriptProperties();
  Logger.log('Sheet ID: ' + props.getProperty('SHEET_ID'));
  Logger.log('Folder ID: ' + props.getProperty('DRIVE_FOLDER_ID'));
  Logger.log('DB Version: ' + props.getProperty('DB_VERSION'));
}

function testAPI() {
  const testData = {
    action: 'getData'
  };
  
  const result = doPost({ postData: { contents: JSON.stringify(testData) } });
  Logger.log('API Test: ' + result.getContent());
}

function testUpdateOwner() {
  const testData = {
    action: 'updateOwner',
    ownerId: 'own1',
    creditLimit: 75000,
    notes: 'Test update'
  };
  
  const result = doPost({ postData: { contents: JSON.stringify(testData) } });
  Logger.log('Update Owner Test: ' + result.getContent());
}

function testAddPayment() {
  const testData = {
    action: 'addPaymentEntry',
    ownerId: 'own1',
    amount: 5000,
    method: 'upi',
    notes: 'Test payment'
  };
  
  const result = doPost({ postData: { contents: JSON.stringify(testData) } });
  Logger.log('Add Payment Test: ' + result.getContent());
}
