"use client";

import { useSearchParams, useRouter } from "next/navigation";

export default function WinPage() {
    const sp = useSearchParams();
    const router = useRouter();
    const matchId = sp.get("matchId");

    return (
        <div style={{ padding: "20px", textAlign: "center", minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
            <h1 style={{ fontSize: "48px", color: "#00aa00", marginBottom: "20px" }}>🎉 勝利! 🎉</h1>
            <p style={{ fontSize: "24px", marginBottom: "40px" }}>バトルに勝ちました!</p>

            <button
                onClick={() => router.push("/")}
                style={{
                    padding: "12px 24px",
                    fontSize: "16px",
                    backgroundColor: "#007bff",
                    color: "white",
                    border: "none",
                    borderRadius: "5px",
                    cursor: "pointer",
                    marginRight: "10px"
                }}
            >
                ホームに戻る
            </button>

            <button
                onClick={() => router.push("/matchmaking")}
                style={{
                    padding: "12px 24px",
                    fontSize: "16px",
                    backgroundColor: "#28a745",
                    color: "white",
                    border: "none",
                    borderRadius: "5px",
                    cursor: "pointer"
                }}
            >
                次のマッチを探す
            </button>
        </div>
    );
}
