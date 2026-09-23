-- ============================================================
-- 014_allow_instructor_export_logs.sql
-- Enables faculty instructors to read and record attendance export logs
-- alongside administrators.
-- ============================================================

-- Drop old admin-only export_logs policies if they exist
DROP POLICY IF EXISTS "Admin can read export logs" ON public.export_logs;
DROP POLICY IF EXISTS "Admin can insert export logs" ON public.export_logs;
DROP POLICY IF EXISTS "Staff can read export logs" ON public.export_logs;
DROP POLICY IF EXISTS "Staff can insert export logs" ON public.export_logs;

-- Allow both admins and instructors to read export logs
CREATE POLICY "Staff can read export logs"
  ON public.export_logs FOR SELECT
  TO authenticated
  USING (public.get_user_role() IN ('admin', 'instructor'));

-- Allow both admins and instructors to insert export logs
CREATE POLICY "Staff can insert export logs"
  ON public.export_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role() IN ('admin', 'instructor'));
