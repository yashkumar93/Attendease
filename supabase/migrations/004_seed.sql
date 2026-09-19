-- ============================================================
-- 004_seed.sql — Seed data for 7 classes and default subjects
-- ============================================================

-- Single Class
INSERT INTO public.classes (class_name) VALUES
  ('Class 1')
ON CONFLICT (class_name) DO NOTHING;

-- Note: Default subjects are removed as requested. Subjects can be added dynamically by Admin.
