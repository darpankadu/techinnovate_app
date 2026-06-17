# CNG Fuel Tracker - Complete Google Backend Setup

## Step 1: Create Google Sheet

1. Go to https://sheets.google.com → Create blank sheet
2. Name it: **"CNG Fuel Tracker DB"**
3. Create 5 tabs with these exact headers:

**Tab 1: Owners**
```
id | name | email | phone | business | password | status | createdAt
```

**Tab 2: Drivers**
```
id | name | code | assignedVehicleId | ownerId | status | createdAt
```

**Tab 3: Vehicles**
```
id | plate | model | initialOdo | currentOdo | capacity | ownerId | status
```

**Tab 4: Fills**
```
id | vehicleId | driverId | time | station | kgs | rate | total | videoUrl | pumpPhotoUrl | receiptPhotoUrl | odoPhotoUrl | pumpGPS | receiptGPS | odoGPS | odoReading | distanceDiff | mismatch | fuelDropPercent | ownerId | verified
```

**Tab 5: Alerts**
```
id | time | event | user | type | ownerId | resolved
```

4. Copy the Sheet ID from URL: `https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit`

---

## Step 2: Create Drive Folder

1. Go to https://drive.google.com
2. Create folder: **"CNG Fuel Media"**
3. Right-click → Share → Anyone with link → Viewer
4. Copy Folder ID from URL

---

## Step 3: Create Apps Script

1. Go to https://script.google.com → New Project
2. Name: **"CNG Tracker API"**
3. Delete default code, paste this:

```javascript
// ============= CONFIG =============
const SHEET_ID = 'PASTE_YOUR_SHEET_ID_HERE';
const DRIVE_FOLDER_ID = 'PASTE_YOUR_DRIVE_FOLDER_ID_HERE';
const DRIVE_FOLDER_NAME = 'CNG Fuel Media';
// ===================================

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    switch(action) {
      case 'uploadMedia': return uploadMedia(data);
      case 'addFill': return addFill(data);
      case 'addDriver': return addDriver(data);
      case 'addVehicle': return addVehicle(data);
      case 'getFills': return getFills(data);
      default: return json({success: false, error: 'Unknown action'});
    }
  } catch(err) {
    return json({success: false, error: err.toString()});
  }
}

function doGet(e) {
  return json({status: 'CNG API Active', time: new Date()});
}

function uploadMedia(data) {
  try {
    // Get main folder
    const mainFolder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    
    // Create vehicle folder
    const plate = (data.vehiclePlate || 'Unknown').replace(/[^a-zA-Z0-9-_]/g, '_');
    const vehicleFolder = getOrCreateFolder(mainFolder, plate);
    
    // Create date folder
    const date = data.fillDate || new Date().toISOString().split('T')[0];
    const dateFolder = getOrCreateFolder(vehicleFolder, date);
    
    // Decode and upload
    const bytes = Utilities.base64Decode(data.base64Data);
    const blob = Utilities.newBlob(bytes, data.mimeType, data.fileName);
    const file = dateFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    const url = 'https://drive.google.com/uc?id=' + file.getId();
    
    return json({
      success: true,
      fileUrl: url,
      fileId: file.getId(),
      path: plate + '/' + date
    });
  } catch(err) {
    return json({success: false, error: err.toString()});
  }
}

function addFill(data) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Fills');
    
    const row = [
      data.id,
      data.vehicleId,
      data.driverId,
      data.time,
      data.station,
      Number(data.kgs) || 0,
      Number(data.rate) || 0,
      Number(data.total) || 0,
      data.videoUrl || '',
      data.pumpPhotoUrl || '',
      data.receiptPhotoUrl || '',
      data.odoPhotoUrl || '',
      data.pumpGPS || '',
      data.receiptGPS || '',
      data.odoGPS || '',
      Number(data.odoReading) || 0,
      Number(data.distanceDiff) || 0,
      data.mismatch || false,
      Number(data.fuelDropPercent) || 0,
      data.ownerId,
      data.verified || false
    ];
    
    sheet.appendRow(row);
    
    // Add alert if needed
    if (data.mismatch || data.fuelDropPercent > 20) {
      const alertSheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Alerts');
      alertSheet.appendRow([
        'alert_' + Date.now(),
        data.time,
        data.mismatch ? 'Location mismatch: ' + Math.round(data.distanceDiff) + 'm' : 'Fuel drop: ' + data.fuelDropPercent.toFixed(1) + '%',
        data.driverId,
        data.mismatch ? 'location_mismatch' : 'fuel_drop',
        data.ownerId,
        false
      ]);
    }
    
    // Update vehicle odometer
    if (data.vehicleId && data.odoReading) {
      const vSheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Vehicles');
      const values = vSheet.getDataRange().getValues();
      for (let i = 1; i < values.length; i++) {
        if (values[i][0] === data.vehicleId) {
          vSheet.getRange(i+1, 5).setValue(Number(data.odoReading)); // currentOdo is column 5
          break;
        }
      }
    }
    
    return json({success: true, id: data.id});
  } catch(err) {
    return json({success: false, error: err.toString()});
  }
}

function addDriver(data) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Drivers');
    sheet.appendRow([
      data.id, data.name, data.code, data.assignedVehicleId || '',
      data.ownerId, 'active', new Date().toISOString()
    ]);
    return json({success: true});
  } catch(err) {
    return json({success: false, error: err.toString()});
  }
}

function addVehicle(data) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Vehicles');
    sheet.appendRow([
      data.id, data.plate, data.model, Number(data.initialOdo) || 0,
      Number(data.currentOdo) || 0, Number(data.capacity) || 60,
      data.ownerId, 'active'
    ]);
    return json({success: true});
  } catch(err) {
    return json({success: false, error: err.toString()});
  }
}

function getFills(data) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Fills');
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const rows = values.slice(1).filter(r => !data.ownerId || r[19] === data.ownerId);
    
    const fills = rows.map(r => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = r[i]);
      return obj;
    });
    
    return json({success: true, fills});
  } catch(err) {
    return json({success: false, error: err.toString()});
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
```

4. Replace `SHEET_ID` and `DRIVE_FOLDER_ID` at top
5. Save
6. Deploy → New deployment → Web app
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Copy the Web App URL

---

## Step 4: Update App

Give me the new Web App URL and I'll update the app in 30 seconds.

---

## What This Gives You:

✅ **Drive Structure:**
```
CNG Fuel Media/
  ├── GJ-01-AB-1234/
  │   ├── 2024-01-15/
  │   │   ├── video_123.webm
  │   │   ├── pump_123.jpg
  │   │   ├── receipt_123.jpg
  │   │   └── odo_123.jpg
```

✅ **Sheet:** All fills with proper numbers (not 0)
✅ **Auto alerts** for mismatches
✅ **Auto odometer updates**
✅ **Works offline** then syncs