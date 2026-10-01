/* eslint-disable @typescript-eslint/no-explicit-any */
import { google } from 'googleapis'

/**
 * Creates an authenticated Google Sheets + Drive client using the
 * service account credentials stored in environment variables.
 */
/**
 * Returns a human-readable error message from a Google API error.
 */
function googleErrMsg(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) return String((err as any).message)
  return String(err)
}

// BN-8: Module-level cache for Google auth clients.
// GoogleAuth performs private-key parsing on construction — doing this on
// every export call is wasteful. The auth object is stateless and thread-safe,
// so we create it once and reuse across all calls in this module's lifetime.
let _cachedGoogleClients: ReturnType<typeof _buildGoogleClients> | null = null

function _buildGoogleClients() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY

  if (!email || !rawKey) {
    throw new Error(
      'Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY env vars'
    )
  }

  // Next.js stores \n as literal \\n in env vars — normalize them
  const privateKey = rawKey.replace(/\\n/g, '\n')

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: email,
      private_key: privateKey,
    },
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  })

  const sheets = google.sheets({ version: 'v4', auth })
  const drive = google.drive({ version: 'v3', auth })

  return { sheets, drive, auth }
}

function getGoogleClients() {
  if (!_cachedGoogleClients) {
    _cachedGoogleClients = _buildGoogleClients()
  }
  return _cachedGoogleClients
}

export interface AttendanceRow {
  date: string
  className: string
  periodTime: string
  periodType: string
  studentName: string
  rollNumber: string
  status: string
  markedBy: string
  remark: string
  markedAt: string
}

function extractSpreadsheetId(val: string): string {
  const match = val.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : val.trim()
}

/**
 * Resolves or creates the tab in a master spreadsheet.
 * Returns { spreadsheetId, sheetId, tabTitle }.
 */
async function resolveTab(
  sheets: ReturnType<typeof google.sheets>,
  drive: ReturnType<typeof google.drive>,
  shareEmail: string | undefined,
  masterSpreadsheetEnv: string | undefined,
  rawTitle: string,
): Promise<{ spreadsheetId: string; sheetId: number; tabTitle: string }> {
  if (masterSpreadsheetEnv) {
    const spreadsheetId = extractSpreadsheetId(masterSpreadsheetEnv)

    let meta
    try {
      meta = await sheets.spreadsheets.get({ spreadsheetId })
    } catch (err) {
      throw new Error(
        `Failed to access master spreadsheet (${spreadsheetId}): ${googleErrMsg(err)}. ` +
        'Please ensure the Google Sheet is shared with your service account as Editor.'
      )
    }

    const cleanTitle = rawTitle.replace(/[\\/?*[\]:]/g, '-').slice(0, 80).trim()
    const existingSheets = meta.data.sheets || []
    const existingTitles = new Set(existingSheets.map((s) => s.properties?.title))

    let tabTitle = cleanTitle || 'Attendance'
    let counter = 1
    while (existingTitles.has(tabTitle)) {
      counter++
      tabTitle = `${cleanTitle.slice(0, 75)} (${counter})`
    }

    const addSheetRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: tabTitle, gridProperties: { frozenRowCount: 1 } } } }],
      },
    })
    const sheetId = addSheetRes.data.replies?.[0]?.addSheet?.properties?.sheetId!

    // Remove untouched default Sheet1 if it's the only prior sheet
    if (
      existingSheets.length === 1 &&
      existingSheets[0].properties?.title === 'Sheet1' &&
      existingSheets[0].properties?.sheetId !== undefined
    ) {
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests: [{ deleteSheet: { sheetId: existingSheets[0].properties.sheetId } }] },
        })
      } catch { /* ignore */ }
    }

    return { spreadsheetId, sheetId, tabTitle }
  } else {
    // Fallback: create a new spreadsheet file
    let createRes
    try {
      createRes = await sheets.spreadsheets.create({
        requestBody: {
          properties: { title: rawTitle },
          sheets: [{ properties: { title: 'Attendance', gridProperties: { frozenRowCount: 1 } } }],
        },
      })
    } catch (err) {
      throw new Error(
        `Failed to create spreadsheet: ${googleErrMsg(err)}. ` +
        'Note: Google Service Accounts have 0 Drive quota. Set GOOGLE_SPREADSHEET_ID in .env.local to use an existing shared sheet.'
      )
    }

    const spreadsheetId = createRes.data.spreadsheetId!
    const sheetId = createRes.data.sheets![0].properties!.sheetId!
    const tabTitle = 'Attendance'

    if (shareEmail) {
      try {
        await drive.permissions.create({
          fileId: spreadsheetId,
          requestBody: { type: 'user', role: 'writer', emailAddress: shareEmail },
          sendNotificationEmail: false,
        })
      } catch (shareErr) {
        console.warn(`[Sheets] Could not share: ${googleErrMsg(shareErr)}`)
      }
    }

    return { spreadsheetId, sheetId, tabTitle }
  }
}

/**
 * Creates a PIVOT sheet: rows = students, columns = dates.
 * Only used for "date range + specific period" exports.
 *
 * Layout:
 *   Roll No | Student Name | Class | Period | 01 Sep | 02 Sep | … | Summary (Present/Total)
 */
export async function createPivotAttendanceSheet(
  title: string,
  rows: AttendanceRow[],
): Promise<string> {
  const { sheets, drive } = getGoogleClients()
  const shareEmail = process.env.GOOGLE_SHEETS_SHARE_EMAIL
  const masterSpreadsheetEnv = process.env.GOOGLE_SPREADSHEET_ID

  const { spreadsheetId, sheetId, tabTitle } = await resolveTab(
    sheets, drive, shareEmail, masterSpreadsheetEnv, title
  )

  // ── Build pivot matrix ──────────────────────────────────────────────────

  // Collect sorted unique dates (columns)
  const dateSet = new Set(rows.map((r) => r.date))
  const dates = Array.from(dateSet).sort()

  // Collect students (keyed by rollNumber)
  type StudentKey = string
  const studentMap = new Map<StudentKey, { name: string; roll: string; className: string; periodTime: string }>()
  for (const r of rows) {
    if (!studentMap.has(r.rollNumber)) {
      studentMap.set(r.rollNumber, {
        name: r.studentName,
        roll: r.rollNumber,
        className: r.className,
        periodTime: r.periodTime,
      })
    }
  }

  // Sort students by roll number (numeric if possible)
  const students = Array.from(studentMap.values()).sort((a, b) => {
    const na = parseInt(a.roll, 10)
    const nb = parseInt(b.roll, 10)
    return isNaN(na) || isNaN(nb) ? a.roll.localeCompare(b.roll) : na - nb
  })

  // Build lookup: rollNumber → date → status
  const statusMap = new Map<string, Map<string, string>>()
  for (const r of rows) {
    if (!statusMap.has(r.rollNumber)) statusMap.set(r.rollNumber, new Map())
    statusMap.get(r.rollNumber)!.set(r.date, r.status)
  }

  // Format date as "01 Sep" for column headers
  const fmtDate = (d: string) => {
    const dt = new Date(d + 'T00:00:00')
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
  }

  // Header row: Roll No | Student Name | Class | Period | ...dates... | Present | Absent | %
  const header = [
    'Roll No', 'Student Name', 'Class', 'Period',
    ...dates.map(fmtDate),
    'Present', 'Absent', 'Attendance %',
  ]

  // Data rows
  const dataRows = students.map((s) => {
    const byDate = statusMap.get(s.roll) || new Map()
    const dateCells = dates.map((d) => byDate.get(d) || '—')
    const presentCount = dateCells.filter((c) => c === 'Present').length
    const absentCount = dateCells.filter((c) => c === 'Absent').length
    const total = presentCount + absentCount
    const pct = total > 0 ? `${Math.round((presentCount / total) * 100)}%` : '—'
    return [s.roll, s.name, s.className, s.periodTime, ...dateCells, presentCount, absentCount, pct]
  })

  const totalCols = header.length
  const totalRows = dataRows.length + 1 // +1 for header

  // Write values
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tabTitle}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [header, ...dataRows] },
    })
  } catch (err) {
    throw new Error(`Failed to write pivot data: ${googleErrMsg(err)}`)
  }

  // ── Formatting ──────────────────────────────────────────────────────────
  const dateCols = dates.length
  const firstDateCol = 4 // 0-indexed: Roll(0) Name(1) Class(2) Period(3)
  const lastDateCol = firstDateCol + dateCols // exclusive

  const formatRequests: any[] = [
    // Bold + deep-teal header row
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: totalCols },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.0, green: 0.235, blue: 0.2 }, // #003c33 deep green
            textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
            horizontalAlignment: 'CENTER',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
      },
    },
    // Freeze header row + first 2 columns (roll + name)
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: { frozenRowCount: 1, frozenColumnCount: 2 },
        },
        fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount',
      },
    },
    // Alternating row colours for readability
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId, startRowIndex: 1, endRowIndex: totalRows, startColumnIndex: 0, endColumnIndex: totalCols }],
          booleanRule: {
            condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=ISEVEN(ROW())' }] },
            format: { backgroundColor: { red: 0.96, green: 0.97, blue: 0.97 } },
          },
        },
        index: 0,
      },
    },
    // Present cells: pale green (date columns only)
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId, startRowIndex: 1, endRowIndex: totalRows, startColumnIndex: firstDateCol, endColumnIndex: lastDateCol }],
          booleanRule: {
            condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'Present' }] },
            format: {
              backgroundColor: { red: 0.851, green: 0.949, blue: 0.867 },
              textFormat: { foregroundColor: { red: 0.106, green: 0.471, blue: 0.220 } },
            },
          },
        },
        index: 1,
      },
    },
    // Absent cells: pale red
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId, startRowIndex: 1, endRowIndex: totalRows, startColumnIndex: firstDateCol, endColumnIndex: lastDateCol }],
          booleanRule: {
            condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'Absent' }] },
            format: {
              backgroundColor: { red: 0.988, green: 0.867, blue: 0.867 },
              textFormat: { foregroundColor: { red: 0.671, green: 0.102, blue: 0.102 } },
            },
          },
        },
        index: 2,
      },
    },
    // Centre-align all date cells
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: totalRows, startColumnIndex: firstDateCol, endColumnIndex: totalCols },
        cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } },
        fields: 'userEnteredFormat.horizontalAlignment',
      },
    },
    // Auto-resize all columns
    {
      autoResizeDimensions: {
        dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: totalCols },
      },
    },
    // Borders
    {
      updateBorders: {
        range: { sheetId, startRowIndex: 0, endRowIndex: totalRows, startColumnIndex: 0, endColumnIndex: totalCols },
        top: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
        bottom: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
        left: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
        right: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
        innerHorizontal: { style: 'SOLID', width: 1, color: { red: 0.9, green: 0.9, blue: 0.9 } },
        innerVertical: { style: 'SOLID', width: 1, color: { red: 0.9, green: 0.9, blue: 0.9 } },
      },
    },
  ]

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: formatRequests },
    })
  } catch (err) {
    throw new Error(`Failed to format pivot sheet: ${googleErrMsg(err)}`)
  }

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`
}

/**
 * Creates or appends attendance data to a Google Sheet with formatting.
 * If GOOGLE_SPREADSHEET_ID is configured, creates a dedicated tab in that spreadsheet.
 * Otherwise, attempts to create a new spreadsheet file.
 * Returns the direct URL to the sheet/tab.
 */
export async function createAttendanceSheet(
  title: string,
  rows: AttendanceRow[]
): Promise<string> {
  const { sheets, drive } = getGoogleClients()
  const shareEmail = process.env.GOOGLE_SHEETS_SHARE_EMAIL
  const masterSpreadsheetEnv = process.env.GOOGLE_SPREADSHEET_ID

  // Header + data rows
  const header = [
    'Date', 'Class', 'Period Time', 'Period Type',
    'Student Name', 'Roll Number', 'Status', 'Marked By', 'Remark', 'Marked At',
  ]

  const dataRows = rows.map((r) => [
    r.date, r.className, r.periodTime, r.periodType,
    r.studentName, r.rollNumber, r.status, r.markedBy, r.remark, r.markedAt,
  ])

  const { spreadsheetId, sheetId, tabTitle } = await resolveTab(
    sheets, drive, shareEmail, masterSpreadsheetEnv, title
  )

  // 2. Write header + data rows
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tabTitle}'!A1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [header, ...dataRows],
      },
    })
  } catch (err) {
    throw new Error(`Failed to write data to sheet: ${googleErrMsg(err)}`)
  }

  // 3. Apply formatting: bold header, freeze row, column widths, conditional colours
  const totalRows = dataRows.length + 1
  const totalCols = header.length

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          // Bold the header row
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: totalCols },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.165, green: 0.384, blue: 0.545 }, // #2A6289
                  textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                  horizontalAlignment: 'CENTER',
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
            },
          },
          // Alternating row colours for data rows
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [{ sheetId, startRowIndex: 1, endRowIndex: totalRows, startColumnIndex: 0, endColumnIndex: totalCols }],
                booleanRule: {
                  condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=ISEVEN(ROW())' }] },
                  format: { backgroundColor: { red: 0.945, green: 0.961, blue: 0.976 } }, // #F1F5F9
                },
              },
              index: 0,
            },
          },
          // Colour "Present" cells green, "Absent" cells red (status column = index 6)
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [{ sheetId, startRowIndex: 1, endRowIndex: totalRows, startColumnIndex: 6, endColumnIndex: 7 }],
                booleanRule: {
                  condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'Present' }] },
                  format: {
                    backgroundColor: { red: 0.851, green: 0.949, blue: 0.867 }, // #D9F2DD
                    textFormat: { foregroundColor: { red: 0.106, green: 0.471, blue: 0.220 } },
                  },
                },
              },
              index: 1,
            },
          },
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [{ sheetId, startRowIndex: 1, endRowIndex: totalRows, startColumnIndex: 6, endColumnIndex: 7 }],
                booleanRule: {
                  condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'Absent' }] },
                  format: {
                    backgroundColor: { red: 0.988, green: 0.867, blue: 0.867 }, // #FCDDDD
                    textFormat: { foregroundColor: { red: 0.671, green: 0.102, blue: 0.102 } },
                  },
                },
              },
              index: 2,
            },
          },
          // Auto-resize all columns
          {
            autoResizeDimensions: {
              dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: totalCols },
            },
          },
          // Add borders
          {
            updateBorders: {
              range: { sheetId, startRowIndex: 0, endRowIndex: totalRows, startColumnIndex: 0, endColumnIndex: totalCols },
              top: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
              bottom: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
              left: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
              right: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
              innerHorizontal: { style: 'SOLID', width: 1, color: { red: 0.9, green: 0.9, blue: 0.9 } },
              innerVertical: { style: 'SOLID', width: 1, color: { red: 0.9, green: 0.9, blue: 0.9 } },
            },
          },
        ],
      },
    })
  } catch (err) {
    throw new Error(`Failed to format sheet: ${googleErrMsg(err)}`)
  }

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`
}

/**
 * Bulk-exports attendance for a single date by creating one sub-sheet per period
 * in the master spreadsheet. Returns the URL to the first tab created.
 *
 * periodGroups: Map of period label → rows belonging to that period
 *   e.g. "2026-10-01 – P1 Maths (09:00–09:45)" → AttendanceRow[]
 */
export async function createBulkPeriodSheets(
  periodGroups: { tabTitle: string; rows: AttendanceRow[] }[],
): Promise<string> {
  const { sheets, drive } = getGoogleClients()
  const shareEmail = process.env.GOOGLE_SHEETS_SHARE_EMAIL
  const masterSpreadsheetEnv = process.env.GOOGLE_SPREADSHEET_ID

  if (!masterSpreadsheetEnv) {
    throw new Error(
      'Bulk period export requires GOOGLE_SPREADSHEET_ID in .env.local. ' +
      'Service accounts cannot create new spreadsheet files.'
    )
  }

  const spreadsheetId = extractSpreadsheetId(masterSpreadsheetEnv)

  let meta
  try {
    meta = await sheets.spreadsheets.get({ spreadsheetId })
  } catch (err) {
    throw new Error(
      `Failed to access master spreadsheet (${spreadsheetId}): ${googleErrMsg(err)}. ` +
      'Please ensure the Google Sheet is shared with your service account as Editor.'
    )
  }

  const existingSheets = meta.data.sheets || []
  const existingTitles = new Set(existingSheets.map((s) => s.properties?.title))

  // Build deduped tab titles
  const resolvedTitles: string[] = []
  for (const group of periodGroups) {
    let cleanTitle = group.tabTitle.replace(/[\\/?*[\]:]/g, '-').slice(0, 80).trim() || 'Attendance'
    let finalTitle = cleanTitle
    let counter = 1
    while (existingTitles.has(finalTitle) || resolvedTitles.includes(finalTitle)) {
      counter++
      finalTitle = `${cleanTitle.slice(0, 75)} (${counter})`
    }
    resolvedTitles.push(finalTitle)
  }

  // Create all tabs in a single batchUpdate
  const addSheetRequests = resolvedTitles.map((title) => ({
    addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } },
  }))

  let addRes
  try {
    addRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: addSheetRequests },
    })
  } catch (err) {
    throw new Error(`Failed to create period tabs: ${googleErrMsg(err)}`)
  }

  const sheetIds = addRes.data.replies!.map((r) => r.addSheet!.properties!.sheetId!)

  // Remove untouched default Sheet1 if it was the only prior sheet
  if (
    existingSheets.length === 1 &&
    existingSheets[0].properties?.title === 'Sheet1' &&
    existingSheets[0].properties?.sheetId !== undefined
  ) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ deleteSheet: { sheetId: existingSheets[0].properties.sheetId } }] },
      })
    } catch { /* ignore */ }
  }

  // Write data + format each tab
  const header = [
    'Date', 'Class', 'Period Time', 'Period Type',
    'Student Name', 'Roll Number', 'Status', 'Marked By', 'Remark', 'Marked At',
  ]

  for (let i = 0; i < periodGroups.length; i++) {
    const { rows } = periodGroups[i]
    const tabTitle = resolvedTitles[i]
    const sheetId = sheetIds[i]

    const dataRows = rows.map((r) => [
      r.date, r.className, r.periodTime, r.periodType,
      r.studentName, r.rollNumber, r.status, r.markedBy, r.remark, r.markedAt,
    ])

    // Write data
    try {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${tabTitle}'!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [header, ...dataRows] },
      })
    } catch (err) {
      throw new Error(`Failed to write data to tab "${tabTitle}": ${googleErrMsg(err)}`)
    }

    // Format
    const totalRows = dataRows.length + 1
    const totalCols = header.length

    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            // Bold header with deep blue background
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: totalCols },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.165, green: 0.384, blue: 0.545 },
                    textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                    horizontalAlignment: 'CENTER',
                  },
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
              },
            },
            // Alternating rows
            {
              addConditionalFormatRule: {
                rule: {
                  ranges: [{ sheetId, startRowIndex: 1, endRowIndex: totalRows, startColumnIndex: 0, endColumnIndex: totalCols }],
                  booleanRule: {
                    condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=ISEVEN(ROW())' }] },
                    format: { backgroundColor: { red: 0.945, green: 0.961, blue: 0.976 } },
                  },
                },
                index: 0,
              },
            },
            // Present green (status column = 6)
            {
              addConditionalFormatRule: {
                rule: {
                  ranges: [{ sheetId, startRowIndex: 1, endRowIndex: totalRows, startColumnIndex: 6, endColumnIndex: 7 }],
                  booleanRule: {
                    condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'Present' }] },
                    format: {
                      backgroundColor: { red: 0.851, green: 0.949, blue: 0.867 },
                      textFormat: { foregroundColor: { red: 0.106, green: 0.471, blue: 0.220 } },
                    },
                  },
                },
                index: 1,
              },
            },
            // Absent red
            {
              addConditionalFormatRule: {
                rule: {
                  ranges: [{ sheetId, startRowIndex: 1, endRowIndex: totalRows, startColumnIndex: 6, endColumnIndex: 7 }],
                  booleanRule: {
                    condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'Absent' }] },
                    format: {
                      backgroundColor: { red: 0.988, green: 0.867, blue: 0.867 },
                      textFormat: { foregroundColor: { red: 0.671, green: 0.102, blue: 0.102 } },
                    },
                  },
                },
                index: 2,
              },
            },
            // Auto-resize columns
            {
              autoResizeDimensions: {
                dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: totalCols },
              },
            },
            // Borders
            {
              updateBorders: {
                range: { sheetId, startRowIndex: 0, endRowIndex: totalRows, startColumnIndex: 0, endColumnIndex: totalCols },
                top: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                bottom: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                left: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                right: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                innerHorizontal: { style: 'SOLID', width: 1, color: { red: 0.9, green: 0.9, blue: 0.9 } },
                innerVertical: { style: 'SOLID', width: 1, color: { red: 0.9, green: 0.9, blue: 0.9 } },
              },
            },
          ],
        },
      })
    } catch (err) {
      throw new Error(`Failed to format tab "${tabTitle}": ${googleErrMsg(err)}`)
    }
  }

  // Return URL to the first tab
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetIds[0]}`
}
