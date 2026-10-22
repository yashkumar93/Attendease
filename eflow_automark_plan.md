# Plan: Auto-Mark Absent on eFlow Geeta University Portal

> **Portal**: https://eflow.geetauniversity.com/academic_v2/attendance_workbench  
> **Purpose**: After Attendease records who's absent, automatically mark those students absent on the eFlow portal too — the instructor just submits at the end.

---

## The Big Picture (Both Portals Together)

```
CCBP Platform                    Attendease DB              eFlow Portal
(Source of Truth)                (Your App)                 (University ERP)
      │                               │                           │
      │  1. Extension scrapes         │                           │
      │     absent names ─────────────▶ Saves attendance         │
      │                               │                           │
      │                               │  2. Extension reads       │
      │                               │     absent list ──────────▶ Auto-marks
      │                               │                           │  absent students
      │                               │                           │
      │                               │                      3. Instructor
      │                               │                         clicks Submit
```

---

## How eFlow Auto-Mark Will Work

### Step 1 — Time Matching (Class Period Detection)

When the instructor opens the extension popup on the **eFlow attendance_workbench** page:

- The extension reads the **current IST time**
- Matches it against the standard period schedule (09:20–10:10, 10:10–11:00, etc.)
- **Auto-selects the correct period/slot** on eFlow's attendance form
- This avoids the instructor having to manually pick the right class from a dropdown

```
Current Time: 10:35 AM IST
→ Matches: Period 2 (10:10 – 11:00)
→ Extension looks for "Period 2" / "10:10" in eFlow dropdowns
→ Auto-selects it
```

### Step 2 — Fetch Absent List from Attendease

Same as the CCBP plan — the extension calls:

```
GET /api/extension/absent?classId=&periodNumber=&date=
→ Returns: [{ name, roll_number }]  ← students marked Absent in Attendease for this period
```

The extension then has the **list of names/roll numbers** who need to be marked absent on eFlow.

### Step 3 — Match & Mark on eFlow

Once the extension knows:
- Which period is active (from time matching)
- Which students are absent (from Attendease)

It injects a script into the eFlow page that:

1. **Opens / ensures the attendance workbench form is loaded** for the right class/period
2. **Finds each student row** in the eFlow student list table
3. For each absent student:
   - Fuzzy-match roll number or name against the eFlow table row
   - **Click the "Absent" marker** for that student (checkbox / radio / button — to be confirmed after seeing UI)
4. Reports back: `Marked X absent, Y already absent, Z not found`

### Step 4 — Verification

After auto-clicking, the extension:
- **Counts the absent checkmarks** visible on eFlow
- Compares with the expected absent count from Attendease
- Shows a verification banner:
  - ✅ `"Absent count matches: 4/4 students marked absent"`
  - ⚠️ `"Count mismatch: Expected 4, found 3 — please check Raj Kumar manually"`

### Step 5 — Instructor Submits

- The extension shows a **"All done! Please click Submit on eFlow"** prompt
- The instructor reviews the auto-marked list and clicks the eFlow portal's own Submit button
- (We do NOT auto-submit to avoid accidental mass submissions)

---

## Extension Architecture for eFlow

### New Content Script for eFlow

We'll add a **separate content script** that only activates on the eFlow domain:

```json
// manifest.json addition
{
  "content_scripts": [
    {
      "matches": ["*://eflow.geetauniversity.com/*"],
      "js": ["eflow-content.js"],
      "css": ["content.css"]
    }
  ]
}
```

### New Popup Mode

The popup detects which platform the user is on:

```
Tab URL contains "ccbp.in"          → Show CCBP mode
Tab URL contains "eflow.geetauniversity.com"  → Show eFlow mode
Neither                              → Show "Not on supported platform"
```

---

## Files to Create / Change

| File | Change |
|------|--------|
| `extension/manifest.json` | Add eFlow to `host_permissions` + new content script |
| `extension/popup.html` | Add eFlow mode section (hidden by default, shown when on eFlow) |
| `extension/popup.js` | Add `detectPlatform()`, `eflowAutoMark()`, time-matching logic |
| `extension/eflow-content.js` *(new)* | Floating badge + helper for eFlow page |
| `src/app/api/extension/absent/route.ts` *(new)* | API: returns absent students for a period |

---

## UX Flow on eFlow (Popup View)

```
┌──────────────────────────────────────┐
│  🎓 Attendease  ·  eFlow Sync        │
├──────────────────────────────────────┤
│  🕐 Detected Period: 2 (10:10–11:00) │
│  📅 Date: 21 Oct 2026                │
│  🏫 Class: Class 1                   │
├──────────────────────────────────────┤
│  Absent Students (from Attendease):  │
│  ┌────────────────────────────────┐  │
│  │ ● Rahul Sharma  (CS-001)       │  │
│  │ ● Priya Patel   (CS-008)       │  │
│  │ ● Amit Verma    (CS-015)       │  │
│  └────────────────────────────────┘  │
│                                      │
│  [🤖 Auto-Mark on eFlow]             │
├──────────────────────────────────────┤
│  ✅ Marked absent: 3/3               │
│  ✅ Count verified: 3 absent on eFlow│
│                                      │
│  ⬆️ Please click SUBMIT on eFlow     │
└──────────────────────────────────────┘
```

---

## Logic for Time Matching (Detailed)

```js
function matchEflowPeriod() {
  const now = getCurrentISTTimeString(); // "10:35"
  
  for (const period of STANDARD_PERIODS) {
    if (now >= period.startTime && now < period.endTime) {
      return period; // { periodNumber: 2, startTime: "10:10", endTime: "11:00" }
    }
  }
  
  // If between periods, pick the nearest upcoming one
  return findNearestUpcomingPeriod(now);
}
```

On the eFlow page, once the period is known, the injected script will:
1. Find the period/slot selector dropdown → select the matching value
2. Trigger a change event to load the student list
3. Wait for the student table to populate
4. Begin marking

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Between periods (e.g., 11:00–11:05 break) | Pick the period that just ended (most likely still being submitted) |
| eFlow session not logged in | Show: "Please log in to eFlow first" |
| eFlow page not on attendance_workbench | Show: "Navigate to Attendance Workbench first" |
| Roll number format mismatch | Try name matching as fallback |
| Student in Attendease but not in eFlow roster | Show in "Not Found" list |
| Network error fetching from Attendease | Use cached `state.scrapedNames` from last scrape as fallback |

---

## What We Need from You (UI Details)

To build the DOM interaction for eFlow correctly, we need to know:

1. **How are students listed?** — A table? A list of cards?
2. **How do you mark someone absent?** — Checkbox? Radio button (P/A)? A dropdown per student? A toggle?
3. **Is there a "class" or "section" dropdown?** — What does it look like?
4. **Is there a "period" or "slot" dropdown?** — Or is it time-based automatically?
5. **What does the Submit button look like?**

> 📸 Share a screenshot of the eFlow attendance workbench and we'll build the exact DOM selectors.

---

## Implementation Order (Once UI is Confirmed)

1. `GET /api/extension/absent` route (reusable for both portals)
2. `manifest.json` — add eFlow permissions
3. `eflow-content.js` — floating badge for eFlow
4. `popup.js` — `detectPlatform()` + eFlow mode rendering
5. `popup.js` — `eflowAutoMark(absentStudents)` injected function
6. `popup.html` — eFlow UI section
7. **Test end-to-end** with real eFlow session

---

> ✅ **Ready to implement as soon as you share the eFlow UI screenshot/description!**
