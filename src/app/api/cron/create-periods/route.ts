import { NextResponse } from 'next/server'
import { ensureDailyPeriods } from '@/app/actions/auto-schedule'

/**
 * GET /api/cron/create-periods
 * Creates today's 7 period slots for all classes if they don't already exist.
 * Secured with CRON_SECRET header (for Vercel Cron or external cron services).
 */
export async function GET(request: Request) {
  // Verify cron secret if set (optional for local dev)
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const result = await ensureDailyPeriods()
    return NextResponse.json(result)
  } catch (err) {
    console.error('Cron create-periods error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
