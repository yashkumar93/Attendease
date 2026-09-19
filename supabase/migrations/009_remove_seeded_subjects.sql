-- ============================================================
-- 009_remove_seeded_subjects.sql
-- Removes all seeded subjects and ensures periods.subject_id is nullable
-- with ON DELETE SET NULL constraint.
-- ============================================================

-- 1. Ensure subject_id is nullable on periods
ALTER TABLE public.periods ALTER COLUMN subject_id DROP NOT NULL;

-- 2. Update foreign key on periods to ON DELETE SET NULL
ALTER TABLE public.periods DROP CONSTRAINT IF EXISTS periods_subject_id_fkey;
ALTER TABLE public.periods 
  ADD CONSTRAINT periods_subject_id_fkey 
  FOREIGN KEY (subject_id) 
  REFERENCES public.subjects(id) 
  ON DELETE SET NULL;

-- 3. Set all existing period subject_id references to NULL
UPDATE public.periods SET subject_id = NULL WHERE subject_id IS NOT NULL;

-- 4. Delete all existing seeded subjects
DELETE FROM public.subjects;
