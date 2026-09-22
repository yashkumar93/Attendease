-- ============================================================
-- 011_add_staff_post_and_seed.sql
-- Adds post (job title / designation) and email to profiles metadata
-- ============================================================

-- 1. Update raw_user_meta_data for Admins
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"post":"Business Operations Associate (BOA)","email":"Ujjwal@niat.in"}'::jsonb
WHERE LOWER(email) = 'ujjwal@niat.in';

UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"post":"Program Manager (PM)","email":"divesh@niat.in"}'::jsonb
WHERE LOWER(email) = 'divesh@niat.in';

UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"post":"Program Manager Associate (PMA)","email":"pankaj@niat.in"}'::jsonb
WHERE LOWER(email) = 'pankaj@niat.in';

-- 2. Update raw_user_meta_data for Instructors
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"post":"Tech Instructor (Frontend Technologies & GENAI )","email":"Yash@niat.in"}'::jsonb
WHERE LOWER(email) = 'yash@niat.in';

UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"post":"Tech Instructor (Backend Systems)","email":"Skund@niat.in"}'::jsonb
WHERE LOWER(email) = 'skund@niat.in';

UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"post":"English Instructor (English & Communication Studies)","email":"Inderjit@niat.in"}'::jsonb
WHERE LOWER(email) = 'inderjit@niat.in';

UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"post":"Mathematics Instructor (Maths & Aptitude)","email":"Rishabh@niat.in"}'::jsonb
WHERE LOWER(email) = 'rishabh@niat.in';
