// CNG FUEL TRACKER - PHASE 2 BACKEND (Alert Management)
// Add these functions to your APPS_SCRIPT_COMPLETE.js file

// Enhanced CONFIG.SHEETS.Alerts - update headers to:
// ['id', 'time', 'event', 'user', 'type', 'ownerId', 'resolved', 'resolvedBy', 'resolvedAt', 'resolutionNote', 'severity']

// ADD ALERT (Standalone - prevents duplicates)
function handleAddAlert(data, SHEET_ID) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Alerts');
  
  // Check for duplicate alert (same owner, type, event, within 5 minutes)
  const existingData = sheet.getDataRange().getValues();
  const now = new Date(data.time || Date.now());
  
  for (let i = 1; i < existingData.length; i++) {
    const existingTime = new Date(existingData[i][1]);
    const existingOwner = existingData[i][5];
    const existingType = existingData[i][4];
    const existingEvent = existingData[i][2];
    const timeDiff = Math.abs(now.getTime() - existingTime.getTime());
    
    if (existingOwner === data.ownerId && 
        existingType === data.type && 
        timeDiff < 300000 &&
        existingEvent === data.event) {
      return json({ success: true, id: existingData[i][0], duplicate: true });
    }
  }
  
  const alertId = data.id || 'alert_' + Date.now();
  
  sheet.appendRow([
    alertId,
    data.time || new Date().toISOString(),
    data.event || 'Alert',
    data.user || '',
    data.type || 'info',
    data.ownerId,
    false,
    '',
    '',
    '',
    data.severity || 'medium'
  ]);
  
  return json({ success: true, id: alertId });
}

// RESOLVE ALERT
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
      
      if (colMap.resolved !== undefined) {
        sheet.getRange(rowNum, colMap.resolved + 1).setValue(true);
      }
      if (colMap.resolvedBy !== undefined && data.resolvedBy) {
        sheet.getRange(rowNum, colMap.resolvedBy + 1).setValue(data.resolvedBy);
      }
      if (colMap.resolvedAt !== undefined) {
        sheet.getRange(rowNum, colMap.resolvedAt + 1).setValue(new Date().toISOString());
      }
      if (colMap.resolutionNote !== undefined && data.resolutionNote) {
        sheet.getRange(rowNum, colMap.resolutionNote + 1).setValue(data.resolutionNote);
      }
      
      return json({ success: true, resolved: true });
    }
  }
  
  return json({ success: false, error: 'Alert not found: ' + data.alertId });
}

// Update doPost to handle these actions:
// if (action === 'addAlert') return handleAddAlert(data, SHEET_ID);
// if (action === 'resolveAlert') return handleResolveAlert(data, SHEET_ID);
