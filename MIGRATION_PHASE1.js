// MIGRATION SCRIPT v1.0 - Phase 1
// Run this in Google Apps Script to migrate existing data to new schema
// Paste this code into your existing Apps Script project and run migrateToPhase1()

/**
 * MIGRATE TO PHASE 1
 * This function:
 * 1. Adds new columns to Owners sheet (creditLimit, creditUsed, creditFrozen, totalPaid, lastPaymentDate, notes)
 * 2. Creates PaymentEntries sheet if it doesn't exist
 * 3. Sets default values for existing owners
 * 4. Preserves all existing data
 */
function migrateToPhase1() {
  const props = PropertiesService.getScriptProperties();
  const SHEET_ID = props.getProperty('SHEET_ID');
  
  if (!SHEET_ID) {
    Logger.log('ERROR: SHEET_ID not found. Run setup() first.');
    return 'Error: No SHEET_ID found';
  }
  
  Logger.log('=== PHASE 1 MIGRATION STARTED ===');
  Logger.log('Sheet ID: ' + SHEET_ID);
  
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const migrationLog = [];
  
  // ========== STEP 1: Migrate Owners Sheet ==========
  Logger.log('\\n--- Migrating Owners Sheet ---');
  const ownersSheet = ss.getSheetByName('Owners');
  
  if (!ownersSheet) {
    Logger.log('ERROR: Owners sheet not found');
    return 'Error: Owners sheet missing';
  }
  
  // Check current headers
  const ownersHeaders = ownersSheet.getRange(1, 1, 1, ownersSheet.getLastColumn()).getValues()[0];
  Logger.log('Current Owners columns: ' + ownersHeaders.join(', '));
  
  // New columns to add
  const newOwnerColumns = [
    { name: 'creditLimit', default: 50000 },
    { name: 'creditUsed', default: 0 },
    { name: 'creditFrozen', default: false },
    { name: 'totalPaid', default: 0 },
    { name: 'lastPaymentDate', default: '' },
    { name: 'notes', default: '' }
  ];
  
  // Add missing columns
  newOwnerColumns.forEach(col => {
    if (!ownersHeaders.includes(col.name)) {
      const newColIndex = ownersSheet.getLastColumn() + 1;
      ownersSheet.getRange(1, newColIndex).setValue(col.name);
      ownersSheet.getRange(1, newColIndex).setFontWeight('bold').setBackground('#EE2726').setFontColor('white');
      
      // Set default values for existing rows
      const lastRow = ownersSheet.getLastRow();
      if (lastRow > 1) {
        for (let row = 2; row <= lastRow; row++) {
          ownersSheet.getRange(row, newColIndex).setValue(col.default);
        }
      }
      
      migrationLog.push('Added column: ' + col.name + ' with default: ' + col.default);
      Logger.log('✓ Added column: ' + col.name);
    } else {
      Logger.log('  Already exists: ' + col.name);
    }
  });
  
  // ========== STEP 2: Create PaymentEntries Sheet ==========
  Logger.log('\\n--- Creating PaymentEntries Sheet ---');
  let paymentSheet = ss.getSheetByName('PaymentEntries');
  
  if (!paymentSheet) {
    paymentSheet = ss.insertSheet('PaymentEntries');
    const paymentHeaders = ['id', 'ownerId', 'amount', 'date', 'method', 'notes', 'createdAt'];
    paymentSheet.getRange(1, 1, 1, paymentHeaders.length).setValues([paymentHeaders]);
    paymentSheet.getRange(1, 1, 1, paymentHeaders.length).setFontWeight('bold').setBackground('#EE2726').setFontColor('white');
    paymentSheet.setFrozenRows(1);
    
    migrationLog.push('Created PaymentEntries sheet');
    Logger.log('✓ Created PaymentEntries sheet');
  } else {
    Logger.log('  PaymentEntries sheet already exists');
  }
  
  // ========== STEP 3: Verify Migration ==========
  Logger.log('\\n--- Verifying Migration ---');
  const updatedOwnersHeaders = ownersSheet.getRange(1, 1, 1, ownersSheet.getLastColumn()).getValues()[0];
  Logger.log('Updated Owners columns: ' + updatedOwnersHeaders.join(', '));
  
  const paymentHeaders = paymentSheet.getRange(1, 1, 1, paymentSheet.getLastColumn()).getValues()[0];
  Logger.log('PaymentEntries columns: ' + paymentHeaders.join(', '));
  
  // ========== STEP 4: Summary ==========
  Logger.log('\\n=== MIGRATION COMPLETE ===');
  Logger.log('Changes made:');
  migrationLog.forEach(log => Logger.log('  - ' + log));
  
  // Show success popup
  SpreadsheetApp.getUi().alert(
    'Migration Complete!',
    'Phase 1 migration finished successfully.\\n\\nChanges:\\n' + migrationLog.join('\\n'),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
  
  return {
    success: true,
    changes: migrationLog,
    ownersColumns: updatedOwnersHeaders.length,
    paymentSheetCreated: !ss.getSheetByName('PaymentEntries')
  };
}

/**
 * ROLLBACK MIGRATION (Use with caution!)
 * Removes the new columns from Owners sheet
 */
function rollbackPhase1() {
  const props = PropertiesService.getScriptProperties();
  const SHEET_ID = props.getProperty('SHEET_ID');
  
  if (!SHEET_ID) {
    Logger.log('ERROR: SHEET_ID not found');
    return;
  }
  
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const ownersSheet = ss.getSheetByName('Owners');
  
  // Get current headers
  const headers = ownersSheet.getRange(1, 1, 1, ownersSheet.getLastColumn()).getValues()[0];
  
  // Columns to remove (in reverse order to avoid index shifting)
  const columnsToRemove = ['notes', 'lastPaymentDate', 'totalPaid', 'creditFrozen', 'creditUsed', 'creditLimit'];
  
  columnsToRemove.forEach(colName => {
    const colIndex = headers.indexOf(colName);
    if (colIndex >= 0) {
      ownersSheet.deleteColumn(colIndex + 1);
      Logger.log('Removed column: ' + colName);
    }
  });
  
  // Optionally delete PaymentEntries sheet
  const paymentSheet = ss.getSheetByName('PaymentEntries');
  if (paymentSheet) {
    ss.deleteSheet(paymentSheet);
    Logger.log('Deleted PaymentEntries sheet');
  }
  
  Logger.log('Rollback complete');
}

/**
 * TEST MIGRATION
 * Run this to verify the migration worked
 */
function testMigration() {
  const props = PropertiesService.getScriptProperties();
  const SHEET_ID = props.getProperty('SHEET_ID');
  
  const ss = SpreadsheetApp.openById(SHEET_ID);
  
  // Test Owners
  const ownersSheet = ss.getSheetByName('Owners');
  const ownersData = ownersSheet.getDataRange().getValues();
  Logger.log('Owners sheet:');
  Logger.log('  Headers: ' + ownersData[0].join(', '));
  Logger.log('  Row count: ' + (ownersData.length - 1));
  
  // Test PaymentEntries
  const paymentSheet = ss.getSheetByName('PaymentEntries');
  if (paymentSheet) {
    const paymentData = paymentSheet.getDataRange().getValues();
    Logger.log('\\nPaymentEntries sheet:');
    Logger.log('  Headers: ' + paymentData[0].join(', '));
    Logger.log('  Row count: ' + (paymentData.length - 1));
  }
  
  // Test API
  Logger.log('\\nTesting API...');
  const testResult = doPost({
    postData: {
      contents: JSON.stringify({
        action: 'getData'
      })
    }
  });
  Logger.log('API Response: ' + testResult.getContent());
}
