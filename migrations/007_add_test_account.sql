-- Test account for login testing
-- This account does not have Supabase Auth user, only DB record for testing login API
INSERT INTO public.users (email, handle, email_verified, created_at, updated_at)
VALUES (
  'example@ynu.jp',
  'example',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING;

-- Note: This account is for testing login flow.
-- Do NOT use this for actual Supabase Auth signup/login (will fail because no Auth user exists).
-- To test login, modify `/api/auth/login` to accept this test account without Auth verification.
