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

function repairMissingHeaders(ss) {
  const sheetsConfig = CONFIG.SHEETS;
  for (const sheetName in sheetsConfig) {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) continue;
    
    const lastRow = sheet.getLastRow();
    if (lastRow === 0) {
      createSheetWithHeaders(ss, sheetName, sheetsConfig[sheetName].headers);
      continue;
    }
    
    // Read the first row's first few cells
    const lastCol = Math.max(1, Math.min(10, sheet.getLastColumn()));
    const firstRowValues = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const firstCell = String(firstRowValues[0]).trim();
    
    // If first cell is not 'id' (case-insensitive), the header row is missing/deleted
    if (firstCell.toLowerCase() !== 'id') {
      Logger.log('Detected missing or invalid headers in sheet: ' + sheetName + '. Row 1 starts with: "' + firstCell + '". Attempting self-healing...');
      
      // Insert a new blank row at the top (shifting everything down)
      sheet.insertRowBefore(1);
      
      // Write the expected headers into row 1
      const headers = sheetsConfig[sheetName].headers;
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      
      // Apply bold, red background, white text styling to the new header row
      sheet.getRange(1, 1, 1, headers.length)
           .setFontWeight('bold')
           .setBackground('#EE2726')
           .setFontColor('white');
      
      Logger.log('Self-healing complete. Restored headers for sheet: ' + sheetName);
    }
  }
}

function repairOwnersSheetData(ss) {
  const sheet = ss.getSheetByName('Owners');
  if (!sheet) return;
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;
  
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  
  const idIdx = findColumnIndex(headers, 'id');
  const creditLimitIdx = findColumnIndex(headers, 'creditLimit');
  
  if (idIdx === -1 || creditLimitIdx === -1) {
    Logger.log('Cannot repair Owners sheet: headers "id" or "creditLimit" not found.');
    return;
  }
  
  let repairedCount = 0;
  for (let i = 1; i < values.length; i++) {
    const rowNum = i + 1;
    const idVal = String(values[i][idIdx]).trim();
    const creditLimitVal = String(values[i][creditLimitIdx]).trim();
    
    // Check if the ID column does NOT start with 'own', but the creditLimit column DOES start with 'own'
    if (!idVal.startsWith('own') && creditLimitVal.startsWith('own')) {
      Logger.log('Detected swapped ID and creditLimit in row ' + rowNum + '. Swapping back...');
      const realId = creditLimitVal;
      const realLimit = parseFloat(idVal) || 50000;
      
      sheet.getRange(rowNum, idIdx + 1).setValue(realId);
      sheet.getRange(rowNum, creditLimitIdx + 1).setValue(realLimit);
      repairedCount++;
    } else if (creditLimitVal.startsWith('own')) {
      Logger.log('Detected invalid creditLimit (owner ID) in row ' + rowNum + '. Resetting to 50000...');
      sheet.getRange(rowNum, creditLimitIdx + 1).setValue(50000);
      repairedCount++;
    }
  }
  
  if (repairedCount > 0) {
    Logger.log('Repaired ' + repairedCount + ' owner rows.');
  }
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
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
    if (action === 'updateVehicleOdometer') {
      const updateData = {
        vehicleId: data.vehicleId,
        currentOdo: data.odometer
      };
      return handleUpdateVehicle(updateData, SHEET_ID);
    }
    
    // Phase 5: Credit Actions
    if (action === 'addCreditAction') return handleAddCreditAction(data, SHEET_ID);
    if (action === 'updateCreditAction') return handleUpdateCreditAction(data, SHEET_ID);
    
    // Phase 6: Statistics
    if (action === 'getOwnerStats') return handleGetOwnerStats(data, SHEET_ID);
    if (action === 'getVehicleStats') return handleGetVehicleStats(data, SHEET_ID);
    
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
  
  sheet.appendRow([
    data.id, data.vehicleId, data.driverId, data.time, data.station,
    parseFloat(data.kgs) || 0, parseFloat(data.rate) || 0, parseFloat(data.total) || 0,
    (data.videoUrl && data.videoUrl.startsWith('http') ? '=HYPERLINK("' + data.videoUrl + '", "Video")' : (data.videoUrl || '')),
    data.pumpPhotoUrl || '', data.receiptPhotoUrl || '', data.odoPhotoUrl || '',
    data.pumpGPS || '', data.receiptGPS || '', data.odoGPS || '',
    parseInt(data.odoReading) || 0, parseFloat(data.distanceDiff) || 0,
    data.mismatch === true || data.mismatch === 'true', parseFloat(data.fuelDropPercent) || 0,
    data.ownerId, data.verified === true || data.verified === 'true',
    data.verifiedBy || '', data.verifiedAt || '', data.adminNotes || ''
  ]);
  
  // Update vehicle odometer
  try {
    const vSheet = ss.getSheetByName('Vehicles');
    const vData = vSheet.getDataRange().getValues();
    const vHeaders = vData[0];
    const currentOdoIdx = findColumnIndex(vHeaders, 'currentOdo');
    const vIdIdx = findColumnIndex(vHeaders, 'id');
    const plateIdx = findColumnIndex(vHeaders, 'plate');
    const checkIdx = vIdIdx >= 0 ? vIdIdx : 0;
    const odoCol = currentOdoIdx >= 0 ? currentOdoIdx : 4;
    
    for (let i = 1; i < vData.length; i++) {
      const rowId = String(vData[i][checkIdx]);
      const rowPlate = plateIdx >= 0 ? String(vData[i][plateIdx]) : (vData[i][1] ? String(vData[i][1]) : '');
      const targetId = String(data.vehicleId);
      
      if (rowId === targetId || (rowPlate !== '' && rowPlate === targetId)) {
        const currentOdoVal = parseInt(vData[i][odoCol]) || 0;
        const newOdoVal = parseInt(data.odoReading) || 0;
        if (newOdoVal >= currentOdoVal) {
          vSheet.getRange(i + 1, odoCol + 1).setValue(newOdoVal);
        }
        break;
      }
    }
  } catch (err) {
    Logger.log('Error updating vehicle odometer: ' + err);
  }
  
  // Add alert if needed
  if (data.mismatch || parseFloat(data.fuelDropPercent) > 20) {
    const aSheet = ss.getSheetByName('Alerts');
    aSheet.appendRow([
      'alert_' + Date.now(), data.time,
      data.mismatch ? 'Location mismatch' : 'Fuel drop',
      data.driverId, data.mismatch ? 'location_mismatch' : 'fuel_drop',
      data.ownerId, false, '', '', '', 'high'
    ]);
  }
  
  return json({ success: true, id: data.id });
}

// ============= PHASE 1: OWNER CREDIT =============
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
      
      const fields = ['creditLimit', 'creditUsed', 'creditFrozen', 'totalPaid', 'lastPaymentDate', 'notes', 'status'];
      fields.forEach(field => {
        if (data[field] !== undefined && colMap[field] !== undefined) {
          let value = data[field];
          if (field === 'creditFrozen') value = value === true || value === 'true';
          else if (['creditLimit', 'creditUsed', 'totalPaid'].includes(field)) value = parseFloat(value) || 0;
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
  const paymentSheet = ss.getSheetByName('PaymentEntries');
  
  // Check duplicates
  const existingData = paymentSheet.getDataRange().getValues();
  const now = Date.now();
  
  for (let i = 1; i < existingData.length; i++) {
    const existingTime = new Date(existingData[i][6]).getTime();
    const existingOwner = existingData[i][1];
    const existingAmount = parseFloat(existingData[i][2]) || 0;
    
    if (existingOwner === data.ownerId && existingAmount === (parseFloat(data.amount) || 0) && (now - existingTime) < 5000) {
      return json({ success: true, id: existingData[i][0], duplicate: true });
    }
  }
  
  const paymentId = 'pay_' + now;
  paymentSheet.appendRow([
    paymentId, data.ownerId, parseFloat(data.amount) || 0,
    data.date || new Date().toISOString().split('T')[0],
    data.method || 'cash', data.notes || '', new Date().toISOString()
  ]);
  
  // Update owner totals
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
  
  // Check duplicates
  const existingData = sheet.getDataRange().getValues();
  const now = new Date(data.time || Date.now());
  
  for (let i = 1; i < existingData.length; i++) {
    const existingTime = new Date(existingData[i][1]);
    const existingOwner = existingData[i][5];
    const existingType = existingData[i][4];
    const existingEvent = existingData[i][2];
    const timeDiff = Math.abs(now.getTime() - existingTime.getTime());
    
    if (existingOwner === data.ownerId && existingType === data.type && timeDiff < 300000 && existingEvent === data.event) {
      return json({ success: true, id: existingData[i][0], duplicate: true });
    }
  }
  
  const alertId = data.id || 'alert_' + Date.now();
  sheet.appendRow([
    alertId, data.time || new Date().toISOString(),
    data.event || 'Alert', data.user || '', data.type || 'info',
    data.ownerId, false, '', '', '', data.severity || 'medium'
  ]);
  
  return json({ success: true, id: alertId });
}

function handleResolveAlert(data, SHEET_ID) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Alerts');
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  
  const colMap = {};
  headers.forEach((h, i) => colMap[h] = i);
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === data.alertId) {
      const rowNum = i + 1;
      
      if (colMap.resolved !== undefined) sheet.getRange(rowNum, colMap.resolved + 1).setValue(true);
      if (colMap.resolvedBy !== undefined && data.resolvedBy) sheet.getRange(rowNum, colMap.resolvedBy + 1).setValue(data.resolvedBy);
      if (colMap.resolvedAt !== undefined) sheet.getRange(rowNum, colMap.resolvedAt + 1).setValue(new Date().toISOString());
      if (colMap.resolutionNote !== undefined && data.resolutionNote) sheet.getRange(rowNum, colMap.resolutionNote + 1).setValue(data.resolutionNote);
      
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
  
  const colMap = {};
  headers.forEach((h, i) => colMap[h] = i);
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === data.fillId) {
      const rowNum = i + 1;
      const updates = [];
      
      if (data.verified !== undefined && colMap.verified !== undefined) {
        sheet.getRange(rowNum, colMap.verified + 1).setValue(data.verified === true || data.verified === 'true');
        updates.push('verified');
      }
      if (data.verifiedBy !== undefined && colMap.verifiedBy !== undefined) {
        sheet.getRange(rowNum, colMap.verifiedBy + 1).setValue(data.verifiedBy);
        updates.push('verifiedBy');
      }
      if (data.verifiedAt !== undefined && colMap.verifiedAt !== undefined) {
        sheet.getRange(rowNum, colMap.verifiedAt + 1).setValue(data.verifiedAt || new Date().toISOString());
        updates.push('verifiedAt');
      }
      if (data.adminNotes !== undefined && colMap.adminNotes !== undefined) {
        sheet.getRange(rowNum, colMap.adminNotes + 1).setValue(data.adminNotes);
        updates.push('adminNotes');
      }
      
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
  
  const colMap = {};
  headers.forEach((h, i) => colMap[h] = i);
  
  const idIdx = findColumnIndex(headers, 'id');
  const plateIdx = findColumnIndex(headers, 'plate');
  const checkIdx = idIdx >= 0 ? idIdx : 0;
  
  for (let i = 1; i < values.length; i++) {
    const rowId = String(values[i][checkIdx]);
    const rowPlate = plateIdx >= 0 ? String(values[i][plateIdx]) : (values[i][1] ? String(values[i][1]) : '');
    const targetId = String(data.vehicleId);
    
    if (rowId === targetId || (rowPlate !== '' && rowPlate === targetId)) {
      const rowNum = i + 1;
      const updates = [];
      
      const fields = ['plate', 'model', 'initialOdo', 'currentOdo', 'capacity', 'status', 'ownerId'];
      fields.forEach(field => {
        if (data[field] !== undefined && colMap[field] !== undefined) {
          let value = data[field];
          if (['initialOdo', 'currentOdo', 'capacity'].includes(field)) value = parseInt(value) || 0;
          
          if (field === 'currentOdo') {
            const currentOdoVal = parseInt(values[i][colMap[field]]) || 0;
            if (value < currentOdoVal) return;
          }
          
          sheet.getRange(rowNum, colMap[field] + 1).setValue(value);
          updates.push(field);
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
  
  const actionId = 'ca_' + Date.now();
  actionSheet.appendRow([
    actionId, data.ownerId, data.type, parseFloat(data.amount) || 0,
    data.reason || '', data.requestedBy || '', data.approvedBy || '',
    data.status || 'pending', new Date().toISOString()
  ]);
  
  // Update owner credit based on action type ONLY if status is approved (or not pending)
  if (data.status !== 'pending' && (data.type === 'issue' || data.type === 'emergency' || data.type === 'bonus' || data.type === 'issued')) {
    const ownerSheet = ss.getSheetByName('Owners');
    const ownerData = ownerSheet.getDataRange().getValues();
    const ownerHeaders = ownerData[0];
    const creditLimitIdx = ownerHeaders.indexOf('creditLimit');
    
    if (creditLimitIdx >= 0) {
      for (let i = 1; i < ownerData.length; i++) {
        if (ownerData[i][0] === data.ownerId) {
          const currentLimit = parseFloat(ownerData[i][creditLimitIdx]) || 0;
          ownerSheet.getRange(i + 1, creditLimitIdx + 1).setValue(currentLimit + (parseFloat(data.amount) || 0));
          break;
        }
      }
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
  headers.forEach((h, i) => colMap[h] = i);
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === data.actionId) {
      const rowNum = i + 1;
      if (colMap.status !== undefined) sheet.getRange(rowNum, colMap.status + 1).setValue(data.status);
      if (colMap.approvedBy !== undefined && data.approvedBy) sheet.getRange(rowNum, colMap.approvedBy + 1).setValue(data.approvedBy);
      
      // If approved, update owner's credit limit
      if (data.status === 'approved') {
        const ownerId = values[i][colMap.ownerId];
        const type = values[i][colMap.type];
        const amount = parseFloat(values[i][colMap.amount]) || 0;
        
        if (type === 'issue' || type === 'emergency' || type === 'bonus' || type === 'issued') {
          const ownerSheet = ss.getSheetByName('Owners');
          const ownerData = ownerSheet.getDataRange().getValues();
          const ownerHeaders = ownerData[0];
          const creditLimitIdx = ownerHeaders.indexOf('creditLimit');
          
          if (creditLimitIdx >= 0) {
            for (let j = 1; j < ownerData.length; j++) {
              if (ownerData[j][0] === ownerId) {
                const currentLimit = parseFloat(ownerData[j][creditLimitIdx]) || 0;
                ownerSheet.getRange(j + 1, creditLimitIdx + 1).setValue(currentLimit + amount);
                break;
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

// ============= EXISTING CRUD =============
function handleRegisterOwner(data, SHEET_ID) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Owners');
  // Generate ID if not provided
  const ownerId = data.id || 'own_' + Date.now();
  sheet.appendRow([
    ownerId, data.name, data.email, data.phone, data.business, data.password,
    'active', new Date().toISOString(), 50000, 0, false, 0, '', ''
  ]);
  return json({ success: true, id: ownerId });
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

// ============= GET ALL DATA =============
function handleGetData(SHEET_ID) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  
  // Auto-heal any sheets missing their headers
  try {
    repairMissingHeaders(ss);
  } catch (err) {
    Logger.log('Error repairing headers in handleGetData: ' + err);
  }
  
  // Repair any corrupted/swapped owner data (e.g. creditLimit swapped with ID)
  try {
    repairOwnersSheetData(ss);
  } catch (err) {
    Logger.log('Error repairing owner data in handleGetData: ' + err);
  }
  
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
      headers.forEach((h, i) => {
        obj[h] = parseValue(row[i]);
      });
      return obj;
    });
  };

  const getFillsData = () => {
    const sheet = ss.getSheetByName('Fills');
    if (!sheet) return [];
    const values = sheet.getDataRange().getValues();
    const richTextValues = sheet.getDataRange().getRichTextValues();
    const formulas = sheet.getDataRange().getFormulas();
    const headers = values[0];
    
    // Column indices that might contain URLs (cleaned lowercase)
    const cleanUrlColumns = ['videourl', 'pumpphotourl', 'receiptphotourl', 'odophotourl'];
    
    return values.slice(1).map((row, rowIndex) => {
      const obj = {};
      headers.forEach((h, i) => {
        const cleanH = String(h).trim().toLowerCase().replace(/[\s_-]/g, '');
        if (cleanUrlColumns.includes(cleanH)) {
          let url = '';
          // 1. Try extracting from formula first
          const formula = formulas[rowIndex + 1] ? formulas[rowIndex + 1][i] : '';
          if (formula && formula.toUpperCase().indexOf('=HYPERLINK') >= 0) {
            const match = formula.match(/=HYPERLINK\(\s*"(.*?)"/i);
            if (match && match[1]) {
              url = match[1];
            }
          }
          
          // 2. Try extracting from rich text
          if (!url) {
            const richText = richTextValues[rowIndex + 1] ? richTextValues[rowIndex + 1][i] : null;
            if (richText) {
              const runs = richText.getRuns();
              for (let r = 0; r < runs.length; r++) {
                const linkUrl = runs[r].getLinkUrl();
                if (linkUrl) {
                  url = linkUrl;
                  break;
                }
              }
              if (!url) {
                const textVal = richText.getText();
                if (textVal && textVal.startsWith('http')) {
                  url = textVal;
                }
              }
            }
          }
          
          // 3. Fallback to raw cell value
          if (!url) {
            const rawVal = row[i];
            if (typeof rawVal === 'string' && rawVal.startsWith('http')) {
              url = rawVal;
            }
          }
          
          obj[h] = url;
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
