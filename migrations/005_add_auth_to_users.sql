-- Step 1: users テーブルに email と password_hash カラムを追加
ALTER TABLE users
ADD COLUMN email VARCHAR(255) UNIQUE,
ADD COLUMN password_hash VARCHAR(255),
ADD COLUMN email_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();

-- Step 2: OTP（One-Time Password）テーブルを作成
CREATE TABLE email_verification_otp (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    otp_code VARCHAR(6) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP,
    CONSTRAINT otp_code_format CHECK (otp_code ~ '^\d{6}$')
);

-- OTP テーブルのインデックス
CREATE INDEX idx_email_verification_otp_email ON email_verification_otp(email);
CREATE INDEX idx_email_verification_otp_created_at ON email_verification_otp(created_at DESC);

-- Step 3: ユーザーのメール確認ステータスを追跡するテーブル
CREATE TABLE email_verification_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'verified', 'failed')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_verification_log_email ON email_verification_log(email);
CREATE INDEX idx_email_verification_log_user_id ON email_verification_log(user_id);

-- 既存ユーザーのデータを保持するため、デフォルト値を設定
-- （スキーマ追加時に既にユーザーがいる場合）
UPDATE users SET email_verified = TRUE WHERE email IS NULL AND created_at IS NOT NULL;
