"use client";

import Image from "next/image";
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
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h1>YNU MONSTERS (MVP)</h1>

      <div style={{ margin: "16px 0" }}>
        <Image src="/placeholder.png" alt="placeholder" width={720} height={240} style={{ width: "100%", height: "auto" }} />
      </div>

      <p>まずは handle を入力して開始（UIは後で整える）。</p>

      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
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
    </main>
  );
}