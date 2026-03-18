"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userHandle, setUserHandle] = useState<string | null>(null);
  const [userCoin, setUserCoin] = useState(0);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [showHandleChange, setShowHandleChange] = useState(false);
  const [showScheduleEdit, setShowScheduleEdit] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newHandle, setNewHandle] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [circleReviews, setCircleReviews] = useState<any[]>([]);
  const [courseReviews, setCourseReviews] = useState<any[]>([]);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [editingPeriod, setEditingPeriod] = useState<{ weekday: number; period: number } | null>(null);
  const [editingSubject, setEditingSubject] = useState("");
  const [editingRoom, setEditingRoom] = useState("");

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

    // ユーザー情報取得（coin を含む）
    const fetchUserData = async () => {
      try {
        const userData = await apiFetch(`/api/auth/user/${encodeURIComponent(email)}`);
        if (userData?.user?.coin !== undefined) {
          setUserCoin(userData.user.coin);
        }
      } catch {
        // エラー無視
      }
    };

    fetchUserData();

    // ユーザーの時間割取得
    const fetchSchedule = async () => {
      try {
        const scheduleData = await apiFetch(`/api/schedule/${encodeURIComponent(handle)}`);
        setSchedule(scheduleData?.data || []);
      } catch {
        // エラー無視
      }
    };

    fetchSchedule();
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

  const handleUpdateHandle = async () => {
    setErr(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const nh = newHandle.trim();

      if (!nh) throw new Error("新しいハンドルを入力してください");
      if (nh.length < 3) throw new Error("ハンドルは3文字以上です");
      if (!/^[a-zA-Z0-9_-]+$/.test(nh)) throw new Error("ハンドルに使用できない文字があります");
      if (nh === userHandle) throw new Error("新しいハンドルは現在のハンドルと異なる必要があります");

      if (!userEmail) throw new Error("ユーザー情報がありません");

      const result = await apiFetch("/api/auth/update-handle", {
        method: "POST",
        body: JSON.stringify({
          email: userEmail,
          newHandle: nh,
        }),
      });

      // Update localStorage and state
      localStorage.setItem("userHandle", nh);
      setUserHandle(nh);

      setSuccessMsg("ハンドルが変更されました");
      setNewHandle("");
      setShowHandleChange(false);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleCheckin = async () => {
    setErr(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (!userEmail) throw new Error("ユーザー情報がありません");

      // Get GPS location
      if (!navigator.geolocation) {
        throw new Error("このブラウザは位置情報に対応していません");
      }

      const position = await new Promise<GeolocationCoordinates>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos.coords),
          (err) => reject(new Error(`位置情報取得失敗: ${err.message}`)),
          { timeout: 10000, enableHighAccuracy: true }
        );
      });

      const result = await apiFetch("/api/auth/checkin", {
        method: "POST",
        body: JSON.stringify({
          email: userEmail,
          latitude: position.latitude,
          longitude: position.longitude,
        }),
      });

      // Update coin count
      if (result?.user?.coin !== undefined) {
        setUserCoin(result.user.coin);
      }

      setSuccessMsg("出席しました! コイン +1");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleScheduleEdit = async (weekday: number, period: number) => {
    setEditingPeriod({ weekday, period });
    const existing = schedule.find((s) => s.weekday === weekday && s.period === period);
    if (existing) {
      setEditingSubject(existing.subject || "");
      setEditingRoom(existing.room || "");
    } else {
      setEditingSubject("");
      setEditingRoom("");
    }
  };

  const handleScheduleSave = async () => {
    if (!editingPeriod || !userHandle) return;

    try {
      setLoading(true);
      await apiFetch(`/api/schedule/${encodeURIComponent(userHandle)}`, {
        method: "POST",
        body: JSON.stringify({
          weekday: editingPeriod.weekday,
          period: editingPeriod.period,
          subject: editingSubject || null,
          room: editingRoom || null,
        }),
      });

      // Refresh schedule
      const scheduleData = await apiFetch(`/api/schedule/${encodeURIComponent(userHandle)}`);
      setSchedule(scheduleData?.data || []);

      setSuccessMsg("時間割を保存しました");
      setEditingPeriod(null);
      setEditingSubject("");
      setEditingRoom("");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleScheduleDelete = async (weekday: number, period: number) => {
    if (!userHandle) return;

    try {
      setLoading(true);
      await apiFetch(`/api/schedule/${encodeURIComponent(userHandle)}`, {
        method: "DELETE",
        body: JSON.stringify({ weekday, period }),
      });

      // Refresh schedule
      const scheduleData = await apiFetch(`/api/schedule/${encodeURIComponent(userHandle)}`);
      setSchedule(scheduleData?.data || []);

      setSuccessMsg("時間割を削除しました");
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

  const blueButtonStyle = {
    ...buttonStyle,
    backgroundColor: "#2196F3",
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
          <p>
            <strong>コイン:</strong> 🪙 {userCoin}
          </p>
        </div>

        {/* アクションボタン */}
        <div style={{ marginBottom: "20px" }}>
          <button
            onClick={() => router.push(`/reviews?handle=${encodeURIComponent(userHandle || "")}`)}
            style={buttonStyle}
          >
            授業レビューページ
          </button>

          <button
            onClick={() => router.push(`/circles?handle=${encodeURIComponent(userHandle || "")}`)}
            style={blueButtonStyle}
          >
            サークルレビューページ
          </button>

          <button
            onClick={() => router.push(`/matchmaking?handle=${encodeURIComponent(userHandle || "")}`)}
            style={buttonStyle}
          >
            マッチメイキングへ
          </button>

          <button
            onClick={handleCheckin}
            style={{ ...blueButtonStyle }}
            disabled={loading}
          >
            {loading ? "出席中..." : "🪙 出席"}
          </button>

          <button
            onClick={() => setShowPasswordChange(!showPasswordChange)}
            style={secondaryButtonStyle}
          >
            {showPasswordChange ? "キャンセル" : "パスワード変更"}
          </button>

          <button
            onClick={() => setShowHandleChange(!showHandleChange)}
            style={secondaryButtonStyle}
          >
            {showHandleChange ? "キャンセル" : "ハンドル変更"}
          </button>

          <button
            onClick={() => setShowScheduleEdit(!showScheduleEdit)}
            style={secondaryButtonStyle}
          >
            {showScheduleEdit ? "キャンセル" : "時間割編集"}
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

        {/* ハンドル変更フォーム */}
        {showHandleChange && (
          <div style={{ ...cardStyle, backgroundColor: "#fafafa", marginBottom: "20px" }}>
            <h3 style={{ marginBottom: "16px" }}>ハンドル変更</h3>

            <label style={labelStyle}>現在のハンドル</label>
            <input
              type="text"
              placeholder="現在のハンドル"
              value={userHandle || ""}
              style={inputStyle}
              disabled
              readOnly
            />

            <label style={labelStyle}>新しいハンドル（3文字以上、英数字・アンダースコア・ハイフン）</label>
            <input
              type="text"
              placeholder="新しいハンドル"
              value={newHandle}
              onChange={(e) => setNewHandle(e.target.value)}
              style={inputStyle}
              disabled={loading}
            />

            {err && <div style={errorStyle}>{err}</div>}
            {successMsg && <div style={successStyle}>{successMsg}</div>}

            <button
              onClick={handleUpdateHandle}
              style={buttonStyle}
              disabled={loading}
            >
              {loading ? "変更中..." : "変更"}
            </button>
          </div>
        )}

        {/* 時間割表示と編集 */}
        <div style={cardStyle}>
          <h3 style={{ marginBottom: "16px" }}>📚 時間割</h3>

          <div style={{ overflowX: "auto", marginBottom: "20px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: "#f0f0f0" }}>
                  <th style={{ border: "1px solid #ddd", padding: "8px" }}>時限</th>
                  {["日", "月", "火", "水", "木", "金", "土"].map((day, i) => (
                    <th key={i} style={{ border: "1px solid #ddd", padding: "8px" }}>
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5, 6, 7].map((period) => (
                  <tr key={period}>
                    <td style={{ border: "1px solid #ddd", padding: "8px", fontWeight: "bold" }}>
                      {period}限
                    </td>
                    {[0, 1, 2, 3, 4, 5, 6].map((weekday) => {
                      const entry = schedule.find((s) => s.weekday === weekday && s.period === period);
                      return (
                        <td
                          key={`${weekday}-${period}`}
                          style={{
                            border: "1px solid #ddd",
                            padding: "8px",
                            backgroundColor: entry ? "#E8F5E9" : "white",
                            cursor: "pointer",
                            textAlign: "center",
                            fontSize: "12px",
                          }}
                          onClick={() => handleScheduleEdit(weekday, period)}
                        >
                          {entry ? entry.subject : "-"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {showScheduleEdit && editingPeriod && (
            <div
              style={{
                backgroundColor: "#fafafa",
                padding: "16px",
                borderRadius: "4px",
                marginTop: "16px",
              }}
            >
              <h4>時間割編集</h4>
              <p style={{ fontSize: "12px", marginBottom: "8px" }}>
                {["日", "月", "火", "水", "木", "金", "土"][editingPeriod.weekday]} 曜日 {editingPeriod.period}限
              </p>

              <label style={labelStyle}>授業名</label>
              <input
                type="text"
                placeholder="授業名（例：データベース基礎）"
                value={editingSubject}
                onChange={(e) => setEditingSubject(e.target.value)}
                style={inputStyle}
              />

              <label style={labelStyle}>教室</label>
              <input
                type="text"
                placeholder="教室（例：A101）"
                value={editingRoom}
                onChange={(e) => setEditingRoom(e.target.value)}
                style={inputStyle}
              />

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={handleScheduleSave}
                  style={buttonStyle}
                  disabled={loading}
                >
                  {loading ? "保存中..." : "保存"}
                </button>
                {editingSubject && (
                  <button
                    onClick={() => handleScheduleDelete(editingPeriod.weekday, editingPeriod.period)}
                    style={{ ...secondaryButtonStyle, backgroundColor: "#f44336" }}
                    disabled={loading}
                  >
                    {loading ? "削除中..." : "削除"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
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
