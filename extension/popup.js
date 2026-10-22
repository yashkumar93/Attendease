/**
 * Attendease CCBP Sync — Popup Script
 * ════════════════════════════════════
 * Orchestrates the Chrome Extension Popup:
 *   1. Verifies the user is on the CCBP Instructor Platform.
 *   2. Connects to the Attendease API to fetch classes, periods, and current status.
 *   3. Automatically scrapes absent student names from the CCBP "Review Attendance" modal.
 *   4. Allows the instructor to review, remove, or manually add student names.
 *   5. Allows selecting date, class, and period (auto-selected to the current active period).
 *   6. Submits attendance to Attendease with fuzzy matching and upserting.
 */

// ── Default Configuration ────────────────────────────────────────
const DEFAULT_CONFIG = {
  API_BASE: 'https://attend-niat.vercel.app',
  SUPABASE_URL: 'https://mniuvenxsfngvuzgvrvv.supabase.co',
  EXTENSION_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uaXV2ZW54c2ZuZ3Z1emd2cnZ2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTcwNzc0MSwiZXhwIjoyMTA1MjgzNzQxfQ.rw0X87g7wGCjY_hfnY51aRiKofi2rZ8Fv_WHH4ib38I',
  DEFAULT_USER_ID: 'cb5e99ae-4275-484d-889f-701f44e1c8fe', // Yash (default)
};

// ── Standard Periods Definition (IST) ─────────────────────────────
const STANDARD_PERIODS = [
  { periodNumber: 1, startTime: '09:20', endTime: '10:10', label: 'Period 1 (09:20 – 10:10 AM)' },
  { periodNumber: 2, startTime: '10:10', endTime: '11:00', label: 'Period 2 (10:10 – 11:00 AM)' },
  { periodNumber: 3, startTime: '11:00', endTime: '11:50', label: 'Period 3 (11:00 – 11:50 AM)' },
  { periodNumber: 4, startTime: '11:50', endTime: '12:40', label: 'Period 4 (11:50 AM – 12:40 PM)' },
  { periodNumber: 5, startTime: '13:30', endTime: '14:20', label: 'Period 5 (01:30 – 02:20 PM)' },
  { periodNumber: 6, startTime: '14:20', endTime: '15:10', label: 'Period 6 (02:20 – 03:10 PM)' },
  { periodNumber: 7, startTime: '15:10', endTime: '16:00', label: 'Period 7 (03:10 – 04:00 PM)' },
];

// ── State ────────────────────────────────────────────────────────
let state = {
  apiBase: DEFAULT_CONFIG.API_BASE,
  extensionKey: DEFAULT_CONFIG.EXTENSION_KEY,
  scrapedNames: [],
  classes: [{ id: 1, class_name: 'Class 1' }],
  scheduledPeriods: [],
  standardPeriods: STANDARD_PERIODS,
  currentPeriodNumber: 2,
  selectedClassId: 1,
  selectedPeriodNumber: 2,
  selectedInstructorId: DEFAULT_CONFIG.DEFAULT_USER_ID,
  selectedInstructorName: 'Yash',
  selectedInstructorEmail: 'yash@niat.in',
  date: '',
  lastPeriodId: null,
};

// ── DOM Helpers ──────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const stepNotCCBP = $('step-not-ccbp');
const stepConfig = $('step-config');
const stepResults = $('step-results');
const statusBanner = $('status-banner');
const statusText = $('status-text');

const sessionTitleEl = $('session-title');
const absentCountEl = $('absent-count');
const absentExpectedEl = $('absent-expected');
const absentChipsEl = $('absent-chips');
const chipCountEl = $('chip-count');
const inputAddStudent = $('input-add-student');
const btnAddStudent = $('btn-add-student');

const instructorSelect = $('instructor-select');
const instructorHint = $('instructor-hint');
const dateInput = $('date-input');
const classSelect = $('class-select');
const periodSelect = $('period-select');
const currentPeriodHint = $('current-period-hint');
const scheduleStatusText = $('schedule-status-text');
const btnAutoSchedule = $('btn-auto-schedule');

const btnScrape = $('btn-scrape');
const btnSubmit = $('btn-submit');
const btnDone = $('btn-done');
const btnViewAttendease = $('btn-view-attendease');

const btnToggleSettings = $('btn-toggle-settings');
const btnCloseSettings = $('btn-close-settings');
const settingsPanel = $('settings-panel');
const settingApiUrl = $('setting-api-url');
const btnSaveSettings = $('btn-save-settings');

// ── Status Banner Helper ─────────────────────────────────────────
function showStatus(type, text) {
  statusBanner.className = `status-banner ${type}`;
  statusText.textContent = text;
}

function hideStatus() {
  statusBanner.className = 'status-banner hidden';
}

function showStep(step) {
  stepNotCCBP.classList.add('hidden');
  stepConfig.classList.add('hidden');
  stepResults.classList.add('hidden');
  step.classList.remove('hidden');
}

// ── IST Date & Period Time Helpers ────────────────────────────────
function getTodayISTDate() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffset);
  return istDate.toISOString().split('T')[0];
}

function getCurrentISTTimeString() {
  const now = new Date();
  const istOffset = 5.5 * 60; // minutes
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const istMinutes = utcMinutes + istOffset;
  const hours = Math.floor(istMinutes / 60) % 24;
  const minutes = Math.floor(istMinutes % 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function detectCurrentPeriod() {
  const timeString = getCurrentISTTimeString();
  for (const period of STANDARD_PERIODS) {
    if (timeString >= period.startTime && timeString < period.endTime) {
      return period.periodNumber;
    }
  }
  return 1;
}

// ── Dropdown Population ───────────────────────────────────────────
function populateClasses() {
  const currentVal = classSelect.value || state.selectedClassId;
  classSelect.innerHTML = '';
  for (const cls of state.classes) {
    const opt = document.createElement('option');
    opt.value = cls.id;
    opt.textContent = cls.class_name;
    if (currentVal && String(currentVal) === String(cls.id)) {
      opt.selected = true;
    }
    classSelect.appendChild(opt);
  }
  if (!classSelect.value && state.classes.length > 0) {
    classSelect.value = state.classes[0].id;
  }
  state.selectedClassId = parseInt(classSelect.value) || 1;
}

function populatePeriods() {
  const selectedClassId = parseInt(classSelect.value) || 1;
  const currentSelectedVal = periodSelect.value ? parseInt(periodSelect.value) : null;
  periodSelect.innerHTML = '';

  const scheduled = (state.scheduledPeriods || []).filter((p) => p.classId === selectedClassId);
  const slots = state.standardPeriods?.length > 0 ? state.standardPeriods : STANDARD_PERIODS;

  for (const slot of slots) {
    const num = slot.periodNumber || slot.period_number;
    const match = scheduled.find((p) => p.periodNumber === num);
    const opt = document.createElement('option');
    opt.value = num;

    if (match) {
      const subj = match.subjectName ? ` · ${match.subjectName}` : '';
      opt.textContent = `Period ${num}${subj} (${match.startTime}–${match.endTime})`;
    } else {
      opt.textContent = slot.label || `Period ${num} (${slot.startTime || '09:00'}–${slot.endTime || '10:00'})`;
    }

    const targetPeriod = currentSelectedVal || state.currentPeriodNumber;
    if (targetPeriod && num === targetPeriod) {
      opt.selected = true;
    }
    periodSelect.appendChild(opt);
  }

  if (!periodSelect.value && slots.length > 0) {
    periodSelect.value = slots[0].periodNumber || slots[0].period_number;
  }

  if (state.currentPeriodNumber) {
    currentPeriodHint.textContent = `Active: Period ${state.currentPeriodNumber}`;
    currentPeriodHint.classList.remove('hidden');
  } else {
    currentPeriodHint.classList.add('hidden');
  }

  updateSubmitButton();
}

function updateSubmitButton() {
  const hasClass = Boolean(classSelect.value);
  const hasPeriod = Boolean(periodSelect.value);
  btnSubmit.disabled = !(hasClass && hasPeriod);
}

// ── Fuzzy Name Matching Helpers (for direct cloud submission) ─────
function levenshtein(a, b) {
  const la = a.length, lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  let prev = new Array(lb + 1), curr = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[lb];
}

function similarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - levenshtein(a, b) / maxLen;
}

function normalizeName(s) {
  let str = String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  str = str.replace(/\bathrav\b/g, 'atharv');
  return str;
}

function matchStudentLocally(inputName, students) {
  const input = normalizeName(inputName);
  if (!input) return null;

  // 1. Exact match on full name or roll number
  const exact = students.find(
    (s) => normalizeName(s.name) === input || (s.roll_number && normalizeName(s.roll_number) === input)
  );
  if (exact) return { student: exact, confidence: 1.0 };

  // 2. Part-name match (e.g. "Abhinav" -> "Abhinav Singh")
  const partMatches = students.filter((s) =>
    normalizeName(s.name).split(' ').some((p) => p === input)
  );
  if (partMatches.length === 1) return { student: partMatches[0], confidence: 0.9 };

  // 3. Substring match
  const subMatches = students.filter((s) => {
    const sName = normalizeName(s.name);
    return sName.includes(input) || input.includes(sName);
  });
  if (subMatches.length === 1) return { student: subMatches[0], confidence: 0.85 };

  // 4. Levenshtein fuzzy match
  if (input.length >= 3) {
    const scored = students
      .map((s) => ({
        student: s,
        score: Math.max(
          similarity(input, normalizeName(s.name)),
          ...normalizeName(s.name).split(' ').map((p) => similarity(input, p))
        ),
      }))
      .filter((s) => s.score >= 0.65)
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0 && scored[0].score >= 0.7) {
      return { student: scored[0].student, confidence: scored[0].score };
    }
  }

  return null;
}

// ── Initialization ───────────────────────────────────────────────
// ── Initialization ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Instant hydration with reliable defaults
  state.date = getTodayISTDate();
  dateInput.value = state.date;
  state.currentPeriodNumber = detectCurrentPeriod();
  state.standardPeriods = STANDARD_PERIODS;

  // Load saved settings if any
  if (chrome?.storage?.local) {
    const saved = await chrome.storage.local.get([
      'apiBase',
      'savedClassId',
      'savedInstructorId',
      'savedInstructorName',
      'savedInstructorEmail',
    ]);
    if (saved.apiBase) state.apiBase = saved.apiBase;
    if (saved.savedClassId) state.selectedClassId = saved.savedClassId;
    if (saved.savedInstructorId) {
      state.selectedInstructorId = saved.savedInstructorId;
      state.selectedInstructorName = saved.savedInstructorName || '';
      state.selectedInstructorEmail = saved.savedInstructorEmail || '';
      if (instructorSelect) {
        instructorSelect.value = saved.savedInstructorId;
      }
      if (instructorHint && saved.savedInstructorName) {
        instructorHint.textContent = `✓ ${saved.savedInstructorName}`;
      }
    }
  }
  settingApiUrl.value = state.apiBase;

  // Hydrate UI immediately so dropdowns are never empty
  populateClasses();
  populatePeriods();

  // 2. Verify tab URL — detect platform
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isCCBP = tab?.url?.includes('niat-instructor-platform.ccbp.in') || tab?.url?.includes('nial-instructor-platform.ccbp.in');
  const isEflow = tab?.url?.includes('eflow.geetauniversity.com');

  if (isEflow) {
    const badge = $('header-platform-badge');
    if (badge) { badge.textContent = 'eFlow Sync'; badge.classList.add('eflow'); }
    await loadBackendData(); // populate classes
    await initEflowMode(tab);
    return;
  }

  if (!isCCBP) {
    showStep(stepNotCCBP);
    return;
  }

  showStep(stepConfig);

  // 3. Fetch latest data (with seamless Cloud fallback) and scan page
  await loadBackendData();
  await triggerScrape();
});

// ── Fetch Classes and Schedule (Dual Local & Supabase Cloud Sync) ─
async function loadBackendData() {
  // First attempt: Next.js API (if running locally or deployed)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1800);
    const res = await fetch(`${state.apiBase}/api/extension/submit`, {
      headers: { 'x-extension-key': state.extensionKey },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.classes?.length > 0) state.classes = data.classes;
      state.scheduledPeriods = data.periods || [];
      if (data.standardPeriods?.length > 0) state.standardPeriods = data.standardPeriods;
      if (data.currentPeriodNumber) state.currentPeriodNumber = data.currentPeriodNumber;
      if (data.today) state.date = data.today;

      dateInput.value = state.date;
      populateClasses();
      populatePeriods();
      return;
    }
  } catch (err) {
    // Local server is not running or unreachable; fall back to direct Supabase Cloud REST
  }

  // Fallback: Direct Supabase Cloud REST API
  try {
    const headers = {
      apikey: state.extensionKey,
      Authorization: `Bearer ${state.extensionKey}`,
    };

    // 1. Fetch classes from Supabase
    const classesRes = await fetch(
      `${DEFAULT_CONFIG.SUPABASE_URL}/rest/v1/classes?select=id,class_name&order=id.asc`,
      { headers }
    );
    if (classesRes.ok) {
      const classesData = await classesRes.json();
      if (classesData.length > 0) {
        state.classes = classesData;
      }
    }

    // 2. Fetch today's scheduled periods from Supabase
    let periodsRes = await fetch(
      `${DEFAULT_CONFIG.SUPABASE_URL}/rest/v1/periods?date=eq.${state.date}&select=id,period_number,class_id,start_time,end_time&order=period_number.asc`,
      { headers }
    );
    let periodsData = periodsRes.ok ? await periodsRes.json() : [];

    // Auto-schedule missing slots for all classes if incomplete
    const expectedSlots = (state.classes?.length || 1) * 7;
    if (periodsData.length < expectedSlots && state.date) {
      try {
        const existingSlots = new Set(periodsData.map((p) => `${p.class_id}_${p.period_number}`));
        const toInsert = [];
        const instructorId = state.selectedInstructorId || DEFAULT_CONFIG.DEFAULT_USER_ID;

        for (const cls of state.classes) {
          for (const sp of STANDARD_PERIODS) {
            if (!existingSlots.has(`${cls.id}_${sp.periodNumber}`)) {
              toInsert.push({
                date: state.date,
                class_id: cls.id,
                period_number: sp.periodNumber,
                start_time: `${sp.startTime}:00`,
                end_time: `${sp.endTime}:00`,
                period_type: 'Lecture',
                created_by: instructorId,
              });
            }
          }
        }

        if (toInsert.length > 0) {
          const createAllRes = await fetch(`${DEFAULT_CONFIG.SUPABASE_URL}/rest/v1/periods`, {
            method: 'POST',
            headers: { ...headers, Prefer: 'return=representation' },
            body: JSON.stringify(toInsert),
          });
          if (createAllRes.ok) {
            const newlyCreated = await createAllRes.json();
            periodsData = [...periodsData, ...newlyCreated];
          }
        }
      } catch (autoErr) {
        console.warn('Auto-schedule direct Supabase error:', autoErr);
      }
    }

    state.scheduledPeriods = periodsData.map((p) => ({
      id: p.id,
      periodNumber: p.period_number,
      classId: p.class_id,
      startTime: p.start_time?.slice(0, 5),
      endTime: p.end_time?.slice(0, 5),
    }));

    // 3. Fetch latest instructors from Supabase profiles
    try {
      const profilesRes = await fetch(
        `${DEFAULT_CONFIG.SUPABASE_URL}/rest/v1/profiles?select=id,full_name,role&order=full_name.asc`,
        { headers }
      );
      if (profilesRes.ok) {
        const profilesData = await profilesRes.json();
        if (profilesData?.length > 0 && instructorSelect) {
          const currentVal = state.selectedInstructorId || instructorSelect.value;
          instructorSelect.innerHTML = '';
          for (const p of profilesData) {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.dataset.name = p.full_name;
            opt.textContent = `${p.full_name} (${p.role || 'Instructor'})`;
            if (p.id === currentVal) opt.selected = true;
            instructorSelect.appendChild(opt);
          }
          if (instructorSelect.value) {
            state.selectedInstructorId = instructorSelect.value;
          }
        }
      }
    } catch (e) {
      // Keep static list if fetch fails
    }

    populateClasses();
    populatePeriods();
  } catch (supabaseErr) {
    console.error('Supabase fallback error:', supabaseErr);
    // UI already has standard periods and Class 1 loaded
    populateClasses();
    populatePeriods();
  }
}

// ── Manual Auto-Schedule All Classes Button ─────────────────────────
if (btnAutoSchedule) {
  btnAutoSchedule.addEventListener('click', async () => {
    btnAutoSchedule.disabled = true;
    btnAutoSchedule.textContent = 'Scheduling…';
    showStatus('loading', 'Automatically scheduling all classes for today…');

    try {
      // Try Next.js API first
      let success = false;
      try {
        const res = await fetch(`${state.apiBase}/api/extension/submit`, {
          headers: { 'x-extension-key': state.extensionKey },
        });
        if (res.ok) {
          success = true;
        }
      } catch (e) {}

      // Reload data to reflect scheduled periods
      await loadBackendData();
      showStatus('success', '✓ All classes automatically scheduled for today!');
      if (scheduleStatusText) scheduleStatusText.textContent = '✓ All 7 periods scheduled';
    } catch (err) {
      showStatus('error', 'Auto-scheduling error: ' + err.message);
    } finally {
      btnAutoSchedule.disabled = false;
      btnAutoSchedule.textContent = '⚡ Auto-schedule';
    }
  });
}

// ── Event Handlers: Form Inputs ───────────────────────────────────
if (instructorSelect) {
  instructorSelect.addEventListener('change', () => {
    const selectedOption = instructorSelect.options[instructorSelect.selectedIndex];
    const id = instructorSelect.value;
    const name = selectedOption?.dataset?.name || selectedOption?.textContent?.split('(')[0]?.trim() || '';
    const email = selectedOption?.dataset?.email || '';

    state.selectedInstructorId = id;
    state.selectedInstructorName = name;
    state.selectedInstructorEmail = email;

    if (chrome?.storage?.local) {
      chrome.storage.local.set({
        savedInstructorId: id,
        savedInstructorName: name,
        savedInstructorEmail: email,
      });
    }

    if (instructorHint) {
      instructorHint.textContent = `✓ Saved: ${name}`;
      setTimeout(() => {
        instructorHint.textContent = `✓ ${name}`;
      }, 2500);
    }
  });
}

classSelect.addEventListener('change', () => {
  const val = parseInt(classSelect.value);
  if (val) {
    state.selectedClassId = val;
    if (chrome?.storage?.local) {
      chrome.storage.local.set({ savedClassId: val });
    }
  }
  populatePeriods();
});

periodSelect.addEventListener('change', updateSubmitButton);
dateInput.addEventListener('change', () => {
  state.date = dateInput.value;
  updateSubmitButton();
});

// ── Scrape Absent Names from CCBP Tab ─────────────────────────────
async function triggerScrape() {
  btnScrape.disabled = true;
  btnScrape.innerHTML = '<span class="spinner"></span> Scraping…';
  showStatus('loading', 'Scanning CCBP "Review Attendance" modal…');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeCCBPAbsentees,
    });

    const data = results?.[0]?.result;

    if (!data || !data.success) {
      showStatus(
        'error',
        data?.message || 'Please open the "Review Attendance" modal in CCBP and try again.'
      );
      sessionTitleEl.textContent = 'Modal not detected';
      renderChips();
      resetScrapeButton();
      return;
    }

    state.scrapedNames = data.absentNames || [];
    sessionTitleEl.textContent = data.sessionTitle || 'Active Lecture';
    absentCountEl.textContent = state.scrapedNames.length;

    if (data.expectedCount !== null) {
      absentExpectedEl.textContent = `(Expected: ${data.expectedCount})`;
    } else {
      absentExpectedEl.textContent = '';
    }

    renderChips();

    showStatus(
      'success',
      `Found ${state.scrapedNames.length} absent student${
        state.scrapedNames.length !== 1 ? 's' : ''
      }. Ready to submit.`
    );
  } catch (err) {
    showStatus('error', 'Scrape failed: ' + err.message);
  } finally {
    resetScrapeButton();
  }
}

function resetScrapeButton() {
  btnScrape.disabled = false;
  btnScrape.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M23 4v6h-6M1 20v-6h6"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
    Re-scrape
  `;
  updateSubmitButton();
}

btnScrape.addEventListener('click', triggerScrape);

// ── Render Chips & Manual Add/Remove ──────────────────────────────
function renderChips() {
  absentChipsEl.innerHTML = '';
  absentCountEl.textContent = state.scrapedNames.length;
  chipCountEl.textContent = `${state.scrapedNames.length} name${
    state.scrapedNames.length !== 1 ? 's' : ''
  }`;

  if (state.scrapedNames.length === 0) {
    absentChipsEl.innerHTML =
      '<span class="empty-chips-msg">No absent students recorded (100% Present).</span>';
    return;
  }

  state.scrapedNames.forEach((name, index) => {
    const chip = document.createElement('span');
    chip.className = 'chip';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = name;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'chip-remove';
    removeBtn.innerHTML = '&times;';
    removeBtn.title = 'Remove ' + name;
    removeBtn.addEventListener('click', () => {
      state.scrapedNames.splice(index, 1);
      renderChips();
    });

    chip.appendChild(nameSpan);
    chip.appendChild(removeBtn);
    absentChipsEl.appendChild(chip);
  });
}

// Add student manually
function handleAddStudent() {
  const name = inputAddStudent.value.trim();
  if (!name) return;
  if (!state.scrapedNames.includes(name)) {
    state.scrapedNames.push(name);
    renderChips();
  }
  inputAddStudent.value = '';
}

btnAddStudent.addEventListener('click', handleAddStudent);
inputAddStudent.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleAddStudent();
  }
});

// ── Submit Attendance (Next.js API + Supabase Cloud Fallback) ──────
btnSubmit.addEventListener('click', async () => {
  btnSubmit.disabled = true;
  btnSubmit.innerHTML = '<span class="spinner"></span> Submitting…';
  showStatus('loading', 'Submitting attendance to Attendease…');

  const classId = parseInt(classSelect.value) || 1;
  const periodNumber = parseInt(periodSelect.value) || detectCurrentPeriod();
  const date = dateInput.value || getTodayISTDate();

  let submittedData = null;

  // 1. Attempt submitting via Next.js backend API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${state.apiBase}/api/extension/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-extension-key': state.extensionKey,
      },
      body: JSON.stringify({
        absentNames: state.scrapedNames,
        periodNumber,
        date,
        classId,
        instructorEmail: state.selectedInstructorEmail,
        instructorId: state.selectedInstructorId,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        submittedData = data;
      }
    }
  } catch (err) {
    console.log('Local API submit failed, falling back directly to Supabase cloud...');
  }

  // 2. Direct Supabase Cloud REST fallback
  if (!submittedData) {
    try {
      const headers = {
        apikey: state.extensionKey,
        Authorization: `Bearer ${state.extensionKey}`,
        'Content-Type': 'application/json',
      };

      const instructorId = state.selectedInstructorId || DEFAULT_CONFIG.DEFAULT_USER_ID;

      // A. Check if period exists for this date, class, and period number
      const existingPeriodRes = await fetch(
        `${DEFAULT_CONFIG.SUPABASE_URL}/rest/v1/periods?date=eq.${date}&class_id=eq.${classId}&period_number=eq.${periodNumber}&select=id`,
        { headers }
      );
      const existingPeriods = await existingPeriodRes.json();
      let periodId;

      if (existingPeriods?.length > 0) {
        periodId = existingPeriods[0].id;
      } else {
        const slotTiming = STANDARD_PERIODS.find((p) => p.periodNumber === periodNumber) || {
          startTime: '09:20',
          endTime: '10:10',
        };
        const createPeriodRes = await fetch(`${DEFAULT_CONFIG.SUPABASE_URL}/rest/v1/periods`, {
          method: 'POST',
          headers: {
            ...headers,
            Prefer: 'return=representation',
          },
          body: JSON.stringify({
            date,
            class_id: classId,
            period_number: periodNumber,
            start_time: `${slotTiming.startTime}:00`,
            end_time: `${slotTiming.endTime}:00`,
            period_type: 'Lecture',
            created_by: instructorId,
            instructor_id: instructorId,
          }),
        });
        const createdPeriod = await createPeriodRes.json();
        periodId = createdPeriod?.[0]?.id;
      }

      if (!periodId) {
        throw new Error('Failed to create or access period slot in Attendease.');
      }

      // B. Fetch active students for this class
      const studentsRes = await fetch(
        `${DEFAULT_CONFIG.SUPABASE_URL}/rest/v1/students?class_id=eq.${classId}&status=eq.active&select=id,name,roll_number&order=roll_number.asc`,
        { headers }
      );
      const activeStudents = await studentsRes.json();

      if (!activeStudents || activeStudents.length === 0) {
        throw new Error('No active students found in this class.');
      }

      // C. Fuzzy match scraped names against the active student roster
      const matched = [];
      const unmatched = [];

      for (const rawName of state.scrapedNames) {
        const trimmed = (rawName || '').trim();
        if (!trimmed) continue;
        const matchResult = matchStudentLocally(trimmed, activeStudents);
        if (matchResult && matchResult.student) {
          matched.push({
            scraped: trimmed,
            matched: matchResult.student.name,
            rollNumber: matchResult.student.roll_number,
            studentId: matchResult.student.id,
          });
        } else {
          unmatched.push(trimmed);
        }
      }

      const absentStudentIds = new Set(matched.map((m) => m.studentId));
      const now = new Date().toISOString();

      // D. Build attendance records (Present for all students, Absent for matched absentees)
      const attendanceRecords = activeStudents.map((s) => ({
        period_id: periodId,
        student_id: s.id,
        status: absentStudentIds.has(s.id) ? 'Absent' : 'Present',
        marked_by: instructorId,
        marked_at: now,
        remark: absentStudentIds.has(s.id) ? 'Marked via CCBP Extension' : null,
      }));

      // E. Upsert attendance records to Supabase
      const upsertRes = await fetch(
        `${DEFAULT_CONFIG.SUPABASE_URL}/rest/v1/attendance?on_conflict=period_id,student_id`,
        {
          method: 'POST',
          headers: {
            ...headers,
            Prefer: 'resolution=merge-duplicates,return=representation',
          },
          body: JSON.stringify(attendanceRecords),
        }
      );

      if (!upsertRes.ok) {
        const errorText = await upsertRes.text();
        throw new Error(`Failed to save attendance: ${errorText}`);
      }

      submittedData = {
        success: true,
        periodId,
        totalStudents: activeStudents.length,
        absentCount: absentStudentIds.size,
        presentCount: activeStudents.length - absentStudentIds.size,
        matched,
        unmatched,
      };
    } catch (directErr) {
      console.error('Supabase direct submission error:', directErr);
      showStatus('error', 'Submission failed: ' + directErr.message);
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Retry Submit
      `;
      return;
    }
  }

  // F. Display Results
  state.lastPeriodId = submittedData.periodId;
  hideStatus();
  showStep(stepResults);

  $('result-present').textContent = submittedData.presentCount;
  $('result-absent').textContent = submittedData.absentCount;
  $('result-unmatched').textContent = submittedData.unmatched?.length || 0;

  // Render matched list
  const matchedWrapper = $('matched-list-wrapper');
  const matchedList = $('matched-names');
  if (submittedData.matched && submittedData.matched.length > 0) {
    matchedWrapper.classList.remove('hidden');
    matchedList.innerHTML = '';
    for (const m of submittedData.matched) {
      const li = document.createElement('li');
      const rollBadge = m.rollNumber ? `<span class="roll-badge">${escapeHtml(m.rollNumber)}</span>` : '';
      if (m.scraped.toLowerCase() !== m.matched.toLowerCase()) {
        li.innerHTML = `
          <span class="scraped-name">${escapeHtml(m.scraped)}</span>
          <span class="match-arrow">&rarr;</span>
          <strong>${escapeHtml(m.matched)}</strong>
          ${rollBadge}
        `;
      } else {
        li.innerHTML = `<strong>${escapeHtml(m.matched)}</strong>${rollBadge}`;
      }
      matchedList.appendChild(li);
    }
  } else {
    matchedWrapper.classList.add('hidden');
  }

  // Render unmatched list
  const unmatchedWrapper = $('unmatched-list-wrapper');
  const unmatchedList = $('unmatched-names');
  if (submittedData.unmatched && submittedData.unmatched.length > 0) {
    unmatchedWrapper.classList.remove('hidden');
    unmatchedList.innerHTML = '';
    for (const name of submittedData.unmatched) {
      const li = document.createElement('li');
      li.textContent = name;
      unmatchedList.appendChild(li);
    }
  } else {
    unmatchedWrapper.classList.add('hidden');
  }
});

// ── Results Actions ───────────────────────────────────────────────
btnViewAttendease.addEventListener('click', () => {
  const url = state.lastPeriodId
    ? `${state.apiBase}/dashboard/attendance/${state.lastPeriodId}`
    : `${state.apiBase}/dashboard/instructor/attendance`;
  chrome.tabs.create({ url });
});

btnDone.addEventListener('click', () => {
  window.close();
});

// ── Settings Panel Toggle & Save ──────────────────────────────────
btnToggleSettings.addEventListener('click', () => {
  settingsPanel.classList.toggle('hidden');
});

btnCloseSettings.addEventListener('click', () => {
  settingsPanel.classList.add('hidden');
});

btnSaveSettings.addEventListener('click', async () => {
  const newUrl = settingApiUrl.value.trim().replace(/\/+$/, '');
  if (newUrl) {
    state.apiBase = newUrl;
    if (chrome?.storage?.local) {
      await chrome.storage.local.set({ apiBase: newUrl });
    }
    settingsPanel.classList.add('hidden');
    await loadBackendData();
  }
});

// ── Utility: Escape HTML ──────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─────────────────────────────────────────────────────────────────
// ── eFlow AUTO-MARK LOGIC ─────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────

const stepEflow = $('step-eflow');
const eflowPeriodLabel = $('eflow-period-label');
const eflowDateLabel = $('eflow-date-label');
const eflowClassLabel = $('eflow-class-label');
const eflowAbsentChips = $('eflow-absent-chips');
const eflowAbsentCount = $('eflow-absent-count');
const btnEflowFetch = $('btn-eflow-fetch');
const btnEflowAutomark = $('btn-eflow-automark');
const eflowResult = $('eflow-result');
const eflowResultMarked = $('eflow-result-marked');
const eflowResultNotfound = $('eflow-result-notfound');
const eflowClassSelect = $('eflow-class-select');
const eflowPeriodSelect = $('eflow-period-select');

// eFlow state
let eflowState = {
  absentStudents: [],   // [{ name, roll_number }]
  detectedPeriod: null,
  eflowClassName: '',
};

/** Scrape the class title and time from the eFlow page header */
async function scrapeEflowPageInfo(tab) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // The page header typically says something like
        // "CAI3101 - Web Application Development"
        // with a subtitle "2026-10-22 | 2 | 10:10 - 11:00 | Location: ..."
        const h1 = document.querySelector('h1, .course-name, [class*="course"], [class*="title"]');
        const subTitle = document.querySelector('.course-details, [class*="detail"], [class*="subtitle"], [class*="timing"], [class*="info"]');
        // Also try reading the big heading text at the top of the workbench
        const allH = Array.from(document.querySelectorAll('h1,h2,h3,h4'));
        const courseHeading = allH.find(el => el.textContent.trim().length > 5);
        // Find timing line — look for text matching HH:MM - HH:MM
        const allText = document.body.innerText || '';
        const timeMatch = allText.match(/(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})/);
        const className = courseHeading?.textContent?.trim() || h1?.textContent?.trim() || '';
        return {
          className,
          startTime: timeMatch?.[1] || null,
          endTime: timeMatch?.[2] || null,
          rawSubtitle: subTitle?.textContent?.trim() || '',
        };
      },
    });
    return results?.[0]?.result || {};
  } catch (e) {
    return {};
  }
}

/** Init eFlow mode: detect period, populate UI, fetch absent list */
async function initEflowMode(tab) {
  showStep(stepEflow);
  showStatus('loading', 'Reading eFlow page and fetching absent list…');

  // 1. Date
  const today = getTodayISTDate();
  if (eflowDateLabel) eflowDateLabel.textContent = today;

  // 2. Detect current period from IST time (same logic as CCBP side)
  const detectedPeriodNum = detectCurrentPeriod();
  eflowState.detectedPeriod = detectedPeriodNum;
  const periodInfo = STANDARD_PERIODS.find(p => p.periodNumber === detectedPeriodNum);
  if (eflowPeriodLabel) {
    eflowPeriodLabel.textContent = periodInfo
      ? `Period ${detectedPeriodNum} (${periodInfo.startTime}–${periodInfo.endTime})`
      : `Period ${detectedPeriodNum}`;
  }

  // Pre-select the period dropdown
  if (eflowPeriodSelect) eflowPeriodSelect.value = String(detectedPeriodNum);

  // 3. Populate class select from loaded classes
  if (eflowClassSelect && state.classes.length > 0) {
    eflowClassSelect.innerHTML = '';
    for (const cls of state.classes) {
      const opt = document.createElement('option');
      opt.value = cls.id;
      opt.textContent = cls.class_name;
      if (String(cls.id) === String(state.selectedClassId)) opt.selected = true;
      eflowClassSelect.appendChild(opt);
    }
  }

  // 4. Read eFlow page info
  const pageInfo = await scrapeEflowPageInfo(tab);
  eflowState.eflowClassName = pageInfo.className || 'eFlow Class';
  if (eflowClassLabel) eflowClassLabel.textContent = eflowState.eflowClassName.slice(0, 40) || '—';

  // 5. Fetch absent list from Attendease (Supabase)
  await fetchEflowAbsentList();
}

/** Fetch absent students for the selected class + period from Supabase */
async function fetchEflowAbsentList() {
  if (eflowAbsentChips) eflowAbsentChips.innerHTML = '<span class="empty-chips-msg">Fetching from Attendease…</span>';
  if (btnEflowAutomark) btnEflowAutomark.disabled = true;
  if (eflowResult) eflowResult.classList.add('hidden');

  const classId = parseInt(eflowClassSelect?.value) || 1;
  const periodNum = parseInt(eflowPeriodSelect?.value) || eflowState.detectedPeriod || detectCurrentPeriod();
  const today = getTodayISTDate();

  try {
    const headers = {
      apikey: state.extensionKey,
      Authorization: `Bearer ${state.extensionKey}`,
    };

    // Find the period_id for today / classId / periodNum
    const periodRes = await fetch(
      `${DEFAULT_CONFIG.SUPABASE_URL}/rest/v1/periods?date=eq.${today}&class_id=eq.${classId}&period_number=eq.${periodNum}&select=id`,
      { headers }
    );
    const periods = periodRes.ok ? await periodRes.json() : [];

    if (!periods.length) {
      showStatus('error', `No period found in Attendease for Period ${periodNum} today. Submit CCBP attendance first.`);
      if (eflowAbsentChips) eflowAbsentChips.innerHTML = '<span class="empty-chips-msg">No period record found — submit CCBP attendance first.</span>';
      return;
    }

    const periodId = periods[0].id;

    // Fetch Absent attendance records for this period
    const attRes = await fetch(
      `${DEFAULT_CONFIG.SUPABASE_URL}/rest/v1/attendance?period_id=eq.${periodId}&status=eq.Absent&select=student_id,students(name,roll_number)`,
      { headers }
    );
    const attData = attRes.ok ? await attRes.json() : [];

    eflowState.absentStudents = attData
      .map(r => ({
        name: r.students?.name || '',
        roll_number: r.students?.roll_number || '',
      }))
      .filter(s => s.name || s.roll_number);

    renderEflowAbsentChips();

    if (eflowState.absentStudents.length === 0) {
      showStatus('success', '✓ No absent students — everyone is present!');
    } else {
      showStatus('success', `Fetched ${eflowState.absentStudents.length} absent student(s) from Attendease.`);
      if (btnEflowAutomark) btnEflowAutomark.disabled = false;
    }
  } catch (err) {
    showStatus('error', 'Failed to fetch absent list: ' + err.message);
    if (eflowAbsentChips) eflowAbsentChips.innerHTML = '<span class="empty-chips-msg">Error fetching absent list.</span>';
  }
}

/** Render chips for eFlow absent list */
function renderEflowAbsentChips() {
  if (!eflowAbsentChips) return;
  eflowAbsentChips.innerHTML = '';
  const count = eflowState.absentStudents.length;
  if (eflowAbsentCount) eflowAbsentCount.textContent = `${count} student${count !== 1 ? 's' : ''}`;

  if (count === 0) {
    eflowAbsentChips.innerHTML = '<span class="empty-chips-msg">All students are present ✓</span>';
    return;
  }

  eflowState.absentStudents.forEach(s => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `<span>${escapeHtml(s.name || s.roll_number)}</span>`;
    if (s.roll_number) {
      const badge = document.createElement('span');
      badge.className = 'roll-badge';
      badge.style.cssText = 'font-size:10px;opacity:0.7;margin-left:4px';
      badge.textContent = s.roll_number;
      chip.appendChild(badge);
    }
    eflowAbsentChips.appendChild(chip);
  });
}

/** Inject script into eFlow page to auto-click Absent for each absent student */
async function eflowAutoMark() {
  if (!eflowState.absentStudents.length) return;

  btnEflowAutomark.disabled = true;
  btnEflowAutomark.innerHTML = '<span class="spinner"></span> Marking…';
  showStatus('loading', 'Auto-marking absent students on eFlow…');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const absentList = eflowState.absentStudents.map(s => ({
      name: s.name,
      roll: s.roll_number,
    }));

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (absentStudents) => {
        /**
         * eFlow attendance workbench — NAME-BASED matching.
         *
         * Root cause of old failure: Attendease stores short rolls (R039) but eFlow
         * shows full institutional rolls (2601301171) — they never match.
         *
         * New strategy:
         *  PRIMARY  → match card by student NAME (fuzzy, case-insensitive)
         *  FALLBACK → match card by full roll number if name not found
         *
         * Clicking absent:
         *  1. Look for a visible element whose text is exactly "Absent"
         *  2. If not found, look for "Present" (tap-to-toggle behavior)
         *  3. If still not found, click the card itself
         */

        // ── helpers ──────────────────────────────────────────────
        function norm(s) {
          let str = String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
          // Name alias / transposition support (e.g. Athrav == Atharv, Swami == Swamy)
          str = str.replace(/\bathrav\b/g, 'atharv');
          str = str.replace(/\bswamy\b/g, 'swami');
          return str;
        }

        function levenshtein(a, b) {
          const la = a.length, lb = b.length;
          if (la === 0) return lb;
          if (lb === 0) return la;
          const dp = Array.from({ length: la + 1 }, (_, i) => [i]);
          for (let j = 0; j <= lb; j++) dp[0][j] = j;
          for (let i = 1; i <= la; i++) {
            for (let j = 1; j <= lb; j++) {
              dp[i][j] = a[i-1] === b[j-1]
                ? dp[i-1][j-1]
                : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
            }
          }
          return dp[la][lb];
        }

        // similarity between two single words: 1 = identical, 0 = nothing alike
        function wordSim(a, b) {
          if (a === b) return 1;
          const maxLen = Math.max(a.length, b.length);
          if (maxLen === 0) return 1;
          return 1 - levenshtein(a, b) / maxLen;
        }

        function nameSimilarity(a, b) {
          a = norm(a); b = norm(b);
          if (!a || !b) return 0;
          if (a === b) return 1;
          const wordsA = a.split(' ').filter(Boolean);
          const wordsB = b.split(' ').filter(Boolean);
          if (wordsA.length === 0 || wordsB.length === 0) return 0;

          // For each word in A, find the best-matching word in B (fuzzy)
          const scores = wordsA.map(wa =>
            Math.max(...wordsB.map(wb => wordSim(wa, wb)))
          );
          const avg = scores.reduce((s, x) => s + x, 0) / scores.length;

          // Also score from B→A direction and take the higher
          const scoresBA = wordsB.map(wb =>
            Math.max(...wordsA.map(wa => wordSim(wb, wa)))
          );
          const avgBA = scoresBA.reduce((s, x) => s + x, 0) / scoresBA.length;

          return Math.max(avg, avgBA);
        }


        // ── collect all student cards ─────────────────────────────
        const allEls = Array.from(document.querySelectorAll('*'));

        // Find the roll-number elements (e.g. "Roll: 2601301171")
        const rollEls = allEls.filter(el => {
          if (el.children.length > 2) return false;
          return /Roll[:\s]*\d{6,}/i.test(el.textContent?.trim() || '');
        });

        // Build list of card objects: { cardEl, rollNum, nameText }
        const cards = [];
        for (const rollEl of rollEls) {
          const rollMatch = rollEl.textContent.match(/Roll[:\s]*(\d+)/i);
          if (!rollMatch) continue;
          const rollNum = rollMatch[1].trim();

          // Walk up to find the single student card container
          let card = rollEl;
          while (card && card.parentElement && card.parentElement !== document.body) {
            const rollsInParent = Array.from(card.parentElement.querySelectorAll('*')).filter(el =>
              el.children.length === 0 && /Roll[:\s]*\d{6,}/i.test(el.textContent || '')
            );
            if (rollsInParent.length > 1) {
              // card.parentElement is the container of all cards; card is the individual card container
              break;
            }
            card = card.parentElement;
          }

          if (!card || card === document.body) {
            // Fallback: search upward for container with status markers
            card = rollEl.parentElement;
            for (let i = 0; i < 8 && card && card !== document.body; i++) {
              const ct = card.textContent || '';
              if (ct.includes('Present') || ct.includes('Absent') || ct.includes('Not Marked')) break;
              card = card.parentElement;
            }
          }
          if (!card || card === document.body) continue;

          // Extract name: find text nodes inside card that are not roll/status
          const candidateEls = Array.from(card.querySelectorAll('h1,h2,h3,h4,h5,h6,p,span,div,b,strong'))
            .filter(el => {
              if (el.children.length > 0) return false;
              const t = (el.textContent || '').trim();
              return (
                t.length >= 2 && t.length <= 60 &&
                !/roll/i.test(t) &&
                !/present/i.test(t) &&
                !/absent/i.test(t) &&
                !/not\s*marked/i.test(t) &&
                !/enrollment/i.test(t) &&
                !/program\s*type/i.test(t) &&
                !/section/i.test(t) &&
                !/student/i.test(t) &&
                !/^[\d\s:\-\.\,\/]+$/.test(t)
              );
            });

          const nameText = candidateEls.length > 0 ? candidateEls[0].textContent.trim() : '';
          cards.push({ cardEl: card, rollNum, nameText });
        }

        // ── match each absent student to a card ───────────────────
        const marked = [];
        const notFound = [];
        let alreadyAbsent = 0;
        const handledCards = new Set();

        for (const s of absentStudents) {
          const sName = norm(s.name || '');
          const sRoll = (s.roll || '').toString().toLowerCase().trim();

          // 1. Exact name match (normalized, with athrav==atharv alias)
          let match = cards.find(c =>
            !handledCards.has(c.rollNum) && norm(c.nameText) === sName
          );

          // 2. Fuzzy name match (per-word Levenshtein similarity)
          if (!match) {
            match = cards
              .filter(c => !handledCards.has(c.rollNum))
              .map(c => ({ c, score: nameSimilarity(c.nameText, s.name) }))
              .filter(x => x.score >= 0.6)
              .sort((a, b) => b.score - a.score)[0]?.c;
          }

          // 3. Roll number suffix match (Attendease "R039" vs eFlow "2601301039" — last digits)
          if (!match && sRoll) {
            const sRollDigits = sRoll.replace(/\D/g, '');
            match = cards.find(c =>
              !handledCards.has(c.rollNum) &&
              sRollDigits.length >= 3 &&
              c.rollNum.endsWith(sRollDigits)
            );
          }

          if (!match) {
            notFound.push(s.name || s.roll);
            continue;
          }

          handledCards.add(match.rollNum);
          const card = match.cardEl;
          const cardText = card.textContent || '';

          // Already Absent?
          const isAlreadyAbsent = Array.from(card.querySelectorAll('*')).some(el => {
            const t = (el.textContent || '').trim();
            return /absent/i.test(t) && !/not\s*marked/i.test(t) && el.children.length === 0;
          });

          if (isAlreadyAbsent && !/Not\s*Marked/i.test(cardText)) {
            alreadyAbsent++;
            marked.push({ name: s.name, roll: match.rollNum, status: 'already_absent' });
            continue;
          }

          // Find and click the Absent / Present control
          const allControls = Array.from(card.querySelectorAll(
            'button, input[type="radio"], input[type="checkbox"], [role="button"], label, span, div, p'
          ));

          // Priority 1 — element whose visible text is "Absent"
          let absentBtn = allControls.find(el => {
            const t = (el.textContent || el.value || el.getAttribute('aria-label') || '').trim();
            return /absent/i.test(t) && !/present/i.test(t) && !/not\s*marked/i.test(t) && el.offsetParent !== null;
          });

          // Priority 2 — "Present" toggle (in eFlow, status is "● Present", clicking toggles to Absent)
          if (!absentBtn) {
            absentBtn = allControls.find(el => {
              const t = (el.textContent || el.value || el.getAttribute('aria-label') || '').trim();
              return /present/i.test(t) && el.offsetParent !== null;
            });
          }

          // Priority 3 — click the card itself as last resort
          if (!absentBtn) absentBtn = card;

          if (absentBtn) {
            absentBtn.focus?.();
            absentBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            absentBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            absentBtn.click();
            marked.push({ name: s.name, roll: match.rollNum, status: 'clicked' });
          } else {
            notFound.push(s.name || s.roll);
          }
        }

        // Count Absent marks visible on the page now
        const absentCountOnPage = (() => {
          return Array.from(document.querySelectorAll('*')).filter(
            el => el.children.length === 0 && /^\s*Absent\s*$/i.test(el.textContent?.trim())
          ).length;
        })();

        return { marked, notFound, alreadyAbsent, absentCountOnPage };
      },
      args: [absentList],
    });

    const result = results?.[0]?.result;
    if (!result) throw new Error('Injection returned no result.');

    const { marked, notFound, absentCountOnPage } = result;
    const clickedCount = marked.filter(m => m.status === 'clicked').length;
    const alreadyCount = marked.filter(m => m.status === 'already_absent').length;
    const expected = eflowState.absentStudents.length;

    // Show result
    eflowResult.classList.remove('hidden');
    eflowResultMarked.className = 'eflow-result-row success';
    eflowResultMarked.innerHTML =
      `✅ Clicked Absent: <strong>${clickedCount}</strong>${alreadyCount ? ` (${alreadyCount} already absent)` : ''} / Expected: <strong>${expected}</strong>`;

    if (notFound.length > 0) {
      eflowResultNotfound.className = 'eflow-result-row warning';
      eflowResultNotfound.innerHTML = `⚠️ Not found on eFlow: <strong>${notFound.join(', ')}</strong> — please mark manually.`;
    } else {
      eflowResultNotfound.className = 'eflow-result-row success';
      eflowResultNotfound.textContent = '✅ All absent students were found and clicked.';
    }

    // Verification: count check
    if (absentCountOnPage !== null) {
      const countOk = absentCountOnPage >= expected - notFound.length;
      showStatus(
        countOk ? 'success' : 'error',
        countOk
          ? `✓ Verified: ${absentCountOnPage} absent mark(s) on eFlow page.`
          : `⚠ Count mismatch: expected ≥${expected - notFound.length}, eFlow shows ${absentCountOnPage}.`
      );
    } else {
      showStatus('success', `Done! Clicked absent for ${clickedCount} student(s).`);
    }
  } catch (err) {
    showStatus('error', 'Auto-mark failed: ' + err.message);
  } finally {
    btnEflowAutomark.disabled = false;
    btnEflowAutomark.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M2 17l10 5 10-5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M2 12l10 5 10-5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Re-Mark Absent
    `;
  }
}

// eFlow button listeners (safe — elements may not exist on CCBP pages)
if (btnEflowFetch) {
  btnEflowFetch.addEventListener('click', fetchEflowAbsentList);
}
if (btnEflowAutomark) {
  btnEflowAutomark.addEventListener('click', eflowAutoMark);
}
if (eflowPeriodSelect) {
  eflowPeriodSelect.addEventListener('change', fetchEflowAbsentList);
}
if (eflowClassSelect) {
  eflowClassSelect.addEventListener('change', fetchEflowAbsentList);
}

// ─────────────────────────────────────────────────────────────────
// SCRAPER FUNCTION
// This runs inside the context of the CCBP web page via chrome.scripting.executeScript
// ─────────────────────────────────────────────────────────────────
async function scrapeCCBPAbsentees() {
  try {
    // 1. Locate the "Review Attendance" modal dialog
    // Find heading or modal container containing "Review Attendance"
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, div, p, span'));
    const reviewHeader = headings.find((el) => {
      const text = el.textContent?.trim();
      return text === 'Review Attendance' || text?.startsWith('Review Attendance');
    });

    if (!reviewHeader) {
      return {
        success: false,
        message: 'Could not find "Review Attendance" on the page. Please open the attendance dialog first.',
      };
    }

    // 2. Extract Session Title (subtitle right below Review Attendance)
    let sessionTitle = '';
    const parentContainer = reviewHeader.closest('[role="dialog"]') || reviewHeader.parentElement?.parentElement;

    if (parentContainer) {
      const subTexts = Array.from(parentContainer.querySelectorAll('p, span, div, h4'));
      for (const el of subTexts) {
        const text = el.textContent?.trim() || '';
        if (
          text.length > 6 &&
          !text.includes('Review Attendance') &&
          !text.includes('Present') &&
          !text.includes('Absent') &&
          !text.includes('Not Marked') &&
          !text.includes('Search')
        ) {
          sessionTitle = text;
          break;
        }
      }
    }

    // 3. Find and ensure the "Absent" tab is clicked
    const buttons = Array.from(document.querySelectorAll('button, [role="tab"], div, span'));
    let absentTab = null;
    let expectedCount = null;

    for (const btn of buttons) {
      const text = btn.textContent?.trim() || '';
      const match = text.match(/^Absent\s*\((\d+)\)/i);
      if (match) {
        absentTab = btn;
        expectedCount = parseInt(match[1]);
        break;
      }
    }

    if (!absentTab) {
      // Fallback: look for button with just "Absent"
      for (const btn of buttons) {
        const text = btn.textContent?.trim() || '';
        if (/^absent$/i.test(text)) {
          absentTab = btn;
          break;
        }
      }
    }

    // If absent tab is found, ensure it is clicked and wait for DOM update
    if (absentTab) {
      absentTab.click();
      await new Promise((resolve) => setTimeout(resolve, 350));
    }

    // 4. Extract Absent Student Names
    // In CCBP's modal, every absent student card has:
    // [Avatar] [Student Name] [Marked absent] ... [Absent badge] [Toggle switch]
    const absentNames = [];
    const nameSet = new Set();

    // Strategy 1: Find all elements whose text matches "Marked absent"
    const allTextNodes = Array.from(document.querySelectorAll('*')).filter(
      (el) => el.children.length === 0 && /^marked\s*absent$/i.test(el.textContent?.trim() || '')
    );

    for (const markedEl of allTextNodes) {
      let studentName = '';

      // Check immediate previous sibling (e.g., <p class="name">Suraj</p><p>Marked absent</p>)
      if (markedEl.previousElementSibling) {
        const prevText = markedEl.previousElementSibling.textContent?.trim();
        if (prevText && !/^marked\s*absent$/i.test(prevText) && !/^absent$/i.test(prevText)) {
          studentName = prevText;
        }
      }

      // Check parent's first child
      if (!studentName && markedEl.parentElement) {
        const siblings = Array.from(markedEl.parentElement.children);
        for (const sib of siblings) {
          if (sib !== markedEl) {
            const sibText = sib.textContent?.trim();
            if (sibText && !/^marked\s*absent$/i.test(sibText) && !/^absent$/i.test(sibText)) {
              studentName = sibText;
              break;
            }
          }
        }
      }

      // If still not found, examine row container (ancestor containing exactly this "Marked absent")
      if (!studentName) {
        let row = markedEl.parentElement;
        while (row && row !== document.body) {
          const markedInRow = row.querySelectorAll('*');
          const count = Array.from(markedInRow).filter(
            (n) => n.children.length === 0 && /^marked\s*absent$/i.test(n.textContent?.trim() || '')
          ).length;

          if (count > 1) {
            // We went one level too high (into the list container)
            break;
          }
          // Find text candidate inside this row
          const candidates = Array.from(row.querySelectorAll('p, span, h3, h4, div')).filter((n) => {
            const t = n.textContent?.trim() || '';
            return (
              t.length >= 2 &&
              t.length <= 50 &&
              !/^marked\s*absent$/i.test(t) &&
              !/^absent$/i.test(t) &&
              !/search/i.test(t) &&
              !/review/i.test(t) &&
              !/attendance/i.test(t) &&
              !/^\d+$/.test(t)
            );
          });

          if (candidates.length > 0) {
            // Sort by font-size/weight or take the leaf text node
            studentName = candidates[0].textContent?.trim();
            break;
          }
          row = row.parentElement;
        }
      }

      if (studentName) {
        // Clean name (strip extra spaces or trailing role)
        const cleanName = studentName.replace(/\s+/g, ' ').trim();
        if (cleanName && !nameSet.has(cleanName)) {
          nameSet.add(cleanName);
          absentNames.push(cleanName);
        }
      }
    }

    // Strategy 2 (Fallback if Strategy 1 found nothing):
    // Search within the modal for student list items
    if (absentNames.length === 0) {
      const modal = document.querySelector('[role="dialog"]') || document.querySelector('.modal, [class*="modal"]');
      if (modal) {
        const rows = modal.querySelectorAll('li, [class*="item"], [class*="row"]');
        for (const row of rows) {
          const rowText = row.textContent || '';
          if (/absent/i.test(rowText)) {
            const nameEl = row.querySelector('h3, h4, p, span, [class*="name"]');
            if (nameEl) {
              const nameText = nameEl.textContent?.trim();
              if (
                nameText &&
                !/absent/i.test(nameText) &&
                !/present/i.test(nameText) &&
                !nameSet.has(nameText)
              ) {
                nameSet.add(nameText);
                absentNames.push(nameText);
              }
            }
          }
        }
      }
    }

    // Read footer count if expectedCount was not in tab
    if (expectedCount === null) {
      const footerMatch = document.body.textContent?.match(/Absent:\s*(\d+)/i);
      if (footerMatch) {
        expectedCount = parseInt(footerMatch[1]);
      }
    }

    return {
      success: true,
      sessionTitle,
      absentNames,
      expectedCount,
      countMatches: expectedCount !== null ? absentNames.length === expectedCount : true,
    };
  } catch (err) {
    return {
      success: false,
      message: 'Scraping error: ' + err.message,
    };
  }
}
