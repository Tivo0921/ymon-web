"use client";

import { useEffect, useState } from "react";

type User = { id: string; handle: string; display_name: string | null };
type Owned = { professor_key: string; level: number; exp: number; state_json: any };

export default function Playground() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

  const [handle, setHandle] = useState("haruto1");
  const [displayName, setDisplayName] = useState("Haruto");
  const [user, setUser] = useState<User | null>(null);
  const [owned, setOwned] = useState<Owned[] | null>(null);
  const [profKey, setProfKey] = useState("prof_0");
  const [err, setErr] = useState<string | null>(null);

  const refreshOwned = async (h: string) => {
    const r = await fetch(`${base}/api/users/${encodeURIComponent(h)}/professors`);
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? "failed");
    setOwned(j.data ?? []);
  };

  const createOrGet = async () => {
    setErr(null);
    try {
      const r = await fetch(`${base}/api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle, display_name: displayName }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "failed");
      setUser(j.data);
      await refreshOwned(handle);
    } catch (e: any) {
      setErr(e.message ?? String(e));
    }
  };

  const addProfessor = async () => {
    if (!user) return;
    setErr(null);
    try {
      const r = await fetch(`${base}/api/users/${encodeURIComponent(handle)}/professors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professor_key: profKey, level: 1, exp: 0, state_json: {} }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "failed");
      await refreshOwned(handle);
    } catch (e: any) {
      setErr(e.message ?? String(e));
    }
  };

  useEffect(() => {
    // 初回は何もしない
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: "ui-sans-serif, system-ui" }}>
      <h1>Playground</h1>

      <section style={{ marginTop: 12 }}>
        <h2>Create/Get User</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="handle" />
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="display name" />
          <button onClick={createOrGet}>Create / Get</button>
        </div>
      </section>

      <section style={{ marginTop: 12 }}>
        <h2>Add Professor</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={profKey} onChange={(e) => setProfKey(e.target.value)} placeholder="prof_0" />
          <button onClick={addProfessor} disabled={!user}>Add</button>
        </div>
      </section>

      {err && <pre style={{ marginTop: 12, color: "crimson" }}>{err}</pre>}

      <section style={{ marginTop: 12 }}>
        <h2>User</h2>
        <pre>{JSON.stringify(user, null, 2)}</pre>
      </section>

      <section style={{ marginTop: 12 }}>
        <h2>Owned Professors</h2>
        <pre>{JSON.stringify(owned, null, 2)}</pre>
      </section>
    </main>
  );
}