-- ============================================================
-- 005_seed_users_and_students.sql
-- Seeds Admin, Instructors, and Students
-- ============================================================

-- Enable pgcrypto for password hashing if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 0. Fix any existing NULL token columns in auth.users (causes GoTrue "Database error querying schema")
UPDATE auth.users 
SET 
  confirmation_token = COALESCE(confirmation_token, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  recovery_token = COALESCE(recovery_token, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, ''),
  email = LOWER(email)
WHERE confirmation_token IS NULL
   OR email_change IS NULL
   OR email_change_token_new IS NULL
   OR email_change_token_current IS NULL
   OR recovery_token IS NULL
   OR phone_change IS NULL
   OR phone_change_token IS NULL
   OR reauthentication_token IS NULL;

DO $$
DECLARE
  -- Admins
  admin1_id uuid := gen_random_uuid();
  admin2_id uuid := gen_random_uuid();
  admin3_id uuid := gen_random_uuid();
  
  -- Instructors
  inst1_id uuid := gen_random_uuid();
  inst2_id uuid := gen_random_uuid();
  inst3_id uuid := gen_random_uuid();
  inst4_id uuid := gen_random_uuid();
BEGIN
  -- 1. Clean up existing users if script is re-run
  DELETE FROM auth.users WHERE LOWER(email) IN (
    'ujjwal@niat.in', 'divesh@niat.in', 'pankaj@niat.in',
    'yash@niat.in', 'skund@niat.in', 'inderjit@niat.in', 'rishabh@niat.in'
  );

  -- 2. Insert Auth Users (All string token columns MUST be empty strings '', NOT null, or GoTrue crashes)
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, 
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new,
    email_change_token_current, email_change, phone_change,
    phone_change_token, reauthentication_token,
    created_at, updated_at
  )
  VALUES
    -- Admins
    (admin1_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ujjwal@niat.in', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Ujjwal"}'::jsonb, '', '', '', '', '', '', '', '', now(), now()),
    (admin2_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'divesh@niat.in', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Divesh"}'::jsonb, '', '', '', '', '', '', '', '', now(), now()),
    (admin3_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pankaj@niat.in', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Pankaj"}'::jsonb, '', '', '', '', '', '', '', '', now(), now()),
    
    -- Instructors
    (inst1_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'yash@niat.in', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Yash"}'::jsonb, '', '', '', '', '', '', '', '', now(), now()),
    (inst2_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'skund@niat.in', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Skund"}'::jsonb, '', '', '', '', '', '', '', '', now(), now()),
    (inst3_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inderjit@niat.in', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Inderjit"}'::jsonb, '', '', '', '', '', '', '', '', now(), now()),
    (inst4_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rishabh@niat.in', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Rishabh"}'::jsonb, '', '', '', '', '', '', '', '', now(), now());

  -- 3. Insert Auth Identities
  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  )
  VALUES
    -- Admins
    (gen_random_uuid(), admin1_id, admin1_id::text, format('{"sub":"%s","email":"%s"}', admin1_id::text, 'ujjwal@niat.in')::jsonb, 'email', now(), now(), now()),
    (gen_random_uuid(), admin2_id, admin2_id::text, format('{"sub":"%s","email":"%s"}', admin2_id::text, 'divesh@niat.in')::jsonb, 'email', now(), now(), now()),
    (gen_random_uuid(), admin3_id, admin3_id::text, format('{"sub":"%s","email":"%s"}', admin3_id::text, 'pankaj@niat.in')::jsonb, 'email', now(), now(), now()),
    
    -- Instructors
    (gen_random_uuid(), inst1_id, inst1_id::text, format('{"sub":"%s","email":"%s"}', inst1_id::text, 'yash@niat.in')::jsonb, 'email', now(), now(), now()),
    (gen_random_uuid(), inst2_id, inst2_id::text, format('{"sub":"%s","email":"%s"}', inst2_id::text, 'skund@niat.in')::jsonb, 'email', now(), now(), now()),
    (gen_random_uuid(), inst3_id, inst3_id::text, format('{"sub":"%s","email":"%s"}', inst3_id::text, 'inderjit@niat.in')::jsonb, 'email', now(), now(), now()),
    (gen_random_uuid(), inst4_id, inst4_id::text, format('{"sub":"%s","email":"%s"}', inst4_id::text, 'rishabh@niat.in')::jsonb, 'email', now(), now(), now());

  -- 4. Insert Profiles
  INSERT INTO public.profiles (id, role, full_name, is_active, created_at, updated_at)
  VALUES
    (admin1_id, 'admin', 'Ujjwal', true, now(), now()),
    (admin2_id, 'admin', 'Divesh', true, now(), now()),
    (admin3_id, 'admin', 'Pankaj', true, now(), now()),
    (inst1_id, 'instructor', 'Yash', true, now(), now()),
    (inst2_id, 'instructor', 'Skund', true, now(), now()),
    (inst3_id, 'instructor', 'Inderjit', true, now(), now()),
    (inst4_id, 'instructor', 'Rishabh', true, now(), now());
END $$;

-- 5. Ensure the single Class exists
INSERT INTO public.classes (class_name) VALUES
  ('Class 1')
ON CONFLICT (class_name) DO NOTHING;

-- 6. Insert All 50 Students into the single Class (Class 1)
INSERT INTO public.students (name, roll_number, class_id, contact, status) VALUES
  ('Vicky Gupta', 'R001', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '7302871812', 'active'),
  ('Mukund kumar soni', 'R002', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '6299710703', 'active'),
  ('Tanish Grover', 'R003', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '9034982000', 'active'),
  ('Lovish singla', 'R004', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '7015859588', 'active'),
  ('Chetan Jangra', 'R005', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '8570047276', 'active'),
  ('Dipanshu kumar', 'R006', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '8987228660', 'active'),
  ('Hitika Dhiman', 'R007', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '6395852814', 'active'),
  ('Harshal Mathur', 'R008', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '9306671806', 'active'),
  ('Rupesh', 'R009', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '9588775202', 'active'),
  ('Vikaspreet singh', 'R010', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '8427106218', 'active'),
  ('Ujjwal', 'R011', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '7015056856', 'active'),
  ('RAGHAV GHAI', 'R012', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '9034400366', 'active'),
  ('Jashan Preet Singh', 'R013', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '9034714183', 'active'),
  ('BALRAJ SINGH', 'R014', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '9463976985', 'active'),
  ('Harshita', 'R015', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '8816863401', 'active'),
  ('Abhinav Singh', 'R016', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '6202083406', 'active'),
  ('Ishan Vikram Singh', 'R017', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '9795602332', 'active'),
  ('Bhavya Sharma', 'R018', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '9992555993', 'active'),
  ('Suraj', 'R019', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '7015726954', 'active'),
  ('Bharat', 'R020', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '7838534721', 'active'),
  ('Arjun Singha', 'R021', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '8264627200', 'active'),
  ('Harshit Kamra', 'R022', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '9034273400', 'active'),
  ('Ruhani', 'R023', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '9034400377', 'active'),
  ('Chetan Pandey', 'R024', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '7607163637', 'active'),
  ('Ritik Choudhary', 'R025', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '8091721204', 'active'),
  ('NIHAL MAHORE', 'R026', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '9691833523', 'active'),
  ('Sanskriti Sahu', 'R027', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '7903703408', 'active'),
  ('Sahil Patial', 'R028', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '8278749130', 'active'),
  ('Prachi bhardwaj', 'R029', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '9817724300', 'active'),
  ('Shekhar Kumawat', 'R030', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '9549700183', 'active'),
  ('PRIYANSHU SHARMA', 'R031', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '9306470256', 'active'),
  ('Arunkumar Chaudhary', 'R032', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '9028253978', 'active'),
  ('MD DILSHAN', 'R033', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '8709696605', 'active'),
  ('Nitin gulani', 'R034', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '8930211555', 'active'),
  ('Bhupendra Singh', 'R035', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '9461027253', 'active'),
  ('Naman Jiwrajka', 'R036', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '8918177267', 'active'),
  ('Raj Aryan Naik', 'R037', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '9827943387', 'active'),
  ('Manish kumar', 'R038', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '6299732490', 'active'),
  ('Vijay Swami', 'R039', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '7378204577', 'active'),
  ('Nikhil raj', 'R040', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '9263572647', 'active'),
  ('Yashasvee Patel', 'R041', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '6264465426', 'active'),
  ('Dinesh Bishnoi', 'R042', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '8209465711', 'active'),
  ('Mohit raj', 'R043', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '7903232509', 'active'),
  ('Sawan maheshwari', 'R044', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '6268613075', 'active'),
  ('Chirag Yadav', 'R045', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '7206277764', 'active'),
  ('atharv sharma', 'R046', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '9654480303', 'active'),
  ('Navneet aryan', 'R047', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '8340495035', 'active'),
  ('JAI PRAKASH PANDIT', 'R048', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '9608795825', 'active'),
  ('Aryan Kumar', 'R049', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '8219560945', 'active'),
  ('Bhumishri verma', 'R050', (SELECT id FROM public.classes WHERE class_name = 'Class 1' LIMIT 1), '7354261443', 'active')
ON CONFLICT (roll_number, class_id) DO NOTHING;
