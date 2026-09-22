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

/**
 * Creates a new Google Sheet, writes attendance data with formatting,
 * shares it with the configured email, and returns the sheet URL.
 */
export async function createAttendanceSheet(
  title: string,
  rows: AttendanceRow[]
): Promise<string> {
  const { sheets, drive } = getGoogleClients()
  const shareEmail = process.env.GOOGLE_SHEETS_SHARE_EMAIL

  // 1. Create a new spreadsheet
  let createRes;
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
    throw new Error(`Failed to create spreadsheet (Is Google Sheets API enabled?): ${googleErrMsg(err)}`)
  }

  const spreadsheetId = createRes.data.spreadsheetId!
  const sheetId = createRes.data.sheets![0].properties!.sheetId!

  // 2. Write header + data rows
  const header = [
    'Date', 'Class', 'Subject', 'Period Time', 'Period Type',
    'Instructor', 'Student Name', 'Roll Number', 'Status', 'Remark', 'Marked At',
  ]

  const dataRows = rows.map((r) => [
    r.date, r.className, r.subjectName, r.periodTime, r.periodType,
    r.instructor, r.studentName, r.rollNumber, r.status, r.remark, r.markedAt,
  ])

  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Attendance!A1',
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

  // 4. Share with the configured email so they can open it
  // Wrapped in try/catch — sharing requires Google Drive API to be enabled.
  // If it fails, the sheet is still created and accessible to the service account.
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
      // Drive API not enabled or insufficient permissions — sheet is created but not shared.
      // Enable Google Drive API at: https://console.cloud.google.com/apis/library/drive.googleapis.com
      console.warn(
        `[Sheets] Could not share sheet with ${shareEmail}: ${googleErrMsg(shareErr)}. ` +
        'Make sure Google Drive API is enabled for this project.'
      )
    }
  }

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
}
