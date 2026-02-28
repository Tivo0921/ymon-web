"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

type LobbyPlayer = {
    user_id: string;
    user: { id: string; handle: string; display_name: string; created_at: string } | null;
    mode: string;
    queued_at: string;
};

type MatchRow = { id: string; p1_user_id: string; p2_user_id: string; status: string; created_at: string };

type Invitation = {
    invitation_id: string;
    inviter: { id: string; handle: string; display_name: string } | null;
    status: string;
    created_at: string;
};

export default function MatchmakingPage() {
    const sp = useSearchParams();
    const router = useRouter();
    const handle = sp.get("handle") ?? "";
    const mode = useMemo(() => sp.get("mode") ?? "casual", [sp]);

    const [lobbyPlayers, setLobbyPlayers] = useState<LobbyPlayer[]>([]);
    const [isQueued, setIsQueued] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [invitation, setInvitation] = useState<Invitation | null>(null);
    const [sentInvitedToUserId, setSentInvitedToUserId] = useState<string | null>(null);

    const refreshLobby = async () => {
        if (!mode) return;
        try {
            setLoading(true);
            const { data } = await apiFetch(`/api/matchmaking/lobby/${encodeURIComponent(mode)}`);
            setLobbyPlayers(data ?? []);

            // ロビーから自分を探して、isQueued の状態を更新
            const meInLobby = (data ?? []).find(p => p.user?.handle === handle);
            setIsQueued(!!meInLobby);
        } catch (e: any) {
            setErr(e?.message ?? String(e));
        } finally {
            setLoading(false);
        }
    };

    const joinLobby = async () => {
        setErr(null);
        try {
            await apiFetch("/api/matchmaking/join", {
                method: "POST",
                body: JSON.stringify({ handle, mode }),
            });
            setIsQueued(true);
            await refreshLobby();
        } catch (e: any) {
            setErr(e?.message ?? String(e));
        }
    };

    const invitePlayer = async (opponentUserId: string) => {
        setErr(null);

        // ロビーに入っているか確認
        if (!isQueued) {
            setErr("教室に参加してから招待してください");
            return;
        }

        // 既に招待中の場合はスキップ
        if (sentInvitedToUserId) {
            setErr("既に他のプレイヤーを招待中です。結果を待ってください。");
            return;
        }

        try {
            // 招待通知を送る（マッチングはしない、相手の承認待ち）
            await apiFetch("/api/matchmaking/invite", {
                method: "POST",
                body: JSON.stringify({ handle, opponent_user_id: opponentUserId }),
            });

            // 招待した相手を記録（ポーリングで承認を待つため）
            setSentInvitedToUserId(opponentUserId);
            setErr(null);
        } catch (e: any) {
            setErr(e?.message ?? String(e));
        }
    };

    const leaveLobby = async () => {
        setErr(null);
        try {
            await apiFetch("/api/matchmaking/leave", {
                method: "POST",
                body: JSON.stringify({ handle }),
            });
            setIsQueued(false);
            await refreshLobby();
        } catch (e: any) {
            setErr(e?.message ?? String(e));
        }
    };

    // 招待通知をチェック（招待された側用）
    const checkInvitations = async () => {
        if (!handle) return;
        try {
            const res = await apiFetch(`/api/matchmaking/invitations/${encodeURIComponent(handle)}`);
            const invitations = res?.data ?? [];

            // 最初の pending 招待を表示
            const firstInvitation = invitations.find((inv: any) => inv.status === "pending");
            setInvitation(firstInvitation ?? null);
        } catch (e: any) {
            // エラーは無視
        }
    };

    // 招待が成立したかチェック（招待した側用）
    // 相手が承認してマッチが作成されると、自分がロビーから削除されるので、それをトリガーに遷移
    const checkIfInviteAccepted = async () => {
        if (!sentInvitedToUserId || !handle) return;
        try {
            const status = await apiFetch(`/api/matchmaking/status/${encodeURIComponent(handle)}`);

            // 自分が送った招待が accepted された「かつ」自分がロビーから削除された場合
            if (status?.invitation_accepted && !status?.queued && status?.latest_match) {
                router.push(`/matches/${status.latest_match.id}?handle=${encodeURIComponent(handle)}`);
            }
        } catch (e: any) {
            // エラーは無視
        }
    };

    // 招待を承認（マッチング成立）
    const acceptInvite = async (invitationId: string) => {
        setErr(null);
        try {
            const r = await apiFetch("/api/matchmaking/accept-invite", {
                method: "POST",
                body: JSON.stringify({ handle, invitation_id: invitationId }),
            });

            if (r?.matched && r?.match?.id) {
                router.push(`/matches/${r.match.id}?handle=${encodeURIComponent(handle)}`);
            }
        } catch (e: any) {
            setErr(e?.message ?? String(e));
        }
    };

    // 招待を辞退（次のポーリングで別の招待が表示される）
    const rejectInvite = () => {
        setInvitation(null);
    };

    // 招待のキャンセル（招待した側が別の人に招待したい場合）
    const cancelSentInvite = () => {
        setSentInvitedToUserId(null);
        setErr(null);
    };

    // 初期化とポーリング
    useEffect(() => {
        refreshLobby();
        checkInvitations();
        checkIfInviteAccepted();

        const interval = setInterval(() => {
            refreshLobby();
            checkInvitations();
            checkIfInviteAccepted();
        }, 2000);

        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, handle, sentInvitedToUserId]);

    if (!handle) {
        return (
            <main style={{ padding: 24 }}>
                <h1>matchmaking</h1>
                <p>handle がありません。トップに戻って入力してください。</p>
            </main>
        );
    }

    return (
        <main style={{
            backgroundImage: 'url(/matchmaking.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundAttachment: 'fixed',
            minHeight: '100vh',
            width: '100%'
        }}>
            <div style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
                <h1 style={{ color: "white" }}>講義棟</h1>
                <p style={{ background: "rgba(255, 255, 255, 0.9)", padding: 12, borderRadius: 4, color: "black", marginBottom: 16 }}>あなた: <b>{handle}</b> / モード: <b>{mode}</b></p>

                <div style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap" }}>
                    {!isQueued ? (
                        <button onClick={joinLobby} style={{ padding: 10, fontSize: 16 }}>
                            教室に入る
                        </button>
                    ) : (
                        <button onClick={leaveLobby} style={{ padding: 10, fontSize: 16, background: "crimson", color: "white" }}>
                            教室から離脱
                        </button>
                    )}
                    <button onClick={refreshLobby} style={{ padding: 10, fontSize: 16 }}>
                        更新
                    </button>
                    <button onClick={() => router.push(`/reviews?handle=${encodeURIComponent(handle)}`)} style={{ padding: 10 }}>
                        授業レビューを見る
                    </button>
                </div>

                {err && <div style={{ color: "crimson", marginBottom: 12 }}>{err}</div>}



                {/* === 招待確認ウィンドウ === */}
                {invitation && (
                    <div
                        style={{
                            position: "fixed",
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: "rgba(0,0,0,0.5)",
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            zIndex: 1000
                        }}
                    >
                        <div
                            style={{
                                background: "white",
                                padding: 24,
                                borderRadius: 8,
                                maxWidth: 400,
                                textAlign: "center",
                                boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
                            }}
                        >
                            <h2 style={{ margin: "0 0 16px 0" }}>招待</h2>
                            <p style={{ fontSize: 16, margin: "8px 0" }}>
                                <b>{invitation.inviter?.display_name}</b> さんと対戦しますか？
                            </p>
                            <p style={{ fontSize: 12, opacity: 0.6, margin: "12px 0" }}>
                                @{invitation.inviter?.handle}
                            </p>
                            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 20 }}>
                                <button
                                    onClick={() => acceptInvite(invitation.invitation_id)}
                                    style={{
                                        padding: "10px 24px",
                                        fontSize: 14,
                                        background: "#28a745",
                                        color: "white",
                                        border: "none",
                                        borderRadius: 4,
                                        cursor: "pointer"
                                    }}
                                >
                                    はい
                                </button>
                                <button
                                    onClick={rejectInvite}
                                    style={{
                                        padding: "10px 24px",
                                        fontSize: 14,
                                        background: "#6c757d",
                                        color: "white",
                                        border: "none",
                                        borderRadius: 4,
                                        cursor: "pointer"
                                    }}
                                >
                                    いいえ
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div style={{ marginTop: 24 }}>
                    <h2 style={{ color: "white" }}>教室にいる国民 ({lobbyPlayers.length})</h2>
                    <div style={{ background: "rgba(255, 255, 255, 0.9)", padding: 16, borderRadius: 4, marginTop: 12 }}>
                            {sentInvitedToUserId && (
                                <div style={{ padding: 12, background: "#fff3cd", color: "#856404", borderRadius: 4, marginBottom: 12 }}>
                                    <b>待機中...</b> 招待を送信しました。相手が承認するまでお待ちください。
                                    <button onClick={cancelSentInvite} style={{ marginLeft: 12, padding: "4px 8px", fontSize: 12, cursor: "pointer" }}>
                                        キャンセル
                                    </button>
                                </div>
                            )}
                            {lobbyPlayers.length === 0 ? (
                                <p style={{ opacity: 0.6, color: "black" }}>国民がいません</p>
                            ) : (
                                <div style={{ display: "grid", gap: 8 }}>
                            {lobbyPlayers.map((player) => (
                                <div
                                    key={player.user_id}
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        padding: 12,
                                        border: "1px solid #ddd",
                                        borderRadius: 8,
                                        background: player.user?.handle === handle ? "#f0f0f0" : "#fff",
                                        opacity: sentInvitedToUserId ? 0.6 : 1
                                    }}
                                >
                                    <div>
                                        <div style={{ fontSize: 16, fontWeight: "bold" }}>
                                            {player.user?.display_name || player.user?.handle}
                                        </div>
                                        <div style={{ fontSize: 12, opacity: 0.6 }}>
                                            @{player.user?.handle}
                                        </div>
                                    </div>
                                    {player.user?.handle !== handle && (
                                        <button
                                            onClick={() => invitePlayer(player.user_id)}
                                            disabled={!isQueued || !!sentInvitedToUserId}
                                            style={{
                                                padding: "8px 16px",
                                                fontSize: 12,
                                                background:
                                                    sentInvitedToUserId ? "#ccc" :
                                                        isQueued ? "#007bff" : "#ccc",
                                                color: (!isQueued || sentInvitedToUserId) ? "#666" : "white",
                                                border: "none",
                                                borderRadius: 4,
                                                cursor: (!isQueued || sentInvitedToUserId) ? "not-allowed" : "pointer",
                                                opacity: (!isQueued || sentInvitedToUserId) ? 0.6 : 1
                                            }}
                                        >
                                            {sentInvitedToUserId ? "待機中..." :
                                                isQueued ? "招待" : "ロビー参加後に選択"}
                                        </button>
                                    )}
                                    {player.user?.handle === handle && (
                                        <div style={{ fontSize: 12, color: "green", fontWeight: "bold" }}>
                                            あなた
                                        </div>
                                    )}
                                </div>
                            ))}
                                </div>
                            )}
                            <p style={{ opacity: 0.6, marginTop: 12, color: "black" }}>
                                教室に入って国民を選択し、招待を送信します。相手が承認すると対戦が開始します。
                            </p>
                    </div>
                </div>
            </div>
        </main>
    );
}