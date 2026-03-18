-- Add email verification columns to users table
ALTER TABLE users ADD COLUMN email_verification_token VARCHAR(6);
ALTER TABLE users ADD COLUMN email_verification_sent_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;

-- Add index for faster lookups
CREATE INDEX idx_users_email_verification_token ON users(email_verification_token);
