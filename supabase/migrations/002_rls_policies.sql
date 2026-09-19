-- ============================================================
-- 002_rls_policies.sql — Row Level Security policies
-- ============================================================

-- Helper function: get the current user's role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- PROFILES
-- ============================================================
-- Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Admin can read all profiles
CREATE POLICY "Admin can read all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.get_user_role() = 'admin');

-- Admin can insert profiles (creating instructors)
CREATE POLICY "Admin can insert profiles"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role() = 'admin');

-- Admin can update any profile
CREATE POLICY "Admin can update profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

-- ============================================================
-- CLASSES
-- ============================================================
-- All authenticated users can read classes
CREATE POLICY "Authenticated users can read classes"
  ON public.classes FOR SELECT
  TO authenticated
  USING (true);

-- Only admin can modify classes
CREATE POLICY "Admin can insert classes"
  ON public.classes FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY "Admin can update classes"
  ON public.classes FOR UPDATE
  TO authenticated
  USING (public.get_user_role() = 'admin');

-- ============================================================
-- SUBJECTS
-- ============================================================
-- All authenticated users can read subjects
CREATE POLICY "Authenticated users can read subjects"
  ON public.subjects FOR SELECT
  TO authenticated
  USING (true);

-- Only admin can modify subjects
CREATE POLICY "Admin can insert subjects"
  ON public.subjects FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY "Admin can update subjects"
  ON public.subjects FOR UPDATE
  TO authenticated
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Admin can delete subjects"
  ON public.subjects FOR DELETE
  TO authenticated
  USING (public.get_user_role() = 'admin');

-- ============================================================
-- STUDENTS
-- ============================================================
-- All authenticated users can read students
CREATE POLICY "Authenticated users can read students"
  ON public.students FOR SELECT
  TO authenticated
  USING (true);

-- Only admin can modify students
CREATE POLICY "Admin can insert students"
  ON public.students FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY "Admin can update students"
  ON public.students FOR UPDATE
  TO authenticated
  USING (public.get_user_role() = 'admin');

-- ============================================================
-- PERIODS
-- ============================================================
-- Admin can read all periods
CREATE POLICY "Admin can read all periods"
  ON public.periods FOR SELECT
  TO authenticated
  USING (public.get_user_role() = 'admin');

-- Instructors can read only their assigned periods
CREATE POLICY "Instructors can read own periods"
  ON public.periods FOR SELECT
  TO authenticated
  USING (instructor_id = auth.uid());

-- Only admin can create periods
CREATE POLICY "Admin can insert periods"
  ON public.periods FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role() = 'admin');

-- Only admin can update periods
CREATE POLICY "Admin can update periods"
  ON public.periods FOR UPDATE
  TO authenticated
  USING (public.get_user_role() = 'admin');

-- Only admin can delete periods
CREATE POLICY "Admin can delete periods"
  ON public.periods FOR DELETE
  TO authenticated
  USING (public.get_user_role() = 'admin');

-- ============================================================
-- ATTENDANCE
-- ============================================================
-- All authenticated users can read attendance
CREATE POLICY "Authenticated users can read attendance"
  ON public.attendance FOR SELECT
  TO authenticated
  USING (true);

-- Admin can insert attendance for any period
CREATE POLICY "Admin can insert attendance"
  ON public.attendance FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role() = 'admin');

-- Instructors can insert attendance for their own periods
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

-- Admin can update any attendance
CREATE POLICY "Admin can update attendance"
  ON public.attendance FOR UPDATE
  TO authenticated
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

-- Instructors can update attendance they originally marked for their own periods
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

-- ============================================================
-- ATTENDANCE HISTORY
-- ============================================================
-- All authenticated users can read audit trail
CREATE POLICY "Authenticated users can read attendance history"
  ON public.attendance_history FOR SELECT
  TO authenticated
  USING (true);

-- Inserts happen via trigger (SECURITY DEFINER), not directly by users
-- But allow service role inserts
CREATE POLICY "System can insert attendance history"
  ON public.attendance_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================
-- EXPORT LOGS
-- ============================================================
-- Only admin can read export logs
CREATE POLICY "Admin can read export logs"
  ON public.export_logs FOR SELECT
  TO authenticated
  USING (public.get_user_role() = 'admin');

-- Only admin can insert export logs
CREATE POLICY "Admin can insert export logs"
  ON public.export_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role() = 'admin');
