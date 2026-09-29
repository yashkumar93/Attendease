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
  subjectName: string
  periodTime: string
  periodType: string
  instructor: string
  studentName: string
  rollNumber: string
  status: string
  remark: string
  markedAt: string
}

function extractSpreadsheetId(val: string): string {
  const match = val.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : val.trim()
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

  let spreadsheetId: string
  let sheetId: number
  let tabTitle = 'Attendance'

  // Header + data rows
  const header = [
    'Date', 'Class', 'Subject', 'Period Time', 'Period Type',
    'Instructor', 'Student Name', 'Roll Number', 'Status', 'Remark', 'Marked At',
  ]

  const dataRows = rows.map((r) => [
    r.date, r.className, r.subjectName, r.periodTime, r.periodType,
    r.instructor, r.studentName, r.rollNumber, r.status, r.remark, r.markedAt,
  ])

  if (masterSpreadsheetEnv) {
    // ── Master Spreadsheet Mode (Recommended for Service Accounts) ──────────
    spreadsheetId = extractSpreadsheetId(masterSpreadsheetEnv)

    let meta
    try {
      meta = await sheets.spreadsheets.get({ spreadsheetId })
    } catch (err) {
      throw new Error(
        `Failed to access master spreadsheet (${spreadsheetId}): ${googleErrMsg(err)}. ` +
        'Please ensure the Google Sheet is shared with your service account as Editor.'
      )
    }

    // Google Sheets tab names: max 100 chars, cannot contain \ / ? * [ ] :
    const cleanTitle = title.replace(/[\\/?*[\]:]/g, '-').slice(0, 80).trim()
    const existingSheets = meta.data.sheets || []
    const existingTitles = new Set(existingSheets.map((s) => s.properties?.title))

    tabTitle = cleanTitle || 'Attendance'
    let counter = 1
    while (existingTitles.has(tabTitle)) {
      counter++
      tabTitle = `${cleanTitle.slice(0, 75)} (${counter})`
    }

    try {
      const addSheetRes = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: tabTitle,
                  gridProperties: { frozenRowCount: 1 },
                },
              },
            },
          ],
        },
      })

      sheetId = addSheetRes.data.replies?.[0]?.addSheet?.properties?.sheetId!

      // If the spreadsheet only had the default untouched 'Sheet1', remove it
      if (
        existingSheets.length === 1 &&
        existingSheets[0].properties?.title === 'Sheet1' &&
        existingSheets[0].properties?.sheetId !== undefined
      ) {
        try {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
              requests: [
                {
                  deleteSheet: {
                    sheetId: existingSheets[0].properties.sheetId,
                  },
                },
              ],
            },
          })
        } catch {
          // Ignore if Sheet1 cannot be removed
        }
      }
    } catch (err) {
      throw new Error(`Failed to create attendance tab in spreadsheet: ${googleErrMsg(err)}`)
    }
  } else {
    // ── Fallback: Create a brand new spreadsheet file ───────────────────────
    let createRes
    try {
      createRes = await sheets.spreadsheets.create({
        requestBody: {
          properties: { title },
          sheets: [
            {
              properties: {
                title: 'Attendance',
                gridProperties: { frozenRowCount: 1 },
              },
            },
          ],
        },
      })
    } catch (err) {
      throw new Error(
        `Failed to create spreadsheet: ${googleErrMsg(err)}. ` +
        'Note: Google Service Accounts have 0 Drive quota. Set GOOGLE_SPREADSHEET_ID in .env.local to use an existing shared sheet.'
      )
    }

    spreadsheetId = createRes.data.spreadsheetId!
    sheetId = createRes.data.sheets![0].properties!.sheetId!
    tabTitle = 'Attendance'

    if (shareEmail) {
      try {
        await drive.permissions.create({
          fileId: spreadsheetId,
          requestBody: {
            type: 'user',
            role: 'writer',
            emailAddress: shareEmail,
          },
          sendNotificationEmail: false,
        })
      } catch (shareErr) {
        console.warn(
          `[Sheets] Could not share sheet with ${shareEmail}: ${googleErrMsg(shareErr)}. ` +
          'Make sure Google Drive API is enabled for this project.'
        )
      }
    }
  }

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
          // Colour "Present" cells green, "Absent" cells red (status column = index 8)
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [{ sheetId, startRowIndex: 1, endRowIndex: totalRows, startColumnIndex: 8, endColumnIndex: 9 }],
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
                ranges: [{ sheetId, startRowIndex: 1, endRowIndex: totalRows, startColumnIndex: 8, endColumnIndex: 9 }],
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
