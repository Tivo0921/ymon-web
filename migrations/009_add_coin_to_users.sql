-- Add coin column to users table for attendance tracking
ALTER TABLE public.users ADD COLUMN coin INTEGER DEFAULT 0;
