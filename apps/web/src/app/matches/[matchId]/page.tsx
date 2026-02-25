"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type Owned = {
    professor_key: string;
    level: number;
    exp: number;
    state_json: any;
    master: { key: string; name: string; type: string; hp: number; atk: number; def: number; spd: number } | null;
};

type BattleState = {
    battleId: string;
    status: "in_progress" | "completed";
    currentTurn: number;
    currentTurnSide: "p1" | "p2";
    roundNumber: number;
    p1Team: any[];
    p2Team: any[];
    p1ActiveIndex: number;
    p2ActiveIndex: number;
    turns: any[];
};

export default function MatchPage() {
    const params = useParams<{ matchId: string }>();
    const sp = useSearchParams();
    const router = useRouter();
    const matchId = params.matchId;
    const handle = sp.get("handle") ?? "";

    // 教授選択フェーズ
    const [owned, setOwned] = useState<Owned[]>([]);
    const [p1Keys, setP1Keys] = useState<string[]>([]);
    const [matchData, setMatchData] = useState<any>(null);
    const [err, setErr] = useState<string | null>(null);
    const [isStartingBattle, setIsStartingBattle] = useState(false);
    const [battleCompleted, setBattleCompleted] = useState(false);

    // バトルフェーズ
    const [battleId, setBattleId] = useState<string | null>(null);
    const [battleState, setBattleState] = useState<BattleState | null>(null);
    const [isPolling, setIsPolling] = useState(false);
    const [selectedAttackTarget, setSelectedAttackTarget] = useState<number | null>(null);
    const [selectedSwitchTarget, setSelectedSwitchTarget] = useState<number | null>(null);

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

    // バトル状態ポーリング
    useEffect(() => {
        if (!isPolling || !battleId) return;

        const poll = async () => {
            try {
                const state = await apiFetch(`/api/battles/${battleId}`);
                setBattleState(state);
                if (state.status === "completed") {
                    setIsPolling(false);
                    // 結果ページに遷移
                    const p1Idx = state.p1Team.findIndex((p: any) => p.cur_hp > 0);
                    const p2Idx = state.p2Team.findIndex((p: any) => p.cur_hp > 0);

                    // 自分が勝ったか確認
                    const isP1 = matchData?.players?.p1?.handle === handle;
                    const isWinner = isP1 ? p1Idx >= 0 && p2Idx < 0 : p2Idx >= 0 && p1Idx < 0;

                    if (isWinner) {
                        router.push(`/win?matchId=${matchId}`);
                    } else {
                        router.push(`/lose?matchId=${matchId}`);
                    }
                }
            } catch (e: any) {
                setErr(`ポーリング失敗: ${e?.message ?? String(e)}`);
                console.error("Polling error:", e);
            }
        };

        const interval = setInterval(poll, 2000);
        poll(); // 初回実行

        return () => clearInterval(interval);
    }, [isPolling, battleId, matchData, handle, matchId, router]);

    const toggle = (k: string) => {
        setP1Keys((prev) => {
            if (prev.includes(k)) return prev.filter((x) => x !== k);
            if (prev.length >= 3) return prev;
            return [...prev, k];
        });
    };

    const startBattle = async () => {
        setErr(null);
        setBattleState(null);
        setIsStartingBattle(true);
        try {
            if (!handle) throw new Error("handle がありません");
            if (p1Keys.length !== 3) throw new Error("自分チームは3体選んでください");

            // 自分がP1か P2かを判定
            const isP1 = matchData?.players?.p1?.handle === handle;
            if (matchData?.players?.p1?.handle === undefined || matchData?.players?.p2?.handle === undefined) {
                throw new Error("マッチ情報が不完全です");
            }

            // 相手のhandleを取得
            const opponentHandle = isP1 ? matchData.players.p2.handle : matchData.players.p1.handle;

            // 相手の所持教授を取得
            const opponentOwned = await apiFetch(`/api/users/${encodeURIComponent(opponentHandle)}/owned-professors`);
            const opponentAvailableKeys = (opponentOwned.data ?? []).map((o: Owned) => o.professor_key);

            if (opponentAvailableKeys.length < 3) {
                throw new Error("相手プレイヤーの教授が3体以上ありません");
            }

            const shuffled = [...opponentAvailableKeys].sort(() => Math.random() - 0.5);
            const opponentKeys = shuffled.slice(0, 3);

            // P1/P2に応じてキーを割り当て
            const p1TeamKeys = isP1 ? p1Keys : opponentKeys;
            const p2TeamKeys = isP1 ? opponentKeys : p1Keys;

            // バトル初期化
            const result = await apiFetch(`/api/matches/${matchId}/battle`, {
                method: "POST",
                body: JSON.stringify({
                    p1_team_keys: p1TeamKeys,
                    p2_team_keys: p2TeamKeys,
                }),
            });

            setBattleId(result.battleId);
            setIsPolling(true);
        } catch (e: any) {
            const errMsg = e?.message ?? String(e);
            setErr(errMsg);
            // バトルが既に完了している場合は専用フラグを立てる
            if (errMsg.includes("already been completed")) {
                setBattleCompleted(true);
            }
            setIsStartingBattle(false);
        }
    };

    const nextTurn = async (action: "attack" | "switch", targetIndex: number | null) => {
        if (!battleId) return;
        setErr(null);
        try {
            if (targetIndex === null) {
                setErr(`${action === "attack" ? "攻撃" : "交替"}対象を選んでください`);
                return;
            }

            const result = await apiFetch(`/api/battles/${battleId}/next-turn`, {
                method: "POST",
                body: JSON.stringify({ action, target_index: targetIndex }),
            });

            // ターン完了後に選択をリセット
            setSelectedAttackTarget(null);
            setSelectedSwitchTarget(null);

            if (result.status === "completed") {
                setIsPolling(false);
                // 結果ページに遷移
                const p1Idx = battleState?.p1Team.findIndex((p: any) => p.cur_hp > 0);
                const p2Idx = battleState?.p2Team.findIndex((p: any) => p.cur_hp > 0);

                const isP1 = matchData?.players?.p1?.handle === handle;
                const isWinner = isP1 ? p1Idx >= 0 && p2Idx < 0 : p2Idx >= 0 && p1Idx < 0;

                if (isWinner) {
                    router.push(`/win?matchId=${matchId}`);
                } else {
                    router.push(`/lose?matchId=${matchId}`);
                }
            }
        } catch (e: any) {
            setErr(e?.message ?? String(e));
        }
    };

    // バトル前：教授選択画面
    if (!battleId) {
        // バトル完了済みの場合
        if (battleCompleted) {
            return (
                <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
                    <h1>Battle Already Completed</h1>
                    <p style={{ fontSize: 18, marginBottom: 24 }}>
                        このマッチはバトル完了済みです。新しくマッチメイキングしてください。
                    </p>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button
                            onClick={() => router.push(`/matchmaking?handle=${encodeURIComponent(handle)}`)}
                            style={{ padding: 12, fontSize: 16, backgroundColor: "#007bff", color: "white", border: "none", borderRadius: 5, cursor: "pointer" }}
                        >
                            新しくマッチメイキング
                        </button>
                        <button
                            onClick={() => router.push("/")}
                            style={{ padding: 12, fontSize: 16, backgroundColor: "#6c757d", color: "white", border: "none", borderRadius: 5, cursor: "pointer" }}
                        >
                            ホームに戻る
                        </button>
                    </div>
                </main>
            );
        }

        return (
            <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
                <h1>Match</h1>
                <p>matchId: <b>{matchId}</b></p>
                <p>handle: <b>{handle || "(none)"}</b></p>

                {err && <div style={{ color: "crimson" }}>{err}</div>}

                <h2>match data</h2>
                <pre style={{ background: "#111", color: "#0f0", padding: 12, overflowX: "auto", fontSize: 12 }}>
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

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button
                        onClick={startBattle}
                        disabled={isStartingBattle}
                        style={{ padding: 10, fontSize: 16, opacity: isStartingBattle ? 0.5 : 1, cursor: isStartingBattle ? "not-allowed" : "pointer" }}
                    >
                        {isStartingBattle ? "battle start中..." : "battle start"}
                    </button>
                    <button onClick={load} style={{ padding: 10 }}>reload</button>
                </div>
            </main>
        );
    }

    // バトル中：ターン制画面
    return (
        <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
            <h1>Battle in Progress</h1>
            <p>battleId: <b>{battleId}</b></p>
            <p>Round: <b>{battleState?.roundNumber ?? 1}</b> | Current Turn Side: <b>{battleState?.currentTurnSide === "p1" ? "P1" : "P2"}</b></p>
            <p>Status: <b>{battleState?.status ?? "loading"}</b></p>
            <p style={{ fontSize: 12, color: "#666 " }}>【DEBUG】currentTurnSide: {battleState?.currentTurnSide}, P1: {matchData?.players?.p1?.handle}, P2: {matchData?.players?.p2?.handle}, handle: {handle}</p>

            {err && <div style={{ color: "crimson", marginBottom: 16 }}>{err}</div>}

            {battleState && (
                <>
                    <h2>Team Status</h2>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                        {/* P1 Team */}
                        <div style={{ border: "1px solid blue", padding: 12 }}>
                            <h3>P1 Team</h3>
                            {battleState.p1Team.map((prof, idx) => (
                                <div
                                    key={idx}
                                    style={{
                                        marginBottom: 8,
                                        padding: 8,
                                        background: idx === battleState.p1ActiveIndex ? "#e3f2fd" : "#f5f5f5",
                                        borderRadius: 4,
                                        opacity: prof.cur_hp <= 0 ? 0.5 : 1,
                                    }}
                                >
                                    <div style={{ fontWeight: 700 }}>{prof.key}</div>
                                    <div>HP: {prof.cur_hp}/{prof.hp}</div>
                                    {prof.cur_hp <= 0 && <div style={{ color: "red" }}>FAINTED</div>}
                                </div>
                            ))}
                        </div>

                        {/* P2 Team */}
                        <div style={{ border: "1px solid red", padding: 12 }}>
                            <h3>P2 Team</h3>
                            {battleState.p2Team.map((prof, idx) => (
                                <div
                                    key={idx}
                                    style={{
                                        marginBottom: 8,
                                        padding: 8,
                                        background: idx === battleState.p2ActiveIndex ? "#ffebee" : "#f5f5f5",
                                        borderRadius: 4,
                                        opacity: prof.cur_hp <= 0 ? 0.5 : 1,
                                    }}
                                >
                                    <div style={{ fontWeight: 700 }}>{prof.key}</div>
                                    <div>HP: {prof.cur_hp}/{prof.hp}</div>
                                    {prof.cur_hp <= 0 && <div style={{ color: "red" }}>FAINTED</div>}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 攻撃・交替選択（自分のターンのみ） */}
                    {battleState.status === "in_progress" && (
                        <div style={{ background: "#f0f0f0", padding: 12, marginBottom: 16, borderRadius: 4 }}>
                            {(() => {
                                const isP1 = matchData?.players?.p1?.handle === handle;
                                const isMyTurn = (isP1 && battleState.currentTurnSide === "p1") ||
                                    (!isP1 && battleState.currentTurnSide === "p2");
                                const myTeam = isP1 ? battleState.p1Team : battleState.p2Team;
                                const opponentTeam = isP1 ? battleState.p2Team : battleState.p1Team;

                                if (!isMyTurn) {
                                    return <p style={{ fontStyle: "italic", color: "#666" }}>相手のターンです...</p>;
                                }

                                return (
                                    <>
                                        <h3>アクション選択</h3>

                                        <h4 style={{ marginTop: 12, color: "#ff6b6b" }}>🔴 攻撃: 相手の教授を選びます</h4>
                                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, padding: 12, background: "#fff5f5", borderRadius: 4 }}>
                                            {opponentTeam.map((prof, idx) => (
                                                <button
                                                    key={`attack-${idx}`}
                                                    onClick={() => {
                                                        console.log("Attack target clicked:", idx);
                                                        setSelectedAttackTarget(idx);
                                                    }}
                                                    disabled={prof.cur_hp <= 0}
                                                    style={{
                                                        padding: 10,
                                                        background: selectedAttackTarget === idx ? "#ff6b6b" : "#ffd0d0",
                                                        color: selectedAttackTarget === idx ? "white" : "black",
                                                        border: selectedAttackTarget === idx ? "2px solid #cc0000" : "1px solid #999",
                                                        borderRadius: 4,
                                                        cursor: prof.cur_hp <= 0 ? "not-allowed" : "pointer",
                                                        opacity: prof.cur_hp <= 0 ? 0.5 : 1,
                                                        fontSize: 14,
                                                        fontWeight: selectedAttackTarget === idx ? "bold" : "normal",
                                                    }}
                                                >
                                                    {prof.key} (HP {prof.cur_hp}/{prof.hp})
                                                </button>
                                            ))}
                                        </div>

                                        <h4 style={{ marginTop: 12, color: "#4caf50" }}>🔄 交替: 自分の教授を選びます（任意）</h4>
                                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, padding: 12, background: "#f0fdf4", borderRadius: 4 }}>
                                            {myTeam.map((prof, idx) => {
                                                const myActiveIdx = isP1 ? battleState.p1ActiveIndex : battleState.p2ActiveIndex;
                                                const isActive = idx === myActiveIdx;
                                                const isFainted = prof.cur_hp <= 0;
                                                const canSwitch = !isFainted && !isActive;

                                                return (
                                                    <button
                                                        key={`switch-${idx}`}
                                                        onClick={() => {
                                                            console.log("Switch target clicked:", idx);
                                                            setSelectedSwitchTarget(idx);
                                                        }}
                                                        disabled={!canSwitch}
                                                        style={{
                                                            padding: 10,
                                                            background: selectedSwitchTarget === idx ? "#4caf50" : "#c8e6c9",
                                                            color: selectedSwitchTarget === idx ? "white" : "black",
                                                            border: selectedSwitchTarget === idx ? "2px solid #2e7d32" : "1px solid #999",
                                                            borderRadius: 4,
                                                            cursor: canSwitch ? "pointer" : "not-allowed",
                                                            opacity: canSwitch ? 1 : 0.5,
                                                            fontSize: 14,
                                                            fontWeight: selectedSwitchTarget === idx ? "bold" : "normal",
                                                        }}
                                                    >
                                                        {prof.key} (HP {prof.cur_hp}/{prof.hp}){isActive && " ★"}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                                            <button
                                                onClick={() => {
                                                    console.log("Attack button clicked, target:", selectedAttackTarget);
                                                    nextTurn("attack", selectedAttackTarget);
                                                }}
                                                disabled={selectedAttackTarget === null}
                                                style={{
                                                    padding: 12,
                                                    fontSize: 16,
                                                    fontWeight: "bold",
                                                    backgroundColor: selectedAttackTarget === null ? "#ccc" : "#ff6b6b",
                                                    color: "white",
                                                    border: "none",
                                                    borderRadius: 4,
                                                    cursor: selectedAttackTarget === null ? "not-allowed" : "pointer",
                                                    flex: 1,
                                                }}
                                            >
                                                🔴 攻撃 {selectedAttackTarget !== null && `(${opponentTeam[selectedAttackTarget]?.key})`}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    console.log("Switch button clicked, target:", selectedSwitchTarget);
                                                    nextTurn("switch", selectedSwitchTarget);
                                                }}
                                                disabled={selectedSwitchTarget === null}
                                                style={{
                                                    padding: 12,
                                                    fontSize: 16,
                                                    fontWeight: "bold",
                                                    backgroundColor: selectedSwitchTarget === null ? "#ccc" : "#4caf50",
                                                    color: "white",
                                                    border: "none",
                                                    borderRadius: 4,
                                                    cursor: selectedSwitchTarget === null ? "not-allowed" : "pointer",
                                                    flex: 1,
                                                }}
                                            >
                                                🔄 交替 {selectedSwitchTarget !== null && `(${myTeam[selectedSwitchTarget]?.key})`}
                                            </button>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    )}
                    <div style={{ background: "#f7f7f7", padding: 12, maxHeight: 300, overflowY: "auto" }}>
                        {battleState.turns.length === 0 ? (
                            <p style={{ opacity: 0.6 }}>バトル開始。攻撃先を選んでターンボタンを押してください。</p>
                        ) : (
                            battleState.turns.map((turn, i) => (
                                <div key={i} style={{ marginBottom: 8, fontSize: 14 }}>
                                    <span style={{ fontWeight: 700 }}>Turn {turn.turn_number}:</span>{" "}
                                    {turn.attacker_key} → {turn.defender_key} ({turn.damage_dealt} damage)
                                    {turn.event === "faint" && " [FAINT]"}
                                </div>
                            ))
                        )}
                    </div>

                    {battleState.status === "completed" && (
                        <div style={{ fontSize: 16, fontWeight: 700, color: "green", marginTop: 12 }}>
                            バトル終了！
                        </div>
                    )}
                </>
            )}

            {!battleState && <p>バトル状態読み込み中...</p>}
        </main>
    );
}