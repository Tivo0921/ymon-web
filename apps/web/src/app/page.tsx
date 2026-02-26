"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

export default function HomePage() {
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  const submit = async () => {
    setErr(null);
    const h = handle.trim();
    if (!h) return setErr("handle を入力してください");

    try {
      await apiFetch("/api/users", {
        method: "POST",
        body: JSON.stringify({ handle: h, display_name: displayName || h }),
      });
      router.push(`/matchmaking?handle=${encodeURIComponent(h)}`);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  };

  return (
    <main style={{
      padding: 24,
      width: '100%',
      margin: "0 auto",
      backgroundImage: 'url(/wallpaper.png)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center'
    }}>
      <div style={{
        background: 'rgba(255, 255, 255, 0.15)',
        backdropFilter: 'blur(10px)',
        borderRadius: '12px',
        padding: '40px',
        maxWidth: '400px',
        width: '100%',
        boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
        border: '1px solid rgba(255, 255, 255, 0.18)'
      }}>
        <h1 style={{ textAlign: 'center', color: '#fff', marginBottom: '24px' }}>YNU MONSTERS</h1>

        <div style={{ display: "grid", gap: 8 }}>
          <input
            placeholder="handle (例: shun)"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            style={{ padding: 10, fontSize: 16 }}
          />
          <input
            placeholder="display name (任意)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={{ padding: 10, fontSize: 16 }}
          />
          <button onClick={submit} style={{ padding: 10, fontSize: 16 }}>
            参加する
          </button>
          {err && <div style={{ color: "crimson" }}>{err}</div>}
        </div>
      </div>
    </main>
  );
}