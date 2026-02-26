"use client";

import { useSearchParams, useRouter } from "next/navigation";

export default function WinPage() {
    const sp = useSearchParams();
    const router = useRouter();
    const matchId = sp.get("matchId");

    return (
        <div style={{
            padding: "20px",
            textAlign: "center",
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
            paddingTop: "300px",
            alignItems: "center",
            backgroundImage: 'url(/win.png)',
            backgroundSize: 'cover',
            backgroundPosition: '0 0',
            backgroundAttachment: 'fixed',
            width: '100%'
        }}>

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
