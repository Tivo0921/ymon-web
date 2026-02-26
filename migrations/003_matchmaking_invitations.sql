-- matchmaking_invitations テーブルを作成
-- 招待者が相手に招待通知を送信した時点で pending 状態で記録
-- 招待された側が承認すると accepted に更新

CREATE TABLE matchmaking_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inviter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invitee_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT no_self_invite CHECK (inviter_user_id != invitee_user_id)
);

-- インデックス作成（invitee_user_id でよく検索するため）
CREATE INDEX idx_matchmaking_invitations_invitee_user_id ON matchmaking_invitations (invitee_user_id);
CREATE INDEX idx_matchmaking_invitations_status ON matchmaking_invitations (status);

-- pending 状態の招待は重複を許さない UNIQUE インデックス
CREATE UNIQUE INDEX idx_matchmaking_invitations_no_duplicate_pending 
ON matchmaking_invitations (inviter_user_id, invitee_user_id) 
WHERE status = 'pending';

-- updated_at 自動更新用 function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- trigger: updated_at を自動更新
CREATE TRIGGER update_matchmaking_invitations_updated_at
BEFORE UPDATE ON matchmaking_invitations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
