-- ============================================================
-- 008_make_subject_instructor_nullable.sql
-- Makes subject_id and instructor_id nullable on periods table 
-- so auto-created periods don't require defaults. Admin fills it in later.
-- ============================================================

ALTER TABLE public.periods ALTER COLUMN subject_id DROP NOT NULL;
ALTER TABLE public.periods ALTER COLUMN instructor_id DROP NOT NULL;
