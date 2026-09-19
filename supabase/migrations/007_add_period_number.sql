-- ============================================================
-- 007_add_period_number.sql
-- Adds period_number (1-7) column to periods table and
-- a unique constraint per (date, class_id, period_number).
-- ============================================================

-- 1. Add the column (nullable initially so existing rows aren't rejected)
ALTER TABLE public.periods
  ADD COLUMN IF NOT EXISTS period_number INTEGER;

-- 2. Backfill existing periods: assign period_number by start_time order per (date, class_id)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY date, class_id ORDER BY start_time) AS rn
  FROM public.periods
)
UPDATE public.periods
SET period_number = ranked.rn
FROM ranked
WHERE public.periods.id = ranked.id
  AND public.periods.period_number IS NULL;

-- 3. Add CHECK constraint (1-7)
ALTER TABLE public.periods
  ADD CONSTRAINT chk_period_number CHECK (period_number BETWEEN 1 AND 7);

-- 4. Unique constraint: one period number per class per day
ALTER TABLE public.periods
  ADD CONSTRAINT uq_periods_date_class_number UNIQUE (date, class_id, period_number);
