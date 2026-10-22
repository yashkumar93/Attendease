import { NextResponse } from 'next/server'
import { ensureDateRangePeriods } from '@/app/actions/auto-schedule'

/**
 * GET /api/cron/create-periods
 * Automatically schedules 7 period slots for all classes for today and upcoming days.
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
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '2', 10) // Pre-schedules today + tomorrow by default

    const result = await ensureDateRangePeriods(undefined, days)
    return NextResponse.json(result)
  } catch (err) {
    console.error('Cron create-periods error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

