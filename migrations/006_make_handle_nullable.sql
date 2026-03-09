-- handle カラムを nullable に変更（メール認証フロー対応）
-- ユーザーはまずメール認証で登録され、その後 handle を設定する

ALTER TABLE users
ALTER COLUMN handle DROP NOT NULL;

-- handle をユニークになるように（NULL は複数許可される）
ALTER TABLE users
ADD CONSTRAINT handle_unique UNIQUE NULLS NOT DISTINCT (handle);
