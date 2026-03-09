"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

type Step = "home" | "signup" | "set-handle" | "login";

export default function HomePage() {
  const [step, setStep] = useState<Step>("home");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const handleSignup = async () => {
    setErr(null);
    setLoading(true);
    try {
      const e = email.trim();
      const p = password.trim();

      if (!e) throw new Error("メールアドレスを入力してください");
      if (!e.endsWith("@ynu.jp")) throw new Error("@ynu.jp のメールアドレスを使用してください");
      if (!p || p.length < 8) throw new Error("パスワードは8文字以上で入力してください");

      await apiFetch("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email: e, password: p }),
      });

      setStep("set-handle");
      setErr(null);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setErr(null);
    setLoading(true);
    try {
      const e = email.trim();
      const p = password.trim();

      if (!e) throw new Error("メールアドレスを入力してください");
      if (!p) throw new Error("パスワードを入力してください");

      const response = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: e, password: p }),
      });

      const userHandle = response?.data?.handle;
      
      if (!userHandle) throw new Error("ハンドル情報が見つかりません");

      // セッション保存
      localStorage.setItem("userEmail", e);
      localStorage.setItem("userHandle", userHandle);
      // ホーム画面に遷移
      router.push("/home");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSetHandle = async () => {
    setErr(null);
    setLoading(true);
    try {
      const h = handle.trim();
      if (!h) throw new Error("ハンドルネームを入力してください");
      if (h.length < 3) throw new Error("ハンドルネームは3文字以上です");

      await apiFetch("/api/auth/set-handle", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), handle: h }),
      });

      // セッション保存して /home へ遷移
      localStorage.setItem("userEmail", email.trim());
      localStorage.setItem("userHandle", h);
      router.push("/home");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const containerStyle = {
    padding: 24,
    width: "100%",
    margin: "0 auto",
    backgroundImage: "url(/home.png)",
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundAttachment: "fixed",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "center",
    alignItems: "center",
  };

  const cardStyle = {
    background: "rgba(255, 255, 255, 0.08)",
    backdropFilter: "blur(10px)",
    borderRadius: "12px",
    padding: "40px",
    maxWidth: "400px",
    width: "100%",
    boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.37)",
    border: "1px solid rgba(255, 255, 255, 0.18)",
  };

  const titleStyle = {
    textAlign: "center" as const,
    color: "#fff",
    marginBottom: "24px",
    fontSize: "28px",
    fontWeight: "bold" as const,
  };

  const inputStyle = {
    padding: "10px",
    fontSize: "16px",
    borderRadius: "4px",
    border: "1px solid #ccc",
    width: "100%",
    boxSizing: "border-box" as const,
  };

  const buttonStyle = {
    padding: "10px",
    fontSize: "16px",
    borderRadius: "4px",
    border: "none",
    background: "#4CAF50",
    color: "white",
    cursor: "pointer",
    fontWeight: "bold" as const,
    width: "100%",
  };

  const smallButtonStyle = {
    ...buttonStyle,
    background: "#666",
    fontSize: "14px",
  };

  const errorStyle = {
    color: "#ff6b6b",
    fontSize: "14px",
    marginTop: "8px",
  };

  const layoutStyle = {
    display: "grid",
    gap: "8px" as const,
  };

  return (
    <main style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>YNU MONSTERS</h1>

        {/* ホーム画面 */}
        {step === "home" && (
          <div style={layoutStyle}>
            <p style={{ color: "white", textAlign: "center", marginBottom: "20px" }}>
              ようこそ。YNU MONSTERSのゲームを楽しみましょう
            </p>
            <button
              onClick={() => {
                setStep("login");
                setEmail("");
                setPassword("");
                setErr(null);
              }}
              style={buttonStyle}
            >
              ログイン
            </button>
            <button
              onClick={() => {
                setStep("signup");
                setEmail("");
                setPassword("");
                setErr(null);
              }}
              style={buttonStyle}
            >
              サインアップ
            </button>
          </div>
        )}

        {/* ユーザーホーム画面 */}
        {step === "user-home" && (
          <div style={layoutStyle}>
            <div style={{ color: "white", fontSize: "14px", marginBottom: "16px" }}>
              <p><strong>メール:</strong> {userEmail}</p>
              <p><strong>ハンドル:</strong> {userHandle}</p>
            </div>

            <button
              onClick={() => setStep("change-password")}
              style={buttonStyle}
            >
              パスワード変更
            </button>

            <button
              onClick={() => router.push(`/matchmaking?handle=${encodeURIComponent(userHandle || "")}`)}
              style={buttonStyle}
            >
              マッチメイキングへ
            </button>

            <button
              onClick={handleLogout}
              style={smallButtonStyle}
            >
              ログアウト
            </button>
          </div>
        )}

        {/* パスワード変更画面 */}
        {step === "change-password" && (
          <div style={layoutStyle}>
            <p style={{ color: "white", textAlign: "center", marginBottom: "16px", fontSize: "18px", fontWeight: "bold" }}>
              パスワード変更
            </p>

            <label style={{ color: "white", fontSize: "14px", marginTop: "8px" }}>
              現在のパスワード
            </label>
            <input
              type="password"
              placeholder="現在のパスワード"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              style={inputStyle}
              disabled={loading}
            />

            <label style={{ color: "white", fontSize: "14px", marginTop: "8px" }}>
              新しいパスワード（8文字以上）
            </label>
            <input
              type="password"
              placeholder="新しいパスワード"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={inputStyle}
              disabled={loading}
            />

            <label style={{ color: "white", fontSize: "14px", marginTop: "8px" }}>
              新しいパスワード（確認）
            </label>
            <input
              type="password"
              placeholder="新しいパスワード（確認）"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={inputStyle}
              disabled={loading}
            />

            <button
              onClick={handleChangePassword}
              style={buttonStyle}
              disabled={loading}
            >
              {loading ? "変更中..." : "変更"}
            </button>

            <button
              onClick={() => {
                setStep("user-home");
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
                setErr(null);
              }}
              style={smallButtonStyle}
              disabled={loading}
            >
              戻る
            </button>

            {err && <div style={errorStyle}>{err}</div>}
          </div>
        )}

        {/* ログイン画面 */}
        {step === "login" && (
          <div style={layoutStyle}>
            <p style={{ color: "white", textAlign: "center", marginBottom: "16px", fontSize: "18px", fontWeight: "bold" }}>
              ログイン
            </p>

            <label style={{ color: "white", fontSize: "14px", marginTop: "8px" }}>
              メールアドレス
            </label>
            <input
              type="email"
              placeholder="example@ynu.jp"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              disabled={loading}
            />

            <label style={{ color: "white", fontSize: "14px", marginTop: "8px" }}>
              パスワード
            </label>
            <input
              type="password"
              placeholder="パスワードを入力"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              disabled={loading}
            />

            <button
              onClick={handleLogin}
              style={buttonStyle}
              disabled={loading}
            >
              {loading ? "ログイン中..." : "ログイン"}
            </button>

            <button
              onClick={() => {
                setStep("home");
                setEmail("");
                setPassword("");
                setErr(null);
              }}
              style={smallButtonStyle}
              disabled={loading}
            >
              戻る
            </button>

            {err && <div style={errorStyle}>{err}</div>}
          </div>
        )}

        {/* サインアップ画面（メール・パスワード） */}
        {step === "signup" && (
          <div style={layoutStyle}>
            <label style={{ color: "white", fontSize: "14px", marginTop: "8px" }}>
              メールアドレス (@ynu.jp)
            </label>
            <input
              type="email"
              placeholder="example@ynu.jp"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              disabled={loading}
            />

            <label style={{ color: "white", fontSize: "14px", marginTop: "8px" }}>
              パスワード（8文字以上）
            </label>
            <input
              type="password"
              placeholder="パスワードを入力"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              disabled={loading}
            />

            <button
              onClick={handleSignup}
              style={buttonStyle}
              disabled={loading}
            >
              {loading ? "登録中..." : "登録"}
            </button>

            <button
              onClick={() => {
                setStep("home");
                setErr(null);
              }}
              style={smallButtonStyle}
              disabled={loading}
            >
              戻る
            </button>

            {err && <div style={errorStyle}>{err}</div>}
          </div>
        )}

        {/* ハンドル設定画面 */}
        {step === "set-handle" && (
          <div style={layoutStyle}>
            <p style={{ color: "white", textAlign: "center", marginBottom: "16px" }}>
              ハンドルネームを決めてください
            </p>

            <label style={{ color: "white", fontSize: "14px", marginTop: "8px" }}>
              ハンドルネーム（3文字以上）
            </label>
            <input
              type="text"
              placeholder="例: shun"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              style={inputStyle}
              disabled={loading}
            />

            <button
              onClick={handleSetHandle}
              style={buttonStyle}
              disabled={loading}
            >
              {loading ? "設定中..." : "確定"}
            </button>

            <button
              onClick={() => {
                setStep("signup");
                setHandle("");
                setErr(null);
              }}
              style={smallButtonStyle}
              disabled={loading}
            >
              戻る
            </button>

            {err && <div style={errorStyle}>{err}</div>}
          </div>
        )}
      </div>
    </main>
  );
}