"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

type QueueRow = { id: string; user_id: string; mode: string; queued_at: string };
type MatchRow = { id: string; p1_user_id: string; p2_user_id: string; status: string; created_at: string };

export default function MatchmakingPage() {
    const sp = useSearchParams();
    const router = useRouter();
    const handle = sp.get("handle") ?? "";
    const mode = useMemo(() => sp.get("mode") ?? "casual", [sp]);

    const [status, setStatus] = useState<{
        queued: boolean;
        queue: QueueRow | null;
        latest_match: MatchRow | null;
    } | null>(null);

    const [err, setErr] = useState<string | null>(null);

    const refresh = async () => {
        if (!handle) return;
        try {
            const s = await apiFetch(`/api/matchmaking/status/${encodeURIComponent(handle)}`);
            setStatus(s);
        } catch (e: any) {
            setErr(e?.message ?? String(e));
        }
    };

    const join = async () => {
        setErr(null);
        try {
            const r = await apiFetch<any>("/api/matchmaking/join", {
                method: "POST",
                body: JSON.stringify({ handle, mode }),
            });

            // matched なら即遷移
            if (r?.matched && r?.match?.id) {
                router.push(`/matches/${r.match.id}?handle=${encodeURIComponent(handle)}`);
                return;
            }
            await refresh();
        } catch (e: any) {
            setErr(e?.message ?? String(e));
        }
    };

    const leave = async () => {
        setErr(null);
        try {
            await apiFetch("/api/matchmaking/leave", {
                method: "POST",
                body: JSON.stringify({ handle }),
            });
            await refresh();
        } catch (e: any) {
            setErr(e?.message ?? String(e));
        }
    };

    // ポーリング（queued中だけ）
    useEffect(() => {
        refresh();
        const t = setInterval(() => {
            if (status?.queued) refresh();
        }, 2000);
        return () => clearInterval(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [handle, status?.queued]);

    // status.latest_match が created で、自分が queued じゃなければ遷移
    useEffect(() => {
        const m = status?.latest_match;
        if (!m) return;
        if (m.status === "created" && !status?.queued) {
            router.push(`/matches/${m.id}?handle=${encodeURIComponent(handle)}`);
        }
    }, [status, handle, router]);

    if (!handle) {
        return (
            <main style={{ padding: 24 }}>
                <h1>matchmaking</h1>
                <p>handle がありません。トップに戻って入力してください。</p>
            </main>
        );
    }

    return (
        <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
            <h1>matchmaking</h1>
            <p>handle: <b>{handle}</b> / mode: <b>{mode}</b></p>

            <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
                <button onClick={join} style={{ padding: 10 }}>join</button>
                <button onClick={leave} style={{ padding: 10 }}>leave</button>
                <button onClick={refresh} style={{ padding: 10 }}>refresh</button>
            </div>

            {err && <div style={{ color: "crimson" }}>{err}</div>}

            <pre style={{ background: "#111", color: "#0f0", padding: 12, overflowX: "auto" }}>
                {JSON.stringify(status, null, 2)}
            </pre>

            <p style={{ opacity: 0.8 }}>
                queued=true の間は2秒ごとに status を更新する。match ができたら自動で対戦ページへ遷移する。
            </p>
        </main>
    );
}