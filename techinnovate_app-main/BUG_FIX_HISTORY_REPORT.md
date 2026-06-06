# 🛠️ TechInnovate App — Bug Fix and Development History Report

This report summarizes the major bugs identified in the **TechInnovate CNG Fleet Tracker** system and the corresponding engineering solutions implemented to resolve them. These fixes ensure data security, sync integrity, offline durability, and a smooth owner verification workflow.

---

## 📊 Summary of Enhancements & Resolved Issues

- **Security & Authorization**: Fixed plain-text credentials, race conditions causing auto-logout, and Google Apps Script permission scopes (specifically for free OTP email dispatches).
- **Data Integrity & Synchronization**: Resolved race conditions where local storage was overwritten by incomplete cloud data, standardized ID-to-Plate vehicle associations, and prevented odometer value regression.
- **Offline Reliability**: Implemented a fail-safe offline retry queue for driver fuel entries so that data captured in low-connectivity areas is preserved on page reload and synced automatically when back online.
- **Media Access & CORS Workarounds**: Addressed Google Drive's cross-origin resource sharing (CORS) limits by transitioning the Owner Media verification tab from iframe/image embedding to clean placeholders that open the media preview directly in new browser tabs.

---

## 📝 Detailed Change & Bug Fix Log

### 1. Owner Dashboard Media Previews & CORS Resolution
* **Commit(s)**: `fd67cf3` (Open media links in new tab), `02ee0a1` (Enable lightbox click), `0b63901` (Fix owner media tab)
* **Bug/Issue**: Google Drive denies cross-origin resource sharing (CORS) and blocks iframe embedding of uploaded photos and videos in the owner dashboard grid, rendering them blank or causing loading errors.
* **Root Cause**: Modern browsers block scripts from hotlinking/rendering third-party Google Drive direct-download URLs inside standard `<video>` and `<img>` nodes due to access control headers.
* **Resolution**:
  - Re-designed the owner's media verification grid to show standard placeholder cards (using the Camera icon with status badges indicating `"Captured"` or `"Not Captured"`).
  - Configured placeholders to trigger `window.open(m.url, '_blank')` upon click.
  - This redirects the browser directly to the file on Google Drive's native, authenticated domain, allowing the owner to seamlessly verify videos and images without security sandboxing conflicts.

### 2. Hyperlink Formula Support in Google Sheets Data Extraction
* **Commit(s)**: `6f25eee` (Case-insensitive column matching), `05152c3` (Extract URLs from hyperlinks), `e34bd60` (Format videoUrl as hyperlink)
* **Bug/Issue**: Media URLs stored as `=HYPERLINK("url", "label")` formulas inside the spreadsheet were not being parsed correctly by the Apps Script client, returning empty strings to the React frontend.
* **Root Cause**: Standard `.getValues()` calls in Apps Script extract only the display value (e.g., `"Video"`) instead of the underlying hyperlink destination. Furthermore, spacing and case differences (e.g. `videoUrl` vs `videourl`) caused column mapping mismatches.
* **Resolution**:
  - Refactored `getFillsData` in the Apps Script backend to read cell formulas via `.getFormulas()` and rich text via `.getRichTextValues()`.
  - Added regex extraction parsing `url` from `=HYPERLINK("url", "text")` patterns.
  - Implemented case-insensitive and space-insensitive column header normalization (`.trim().toLowerCase().replace(/[\s_-]/g, '')`) to guarantee robust URL column matching.
  - Automatically formatted new fuel entry `videoUrl` values as `=HYPERLINK("url", "Video")` for clean spreadsheet layout.

### 3. Local Storage Wiping & Driver Fills Synchronization
* **Commit(s)**: `f83bf46` (Fix driver fills sync, offline queue, and odometer matching)
* **Bug/Issue**: Fuel fills submitted by drivers while offline were lost upon page reload. Additionally, sync issues arose with vehicle-override fills, and vehicle odometer values regressed when out-of-order logs synced.
* **Root Cause**:
  - The client replaced the entire local cache with backend sheets data on startup, deleting local-only/unsynced fills.
  - Overridden vehicles were blocked from syncing immediately due to conditional checks.
  - Odometer updates matched solely on vehicle ID and didn't prevent updating values to lower numbers.
* **Resolution**:
  - Updated `loadDataFromBackend` in `App.tsx` to merge backend sheet data with local unsynced/offline fills instead of doing a complete replacement.
  - Always attempt sync on submission and enqueue failures to the local offline retry queue (`cng_offline_queue`).
  - Refactored odometer updates to match vehicle by both plate and ID and verify `newOdo >= currentOdo` to prevent regression.

### 4. OTP Variable Interpolation & Email Verification Issues
* **Commit(s)**: `cf4f92f` (Correct OTP interpolation), `abc0a97` (Email permissions helper), `2364ae9` (Free verification OTP)
* **Bug/Issue**: Verification emails for new owners showed literal `${otp}` text instead of the actual verification digits. Furthermore, registration failed due to missing `MailApp.sendEmail` scopes.
* **Root Cause**:
  - String interpolation used single quotes or incorrect variable names in the Apps Script file.
  - No initial authorization flow was triggered to grant the script access to Google's Mail API.
* **Resolution**:
  - Corrected interpolation syntax in `FINAL_APPS_SCRIPT.js` to ensure the generated verification code is injected.
  - Implemented a local OTP generator using standard script properties to avoid paid SMS/Email APIs.
  - Added a `testEmailPermission` function to force the authorization dialog and request the `https://www.googleapis.com/auth/script.send_mail` scope.

### 5. Backend Alignment and Column Offset Mismatch
* **Commit(s)**: `85d5e7c` (Prevent empty column overwriting), `308e468` (Fix owner registration alignment), `e4a4b99` (Fix shifted owner IDs)
* **Bug/Issue**: Submitting new owners aligned data incorrectly inside the Google Sheet, shifting cells or corrupting columns, and writing empty values over existing drivers and vehicles.
* **Root Cause**: Column index mapping differences between frontend JSON keys and spreadsheet headers when appending rows, and empty rows being parsed as active entities.
* **Resolution**:
  - Aligned data offsets dynamically based on sheet headers.
  - Added filter bounds to ignore empty spreadsheet rows during sync reads, protecting active local storage entries.

---

## 🛠️ Verification Checklist for Founder Review

- [x] **Compile Safety**: Clean TypeScript compilation (`tsc -b && vite build`) passed.
- [x] **Live Environment**: React frontend deployed and live on GitHub Pages.
- [x] **Remote Repository**: All modifications committed and pushed to `main` on GitHub.
- [x] **CORS Resolution**: Media verification links open in new tabs correctly.
- [x] **Data Merge**: Offline logs survive reload and sync when connection is active.
