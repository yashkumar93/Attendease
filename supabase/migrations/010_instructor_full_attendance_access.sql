-- ============================================================
-- 010_instructor_full_attendance_access.sql
-- Gives instructors the same attendance management access as admins:
--   1. Read ALL periods (not just their own)
--   2. Insert attendance for ANY period
--   3. Update attendance for ANY period
-- ============================================================

-- ============================================================
-- PERIODS: Allow instructors to read all periods
-- ============================================================
DROP POLICY IF EXISTS "Instructors can read own periods" ON public.periods;

CREATE POLICY "Instructors can read all periods"
  ON public.periods FOR SELECT
  TO authenticated
  USING (public.get_user_role() = 'instructor');

-- ============================================================
-- ATTENDANCE: Widen instructor INSERT to any period
-- ============================================================
DROP POLICY IF EXISTS "Instructors can insert own period attendance" ON public.attendance;

CREATE POLICY "Instructors can insert any attendance"
  ON public.attendance FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role() = 'instructor');

-- ============================================================
-- ATTENDANCE: Widen instructor UPDATE to any period
-- ============================================================
DROP POLICY IF EXISTS "Instructors can update own period attendance" ON public.attendance;

CREATE POLICY "Instructors can update any attendance"
  ON public.attendance FOR UPDATE
  TO authenticated
  USING (public.get_user_role() = 'instructor')
  WITH CHECK (public.get_user_role() = 'instructor');
