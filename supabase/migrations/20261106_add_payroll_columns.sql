ALTER TABLE public.production_checks
ADD COLUMN is_paid BOOLEAN DEFAULT false,
ADD COLUMN payment_status VARCHAR(50);