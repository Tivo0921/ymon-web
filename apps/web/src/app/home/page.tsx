"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userHandle, setUserHandle] = useState<string | null>(null);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [circleReviews, setCircleReviews] = useState<any[]>([]);
  const [courseReviews, setCourseReviews] = useState<any[]>([]);

  // ユーザーセッション確認 & データ取得
  useEffect(() => {
    const email = localStorage.getItem("userEmail");
    const handle = localStorage.getItem("userHandle");

    if (!email || !handle) {
      router.push("/");
      return;
    }

    setUserEmail(email);
    setUserHandle(handle);

    // サークルレビュー一覧取得（ユーザーが投稿したもの）
    const fetchReviews = async () => {
      try {
        const circles = await apiFetch("/api/circles");
        const reviews: any[] = [];

        // 全サークルのレビューを取得
        for (const circle of circles?.data || []) {
          const reviewsData = await apiFetch(`/api/circle-reviews/${circle.key}`);
          const userReviews = (reviewsData?.data || []).filter(
            (r: any) => r.author_handle === handle
          );
          reviews.push(...userReviews);
        }

        setCircleReviews(reviews);
      } catch {
        // エラー無視
      }

      try {
        const courses = await apiFetch("/api/courses");
        const reviews: any[] = [];

        // 全授業のレビューを取得
        for (const course of courses?.data || []) {
          const reviewsData = await apiFetch(`/api/reviews/${course.key}`);
          const userReviews = (reviewsData?.data || []).filter(
            (r: any) => r.author_handle === handle
          );
          reviews.push(...userReviews);
        }

        setCourseReviews(reviews);
      } catch {
        // エラー無視
      }
    };

    fetchReviews();
  }, [router]);

  const handleChangePassword = async () => {
    setErr(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const cp = currentPassword.trim();
      const np = newPassword.trim();
      const cnp = confirmPassword.trim();

      if (!cp) throw new Error("現在のパスワードを入力してください");
      if (!np) throw new Error("新しいパスワードを入力してください");
      if (np.length < 8) throw new Error("新しいパスワードは8文字以上です");
      if (np !== cnp) throw new Error("新しいパスワードが一致しません");

      if (!userEmail) throw new Error("ユーザー情報がありません");

      await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          email: userEmail,
          oldPassword: cp,
          newPassword: np,
        }),
      });

      setSuccessMsg("パスワードが変更されました");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordChange(false);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userHandle");
    router.push("/");
  };

  const containerStyle = {
    padding: "20px",
    maxWidth: "800px",
    margin: "0 auto",
    backgroundColor: "#f5f5f5",
    minHeight: "100vh",
  };

  const cardStyle = {
    backgroundColor: "white",
    borderRadius: "8px",
    padding: "20px",
    marginBottom: "20px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  };

  const headerStyle = {
    fontSize: "24px",
    fontWeight: "bold" as const,
    marginBottom: "16px",
    color: "#333",
  };

  const buttonStyle = {
    padding: "10px 16px",
    marginRight: "8px",
    marginBottom: "8px",
    backgroundColor: "#4CAF50",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "14px",
  };

  const dangerButtonStyle = {
    ...buttonStyle,
    backgroundColor: "#f44336",
  };

  const secondaryButtonStyle = {
    ...buttonStyle,
    backgroundColor: "#666",
  };

  const inputStyle = {
    padding: "8px",
    fontSize: "14px",
    borderRadius: "4px",
    border: "1px solid #ccc",
    width: "100%",
    boxSizing: "border-box" as const,
    marginBottom: "8px",
  };

  const labelStyle = {
    fontSize: "14px",
    fontWeight: "bold" as const,
    marginBottom: "4px",
    display: "block",
    color: "#333",
  };

  const errorStyle = {
    color: "#f44336",
    fontSize: "14px",
    marginBottom: "8px",
  };

  const successStyle = {
    color: "#4CAF50",
    fontSize: "14px",
    marginBottom: "8px",
  };

  const reviewItemStyle = {
    borderLeft: "4px solid #2196F3",
    paddingLeft: "12px",
    marginBottom: "12px",
    paddingBottom: "12px",
    borderBottom: "1px solid #eee",
  };

  return (
    <main style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={headerStyle}>ホーム</h1>

        {/* ユーザー情報 */}
        <div style={{ marginBottom: "20px", paddingBottom: "20px", borderBottom: "1px solid #eee" }}>
          <p>
            <strong>メール:</strong> {userEmail}
          </p>
          <p>
            <strong>ハンドル:</strong> {userHandle}
          </p>
        </div>

        {/* アクションボタン */}
        <div style={{ marginBottom: "20px" }}>
          <button
            onClick={() => setShowPasswordChange(!showPasswordChange)}
            style={secondaryButtonStyle}
          >
            {showPasswordChange ? "キャンセル" : "パスワード変更"}
          </button>

          <button
            onClick={() => router.push(`/matchmaking?handle=${encodeURIComponent(userHandle || "")}`)}
            style={buttonStyle}
          >
            マッチメイキングへ
          </button>

          <button onClick={handleLogout} style={dangerButtonStyle}>
            ログアウト
          </button>
        </div>

        {/* パスワード変更フォーム */}
        {showPasswordChange && (
          <div style={{ ...cardStyle, backgroundColor: "#fafafa", marginBottom: "20px" }}>
            <h3 style={{ marginBottom: "16px" }}>パスワード変更</h3>

            <label style={labelStyle}>現在のパスワード</label>
            <input
              type="password"
              placeholder="現在のパスワード"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              style={inputStyle}
              disabled={loading}
            />

            <label style={labelStyle}>新しいパスワード（8文字以上）</label>
            <input
              type="password"
              placeholder="新しいパスワード"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={inputStyle}
              disabled={loading}
            />

            <label style={labelStyle}>新しいパスワード（確認）</label>
            <input
              type="password"
              placeholder="新しいパスワード（確認）"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={inputStyle}
              disabled={loading}
            />

            {err && <div style={errorStyle}>{err}</div>}
            {successMsg && <div style={successStyle}>{successMsg}</div>}

            <button
              onClick={handleChangePassword}
              style={buttonStyle}
              disabled={loading}
            >
              {loading ? "変更中..." : "変更"}
            </button>
          </div>
        )}

        {/* サークルレビュー */}
        {circleReviews.length > 0 && (
          <div style={cardStyle}>
            <h3 style={{ marginBottom: "16px" }}>投稿したサークルレビュー</h3>
            {circleReviews.map((review: any, idx: number) => (
              <div key={idx} style={reviewItemStyle}>
                <p>
                  <strong>サークル:</strong> {review.circle_key}
                </p>
                <p>
                  <strong>評価:</strong> {"⭐".repeat(review.rating)}
                </p>
                <p>
                  <strong>コメント:</strong> {review.comment}
                </p>
                <p style={{ fontSize: "12px", color: "#999" }}>
                  {new Date(review.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* 授業レビュー */}
        {courseReviews.length > 0 && (
          <div style={cardStyle}>
            <h3 style={{ marginBottom: "16px" }}>投稿した授業レビュー</h3>
            {courseReviews.map((review: any, idx: number) => (
              <div key={idx} style={reviewItemStyle}>
                <p>
                  <strong>授業:</strong> {review.course_key}
                </p>
                <p>
                  <strong>評価:</strong> {"⭐".repeat(review.rating)}
                </p>
                <p>
                  <strong>コメント:</strong> {review.comment}
                </p>
                <p style={{ fontSize: "12px", color: "#999" }}>
                  {new Date(review.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}

        {circleReviews.length === 0 && courseReviews.length === 0 && (
          <div style={cardStyle} >
            <p style={{ color: "#999" }}>
              まだレビューを投稿していません。ゲームをプレイしてレビューを投稿しましょう！
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
