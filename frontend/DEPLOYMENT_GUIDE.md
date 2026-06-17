# Phase 1 Backend - Complete Deployment Guide

## Overview
This is a complete single-file solution for Phase 1 backend with automatic migration support.

## Files Created

1. **`APPS_SCRIPT_COMPLETE.js`** - All-in-one backend (setup + migration + API)
2. **`src/lib/googleSync.ts`** - Updated frontend sync layer
3. **`MIGRATION_GUIDE.md`** - Detailed documentation

---

## Quick Start (One-File Deployment)

### Step 1: Open Apps Script
1. Go to https://script.google.com
2. Open your existing CNG Fuel Tracker project
3. **Delete ALL existing code** (select all, delete)
4. Copy ALL content from `APPS_SCRIPT_COMPLETE.js`
5. Paste into the editor
6. Save (Ctrl+S)

### Step 2: Run Setup/Migration
1. In the dropdown (next to the ▶️ button), select `setupOrMigrate`
2. Click Run (▶️)
3. Authorize permissions when prompted
4. Wait for the popup

**What happens:**
- If NEW setup: Creates fresh database with all tables
- If EXISTING: Automatically migrates to new schema
- Shows success message with SHEET_ID

### Step 3: Deploy Web App
1. Click **Deploy** → **New deployment**
2. Type: **Web app**
3. Execute as: **Me**
4. Who has access: **Anyone**
5. Click **Deploy**
6. Copy the **Web App URL**

### Step 4: Update Frontend
1. Open `src/lib/googleSync.ts`
2. Replace the APPS_SCRIPT_URL with your new URL:
```typescript
export const APPS_SCRIPT_URL = 'YOUR_NEW_WEB_APP_URL_HERE'
```
3. Save the file

### Step 5: Deploy Frontend
```bash
npm run deploy:pages
```

---

## New Features Available

### Backend API (Phase 1)

#### 1. Update Owner Credit
```typescript
await googleSync.updateOwner('own1', {
  creditLimit: 75000,
  creditUsed: 12500,
  creditFrozen: false,
  totalPaid: 5000,
  lastPaymentDate: '2024-01-15',
  notes: 'Good customer',
  status: 'active'
})
```

#### 2. Add Payment Entry
```typescript
await googleSync.addPaymentEntry({
  ownerId: 'own1',
  amount: 5000,
  method: 'upi', // 'cash' | 'bank' | 'upi'
  notes: 'Monthly payment'
})
// Auto-updates owner.totalPaid and owner.lastPaymentDate
```

#### 3. Get Owner Payment History
```typescript
const payments = await googleSync.getOwnerPayments('own1')
// Returns: [{id, ownerId, amount, date, method, notes, createdAt}]
```

#### 4. Enhanced getData
```typescript
const data = await googleSync.fetchAllData()
// Now includes: data.paymentEntries
```

---

## Database Schema Changes

### Owners Sheet (Enhanced)
| Column | Default | Description |
|--------|---------|-------------|
| id | - | Owner ID |
| name | - | Owner name |
| email | - | Email address |
| phone | - | Phone number |
| business | - | Business name |
| password | - | Login password |
| status | active | Account status |
| createdAt | - | Registration date |
| **creditLimit** | **50000** | **Credit limit ₹** |
| **creditUsed** | **0** | **Credit used ₹** |
| **creditFrozen** | **false** | **Credit status** |
| **totalPaid** | **0** | **Total paid ₹** |
| **lastPaymentDate** | **""** | **Last payment** |
| **notes** | **""** | **Admin notes** |

### NEW: PaymentEntries Sheet
| Column | Description |
|--------|-------------|
| id | Payment ID (pay_timestamp) |
| ownerId | Owner reference |
| amount | Payment amount |
| date | Payment date |
| method | cash/bank/upi |
| notes | Additional info |
| createdAt | Timestamp |

---

## Migration Behavior

The `setupOrMigrate()` function is smart:

### If Fresh Setup:
- Creates all sheets with proper headers
- Adds demo data
- Sets up Drive folder
- Stores SHEET_ID and FOLDER_ID

### If Existing Database:
- Detects existing SHEET_ID
- Adds missing columns to Owners
- Creates PaymentEntries sheet if missing
- Sets default values for existing rows
- Preserves all data
- Updates version marker

### If Already Migrated:
- Detects current version
- Shows "Database Up to Date!"
- No changes made

---

## Testing

### Test Functions (in Apps Script)

1. **testSetup()** - Check IDs
2. **testAPI()** - Test getData
3. **testUpdateOwner()** - Test credit update
4. **testAddPayment()** - Test payment entry

### Manual Testing (Frontend)

Open browser console and run:
```javascript
// Test update
await googleSync.updateOwner('own1', {creditLimit: 100000})

// Test payment
await googleSync.addPaymentEntry({ownerId: 'own1', amount: 5000, method: 'cash'})

// Test fetch
await googleSync.fetchAllData()
```

---

## Troubleshooting

### "Database not set up"
Run `setupOrMigrate()` first in Apps Script.

### "Sheet ID not found"
The migration didn't complete. Check Logs (View → Logs).

### Columns not appearing
Migration adds columns at the END. Check right side of Owners sheet.

### Payments not syncing
Ensure PaymentEntries sheet exists (check Sheets tabs).

### Frontend not seeing new data
1. Clear browser cache
2. Hard refresh (Ctrl+F5)
3. Check Network tab for API errors

---

## Rollback (if needed)

If something goes wrong:

1. In Apps Script, uncomment and run `rollbackPhase1()`:
```javascript
function rollbackPhase1() {
  // ... code in APPS_SCRIPT_COMPLETE.js
}
```

2. Or manually:
   - Remove columns H-N from Owners sheet
   - Delete PaymentEntries sheet

**Warning:** New data in added columns will be lost!

---

## Next Steps

Once Phase 1 is working:
1. Test credit management in Owner Dashboard
2. Test payment recording in Admin Dashboard
3. Proceed to Phase 2 (Alert Management)

---

## Summary

✅ **Backend**: One file with auto-migration  
✅ **Frontend**: Updated googleSync.ts  
✅ **Database**: Credit management enabled  
✅ **Payments**: Full tracking system  

**Ready for deployment!**
