-- ============================================================
-- 001_schema.sql — Core tables for Attendance Management System
-- ============================================================

-- Enable UUID extension (needed for auth.users references)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Profiles (extends auth.users with role + metadata)
-- ============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'instructor')),
  full_name TEXT NOT NULL,
  contact TEXT,
  subjects_qualified TEXT[],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Classes (7 fixed classes)
-- ============================================================
CREATE TABLE public.classes (
  id SERIAL PRIMARY KEY,
  class_name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Subjects (admin-managed)
-- ============================================================
CREATE TABLE public.subjects (
  id SERIAL PRIMARY KEY,
  subject_name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Students
-- ============================================================
CREATE TABLE public.students (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  roll_number TEXT NOT NULL,
  class_id INTEGER NOT NULL REFERENCES public.classes(id),
  contact TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(roll_number, class_id)
);

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Periods (daily schedule entries)
-- ============================================================
CREATE TABLE public.periods (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  class_id INTEGER NOT NULL REFERENCES public.classes(id),
  subject_id INTEGER NOT NULL REFERENCES public.subjects(id),
  instructor_id UUID NOT NULL REFERENCES public.profiles(id),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  period_type TEXT NOT NULL DEFAULT 'Lecture'
    CHECK (period_type IN ('Lecture', 'Lab', 'Tutorial', 'Other')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.periods ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Attendance Records (one per student per period)
-- ============================================================
CREATE TABLE public.attendance (
  id SERIAL PRIMARY KEY,
  period_id INTEGER NOT NULL REFERENCES public.periods(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES public.students(id),
  status TEXT NOT NULL DEFAULT 'Present' CHECK (status IN ('Present', 'Absent')),
  marked_by UUID NOT NULL REFERENCES auth.users(id),
  marked_at TIMESTAMPTZ DEFAULT NOW(),
  last_modified_by UUID REFERENCES auth.users(id),
  last_modified_at TIMESTAMPTZ,
  remark TEXT,
  UNIQUE(period_id, student_id)
);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Attendance History (append-only audit trail)
-- ============================================================
CREATE TABLE public.attendance_history (
  id BIGSERIAL PRIMARY KEY,
  attendance_id INTEGER NOT NULL REFERENCES public.attendance(id) ON DELETE CASCADE,
  period_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  remark TEXT
);

ALTER TABLE public.attendance_history ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Export Logs
-- ============================================================
CREATE TABLE public.export_logs (
  id SERIAL PRIMARY KEY,
  scope_description TEXT NOT NULL,
  google_sheet_url TEXT,
  exported_by UUID NOT NULL REFERENCES auth.users(id),
  exported_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Indexes for query performance
-- ============================================================
CREATE INDEX idx_periods_date ON public.periods(date);
CREATE INDEX idx_periods_instructor ON public.periods(instructor_id);
CREATE INDEX idx_periods_class_date ON public.periods(class_id, date);
CREATE INDEX idx_attendance_period ON public.attendance(period_id);
CREATE INDEX idx_attendance_student ON public.attendance(student_id);
CREATE INDEX idx_students_class ON public.students(class_id);
CREATE INDEX idx_students_status ON public.students(status);
CREATE INDEX idx_attendance_history_attendance ON public.attendance_history(attendance_id);
CREATE INDEX idx_attendance_history_period ON public.attendance_history(period_id);
