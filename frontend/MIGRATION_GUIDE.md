# Phase 1 Backend Migration Guide

## Overview
This migration adds credit management capabilities to your CNG Fuel Tracker backend.

## What Changes

### 1. Owners Sheet - New Columns
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| creditLimit | Number | 50000 | Maximum credit allowed |
| creditUsed | Number | 0 | Amount of credit currently used |
| creditFrozen | Boolean | false | Whether credit is frozen |
| totalPaid | Number | 0 | Total amount paid by owner |
| lastPaymentDate | String | "" | Date of last payment (YYYY-MM-DD) |
| notes | String | "" | Admin notes about owner |

### 2. New Sheet: PaymentEntries
| Column | Type | Description |
|--------|------|-------------|
| id | String | Unique payment ID (pay_timestamp) |
| ownerId | String | Owner who made payment |
| amount | Number | Payment amount in INR |
| date | String | Payment date (YYYY-MM-DD) |
| method | String | Payment method (cash/bank/upi) |
| notes | String | Additional notes |
| createdAt | String | Timestamp of record creation |

## Migration Steps

### Step 1: Backup Your Data
**IMPORTANT:** Before running migration, backup your Google Sheet:
1. Open your existing Google Sheet
2. File → Make a copy
3. Keep the copy as backup

### Step 2: Open Apps Script
1. Go to https://script.google.com
2. Open your existing CNG Fuel Tracker project
3. Click the + next to "Files" to add a new file
4. Name it "Migration"
5. Paste the code from `MIGRATION_PHASE1.js`

### Step 3: Run Migration
1. In the dropdown (next to the debug button), select `migrateToPhase1`
2. Click Run (▶️ button)
3. Authorize permissions when prompted
4. Wait for the "Migration Complete!" popup

### Step 4: Verify Migration
1. Run `testMigration` function
2. Check Logs (View → Logs)
3. Verify:
   - Owners sheet has 14 columns (was 8, now +6)
   - PaymentEntries sheet exists with 7 columns
   - All existing data is preserved

### Step 5: Update API Code
1. Replace your existing `doPost` and `doGet` functions with the code from `APPS_SCRIPT_PHASE1.js`
2. Save (Ctrl+S)
3. Deploy → New deployment → Web app
4. Copy the new Web App URL

## API Changes

### New Actions Available

#### 1. updateOwner
Updates owner credit and status fields.

```javascript
// Request
{
  action: 'updateOwner',
  ownerId: 'own1',
  creditLimit: 75000,        // Optional
  creditUsed: 12500,       // Optional
  creditFrozen: false,     // Optional
  totalPaid: 5000,         // Optional
  lastPaymentDate: '2024-01-15', // Optional
  notes: 'Good customer',  // Optional
  status: 'active'         // Optional
}

// Response
{
  success: true,
  updated: ['creditLimit', 'creditUsed']
}
```

#### 2. addPaymentEntry
Records a payment and auto-updates owner totals.

```javascript
// Request
{
  action: 'addPaymentEntry',
  ownerId: 'own1',
  amount: 5000,
  date: '2024-01-15',      // Optional, defaults to today
  method: 'upi',           // Optional, defaults to 'cash'
  notes: 'Partial payment' // Optional
}

// Response
{
  success: true,
  id: 'pay_1705312800000'
}
```

#### 3. getOwnerPayments
Gets all payments for a specific owner.

```javascript
// Request
{
  action: 'getOwnerPayments',
  ownerId: 'own1'
}

// Response
{
  success: true,
  payments: [
    {
      id: 'pay_1705312800000',
      ownerId: 'own1',
      amount: 5000,
      date: '2024-01-15',
      method: 'upi',
      notes: 'Partial payment',
      createdAt: '2024-01-15T10:00:00.000Z'
    }
  ]
}
```

#### 4. Enhanced getData
Now returns `paymentEntries` along with existing data.

```javascript
// Response
{
  success: true,
  fills: [...],
  drivers: [...],
  vehicles: [...],
  owners: [...],        // Now includes credit fields
  alerts: [...],
  paymentEntries: [...] // NEW
}
```

## Frontend Integration

### Update googleSync.ts

Add these new functions to your frontend:

```typescript
// Update owner credit/status
async updateOwner(ownerId: string, updates: {
  creditLimit?: number;
  creditUsed?: number;
  creditFrozen?: boolean;
  totalPaid?: number;
  lastPaymentDate?: string;
  notes?: string;
  status?: string;
}) {
  const response = await fetch(this.baseUrl, {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'updateOwner',
      ownerId,
      ...updates
    })
  });
  return response.json();
}

// Add payment entry
async addPaymentEntry(entry: {
  ownerId: string;
  amount: number;
  date?: string;
  method?: string;
  notes?: string;
}) {
  const response = await fetch(this.baseUrl, {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'addPaymentEntry',
      ...entry
    })
  });
  return response.json();
}

// Get owner payments
async getOwnerPayments(ownerId: string) {
  const response = await fetch(this.baseUrl, {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'getOwnerPayments',
      ownerId
    })
  });
  return response.json();
}
```

### Update Data Loading

Modify your `fetchAllData` to handle new fields:

```typescript
async fetchAllData() {
  const response = await fetch(this.baseUrl + '?action=getData');
  const data = await response.json();
  
  if (data.success) {
    return {
      fills: data.fills || [],
      drivers: data.drivers || [],
      vehicles: data.vehicles || [],
      owners: data.owners || [],
      alerts: data.alerts || [],
      paymentEntries: data.paymentEntries || [] // NEW
    };
  }
  
  throw new Error(data.error || 'Failed to fetch data');
}
```

## Rollback (If Needed)

If something goes wrong:

1. In Apps Script, run `rollbackPhase1` function
2. This will:
   - Remove new columns from Owners sheet
   - Delete PaymentEntries sheet
   - Keep original 8 columns

**Note:** Data in new columns will be lost!

## Troubleshooting

### Issue: "SHEET_ID not found"
**Solution:** Run `setup()` first to create a new sheet, or check that PropertiesService has SHEET_ID

### Issue: "Column already exists"
**Solution:** This is expected if running migration twice. It's safe to ignore.

### Issue: Data not showing in frontend
**Solution:** 
1. Check that `fetchAllData` includes `paymentEntries`
2. Verify new Owner type includes credit fields
3. Clear browser cache and reload

### Issue: Payments not updating owner totals
**Solution:** 
1. Check that Owners sheet has `totalPaid` and `lastPaymentDate` columns
2. Verify column headers match exactly (case-sensitive)

## Next Steps

After Phase 1 is working:
1. Update frontend to use new endpoints
2. Test credit management features
3. Proceed to Phase 2 (Alert Management)

## Support

If issues occur:
1. Check Apps Script logs (View → Logs)
2. Run `testMigration` to verify data
3. Use rollback if needed
4. Contact with error messages
