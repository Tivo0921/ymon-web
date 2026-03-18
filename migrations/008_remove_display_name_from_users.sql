-- Remove unused display_name column from users table
ALTER TABLE public.users DROP COLUMN IF EXISTS display_name;
