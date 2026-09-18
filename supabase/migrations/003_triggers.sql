-- ============================================================
-- 003_triggers.sql — Audit trail trigger for attendance changes
-- ============================================================

-- Trigger function: logs every INSERT and UPDATE on attendance table
-- to the attendance_history table for full audit trail
CREATE OR REPLACE FUNCTION public.log_attendance_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.attendance_history
      (attendance_id, period_id, student_id, previous_status, new_status, changed_by, remark)
    VALUES
      (NEW.id, NEW.period_id, NEW.student_id, NULL, NEW.status, NEW.marked_by, NEW.remark);
    RETURN NEW;

  ELSIF (TG_OP = 'UPDATE') THEN
    -- Only log if the status actually changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.attendance_history
        (attendance_id, period_id, student_id, previous_status, new_status, changed_by, remark)
      VALUES
        (NEW.id, NEW.period_id, NEW.student_id, OLD.status, NEW.status,
         COALESCE(NEW.last_modified_by, NEW.marked_by), NEW.remark);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to attendance table
CREATE TRIGGER trg_attendance_audit
AFTER INSERT OR UPDATE ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.log_attendance_change();

-- ============================================================
-- Auto-update updated_at timestamp on profiles, students, periods
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_students_updated_at
BEFORE UPDATE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_periods_updated_at
BEFORE UPDATE ON public.periods
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
