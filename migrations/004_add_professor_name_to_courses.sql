-- courses テーブルに教授名カラムを追加
-- 検索機能で教授名からも授業を検索できるようにする

ALTER TABLE courses ADD COLUMN professor_name TEXT DEFAULT '';

-- 既存のデータに対して教授名を空文字で初期化（必要に応じて手動で更新）
UPDATE courses SET professor_name = '' WHERE professor_name IS NULL;

-- インデックスを追加して検索性能を向上
CREATE INDEX idx_courses_professor_name ON courses (professor_name);
CREATE INDEX idx_courses_display_name ON courses (display_name);
