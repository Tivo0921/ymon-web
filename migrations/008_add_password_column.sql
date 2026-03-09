-- Add password column to users table for test account
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password VARCHAR(255);

-- Update test account with hashed password
-- Password: "password" hashed with bcrypt
-- Hash: $2b$10$EIxfqPXhJGXKMcJH5R6.2eXPhWn0BVOoZLlKXJHPVJ0HEz8eVJjJm (for "password")
UPDATE public.users 
SET password = '$2b$10$EIxfqPXhJGXKMcJH5R6.2eXPhWn0BVOoZLlKXJHPVJ0HEz8eVJjJm'
WHERE email = 'example@ynu.jp';

