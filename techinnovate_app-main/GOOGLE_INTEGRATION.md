# Google Sheets + Drive Integration Setup

Current Status: **Frontend ready, needs your Apps Script deployment**

The app is built with full integration architecture. Right now it uses localStorage (works perfectly offline). To enable permanent Google Sheets + Drive storage:

## Step 1: Create Google Apps Script

1. Go to https://script.google.com
2. Create New Project → Name: "CNG Fuel Tracker API"
3. Paste this code:

```javascript
const SHEET_ID = 'YOUR_SHEET_ID_HERE'; // Create a Google Sheet first
const DRIVE_FOLDER_ID = 'YOUR_DRIVE_FOLDER_ID'; // Create a Drive folder

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const action = data.action;
  
  try {
    switch(action) {
      case 'saveFill':
        return saveFillToSheet(data.fill);
      case 'uploadMedia':
        return uploadToDrive(data.file, data.fileName, data.folderName);
      case 'getData':
        return getAllData();
      default:
        return ContentService.createTextOutput(JSON.stringify({error: 'Invalid action'}))
          .setMimeType(ContentService.MimeType.JSON);
    }
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({error: err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({status: 'CNG API Active'}))
    .setMimeType(ContentService.MimeType.JSON);
}

function saveFillToSheet(fill) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  
  // Fills sheet
  let sheet = ss.getSheetByName('Fills');
  if (!sheet) {
    sheet = ss.insertSheet('Fills');
    sheet.appendRow(['id','vehicleId','driverId','time','station','kgs','rate','total','videoUrl','pumpPhotoUrl','receiptPhotoUrl','odoPhotoUrl','pumpGPS','receiptGPS','odoGPS','odoReading','distanceDiff','mismatch','fuelDropPercent','ownerId','verified']);
  }
  
  sheet.appendRow([
    fill.id, fill.vehicleId, fill.driverId, fill.time, fill.station,
    fill.kgs, fill.rate, fill.total,
    fill.videoUrl, fill.pumpPhotoUrl, fill.receiptPhotoUrl, fill.odoPhotoUrl,
    JSON.stringify(fill.pumpGPS), JSON.stringify(fill.receiptGPS), JSON.stringify(fill.odoGPS),
    fill.odoReading, fill.distanceDiff, fill.mismatch, fill.fuelDropPercent,
    fill.ownerId, fill.verified
  ]);
  
  // Alerts sheet
  if (fill.mismatch || fill.fuelDropPercent > 20) {
    let alertSheet = ss.getSheetByName('Alerts');
    if (!alertSheet) {
      alertSheet = ss.insertSheet('Alerts');
      alertSheet.appendRow(['id','time','event','user','type','ownerId','resolved']);
    }
    if (fill.mismatch) {
      alertSheet.appendRow([ 'alert'+Date.now(), fill.time, `Location mismatch: ${Math.round(fill.distanceDiff)}m`, fill.driverId, 'location_mismatch', fill.ownerId, false ]);
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify({success: true, id: fill.id}))
    .setMimeType(ContentService.MimeType.JSON);
}

function uploadToDrive(base64Data, fileName, folderName) {
  const drive = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  
  // Create vehicle+date folder
  let folder;
  const folders = drive.getFoldersByName(folderName);
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = drive.createFolder(folderName);
  }
  
  const blob = Utilities.newBlob(Utilities.base64Decode(base64Data.split(',')[1]), 
    base64Data.split(';')[0].split(':')[1], fileName);
  
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  return ContentService.createTextOutput(JSON.stringify({
    success: true, 
    url: `https://drive.google.com/uc?id=${file.getId()}`,
    fileId: file.getId()
  })).setMimeType(ContentService.MimeType.JSON);
}

function getAllData() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const data = {};
  
  ['Owners','Drivers','Vehicles','Fills','Alerts'].forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet) {
      const values = sheet.getDataRange().getValues();
      const headers = values[0];
      data[name.toLowerCase()] = values.slice(1).map(row => {
        const obj = {};
        headers.forEach((h, i) => obj[h] = row[i]);
        return obj;
      });
    }
  });
  
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
```

4. Deploy → New Deployment → Web App
   - Execute as: Me
   - Who has access: Anyone
   - Copy the Web App URL

## Step 2: Create Google Sheet

Create a sheet with tabs: Owners, Drivers, Vehicles, Fills, Alerts
Copy the Sheet ID from URL

## Step 3: Create Drive Folder

Create folder "CNG Fuel Media" → Copy Folder ID

## Step 4: Update App

In the app, go to Settings (I'll add it) and paste your Apps Script URL.

---

## CURRENT IMPLEMENTATION

Right now the app uses **localStorage** which:
- ✅ Works offline perfectly
- ✅ Persists across sessions
- ✅ Syncs queue when online
- ✅ No setup required
- ❌ Not shared across devices
- ❌ Not permanent cloud backup

**To enable real Google integration**, I've built the full API layer. Update `src/lib/googleSync.ts` with your URL: