"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

type Owned = {
    professor_key: string;
    level: number;
    exp: number;
    state_json: any;
    master: { key: string; name: string; type: string; hp: number; atk: number; def: number; spd: number } | null;
};

export default function MatchPage() {
    const params = useParams<{ matchId: string }>();
    const sp = useSearchParams();
    const matchId = params.matchId;
    const handle = sp.get("handle") ?? "";

    const [owned, setOwned] = useState<Owned[]>([]);
    const [p1Keys, setP1Keys] = useState<string[]>([]);
    const [p2KeysText, setP2KeysText] = useState("prof_3,prof_4,prof_5"); // MVP: 相手は手入力でOK
    const [result, setResult] = useState<any>(null);
    const [matchData, setMatchData] = useState<any>(null);
    const [err, setErr] = useState<string | null>(null);

    const p2Keys = useMemo(
        () => p2KeysText.split(",").map((s) => s.trim()).filter(Boolean),
        [p2KeysText]
    );

    const load = async () => {
        setErr(null);
        try {
            const md = await apiFetch(`/api/matches/${matchId}`);
            setMatchData(md);

            if (handle) {
                const o = await apiFetch(`/api/users/${encodeURIComponent(handle)}/owned-professors`);
                setOwned(o.data ?? []);
            }
        } catch (e: any) {
            setErr(e?.message ?? String(e));
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [matchId, handle]);

    const toggle = (k: string) => {
        setP1Keys((prev) => {
            if (prev.includes(k)) return prev.filter((x) => x !== k);
            if (prev.length >= 3) return prev; // 3体固定
            return [...prev, k];
        });
    };

    const battle = async () => {
        setErr(null);
        setResult(null);
        try {
            if (!handle) throw new Error("handle がありません（/matchmaking から遷移してください）");
            if (p1Keys.length !== 3) throw new Error("自分チームは3体選んでください");
            if (p2Keys.length !== 3) throw new Error("相手チームは3体（カンマ区切り）で入力してください");

            const r = await apiFetch(`/api/matches/${matchId}/battle`, {
                method: "POST",
                body: JSON.stringify({
                    p1_team_keys: p1Keys,
                    p2_team_keys: p2Keys,
                }),
            });

            setResult(r);
            await load(); // 最新状態も更新
        } catch (e: any) {
            setErr(e?.message ?? String(e));
        }
    };

    return (
        <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
            <h1>Match</h1>
            <p>matchId: <b>{matchId}</b></p>
            <p>handle: <b>{handle || "(none)"}</b></p>

            {err && <div style={{ color: "crimson" }}>{err}</div>}

            <h2>match data</h2>
            <pre style={{ background: "#111", color: "#0f0", padding: 12, overflowX: "auto" }}>
                {JSON.stringify(matchData, null, 2)}
            </pre>

            <h2>自分の所持教授（3体選択）</h2>
            {!handle && <p>※ handle 付きで遷移していないので所持教授が取れない。</p>}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                {owned.map((o) => {
                    const k = o.professor_key;
                    const m = o.master;
                    const checked = p1Keys.includes(k);
                    return (
                        <label key={k} style={{ border: "1px solid #ddd", padding: 10, borderRadius: 8 }}>
                            <input type="checkbox" checked={checked} onChange={() => toggle(k)} />
                            <span style={{ marginLeft: 8 }}>
                                <b>{k}</b> {m ? `(${m.name}/${m.type})` : ""}
                            </span>
                        </label>
                    );
                })}
            </div>

            <p>選択中: {p1Keys.join(", ") || "(none)"}</p>

            <h2>相手チーム（暫定：キーをカンマ区切りで入力）</h2>
            <input
                value={p2KeysText}
                onChange={(e) => setP2KeysText(e.target.value)}
                style={{ width: "100%", padding: 10, fontSize: 16 }}
                placeholder="例: prof_3,prof_4,prof_5"
            />

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={battle} style={{ padding: 10 }}>battle</button>
                <button onClick={load} style={{ padding: 10 }}>reload</button>
            </div>

            <h2>result</h2>
            <pre style={{ background: "#111", color: "#0f0", padding: 12, overflowX: "auto" }}>
                {JSON.stringify(result, null, 2)}
            </pre>

            {result?.result?.summary_json?.log && (
                <>
                    <h3>battle log (text)</h3>
                    <div style={{ whiteSpace: "pre-wrap", background: "#f7f7f7", padding: 12 }}>
                        {result.result.summary_json.log.map((x: any, i: number) => {
                            if (x.event === "faint") return `${i + 1}. [${x.side}] ${x.key} faint\n`;
                            return `${i + 1}. ${x.attacker} -> ${x.defender} dmg=${x.damage} defender_hp=${x.defender_hp}\n`;
                        })}
                    </div>
                </>
            )}
        </main>
    );
}