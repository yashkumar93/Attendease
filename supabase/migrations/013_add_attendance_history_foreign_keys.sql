-- ============================================================
-- 013_add_attendance_history_foreign_keys.sql
-- Add foreign key relationship from attendance_history.changed_by
-- to public.profiles(id) so PostgREST schema cache knows the relationship
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'attendance_history_changed_by_fkey'
  ) THEN
    ALTER TABLE public.attendance_history
      ADD CONSTRAINT attendance_history_changed_by_fkey
      FOREIGN KEY (changed_by) REFERENCES public.profiles(id)
      ON DELETE CASCADE;
  END IF;
END $$;
