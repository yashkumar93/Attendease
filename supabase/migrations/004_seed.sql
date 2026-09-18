-- ============================================================
-- 004_seed.sql — Seed data for 7 classes and default subjects
-- ============================================================

-- Single Class
INSERT INTO public.classes (class_name) VALUES
  ('Class 1')
ON CONFLICT (class_name) DO NOTHING;

-- Default Subjects
INSERT INTO public.subjects (subject_name) VALUES
  ('Mathematics'),
  ('Web Development'),
  ('Generative AI'),
  ('English'),
  ('Computer Programming'),
  ('Aptitude')
  
ON CONFLICT (subject_name) DO NOTHING;
