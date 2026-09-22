-- ============================================================
-- 012_audit_trail_remarks_trigger.sql
-- Ensure changes to remarks are also captured in attendance_history
-- even if attendance status remained unchanged
-- ============================================================

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
    -- Log if status changed OR remark was added, modified, or cleared
    IF (OLD.status IS DISTINCT FROM NEW.status) OR (OLD.remark IS DISTINCT FROM NEW.remark) THEN
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
