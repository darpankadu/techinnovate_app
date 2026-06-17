# Hyperlink URL Extraction Fix - DEPLOYMENT REQUIRED

## Problem Fixed
Media photos/videos were showing as placeholders because Google Sheets stores URLs as **hyperlinks** (display text), but Apps Script's `getValues()` returns the display text instead of the actual URL.

## Solution
Updated `handleGetData()` function to use `getRichTextValues()` which can extract the actual URL from hyperlink cells.

## Files Modified
- `APPS_SCRIPT_COMPLETE_ALL_PHASES.js` - Updated `handleGetData()` function

## Deployment Steps

### Step 1: Open Google Apps Script
1. Go to https://script.google.com
2. Open your CNG Fuel Tracker project

### Step 2: Update the Code
1. Delete ALL existing code in the script editor
2. Copy ALL content from `APPS_SCRIPT_COMPLETE_ALL_PHASES.js`
3. Paste it into the script editor
4. Save (Ctrl+S or File → Save)

### Step 3: Deploy as Web App
1. Click **Deploy** → **New deployment**
2. Type: **Web app**
3. Description: "CNG Tracker v3.0 - Hyperlink Fix"
4. Execute as: **Me**
5. Who has access: **Anyone**
6. Click **Deploy**
7. Copy the new Web App URL

### Step 4: Update Frontend
1. Open `src/lib/googleSync.ts`
2. Update `APPS_SCRIPT_URL` constant with the new deployment URL:
   ```typescript
   export const APPS_SCRIPT_URL = 'YOUR_NEW_WEB_APP_URL_HERE'
   ```

### Step 5: Deploy Frontend
```bash
npm run deploy:pages
```

## What Changed in the Code

### Before (Old Code)
```javascript
const getSheetData = (name) => {
  const sheet = ss.getSheetByName(name);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();  // Returns display text for hyperlinks
  const headers = values[0];
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = parseValue(row[i]);  // "Video" instead of actual URL
    });
    return obj;
  });
};
```

### After (New Code)
```javascript
const extractUrlFromHyperlink = (richTextValue) => {
  if (!richTextValue) return '';
  const runs = richTextValue.getRuns();
  for (let i = 0; i < runs.length; i++) {
    const linkUrl = runs[i].getLinkUrl();
    if (linkUrl) return linkUrl;
  }
  return richTextValue.getText() || '';
};

const getFillsData = () => {
  const sheet = ss.getSheetByName('Fills');
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  const richTextValues = sheet.getDataRange().getRichTextValues();  // Gets hyperlinks
  const headers = values[0];
  const urlColumns = ['videoUrl', 'pumpPhotoUrl', 'receiptPhotoUrl', 'odoPhotoUrl'];
  
  return values.slice(1).map((row, rowIndex) => {
    const obj = {};
    headers.forEach((h, i) => {
      if (urlColumns.includes(h)) {
        const richText = richTextValues[rowIndex + 1][i];
        obj[h] = extractUrlFromHyperlink(richText);  // Extracts actual URL
      } else {
        obj[h] = parseValue(row[i]);
      }
    });
    return obj;
  });
};
```

## Verification
After deployment:
1. Open your app at https://nil3108.github.io/techinnovate_app
2. Login as Owner
3. Go to **Media** tab
4. You should now see actual photos/videos instead of placeholders
5. Click on any media to open in lightbox

## If Media Still Doesn't Show
1. Open browser DevTools (F12) → Network tab
2. Refresh the page
3. Find the request to your Apps Script URL
4. Check the response - look for `videoUrl`, `pumpPhotoUrl`, etc. fields
5. If URLs are still empty, check Apps Script execution logs (View → Executions)

## Notes
- This fix only affects the Fills sheet (where media URLs are stored)
- Other sheets continue to use standard `getValues()` (no hyperlink columns)
- If a cell has plain text URL (not hyperlink), it will still work
- If a cell is empty, it returns empty string

## Contact
If issues persist after deployment, check:
1. Apps Script deployment URL is correct
2. Frontend is using the new URL
3. Browser cache is cleared (Ctrl+Shift+R to hard refresh)
