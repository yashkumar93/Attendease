# Attendease – CCBP & eFlow Sync (Chrome Extension v1.1.0)

A Chrome extension designed for instructors to seamlessly sync attendance between:
1. **CCBP Instructor Platform** (`https://niat-instructor-platform.ccbp.in`) ➔ **Attendease DB**
2. **Attendease DB** ➔ **eFlow Geeta University Portal** (`https://eflow.geetauniversity.com/academic_v2/attendance_workbench`)

---

## 🚀 Key Features

### 1. CCBP Platform Integration
- **One-Click Absentee Scraping**: Extracts absent student names directly from the CCBP "Review Attendance" modal.
- **Auto Tab Switching**: Switches to the "Absent" tab automatically if needed.
- **Smart Period Matching**: Detects current period based on Indian Standard Time (IST) class schedules (09:20–10:10, 10:10–11:00, etc.).
- **Editable Student Chips**: Instructors can review, remove, or add names before submission.
- **Dual Sync (Cloud & Local)**: Works out of the box via Supabase Cloud REST API, or with a local/hosted Next.js instance.

### 2. eFlow University Portal Auto-Marking
- **Period Detection**: Automatically identifies the period slot and class timing.
- **Live Absent Fetch**: Pulls the absent student list recorded in Attendease for the selected period.
- **Fuzzy Name Matching**: Handles transpositions and spelling variants (e.g. `Athrav` ↔ `Atharv`, `Swami` ↔ `Swamy`, word-order differences) to match student cards on eFlow.
- **Auto-Click Absent**: Finds each absent student's card and marks them absent with synthetic mouse events.
- **Verification Summary**: Counts and confirms marked absences against expected numbers.
- **Safe Submissions**: Leaves the final "All Done" submission button to the instructor to prevent accidental submissions.

---

## 🛠️ How to Install in Google Chrome

1. Open Google Chrome and go to:
   ```
   chrome://extensions/
   ```
2. Toggle ON **Developer mode** in the top-right corner.
3. Click the **Load unpacked** button in the top-left corner.
4. Select the `extension` folder:
   ```
   c:\Users\Asus\OneDrive\Desktop\attendance_management\extension
   ```
5. Pin **Attendease** to your Chrome toolbar for instant access!

> **Alternatively**: If using `attendease-extension-v1.1.0.zip`, simply extract the zip archive and choose the extracted folder in "Load unpacked".

---

## 📋 How to Use

### Workflow A: Scrape from CCBP
1. Go to your lecture on the **CCBP Instructor Platform**.
2. Open the **Review Attendance** modal.
3. Click the **Attendease** extension icon in your browser toolbar.
4. Review the detected absent students and current period.
5. Click **Submit Attendance**.

### Workflow B: Auto-Mark on eFlow
1. Open the **eFlow Attendance Workbench** (`https://eflow.geetauniversity.com/academic_v2/attendance_workbench`).
2. Click the **Attendease** extension icon (it automatically detects eFlow and switches to eFlow Sync mode).
3. The extension pulls the absent students from Attendease for today's active period.
4. Click **Auto-Mark on eFlow**.
5. Once marked and verified, click **All Done** on the eFlow page to submit.
