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

---

## 📁 Appendix: Raw Git Commit Logs

Below is the official git history log for the recent commits addressing these bugs:

```text
commit dd6305ae8ec84f1602d08f8b866f85ee76306f50
Author: TechInnovate <developer@techinnovate.com>
Date:   Sat Jun 6 13:10:14 2026 +0530

    Add_bug_fix_history_report

 BUG_FIX_HISTORY_REPORT.md | 76 +++++++++++++++++++++++++
 1 file changed, 76 insertions(+)

commit fd67cf392abcfdabad1598bbdb3311d1d0ca59de
Author: TechInnovate <developer@techinnovate.com>
Date:   Sat Jun 6 13:06:22 2026 +0530

    Open_media_links_in_new_tab_to_bypass_CORS

 src/App.tsx | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

commit 02ee0a14de20008ae596e10a3f585d40aefa4a3d
Author: TechInnovate <developer@techinnovate.com>
Date:   Sat Jun 6 13:04:05 2026 +0530

    Enable_owner_media_lightbox_click

 src/App.tsx | 3 ++-
 1 file changed, 2 insertions(+), 1 deletion(-)

commit 0b63901395181ad43a30c6b6ead2de6449175713
Author: TechInnovate <developer@techinnovate.com>
Date:   Sat Jun 6 13:02:40 2026 +0530

    Fix_owner_media_tab

 src/App.tsx | 31 +++++++++++++------------------
 1 file changed, 13 insertions(+), 18 deletions(-)

commit 6f25eee891e0df8cf838c7b1dedbfc7f60390ed0
Author: TechInnovate <developer@techinnovate.com>
Date:   Sat Jun 6 12:57:22 2026 +0530

    Fix case-insensitive and space-insensitive column header matching for URLs in getFillsData

 APPS_SCRIPT_COMPLETE_ALL_PHASES.js | 7 ++++---
 FINAL_APPS_SCRIPT.js               | 7 ++++---
 2 files changed, 8 insertions(+), 6 deletions(-)

commit 05152c372c0b431d1263ff0ef3216c6f3c95d36f
Author: TechInnovate <developer@techinnovate.com>
Date:   Sat Jun 6 12:33:20 2026 +0530

    Update Apps Script getFillsData to support extracting URLs from hyperlink formulas dynamically

 APPS_SCRIPT_COMPLETE_ALL_PHASES.js | 58 ++++++++++++++++------
 FINAL_APPS_SCRIPT.js               | 56 +++++++++++++++------
 2 files changed, 84 insertions(+), 30 deletions(-)

commit e34bd60aca552ab5effa25d3173699506ba114d8
Author: TechInnovate <developer@techinnovate.com>
Date:   Sat Jun 6 12:30:33 2026 +0530

    Format videoUrl as hyperlink formula in new fills Google Sheets entries

 APPS_SCRIPT_COMPLETE.js            | 3 ++-
 APPS_SCRIPT_COMPLETE_ALL_PHASES.js | 3 ++-
 FINAL_APPS_SCRIPT.js               | 4 ++++
 3 files changed, 8 insertions(+), 2 deletions(-)

commit f83bf460cdb55fb8bbd8df9cf3a16933418a1419
Author: TechInnovate <developer@techinnovate.com>
Date:   Sat Jun 6 11:54:19 2026 +0530

    Fix driver fills synchronization, offline queueing, and vehicle odometer matching

 APPS_SCRIPT_COMPLETE_ALL_PHASES.js | 57 ++++++++++++-
 FINAL_APPS_SCRIPT.js               | 33 +++++++-
 src/App.tsx                        | 94 +++++++++++++---------
 3 files changed, 138 insertions(+), 46 deletions(-)

commit cf4f92f9f8556b8939e207fe2d71016dc1600629
Author: TechInnovate <developer@techinnovate.com>
Date:   Fri Jun 5 15:23:16 2026 +0530

    Fix: correct OTP variable interpolation in email body in FINAL_APPS_SCRIPT.js

 FINAL_APPS_SCRIPT.js | 18 ++++++++----------
 1 file changed, 8 insertions(+), 10 deletions(-)

commit abc0a970486ac5dc0f0fb95f3d8952df4addd4a4
Author: TechInnovate <developer@techinnovate.com>
Date:   Fri Jun 5 15:15:52 2026 +0530

    Feat: add testEmailPermission helper to force trigger Google authorization

 FINAL_APPS_SCRIPT.js | 9 +++++++++
 1 file changed, 9 insertions(+)

commit 2364ae94696cebdeb2f3dd9e2788ef12aa8319ff
Author: TechInnovate <developer@techinnovate.com>
Date:   Fri Jun 5 15:04:17 2026 +0530

    Feat: implement free email verification OTP for Owner Registration

 FINAL_APPS_SCRIPT.js         |  72 ++++++++++
 src/components/OwnerRegister.tsx  | 158 +++++++++++++++++++--
 src/lib/googleSync.ts        |  34 +++++
 3 files changed, 254 insertions(+), 10 deletions(-)

commit 85d5e7cca7e077a58e87688db90a96d06d929038
Author: TechInnovate <developer@techinnovate.com>
Date:   Fri Jun 5 10:30:49 2026 +0530

    Fix: prevent empty ID column from overwriting valid driver and vehicle IDs

 src/App.tsx | 15 ++++++++++++---
 1 file changed, 12 insertions(+), 3 deletions(-)

commit 308e468445d148bed2c438283436bc8797963b8e
Author: TechInnovate <developer@techinnovate.com>
Date:   Fri Jun 5 10:21:06 2026 +0530

    Fix: backend owner registration alignment and credit limit offset in spreadsheet

 FINAL_APPS_SCRIPT.js | 514 ++++++++++++++++++++++-------
 1 file changed, 386 insertions(+), 128 deletions(-)
```
