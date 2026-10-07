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
    const sheetId = addSheetRes.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0

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

export interface BulkSessionStudent {
  id: number
  name: string
  rollNumber: string
}

export interface BulkSessionData {
  sessionTitle: string
  periodNumber: number
  dates: string[] // 'YYYY-MM-DD'
  students: BulkSessionStudent[]
  attendanceMap: Map<number, Map<string, string>> // studentId -> (date -> 'Present' | 'Absent')
}

export function formatHeaderDate(isoDate: string): string {
  if (!isoDate) return ''
  const parts = isoDate.split('-').map(Number)
  if (parts.length < 3) return isoDate
  const [year, month, day] = parts
  const dt = new Date(year, month - 1, day)
  const monthName = dt.toLocaleString('en-US', { month: 'short' })
  const dayStr = String(day).padStart(2, '0')
  return `${monthName}-${dayStr}`
}

export function getSessionTitle(periodNumber: number): string {
  const ordinals: Record<number, string> = {
    1: '1st Session',
    2: '2nd Session',
    3: '3rd Session',
    4: '4th Session',
    5: '5th Session',
    6: '6th Session',
    7: '7th Session',
  }
  return ordinals[periodNumber] || `${periodNumber}th Session`
}

/**
 * Bulk exports attendance across periods as up to 7 session sub-sheets
 * ("1st Session", "2nd Session", ... "7th Session").
 *
 * Each sheet is organized in a student rows × date columns matrix:
 *   Row 1: Attendance banner (A1:B1 merged, orange fill)
 *   Row 2: Name | Roll Number | Aug-20 | Aug-21 | ...
 *   Row 3+: Student rows with Present (green pill) / Absent (red pill)
 */
export async function createBulkSessionSheets(
  sessions: BulkSessionData[]
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
  const existingSheetMap = new Map<string, { sheetId: number; merges?: any[] }>()
  for (const s of existingSheets) {
    if (s.properties?.title && s.properties?.sheetId != null) {
      existingSheetMap.set(s.properties.title, {
        sheetId: s.properties.sheetId,
        merges: s.merges || undefined,
      })
    }
  }

  // 1. Ensure all session sheets exist
  for (const s of sessions) {
    if (!existingSheetMap.has(s.sessionTitle)) {
      try {
        const addRes = await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{ addSheet: { properties: { title: s.sessionTitle } } }],
          },
        })
        const newSheetId = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId
        if (newSheetId != null) {
          existingSheetMap.set(s.sessionTitle, { sheetId: newSheetId })
        }
      } catch (err) {
        throw new Error(`Failed to create session tab "${s.sessionTitle}": ${googleErrMsg(err)}`)
      }
    }
  }

  // Delete untouched default 'Sheet1' if present
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

  // If shareEmail is configured, ensure write permission
  if (shareEmail) {
    try {
      await drive.permissions.create({
        fileId: spreadsheetId,
        requestBody: { type: 'user', role: 'writer', emailAddress: shareEmail },
        sendNotificationEmail: false,
      })
    } catch { /* ignore if already shared */ }
  }

  const sessionSheetIds: number[] = []

  // 2. Populate and format each session sheet
  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i]
    const sheetInfo = existingSheetMap.get(session.sessionTitle)
    if (!sheetInfo) continue

    const sheetId = sheetInfo.sheetId
    sessionSheetIds.push(sheetId)

    const dateHeaders = session.dates.map(formatHeaderDate)
    const headerRow1 = ['Attendance', '', ...session.dates.map(() => '')]
    const headerRow2 = ['Name', 'Roll Number', ...dateHeaders]

    const dataRows = session.students.map((student) => {
      const studentStatusMap = session.attendanceMap.get(student.id)
      const dateCells = session.dates.map((d) => studentStatusMap?.get(d) || '')
      return [student.name, student.rollNumber, ...dateCells]
    })

    const totalCols = headerRow2.length
    const totalRows = 2 + dataRows.length

    // Clear any previous values on this sheet tab
    try {
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `'${session.sessionTitle}'!A1:ZZ1000`,
      })
    } catch { /* ignore */ }

    // Write grid values
    try {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${session.sessionTitle}'!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [headerRow1, headerRow2, ...dataRows],
        },
      })
    } catch (err) {
      throw new Error(`Failed to write data to tab "${session.sessionTitle}": ${googleErrMsg(err)}`)
    }

    // Format sheet
    const orange = { red: 0.984, green: 0.549, blue: 0.0 } // #FB8C00 vibrant orange matching screenshot
    const formatRequests: any[] = []

    // Ensure tab index is ordered properly (1st Session -> 2nd Session -> ...)
    formatRequests.push({
      updateSheetProperties: {
        properties: {
          sheetId,
          index: i,
          gridProperties: { frozenRowCount: 2, frozenColumnCount: 2 },
        },
        fields: 'index,gridProperties.frozenRowCount,gridProperties.frozenColumnCount',
      },
    })

    // Unmerge prior merges if any existed on this sheet
    if (sheetInfo.merges && sheetInfo.merges.length > 0) {
      for (const m of sheetInfo.merges) {
        formatRequests.push({
          unmergeCells: { range: m },
        })
      }
    }

    // Merge A1:B1 for 'Attendance' banner
    formatRequests.push({
      mergeCells: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 2,
        },
        mergeType: 'MERGE_ALL',
      },
    })

    // Row 1 formatting (Attendance banner across all cols)
    formatRequests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: totalCols,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: orange,
            textFormat: {
              bold: true,
              fontSize: 11,
              foregroundColor: { red: 0, green: 0, blue: 0 },
            },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
      },
    })

    // Row 2 formatting (Column headers: Name, Roll Number, Dates)
    formatRequests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: 2,
          startColumnIndex: 0,
          endColumnIndex: totalCols,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: orange,
            textFormat: {
              bold: true,
              fontSize: 10,
              foregroundColor: { red: 0, green: 0, blue: 0 },
            },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
      },
    })

    // Left-align 'Name' column header in A2
    formatRequests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: 2,
          startColumnIndex: 0,
          endColumnIndex: 1,
        },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'LEFT',
          },
        },
        fields: 'userEnteredFormat.horizontalAlignment',
      },
    })

    // Left-align student names in Col A
    formatRequests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 2,
          endRowIndex: totalRows,
          startColumnIndex: 0,
          endColumnIndex: 1,
        },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'LEFT',
            verticalAlignment: 'MIDDLE',
          },
        },
        fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)',
      },
    })

    // Center-align Roll Number in Col B
    formatRequests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 2,
          endRowIndex: totalRows,
          startColumnIndex: 1,
          endColumnIndex: 2,
        },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
          },
        },
        fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)',
      },
    })

    // Center-align all date cells (Col C..totalCols)
    formatRequests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 2,
          endRowIndex: totalRows,
          startColumnIndex: 2,
          endColumnIndex: totalCols,
        },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
          },
        },
        fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)',
      },
    })

    // Data validation dropdown chips for Present / Absent
    formatRequests.push({
      setDataValidation: {
        range: {
          sheetId,
          startRowIndex: 2,
          endRowIndex: totalRows,
          startColumnIndex: 2,
          endColumnIndex: totalCols,
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: [
              { userEnteredValue: 'Present' },
              { userEnteredValue: 'Absent' },
            ],
          },
          showCustomUi: true,
          strict: false,
        },
      },
    })

    // Conditional format: Present -> Deep green background, bold white text
    formatRequests.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{
            sheetId,
            startRowIndex: 2,
            endRowIndex: totalRows,
            startColumnIndex: 2,
            endColumnIndex: totalCols,
          }],
          booleanRule: {
            condition: {
              type: 'TEXT_EQ',
              values: [{ userEnteredValue: 'Present' }],
            },
            format: {
              backgroundColor: { red: 0.082, green: 0.455, blue: 0.224 },
              textFormat: {
                foregroundColor: { red: 1, green: 1, blue: 1 },
                bold: true,
              },
            },
          },
        },
        index: 0,
      },
    })

    // Conditional format: Absent -> Deep red background, bold white text
    formatRequests.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{
            sheetId,
            startRowIndex: 2,
            endRowIndex: totalRows,
            startColumnIndex: 2,
            endColumnIndex: totalCols,
          }],
          booleanRule: {
            condition: {
              type: 'TEXT_EQ',
              values: [{ userEnteredValue: 'Absent' }],
            },
            format: {
              backgroundColor: { red: 0.773, green: 0.137, blue: 0.137 },
              textFormat: {
                foregroundColor: { red: 1, green: 1, blue: 1 },
                bold: true,
              },
            },
          },
        },
        index: 1,
      },
    })

    // Column widths: Name (180px), Roll Number (110px), Dates (95px)
    formatRequests.push(
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
          properties: { pixelSize: 180 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
          properties: { pixelSize: 110 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: totalCols },
          properties: { pixelSize: 95 },
          fields: 'pixelSize',
        },
      }
    )

    // Grid Borders
    formatRequests.push({
      updateBorders: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: totalRows,
          startColumnIndex: 0,
          endColumnIndex: totalCols,
        },
        top: { style: 'SOLID', width: 1, color: { red: 0.85, green: 0.85, blue: 0.85 } },
        bottom: { style: 'SOLID', width: 1, color: { red: 0.85, green: 0.85, blue: 0.85 } },
        left: { style: 'SOLID', width: 1, color: { red: 0.85, green: 0.85, blue: 0.85 } },
        right: { style: 'SOLID', width: 1, color: { red: 0.85, green: 0.85, blue: 0.85 } },
        innerHorizontal: { style: 'SOLID', width: 1, color: { red: 0.88, green: 0.88, blue: 0.88 } },
        innerVertical: { style: 'SOLID', width: 1, color: { red: 0.88, green: 0.88, blue: 0.88 } },
      },
    })

    // Basic filter on Row 2
    formatRequests.push({
      setBasicFilter: {
        filter: {
          range: {
            sheetId,
            startRowIndex: 1,
            endRowIndex: totalRows,
            startColumnIndex: 0,
            endColumnIndex: totalCols,
          },
        },
      },
    })

    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: formatRequests },
      })
    } catch (formatErr) {
      console.error(`[Sheets] Failed to format tab "${session.sessionTitle}":`, formatErr)
      throw new Error(`Failed to format tab "${session.sessionTitle}": ${googleErrMsg(formatErr)}`)
    }
  }

  const primarySheetId = sessionSheetIds[0] ?? 0
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${primarySheetId}`
}

/**
 * Backwards compatibility wrapper for createBulkPeriodSheets
 */
export async function createBulkPeriodSheets(
  periodGroups: { tabTitle: string; rows: AttendanceRow[] }[],
): Promise<string> {
  // If legacy call happens, fall back to standard single attendance sheet
  const firstGroup = periodGroups[0]
  if (!firstGroup) throw new Error('No period groups provided')
  return createAttendanceSheet(firstGroup.tabTitle, firstGroup.rows)
}
