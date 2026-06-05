// CNG FUEL TRACKER - COMPLETE BACKEND (ALL PHASES)
// Version: 3.0
// Includes: Phase 1 (Credit), Phase 2 (Alerts), Phase 3 (Fill Verification), Phase 4 (Vehicle), Phase 5 (Stats), Phase 6 (Auth)
// NEW: Added hyperlink URL extraction for media columns (videoUrl, pumpPhotoUrl, receiptPhotoUrl, odoPhotoUrl)
// Paste ALL of this into your Apps Script project
// Run: setupOrMigrate() once, then deploy as Web App

// ============= CONFIGURATION =============
const CONFIG = {
  VERSION: '3.0',
  PHASE: 'Complete - All Phases',
  SHEETS: {
    Owners: {
      required: true,
      headers: ['id', 'name', 'email', 'phone', 'business', 'password', 'status', 'createdAt', 'creditLimit', 'creditUsed', 'creditFrozen', 'totalPaid', 'lastPaymentDate', 'notes'],
      defaults: [50000, 0, false, 0, '', '']
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
      headers: ['id', 'vehicleId', 'driverId', 'time', 'station', 'kgs', 'rate', 'total', 'videoUrl', 'pumpPhotoUrl', 'receiptPhotoUrl', 'odoPhotoUrl', 'pumpGPS', 'receiptGPS', 'odoGPS', 'odoReading', 'distanceDiff', 'mismatch', 'fuelDropPercent', 'ownerId', 'verified', 'verifiedBy', 'verifiedAt', 'adminNotes']
    },
    Alerts: {
      required: true,
      headers: ['id', 'time', 'event', 'user', 'type', 'ownerId', 'resolved', 'resolvedBy', 'resolvedAt', 'resolutionNote', 'severity']
    },
    PaymentEntries: {
      required: false,
      headers: ['id', 'ownerId', 'amount', 'date', 'method', 'notes', 'createdAt']
    },
    CreditActions: {
      required: false,
      headers: ['id', 'ownerId', 'type', 'amount', 'reason', 'requestedBy', 'approvedBy', 'status', 'createdAt']
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
  
  if (!SHEET_ID) {
    Logger.log('No existing setup found. Creating fresh database...');
    return freshSetup();
  }
  
  Logger.log('Existing setup found. Checking migration status...');
  Logger.log('Sheet ID: ' + SHEET_ID);
  
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    
    // Fix any existing shifted owner rows automatically
    Logger.log('Running automatic check/fix for shifted owner data...');
    try {
      fixExistingShiftedOwners(ss);
    } catch (e) {
      Logger.log('Error running fixExistingShiftedOwners: ' + e);
    }
    
    const migrationNeeded = checkMigrationNeeded(ss);
    
    if (migrationNeeded.needsMigration) {
      Logger.log('Migration required for: ' + migrationNeeded.sheetsToCreate.join(', '));
      Logger.log('New columns needed: ' + migrationNeeded.columnsToAdd.length);
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
  Logger.log('Creating Fresh Database...');
  
  const ss = SpreadsheetApp.create('CNG Fuel Tracker DB v' + CONFIG.VERSION);
  const SHEET_ID = ss.getId();
  Logger.log('Created sheet: ' + ss.getUrl());
  
  const driveFolder = DriveApp.createFolder('CNG Fuel Media');
  const DRIVE_FOLDER_ID = driveFolder.getId();
  driveFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  Logger.log('Created Drive folder: ' + driveFolder.getUrl());
  
  Object.keys(CONFIG.SHEETS).forEach(sheetName => {
    const config = CONFIG.SHEETS[sheetName];
    createSheetWithHeaders(ss, sheetName, config.headers);
  });
  
  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet) ss.deleteSheet(defaultSheet);
  
  addDemoData(ss);
  
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SHEET_ID', SHEET_ID);
  props.setProperty('DRIVE_FOLDER_ID', DRIVE_FOLDER_ID);
  props.setProperty('DB_VERSION', CONFIG.VERSION);
  
  Logger.log('=== SETUP COMPLETE ===');
  Logger.log('SHEET_ID: ' + SHEET_ID);
  Logger.log('FOLDER_ID: ' + DRIVE_FOLDER_ID);
  
  showSuccess('Setup Complete!', 'Database v' + CONFIG.VERSION + ' created!');
  
  return { success: true, SHEET_ID, DRIVE_FOLDER_ID, action: 'fresh_setup' };
}

// ============= MIGRATE EXISTING =============
function migrateExisting(ss, migrationInfo) {
  Logger.log('Running Migration...');
  const changes = [];
  
  migrationInfo.sheetsToCreate.forEach(sheetName => {
    const config = CONFIG.SHEETS[sheetName];
    createSheetWithHeaders(ss, sheetName, config.headers);
    changes.push('Created sheet: ' + sheetName);
    Logger.log('Created sheet: ' + sheetName);
  });
  
  migrationInfo.columnsToAdd.forEach(({ sheetName, colName, defaultValue }) => {
    const sheet = ss.getSheetByName(sheetName);
    const newColNum = sheet.getLastColumn() + 1;
    
    sheet.getRange(1, newColNum).setValue(colName);
    sheet.getRange(1, newColNum).setFontWeight('bold').setBackground('#EE2726').setFontColor('white');
    
    const lastRow = sheet.getLastRow();
    if (lastRow > 1 && defaultValue !== undefined) {
      for (let row = 2; row <= lastRow; row++) {
        sheet.getRange(row, newColNum).setValue(defaultValue);
      }
    }
    
    changes.push('Added ' + colName + ' to ' + sheetName);
    Logger.log('Added column ' + colName + ' to ' + sheetName);
  });
  
  const props = PropertiesService.getScriptProperties();
  props.setProperty('DB_VERSION', CONFIG.VERSION);
  
  Logger.log('=== MIGRATION COMPLETE ===');
  
  showSuccess('Migration Complete!', 'Database migrated to v' + CONFIG.VERSION);
  
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
    
    const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const expectedHeaders = config.headers;
    
    expectedHeaders.forEach((header, index) => {
      if (!currentHeaders.includes(header)) {
        const defaultValue = config.defaults ? config.defaults[index - 8] : undefined;
        columnsToAdd.push({ sheetName, colName: header, defaultValue, colIndex: index });
      }
    });
  });
  
  return { needsMigration: sheetsToCreate.length > 0 || columnsToAdd.length > 0, sheetsToCreate, columnsToAdd };
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
  Logger.log('Adding Demo Data...');
  
  const ownersSheet = ss.getSheetByName('Owners');
  ownersSheet.appendRow(['own1', 'Rajesh Patel', 'owner@demo.com', '9876543210', 'Patel Transport', 'demo123', 'active', new Date().toISOString(), 50000, 0, false, 0, '', 'Demo owner']);
  
  const driversSheet = ss.getSheetByName('Drivers');
  driversSheet.appendRow(['drv1', 'Amit Kumar', '1234', 'veh1', 'own1', 'active', new Date().toISOString()]);
  driversSheet.appendRow(['drv2', 'Suresh Singh', '5678', 'veh2', 'own1', 'active', new Date().toISOString()]);
  
  const vehiclesSheet = ss.getSheetByName('Vehicles');
  vehiclesSheet.appendRow(['veh1', 'GJ-01-AB-1234', 'Tata Ace CNG', 45000, 47820, 60, 'own1', 'active']);
  vehiclesSheet.appendRow(['veh2', 'GJ-05-XY-5678', 'Ashok Leyland Dost', 32000, 34150, 75, 'own1', 'active']);
  
  Logger.log('Demo data added');
}

function showSuccess(title, message) {
  try {
    SpreadsheetApp.getUi().alert(title, message, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    Logger.log('Popup not available');
  }
}

function getOrCreateFolder(parent, name) {
  const folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function findColumnIndex(headers, columnName) {
  const cleanTarget = String(columnName).toLowerCase().replace(/[\s_-]/g, '');
  for (let i = 0; i < headers.length; i++) {
    const cleanHeader = String(headers[i]).toLowerCase().replace(/[\s_-]/g, '');
    if (cleanHeader === cleanTarget) {
      return i;
    }
  }
  return -1;
}

function appendRowDynamically(sheet, data, sheetConfigName) {
  const headers = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
  const rowData = new Array(headers.length).fill('');
  
  const sheetConfig = CONFIG.SHEETS[sheetConfigName] || {};
  const expectedHeaders = sheetConfig.headers || [];
  const configDefaults = sheetConfig.defaults || [];
  
  headers.forEach((h, i) => {
    const cleanHeader = String(h).trim().toLowerCase().replace(/[\s_-]/g, '');
    
    // 1. Special case: empty header in first column holds the primary ID
    if (cleanHeader === '' && i === 0) {
      rowData[i] = data.id || data.ownerId || data.driverId || data.vehicleId || data.fillId || data.alertId || data.actionId || data.paymentId || '';
      return;
    }
    
    if (cleanHeader === '') {
      rowData[i] = '';
      return;
    }
    
    // 2. Find matching key in incoming data
    let val = undefined;
    let possibleKeys = [cleanHeader];
    
    if (cleanHeader === 'id') {
      possibleKeys = ['id', 'ownerid', 'driverid', 'vehicleid', 'fillid', 'alertid', 'actionid', 'paymentid'];
    } else if (cleanHeader === 'notes' || cleanHeader === 'adminnotes') {
      possibleKeys = ['notes', 'adminnotes', 'reason'];
    } else if (cleanHeader === 'assignedvehicleid') {
      possibleKeys = ['assignedvehicleid', 'vehicleid'];
    }
    
    for (const key of Object.keys(data)) {
      const cleanKey = String(key).trim().toLowerCase().replace(/[\s_-]/g, '');
      if (possibleKeys.includes(cleanKey)) {
        val = data[key];
        break;
      }
    }
    
    // 3. Search config defaults
    if (val === undefined) {
      const expectedIndex = expectedHeaders.indexOf(h);
      if (expectedIndex >= 0 && configDefaults.length > 0) {
        const defaultStartIdx = expectedHeaders.length - configDefaults.length;
        if (expectedIndex >= defaultStartIdx) {
          val = configDefaults[expectedIndex - defaultStartIdx];
        }
      }
    }
    
    // 4. Default fallbacks
    if (val === undefined) {
      if (['creditlimit'].includes(cleanHeader)) val = 50000;
      else if (['creditused', 'totalpaid', 'kgs', 'rate', 'total', 'initialodo', 'currentodo', 'capacity', 'distancediff', 'fueldroppercent', 'amount'].includes(cleanHeader)) val = 0;
      else if (['creditfrozen', 'mismatch', 'verified', 'resolved'].includes(cleanHeader)) val = false;
      else if (['status'].includes(cleanHeader)) val = 'active';
      else if (['createdat', 'time'].includes(cleanHeader)) val = new Date().toISOString();
      else val = '';
    }
    
    // 5. Types conversions & parsing
    if (typeof val === 'boolean') {
      // Keep as boolean
    } else if (val !== null && val !== undefined && val !== '') {
      if (['creditlimit', 'creditused', 'totalpaid', 'kgs', 'rate', 'total', 'distancediff', 'fueldroppercent', 'amount'].includes(cleanHeader)) {
        val = parseFloat(val) || 0;
      } else if (['initialodo', 'currentodo', 'capacity', 'odoreading'].includes(cleanHeader)) {
        val = parseInt(val) || 0;
      } else if (['creditfrozen', 'mismatch', 'verified', 'resolved'].includes(cleanHeader)) {
        val = (val === true || val === 'true');
      }
    }
    
    rowData[i] = val;
  });
  
  sheet.appendRow(rowData);
}

function fixExistingShiftedOwners(ss) {
  const sheet = ss.getSheetByName('Owners');
  if (!sheet) return;
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  
  const colA = 0;
  const idIdx = findColumnIndex(headers, 'id');
  const creditLimitIdx = findColumnIndex(headers, 'creditLimit');
  const creditUsedIdx = findColumnIndex(headers, 'creditUsed');
  const creditFrozenIdx = findColumnIndex(headers, 'creditFrozen');
  const totalPaidIdx = findColumnIndex(headers, 'totalPaid');
  
  if (idIdx === -1) return;
  
  let fixedCount = 0;
  for (let i = 1; i < values.length; i++) {
    const rowNum = i + 1;
    const firstColVal = String(values[i][colA]).trim();
    const idVal = String(values[i][idIdx]).trim();
    
    if (firstColVal.startsWith('own') && (!idVal.startsWith('own') || idVal === '' || !isNaN(idVal))) {
      const realOwnerId = firstColVal;
      const creditLimitVal = parseFloat(values[i][idIdx]) || 50000;
      const creditUsedVal = parseFloat(values[i][creditLimitIdx]) || 0;
      const creditFrozenVal = (values[i][creditUsedIdx] === true || values[i][creditUsedIdx] === 'true');
      const totalPaidVal = parseFloat(values[i][creditFrozenIdx]) || 0;
      
      sheet.getRange(rowNum, idIdx + 1).setValue(realOwnerId);
      if (creditLimitIdx !== -1) sheet.getRange(rowNum, creditLimitIdx + 1).setValue(creditLimitVal);
      if (creditUsedIdx !== -1) sheet.getRange(rowNum, creditUsedIdx + 1).setValue(creditUsedVal);
      if (creditFrozenIdx !== -1) sheet.getRange(rowNum, creditFrozenIdx + 1).setValue(creditFrozenVal);
      if (totalPaidIdx !== -1) sheet.getRange(rowNum, totalPaidIdx + 1).setValue(totalPaidVal);
      
      fixedCount++;
      Logger.log('Fixed shifted owner row ' + rowNum + ': ' + realOwnerId);
    }
  }
  Logger.log('Automatic fix completed. Fixed ' + fixedCount + ' rows.');
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
    
    // Upload & Core
    if (action === 'uploadMedia') return handleUploadMedia(data, DRIVE_FOLDER_ID);
    if (action === 'addFill') return handleAddFill(data, SHEET_ID);
    
    // Phase 1: Owner Credit
    if (action === 'updateOwner') return handleUpdateOwner(data, SHEET_ID);
    if (action === 'addPaymentEntry') return handleAddPaymentEntry(data, SHEET_ID);
    if (action === 'getOwnerPayments') return handleGetOwnerPayments(data, SHEET_ID);
    
    // Phase 2: Alerts
    if (action === 'addAlert') return handleAddAlert(data, SHEET_ID);
    if (action === 'resolveAlert') return handleResolveAlert(data, SHEET_ID);
    
    // Phase 3: Fill Verification
    if (action === 'updateFill') return handleUpdateFill(data, SHEET_ID);
    
    // Phase 4: Vehicle Updates
    if (action === 'updateVehicle') return handleUpdateVehicle(data, SHEET_ID);
    
    // Phase 5: Credit Actions
    if (action === 'addCreditAction') return handleAddCreditAction(data, SHEET_ID);
    if (action === 'updateCreditAction') return handleUpdateCreditAction(data, SHEET_ID);
    
    // Phase 6: Statistics
    if (action === 'getOwnerStats') return handleGetOwnerStats(data, SHEET_ID);
    if (action === 'getVehicleStats') return handleGetVehicleStats(data, SHEET_ID);
    
    // OTP Verification
    if (action === 'sendOTP') return handleSendOTP(data);
    if (action === 'verifyOTP') return handleVerifyOTP(data);
    
    // Existing CRUD
    if (action === 'registerOwner') return handleRegisterOwner(data, SHEET_ID);
    if (action === 'addDriver') return handleAddDriver(data, SHEET_ID);
    if (action === 'addVehicle') return handleAddVehicle(data, SHEET_ID);
    if (action === 'updateDriver') return handleUpdateDriver(data, SHEET_ID);
    if (action === 'deleteDriver') return handleDeleteDriver(data, SHEET_ID);
    if (action === 'deleteVehicle') return handleDeleteVehicle(data, SHEET_ID);
    if (action === 'getData') return handleGetData(SHEET_ID);
    
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
      if (!SHEET_ID) return json({ success: false, error: 'Database not set up' });
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

// Upload Media
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

// Add Fill
function handleAddFill(data, SHEET_ID) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Fills');
  
  appendRowDynamically(sheet, data, 'Fills');
  
  // Update vehicle odometer
  try {
    const vSheet = ss.getSheetByName('Vehicles');
    const vData = vSheet.getDataRange().getValues();
    const vHeaders = vData[0];
    const currentOdoIdx = findColumnIndex(vHeaders, 'currentOdo');
    const vIdIdx = findColumnIndex(vHeaders, 'id');
    const checkIdx = vIdIdx >= 0 ? vIdIdx : 0;
    
    if (currentOdoIdx >= 0) {
      for (let i = 1; i < vData.length; i++) {
        if (String(vData[i][checkIdx]) === String(data.vehicleId)) {
          vSheet.getRange(i + 1, currentOdoIdx + 1).setValue(parseInt(data.odoReading) || 0);
          break;
        }
      }
    }
  } catch (err) {
    Logger.log('Error updating vehicle odometer: ' + err);
  }
  
  // Add alert if needed
  if (data.mismatch || parseFloat(data.fuelDropPercent) > 20) {
    try {
      const aSheet = ss.getSheetByName('Alerts');
      const alertData = {
        id: 'alert_' + Date.now(),
        time: data.time || new Date().toISOString(),
        event: data.mismatch ? 'Location mismatch' : 'Fuel drop',
        user: data.driverId || '',
        type: data.mismatch ? 'location_mismatch' : 'fuel_drop',
        ownerId: data.ownerId || '',
        resolved: false,
        resolvedBy: '',
        resolvedAt: '',
        resolutionNote: '',
        severity: 'high'
      };
      appendRowDynamically(aSheet, alertData, 'Alerts');
    } catch (err) {
      Logger.log('Error adding alert: ' + err);
    }
  }
  
  return json({ success: true, id: data.id });
}

// ============= PHASE 1: OWNER CREDIT =============
function handleUpdateOwner(data, SHEET_ID) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Owners');
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  
  const idIdx = findColumnIndex(headers, 'id');
  const checkIdx = idIdx >= 0 ? idIdx : 0;
  
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][checkIdx]) === String(data.ownerId)) {
      const rowNum = i + 1;
      const updates = [];
      
      const fields = ['creditLimit', 'creditUsed', 'creditFrozen', 'totalPaid', 'lastPaymentDate', 'notes', 'status'];
      fields.forEach(field => {
        if (data[field] !== undefined) {
          const colIdx = findColumnIndex(headers, field);
          if (colIdx >= 0) {
            let value = data[field];
            if (field === 'creditFrozen') value = value === true || value === 'true';
            else if (['creditLimit', 'creditUsed', 'totalPaid'].includes(field)) value = parseFloat(value) || 0;
            sheet.getRange(rowNum, colIdx + 1).setValue(value);
            updates.push(field);
          }
        }
      });
      
      return json({ success: true, updated: updates });
    }
  }
  
  return json({ success: false, error: 'Owner not found: ' + data.ownerId });
}

function handleAddPaymentEntry(data, SHEET_ID) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const paymentSheet = ss.getSheetByName('PaymentEntries');
  
  // Check duplicates dynamically
  const existingData = paymentSheet.getDataRange().getValues();
  const headers = existingData[0];
  const createdAtIdx = findColumnIndex(headers, 'createdAt');
  const ownerIdIdx = findColumnIndex(headers, 'ownerId');
  const amountIdx = findColumnIndex(headers, 'amount');
  const idIdx = findColumnIndex(headers, 'id');
  
  const now = Date.now();
  
  if (ownerIdIdx >= 0 && amountIdx >= 0 && createdAtIdx >= 0) {
    for (let i = 1; i < existingData.length; i++) {
      const existingTime = new Date(existingData[i][createdAtIdx]).getTime();
      const existingOwner = String(existingData[i][ownerIdIdx]).trim();
      const existingAmount = parseFloat(existingData[i][amountIdx]) || 0;
      
      if (existingOwner === String(data.ownerId).trim() && existingAmount === (parseFloat(data.amount) || 0) && (now - existingTime) < 5000) {
        const dupId = idIdx >= 0 ? existingData[i][idIdx] : 'pay_dup';
        return json({ success: true, id: dupId, duplicate: true });
      }
    }
  }
  
  const paymentId = 'pay_' + now;
  const newPaymentData = {
    id: paymentId,
    ownerId: data.ownerId,
    amount: parseFloat(data.amount) || 0,
    date: data.date || new Date().toISOString().split('T')[0],
    method: data.method || 'cash',
    notes: data.notes || '',
    createdAt: new Date().toISOString()
  };
  appendRowDynamically(paymentSheet, newPaymentData, 'PaymentEntries');
  
  // Update owner totals
  const ownerSheet = ss.getSheetByName('Owners');
  const ownerData = ownerSheet.getDataRange().getValues();
  const ownerHeaders = ownerData[0];
  const totalPaidIdx = findColumnIndex(ownerHeaders, 'totalPaid');
  const lastPaymentIdx = findColumnIndex(ownerHeaders, 'lastPaymentDate');
  const ownerIdColIdx = findColumnIndex(ownerHeaders, 'id');
  const checkIdx = ownerIdColIdx >= 0 ? ownerIdColIdx : 0;
  
  if (totalPaidIdx >= 0) {
    for (let i = 1; i < ownerData.length; i++) {
      if (String(ownerData[i][checkIdx]).trim() === String(data.ownerId).trim()) {
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

// ============= PHASE 2: ALERTS =============
function handleAddAlert(data, SHEET_ID) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Alerts');
  
  // Check duplicates dynamically
  const existingData = sheet.getDataRange().getValues();
  const headers = existingData[0];
  const timeIdx = findColumnIndex(headers, 'time');
  const ownerIdIdx = findColumnIndex(headers, 'ownerId');
  const typeIdx = findColumnIndex(headers, 'type');
  const eventIdx = findColumnIndex(headers, 'event');
  const idIdx = findColumnIndex(headers, 'id');
  
  const now = new Date(data.time || Date.now());
  
  if (timeIdx >= 0 && ownerIdIdx >= 0 && typeIdx >= 0 && eventIdx >= 0) {
    for (let i = 1; i < existingData.length; i++) {
      const existingTime = new Date(existingData[i][timeIdx]);
      const existingOwner = String(existingData[i][ownerIdIdx]).trim();
      const existingType = String(existingData[i][typeIdx]).trim();
      const existingEvent = String(existingData[i][eventIdx]).trim();
      const timeDiff = Math.abs(now.getTime() - existingTime.getTime());
      
      if (existingOwner === String(data.ownerId).trim() && existingType === String(data.type).trim() && timeDiff < 300000 && existingEvent === String(data.event).trim()) {
        const dupId = idIdx >= 0 ? existingData[i][idIdx] : 'alert_dup';
        return json({ success: true, id: dupId, duplicate: true });
      }
    }
  }
  
  const alertId = data.id || 'alert_' + Date.now();
  const newAlertData = {
    id: alertId,
    time: data.time || new Date().toISOString(),
    event: data.event || 'Alert',
    user: data.user || '',
    type: data.type || 'info',
    ownerId: data.ownerId || '',
    resolved: false,
    resolvedBy: '',
    resolvedAt: '',
    resolutionNote: '',
    severity: data.severity || 'medium'
  };
  appendRowDynamically(sheet, newAlertData, 'Alerts');
  
  return json({ success: true, id: alertId });
}

function handleResolveAlert(data, SHEET_ID) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Alerts');
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  
  const idIdx = findColumnIndex(headers, 'id');
  const checkIdx = idIdx >= 0 ? idIdx : 0;
  
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][checkIdx]) === String(data.alertId)) {
      const rowNum = i + 1;
      
      const resolvedIdx = findColumnIndex(headers, 'resolved');
      const resolvedByIdx = findColumnIndex(headers, 'resolvedBy');
      const resolvedAtIdx = findColumnIndex(headers, 'resolvedAt');
      const resolutionNoteIdx = findColumnIndex(headers, 'resolutionNote');
      
      if (resolvedIdx >= 0) sheet.getRange(rowNum, resolvedIdx + 1).setValue(true);
      if (resolvedByIdx >= 0 && data.resolvedBy) sheet.getRange(rowNum, resolvedByIdx + 1).setValue(data.resolvedBy);
      if (resolvedAtIdx >= 0) sheet.getRange(rowNum, resolvedAtIdx + 1).setValue(new Date().toISOString());
      if (resolutionNoteIdx >= 0 && data.resolutionNote) sheet.getRange(rowNum, resolutionNoteIdx + 1).setValue(data.resolutionNote);
      
      return json({ success: true, resolved: true });
    }
  }
  
  return json({ success: false, error: 'Alert not found: ' + data.alertId });
}

// ============= PHASE 3: FILL VERIFICATION =============
function handleUpdateFill(data, SHEET_ID) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Fills');
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  
  const idIdx = findColumnIndex(headers, 'id');
  const checkIdx = idIdx >= 0 ? idIdx : 0;
  
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][checkIdx]) === String(data.fillId)) {
      const rowNum = i + 1;
      const updates = [];
      
      const fields = ['verified', 'verifiedBy', 'verifiedAt', 'adminNotes'];
      fields.forEach(field => {
        if (data[field] !== undefined) {
          const colIdx = findColumnIndex(headers, field);
          if (colIdx >= 0) {
            let value = data[field];
            if (field === 'verified') value = value === true || value === 'true';
            sheet.getRange(rowNum, colIdx + 1).setValue(value);
            updates.push(field);
          }
        }
      });
      
      return json({ success: true, updated: updates });
    }
  }
  
  return json({ success: false, error: 'Fill not found: ' + data.fillId });
}

// ============= PHASE 4: VEHICLE UPDATES =============
function handleUpdateVehicle(data, SHEET_ID) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Vehicles');
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  
  const idIdx = findColumnIndex(headers, 'id');
  const checkIdx = idIdx >= 0 ? idIdx : 0;
  
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][checkIdx]) === String(data.vehicleId)) {
      const rowNum = i + 1;
      const updates = [];
      
      const fields = ['plate', 'model', 'initialOdo', 'currentOdo', 'capacity', 'status', 'ownerId'];
      fields.forEach(field => {
        if (data[field] !== undefined) {
          const colIdx = findColumnIndex(headers, field);
          if (colIdx >= 0) {
            let value = data[field];
            if (['initialOdo', 'currentOdo', 'capacity'].includes(field)) value = parseInt(value) || 0;
            sheet.getRange(rowNum, colIdx + 1).setValue(value);
            updates.push(field);
          }
        }
      });
      
      return json({ success: true, updated: updates });
    }
  }
  
  return json({ success: false, error: 'Vehicle not found: ' + data.vehicleId });
}

// ============= PHASE 5: CREDIT ACTIONS =============
function handleAddCreditAction(data, SHEET_ID) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const actionSheet = ss.getSheetByName('CreditActions');
  
  const actionId = data.id || 'ca_' + Date.now();
  const newActionData = {
    id: actionId,
    ownerId: data.ownerId,
    type: data.type,
    amount: parseFloat(data.amount) || 0,
    reason: data.reason || '',
    requestedBy: data.requestedBy || '',
    approvedBy: data.approvedBy || '',
    status: data.status || 'pending',
    createdAt: new Date().toISOString()
  };
  appendRowDynamically(actionSheet, newActionData, 'CreditActions');
  
  // Update owner credit based on action type ONLY if status is approved (or not pending)
  if (data.status !== 'pending' && (data.type === 'issue' || data.type === 'emergency' || data.type === 'bonus' || data.type === 'issued')) {
    try {
      const ownerSheet = ss.getSheetByName('Owners');
      const ownerData = ownerSheet.getDataRange().getValues();
      const ownerHeaders = ownerData[0];
      const creditLimitIdx = findColumnIndex(ownerHeaders, 'creditLimit');
      const ownerIdColIdx = findColumnIndex(ownerHeaders, 'id');
      const checkIdx = ownerIdColIdx >= 0 ? ownerIdColIdx : 0;
      
      if (creditLimitIdx >= 0) {
        for (let i = 1; i < ownerData.length; i++) {
          if (String(ownerData[i][checkIdx]).trim() === String(data.ownerId).trim()) {
            const currentLimit = parseFloat(ownerData[i][creditLimitIdx]) || 0;
            ownerSheet.getRange(i + 1, creditLimitIdx + 1).setValue(currentLimit + (parseFloat(data.amount) || 0));
            break;
          }
        }
      }
    } catch (e) {
      Logger.log('Error updating owner credit limit in handleAddCreditAction: ' + e);
    }
  }
  
  return json({ success: true, id: actionId });
}

function handleUpdateCreditAction(data, SHEET_ID) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('CreditActions');
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const colMap = {};
  headers.forEach((h, i) => {
    colMap[String(h).trim().toLowerCase()] = i;
  });
  
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === String(data.actionId).trim()) {
      const rowNum = i + 1;
      
      const statusIdx = colMap['status'];
      const approvedByIdx = colMap['approvedby'];
      
      if (statusIdx !== undefined) sheet.getRange(rowNum, statusIdx + 1).setValue(data.status);
      if (approvedByIdx !== undefined && data.approvedBy) sheet.getRange(rowNum, approvedByIdx + 1).setValue(data.approvedBy);
      
      // If approved, update owner's credit limit
      if (data.status === 'approved') {
        const ownerIdIdx = colMap['ownerid'];
        const typeIdx = colMap['type'];
        const amountIdx = colMap['amount'];
        
        if (ownerIdIdx !== undefined && typeIdx !== undefined && amountIdx !== undefined) {
          const ownerId = values[i][ownerIdIdx];
          const type = String(values[i][typeIdx]).trim().toLowerCase();
          const amount = parseFloat(values[i][amountIdx]) || 0;
          
          if (type === 'issue' || type === 'emergency' || type === 'bonus' || type === 'issued') {
            const ownerSheet = ss.getSheetByName('Owners');
            const ownerData = ownerSheet.getDataRange().getValues();
            const ownerHeaders = ownerData[0];
            const creditLimitIdx = ownerHeaders.map(h => String(h).trim().toLowerCase()).indexOf('creditlimit');
            
            if (creditLimitIdx >= 0) {
              for (let j = 1; j < ownerData.length; j++) {
                if (String(ownerData[j][0]).trim() === String(ownerId).trim()) {
                  const currentLimit = parseFloat(ownerData[j][creditLimitIdx]) || 0;
                  ownerSheet.getRange(j + 1, creditLimitIdx + 1).setValue(currentLimit + amount);
                  break;
                }
              }
            }
          }
        }
      }
      return json({ success: true });
    }
  }
  return json({ success: false, error: 'Credit action not found: ' + data.actionId });
}

// ============= PHASE 6: STATISTICS =============
function handleGetOwnerStats(data, SHEET_ID) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const fillsSheet = ss.getSheetByName('Fills');
  const vehiclesSheet = ss.getSheetByName('Vehicles');
  const driversSheet = ss.getSheetByName('Drivers');
  const paymentsSheet = ss.getSheetByName('PaymentEntries');
  
  const ownerId = data.ownerId;
  const period = data.period || 'month';
  
  // Calculate date range
  const now = new Date();
  const startDate = new Date();
  if (period === 'today') startDate.setHours(0, 0, 0, 0);
  else if (period === 'week') startDate.setDate(now.getDate() - 7);
  else if (period === 'month') startDate.setMonth(now.getMonth() - 1);
  
  // Get fills for owner
  const fillsData = fillsSheet.getDataRange().getValues();
  const fillsHeaders = fillsData[0];
  const ownerFills = [];
  let totalSpent = 0;
  let totalKgs = 0;
  
  for (let i = 1; i < fillsData.length; i++) {
    if (fillsData[i][fillsHeaders.indexOf('ownerId')] === ownerId) {
      const fillTime = new Date(fillsData[i][fillsHeaders.indexOf('time')]);
      if (fillTime >= startDate) {
        const fill = {
          kgs: parseFloat(fillsData[i][fillsHeaders.indexOf('kgs')]) || 0,
          total: parseFloat(fillsData[i][fillsHeaders.indexOf('total')]) || 0,
          time: fillTime
        };
        ownerFills.push(fill);
        totalSpent += fill.total;
        totalKgs += fill.kgs;
      }
    }
  }
  
  // Count vehicles and drivers
  const vehiclesData = vehiclesSheet.getDataRange().getValues();
  const vehicleCount = vehiclesData.slice(1).filter(v => v[vehiclesData[0].indexOf('ownerId')] === ownerId).length;
  
  const driversData = driversSheet.getDataRange().getValues();
  const driverCount = driversData.slice(1).filter(d => d[driversData[0].indexOf('ownerId')] === ownerId).length;
  
  // Get total paid
  let totalPaid = 0;
  if (paymentsSheet) {
    const paymentsData = paymentsSheet.getDataRange().getValues();
    const paymentsHeaders = paymentsData[0];
    for (let i = 1; i < paymentsData.length; i++) {
      if (paymentsData[i][paymentsHeaders.indexOf('ownerId')] === ownerId) {
        totalPaid += parseFloat(paymentsData[i][paymentsHeaders.indexOf('amount')]) || 0;
      }
    }
  }
  
  return json({
    success: true,
    stats: {
      fills: ownerFills.length,
      totalSpent: totalSpent,
      totalPaid: totalPaid,
      outstanding: Math.max(0, totalSpent - totalPaid),
      totalKgs: totalKgs,
      vehicles: vehicleCount,
      drivers: driverCount,
      avgFill: ownerFills.length > 0 ? totalSpent / ownerFills.length : 0,
      period: period
    }
  });
}

function handleGetVehicleStats(data, SHEET_ID) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const fillsSheet = ss.getSheetByName('Fills');
  const vehiclesSheet = ss.getSheetByName('Vehicles');
  
  const vehicleId = data.vehicleId;
  
  // Get vehicle info
  const vehiclesData = vehiclesSheet.getDataRange().getValues();
  const vehiclesHeaders = vehiclesData[0];
  let vehicleInfo = null;
  
  for (let i = 1; i < vehiclesData.length; i++) {
    if (vehiclesData[i][vehiclesHeaders.indexOf('id')] === vehicleId) {
      vehicleInfo = {
        plate: vehiclesData[i][vehiclesHeaders.indexOf('plate')],
        model: vehiclesData[i][vehiclesHeaders.indexOf('model')],
        initialOdo: parseInt(vehiclesData[i][vehiclesHeaders.indexOf('initialOdo')]) || 0,
        currentOdo: parseInt(vehiclesData[i][vehiclesHeaders.indexOf('currentOdo')]) || 0
      };
      break;
    }
  }
  
  if (!vehicleInfo) {
    return json({ success: false, error: 'Vehicle not found: ' + vehicleId });
  }
  
  // Get fills for vehicle
  const fillsData = fillsSheet.getDataRange().getValues();
  const fillsHeaders = fillsData[0];
  const vehicleFills = [];
  let totalSpent = 0;
  let totalKgs = 0;
  
  for (let i = 1; i < fillsData.length; i++) {
    if (fillsData[i][fillsHeaders.indexOf('vehicleId')] === vehicleId) {
      const fill = {
        kgs: parseFloat(fillsData[i][fillsHeaders.indexOf('kgs')]) || 0,
        total: parseFloat(fillsData[i][fillsHeaders.indexOf('total')]) || 0,
        time: new Date(fillsData[i][fillsHeaders.indexOf('time')])
      };
      vehicleFills.push(fill);
      totalSpent += fill.total;
      totalKgs += fill.kgs;
    }
  }
  
  const kmTraveled = vehicleInfo.currentOdo - vehicleInfo.initialOdo;
  const efficiency = totalKgs > 0 ? (kmTraveled / totalKgs).toFixed(2) : 0;
  
  return json({
    success: true,
    stats: {
      fills: vehicleFills.length,
      totalSpent: totalSpent,
      totalKgs: totalKgs,
      kmTraveled: kmTraveled,
      efficiency: efficiency,
      avgCost: vehicleFills.length > 0 ? totalSpent / vehicleFills.length : 0,
      lastFill: vehicleFills.length > 0 ? vehicleFills[vehicleFills.length - 1].time : null
    }
  });
}

function handleSendOTP(data) {
  const email = (data.email || '').trim();
  if (email === '') {
    return json({ success: false, error: 'Email address is required.' });
  }
  
  // Rate limiting: allow only one OTP request every 60 seconds per email
  const cache = CacheService.getScriptCache();
  const cooldownKey = 'cooldown_' + email;
  if (cache.get(cooldownKey)) {
    return json({ success: false, error: 'Please wait before requesting another OTP.' });
  }
  
  // Generate a 6-digit random number
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  
  // Store the OTP in the cache (expires in 10 minutes)
  cache.put(email, otp, 600);
  
  // Store a cooldown flag in the cache (expires in 60 seconds)
  cache.put(cooldownKey, '1', 60);
  
  try {
    MailApp.sendEmail({
      to: email,
      subject: 'CNG Fuel Tracker — Email Verification Code',
      htmlBody: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; max-width: 500px; margin: 0 auto; color: #1a202c;">
          <h2 style="color: #3182ce; margin-bottom: 20px;">Email Verification</h2>
          <p>Thank you for registering with CNG Fuel Tracker. Use the following One-Time Password (OTP) to complete your owner account creation:</p>
          <div style="font-size: 28px; font-weight: bold; background-color: #f7fafc; padding: 15px; text-align: center; border-radius: 6px; letter-spacing: 4px; margin: 25px 0; border: 1px dashed #cbd5e0;">
            \${otp}
          </div>
          <p style="font-size: 13px; color: #718096; margin-top: 25px;">This OTP is valid for 10 minutes. If you did not request this code, please ignore this email.</p>
        </div>
      `
    });
    return json({ success: true });
  } catch (err) {
    Logger.log('Error sending email: ' + err);
    return json({ success: false, error: 'Failed to send verification email. Details: ' + err.toString() });
  }
}

function handleVerifyOTP(data) {
  const email = (data.email || '').trim();
  const userOtp = (data.otp || '').trim();
  
  if (email === '' || userOtp === '') {
    return json({ success: false, error: 'Email and OTP code are required.' });
  }
  
  const cache = CacheService.getScriptCache();
  const cachedOtp = cache.get(email);
  
  if (!cachedOtp) {
    return json({ success: false, error: 'OTP has expired or is invalid. Please request a new one.' });
  }
  
  if (cachedOtp === userOtp) {
    // Clear the OTP from cache after successful verification
    cache.remove(email);
    return json({ success: true });
  } else {
    return json({ success: false, error: 'Invalid verification code. Please try again.' });
  }
}

// ============= EXISTING CRUD =============
function handleRegisterOwner(data, SHEET_ID) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Owners');
  // Generate ID if not provided
  const ownerId = data.id || 'own_' + Date.now();
  const newOwnerData = {
    id: ownerId,
    name: data.name,
    email: data.email,
    phone: data.phone,
    business: data.business,
    password: data.password,
    status: 'active',
    createdAt: new Date().toISOString(),
    creditLimit: data.creditLimit !== undefined ? data.creditLimit : 50000,
    creditUsed: data.creditUsed !== undefined ? data.creditUsed : 0,
    creditFrozen: data.creditFrozen !== undefined ? data.creditFrozen : false,
    totalPaid: data.totalPaid !== undefined ? data.totalPaid : 0,
    lastPaymentDate: '',
    notes: ''
  };
  appendRowDynamically(sheet, newOwnerData, 'Owners');
  return json({ success: true, id: ownerId });
}

function handleAddDriver(data, SHEET_ID) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Drivers');
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
  appendRowDynamically(sheet, newDriverData, 'Drivers');
  return json({ success: true });
}

function handleAddVehicle(data, SHEET_ID) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Vehicles');
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
  appendRowDynamically(sheet, newVehicleData, 'Vehicles');
  return json({ success: true });
}

function handleUpdateDriver(data, SHEET_ID) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Drivers');
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const codeIdx = findColumnIndex(headers, 'code');
  const assignedVehicleIdIdx = findColumnIndex(headers, 'assignedVehicleId');
  const idIdx = findColumnIndex(headers, 'id');
  const checkIdx = idIdx >= 0 ? idIdx : 0;
  
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][checkIdx]) === String(data.id)) {
      if (data.code !== undefined && codeIdx >= 0) {
        sheet.getRange(i + 1, codeIdx + 1).setValue(data.code);
      }
      if (data.assignedVehicleId !== undefined && assignedVehicleIdIdx >= 0) {
        sheet.getRange(i + 1, assignedVehicleIdIdx + 1).setValue(data.assignedVehicleId || '');
      }
      break;
    }
  }
  return json({ success: true });
}

function handleDeleteDriver(data, SHEET_ID) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Drivers');
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idIdx = findColumnIndex(headers, 'id');
  const checkIdx = idIdx >= 0 ? idIdx : 0;
  
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][checkIdx]) === String(data.id)) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  return json({ success: true });
}

function handleDeleteVehicle(data, SHEET_ID) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Vehicles');
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idIdx = findColumnIndex(headers, 'id');
  const checkIdx = idIdx >= 0 ? idIdx : 0;
  
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][checkIdx]) === String(data.id)) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  return json({ success: true });
}

// ============= GET ALL DATA =============
function handleGetData(SHEET_ID) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  
  const parseValue = (val) => {
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (typeof val === 'string' && !isNaN(val) && val !== '') return parseFloat(val);
    return val;
  };
  
  // Helper to extract URL from hyperlink or return plain value
  const extractUrlFromHyperlink = (richTextValue) => {
    if (!richTextValue) return '';
    const runs = richTextValue.getRuns();
    for (let i = 0; i < runs.length; i++) {
      const linkUrl = runs[i].getLinkUrl();
      if (linkUrl) return linkUrl;
    }
    return richTextValue.getText() || '';
  };
  
  const getSheetData = (name) => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return [];
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    return values.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = parseValue(row[i]);
      });
      return obj;
    });
  };
  
  // Special handler for Fills sheet to extract URLs from hyperlinks
  const getFillsData = () => {
    const sheet = ss.getSheetByName('Fills');
    if (!sheet) return [];
    const values = sheet.getDataRange().getValues();
    const richTextValues = sheet.getDataRange().getRichTextValues();
    const headers = values[0];
    
    // Column indices that might contain URLs
    const urlColumns = ['videoUrl', 'pumpPhotoUrl', 'receiptPhotoUrl', 'odoPhotoUrl'];
    
    return values.slice(1).map((row, rowIndex) => {
      const obj = {};
      headers.forEach((h, i) => {
        // For URL columns, try to extract URL from hyperlink
        if (urlColumns.includes(h)) {
          const richText = richTextValues[rowIndex + 1][i]; // +1 because we skipped header
          obj[h] = extractUrlFromHyperlink(richText);
        } else {
          obj[h] = parseValue(row[i]);
        }
      });
      return obj;
    });
  };
  
  return json({
    success: true,
    fills: getFillsData(),
    drivers: getSheetData('Drivers'),
    vehicles: getSheetData('Vehicles'),
    owners: getSheetData('Owners'),
    alerts: getSheetData('Alerts'),
    paymentEntries: getSheetData('PaymentEntries'),
    creditActions: getSheetData('CreditActions')
  });
}

// ============= TEST FUNCTIONS =============
function testSetup() {
  const props = PropertiesService.getScriptProperties();
  Logger.log('Sheet ID: ' + props.getProperty('SHEET_ID'));
  Logger.log('Folder ID: ' + props.getProperty('DRIVE_FOLDER_ID'));
  Logger.log('DB Version: ' + props.getProperty('DB_VERSION'));
}

function testAPI() {
  const testData = { action: 'getData' };
  const result = doPost({ postData: { contents: JSON.stringify(testData) } });
  Logger.log('API Test: ' + result.getContent());
}

function restoreDemoData() {
  const props = PropertiesService.getScriptProperties();
  const SHEET_ID = props.getProperty('SHEET_ID');
  if (!SHEET_ID) return 'Run setupOrMigrate() first';
  
  const ss = SpreadsheetApp.openById(SHEET_ID);
  
  ['Owners', 'Drivers', 'Vehicles', 'Fills', 'Alerts', 'PaymentEntries', 'CreditActions'].forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet) {
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
    }
  });
  
  addDemoData(ss);
  return 'Demo data restored!';
}

// ============= FIX EMPTY IDs =============
function fixEmptyIds() {
  const props = PropertiesService.getScriptProperties();
  const SHEET_ID = props.getProperty('SHEET_ID');
  if (!SHEET_ID) return 'Run setupOrMigrate() first';
  
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Owners');
  const values = sheet.getDataRange().getValues();
  
  let fixed = 0;
  for (let i = 1; i < values.length; i++) {
    if (!values[i][0] || values[i][0] === '') {
      const newId = 'own_' + Date.now() + '_' + i;
      sheet.getRange(i + 1, 1).setValue(newId);
      fixed++;
    }
  }
  
  return 'Fixed ' + fixed + ' owners with empty IDs';
}

// ============= FIX ALL EMPTY IDs =============
function fixAllEmptyIds() {
  const props = PropertiesService.getScriptProperties();
  const SHEET_ID = props.getProperty('SHEET_ID');
  if (!SHEET_ID) return 'Run setupOrMigrate() first';
  
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let totalFixed = 0;
  
  // Fix Owners
  const ownersSheet = ss.getSheetByName('Owners');
  const ownersData = ownersSheet.getDataRange().getValues();
  for (let i = 1; i < ownersData.length; i++) {
    if (!ownersData[i][0] || ownersData[i][0] === '') {
      ownersSheet.getRange(i + 1, 1).setValue('own_' + Date.now() + '_' + i);
      totalFixed++;
    }
  }
  
  // Fix Drivers
  const driversSheet = ss.getSheetByName('Drivers');
  if (driversSheet) {
    const driversData = driversSheet.getDataRange().getValues();
    for (let i = 1; i < driversData.length; i++) {
      if (!driversData[i][0] || driversData[i][0] === '') {
        driversSheet.getRange(i + 1, 1).setValue('drv_' + Date.now() + '_' + i);
        totalFixed++;
      }
    }
  }
  
  // Fix Vehicles
  const vehiclesSheet = ss.getSheetByName('Vehicles');
  if (vehiclesSheet) {
    const vehiclesData = vehiclesSheet.getDataRange().getValues();
    for (let i = 1; i < vehiclesData.length; i++) {
      if (!vehiclesData[i][0] || vehiclesData[i][0] === '') {
        vehiclesSheet.getRange(i + 1, 1).setValue('veh_' + Date.now() + '_' + i);
        totalFixed++;
      }
    }
  }
  
  // Fix Fills
  const fillsSheet = ss.getSheetByName('Fills');
  if (fillsSheet) {
    const fillsData = fillsSheet.getDataRange().getValues();
    for (let i = 1; i < fillsData.length; i++) {
      if (!fillsData[i][0] || fillsData[i][0] === '') {
        fillsSheet.getRange(i + 1, 1).setValue('fill_' + Date.now() + '_' + i);
        totalFixed++;
      }
    }
  }
  
  return 'Fixed ' + totalFixed + ' records with empty IDs';
}
