"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export default function WinPage() {
    const sp = useSearchParams();
    const router = useRouter();
    const matchId = sp.get("matchId");
    const [handle, setHandle] = useState<string>("");

    useEffect(() => {
        const getMatchData = async () => {
            if (!matchId) return;
            try {
                const md = await apiFetch(`/api/matches/${matchId}`);
                // matchDataから自分のhandleを取得
                const myHandle = md?.players?.p1?.handle || md?.players?.p2?.handle || "";
                setHandle(myHandle);
            } catch (e) {
                console.error("Failed to fetch match data:", e);
            }
        };
        getMatchData();
    }, [matchId]);

    return (
        <div style={{
            padding: "20px",
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
            paddingTop: "100px",
            paddingLeft: "50px",
            alignItems: "flex-start",
            backgroundImage: 'url(/win.png)',
            backgroundSize: 'cover',
            backgroundPosition: '0 0',
            backgroundAttachment: 'fixed',
            width: '100%',
            gap: "200px"
        }}>

            <h1 style={{ color: "#fff", marginBottom: "0", fontSize: "96px" }}>WIN!</h1>

            <div style={{ display: "flex", gap: "10px", flexDirection: "row", alignItems: "center", justifyContent: "center", width: "100%" }}>
                <button
                    onClick={() => router.push("/")}
                    style={{
                        padding: "20px 40px",
                        fontSize: "20px",
                        backgroundColor: "rgba(125, 125, 125, 0.5)",
                        color: "white",
                        border: "none",
                        borderRadius: "5px",
                        cursor: "pointer"
                    }}
                >
                    出国
                </button>

                <button
                    onClick={() => router.push(`/matchmaking?handle=${encodeURIComponent(handle)}`)}
                    disabled={!handle}
                    style={{
                        padding: "20px 40px",
                        fontSize: "20px",
                        backgroundColor: handle ? "rgba(125, 125, 125, 0.5)" : "rgba(125, 125, 125, 0.2)",
                        color: "white",
                        border: "none",
                        borderRadius: "5px",
                        cursor: handle ? "pointer" : "not-allowed",
                        opacity: handle ? 1 : 0.6
                    }}
                >
                    {handle ? "講義棟へ" : "読み込み中..."}
                </button>
            </div>
        </div>
    );
}
