-- ============================================================
-- 006_fix_attendance_rls.sql
-- Fixes RLS policies on public.attendance:
-- 1. Adds SELECT policy for authenticated users so instructors
--    can read attendance records and PostgREST UPSERT (RETURNING 1)
--    does not fail with 42501 "new row violates row-level security policy".
-- 2. Ensures explicit WITH CHECK clauses on INSERT and UPDATE policies.
-- ============================================================

-- Drop old attendance policies
DROP POLICY IF EXISTS "Admin can read all attendance" ON public.attendance;
DROP POLICY IF EXISTS "Instructors can read own period attendance" ON public.attendance;
DROP POLICY IF EXISTS "Authenticated users can read attendance" ON public.attendance;
DROP POLICY IF EXISTS "Admin can insert attendance" ON public.attendance;
DROP POLICY IF EXISTS "Instructors can insert own period attendance" ON public.attendance;
DROP POLICY IF EXISTS "Admin can update attendance" ON public.attendance;
DROP POLICY IF EXISTS "Instructors can update own period attendance" ON public.attendance;

-- 1. SELECT: Allow authenticated users to read attendance
-- (Admins can view all, instructors can view their periods, and PostgREST UPSERT can verify returned rows)
CREATE POLICY "Authenticated users can read attendance"
  ON public.attendance FOR SELECT
  TO authenticated
  USING (true);

-- 2. INSERT: Admin can insert attendance for any period
CREATE POLICY "Admin can insert attendance"
  ON public.attendance FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role() = 'admin');

-- 3. INSERT: Instructors can insert attendance for their assigned periods
CREATE POLICY "Instructors can insert own period attendance"
  ON public.attendance FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.periods
      WHERE periods.id = period_id
      AND periods.instructor_id = auth.uid()
    )
  );

-- 4. UPDATE: Admin can update any attendance record
CREATE POLICY "Admin can update attendance"
  ON public.attendance FOR UPDATE
  TO authenticated
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

-- 5. UPDATE: Instructors can update attendance for their assigned periods
CREATE POLICY "Instructors can update own period attendance"
  ON public.attendance FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.periods
      WHERE periods.id = attendance.period_id
      AND periods.instructor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.periods
      WHERE periods.id = attendance.period_id
      AND periods.instructor_id = auth.uid()
    )
  );
