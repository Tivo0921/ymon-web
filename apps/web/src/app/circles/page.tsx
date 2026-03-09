"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

type Circle = {
    id: number;
    key: string;
    display_name: string;
    category: string;
};

type CircleReview = {
    id: string;
    circle_key: string;
    author_handle: string;
    rating: number;
    comment: string;
    created_at: string;
};

const CIRCLE_CATEGORIES = ["技術系", "学術系", "スポーツ系", "文化系", "ボランティア系"];

export default function CirclesPage() {
    const sp = useSearchParams();
    const router = useRouter();
    const handle = sp.get("handle") ?? "";

    const [circles, setCircles] = useState<Circle[]>([]);
    const [selectedCircle, setSelectedCircle] = useState<Circle | null>(null);
    const [reviews, setReviews] = useState<CircleReview[]>([]);
    const [rating, setRating] = useState<number>(5);
    const [comment, setComment] = useState<string>("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [selectedCategory, setSelectedCategory] = useState<string>("全て");
    
    // サークル追加フォーム用state
    const [isAddingCircle, setIsAddingCircle] = useState(false);
    const [addCircleKey, setAddCircleKey] = useState<string>("");
    const [addCircleDisplayName, setAddCircleDisplayName] = useState<string>("");
    const [addCircleCategory, setAddCircleCategory] = useState<string>("技術系");
    const [isAddSubmitting, setIsAddSubmitting] = useState(false);
    const [circleAverages, setCircleAverages] = useState<Record<string, number>>({});

    // 平均評価を計算するヘルパー関数
    const getRatingAverage = (circleKey: string) => circleAverages[circleKey];

    // 星表示のヘルパー関数
    const renderStars = (rating: number) => {
        if (!rating) return "評価なし";
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 >= 0.5;
        let stars = "★".repeat(fullStars);
        if (hasHalfStar) stars += "☆";
        return stars;
    };

    // 検索クエリとカテゴリに基づいてサークルをフィルタリング
    const filteredCircles = circles.filter((circle) => {
        const matchesSearch =
            circle.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            circle.key.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = selectedCategory === "全て" || circle.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    // サークル一覧取得
    useEffect(() => {
        const loadCircles = async () => {
            try {
                const data = await apiFetch("/api/circles");
                const circleList = data?.data ?? [];
                setCircles(circleList);

                // 全てのサークルのレビュー平均を先読み計算
                const averages: Record<string, number> = {};
                for (const circle of circleList) {
                    try {
                        const reviewData = await apiFetch(`/api/circle-reviews/${encodeURIComponent(circle.key)}`);
                        const reviews = reviewData?.data ?? [];
                        if (reviews.length > 0) {
                            const avg = reviews.reduce((sum: number, r: CircleReview) => sum + r.rating, 0) / reviews.length;
                            averages[circle.key] = avg;
                        }
                    } catch (e) {
                        // レビューがない場合などは無視
                    }
                }
                setCircleAverages(averages);
            } catch (e: any) {
                setErr(e?.message ?? String(e));
            }
        };
        loadCircles();
    }, []);

    // 選択されたサークルのレビュー取得
    useEffect(() => {
        if (!selectedCircle) {
            setReviews([]);
            return;
        }

        const loadReviews = async () => {
            try {
                const data = await apiFetch(`/api/circle-reviews/${encodeURIComponent(selectedCircle.key)}`);
                const reviewList = data?.data ?? [];
                setReviews(reviewList);

                // 平均評価を計算
                if (reviewList.length > 0) {
                    const avg = reviewList.reduce((sum, r) => sum + r.rating, 0) / reviewList.length;
                    setCircleAverages(prev => ({ ...prev, [selectedCircle.key]: avg }));
                }
            } catch (e: any) {
                setErr(e?.message ?? String(e));
            }
        };
        loadReviews();
    }, [selectedCircle]);

    // レビュー投稿
    const submitReview = async () => {
        if (!selectedCircle || !comment.trim()) {
            setErr("サークルとコメントを入力してください");
            return;
        }

        setIsSubmitting(true);
        setErr(null);
        setSuccessMsg(null);

        try {
            await apiFetch("/api/circle-reviews", {
                method: "POST",
                body: JSON.stringify({
                    handle,
                    circle_key: selectedCircle.key,
                    rating,
                    comment,
                }),
            });

            setComment("");
            setRating(5);
            setSuccessMsg("レビューを投稿しました！");

            // レビュー一覧を再取得
            const data = await apiFetch(`/api/circle-reviews/${encodeURIComponent(selectedCircle.key)}`);
            setReviews(data?.data ?? []);
        } catch (e: any) {
            setErr(e?.message ?? String(e));
        } finally {
            setIsSubmitting(false);
        }
    };

    // サークル追加
    const addCircle = async () => {
        if (!addCircleKey.trim() || !addCircleDisplayName.trim()) {
            setErr("サークルキーと表示名を入力してください");
            return;
        }

        setIsAddSubmitting(true);
        setErr(null);

        try {
            const newCircle = await apiFetch("/api/circles", {
                method: "POST",
                body: JSON.stringify({
                    key: addCircleKey.trim(),
                    display_name: addCircleDisplayName.trim(),
                    category: addCircleCategory,
                }),
            });

            // サークル一覧を再取得
            const data = await apiFetch("/api/circles");
            setCircles(data?.data ?? []);

            // フォームをリセット
            setAddCircleKey("");
            setAddCircleDisplayName("");
            setAddCircleCategory("技術系");
            setIsAddingCircle(false);
            setSuccessMsg("サークルを追加しました！");
        } catch (e: any) {
            setErr(e?.message ?? String(e));
        } finally {
            setIsAddSubmitting(false);
        }
    };

    if (!handle) {
        return (
            <main style={{ padding: 0, maxWidth: "100%", margin: 0 }}>
                <h1 style={{ backgroundColor: "#2196F3", color: "white", padding: 24, margin: 0, fontSize: 32, fontWeight: "bold" }}>サークルレビュー</h1>
                <div style={{ padding: 24 }}>
                    <p>handle がありません。matchmaking から入り直してください。</p>
                    <button onClick={() => router.push("/matchmaking")} style={{ padding: 10 }}>
                        matchmaking に戻る
                    </button>
                </div>
            </main>
        );
    }

    return (
        <main style={{ padding: 0, maxWidth: "100%", margin: 0 }}>
            <h1 style={{ backgroundColor: "#2196F3", color: "white", padding: 24, margin: 0, fontSize: 32, fontWeight: "bold" }}>サークルレビュー</h1>
            <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
                <p>handle: <b>{handle}</b></p>

            <button
                onClick={() => router.push(`/matchmaking?handle=${encodeURIComponent(handle)}`)}
                style={{ padding: 10, marginBottom: 16, backgroundColor: "#e0e0e0" }}
            >
                ← matchmaking に戻る
            </button>

            {err && <div style={{ color: "crimson", marginBottom: 16, padding: 12, background: "#fee" }}>{err}</div>}
            {successMsg && <div style={{ color: "#0056b3", marginBottom: 16, padding: 12, background: "#e3f2fd" }}>{successMsg}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                {/* サークル一覧 */}
                <div style={{ border: "1px solid #bbdefb", padding: 16, borderRadius: 8, backgroundColor: "#f8fbff" }}>
                    <h2>サークル一覧</h2>

                    {/* カテゴリフィルタ */}
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ display: "block", marginBottom: 8, fontWeight: "bold" }}>
                            カテゴリ:
                        </label>
                        <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            style={{
                                width: "100%",
                                padding: 8,
                                fontSize: 14,
                                borderRadius: 4,
                                border: "1px solid #ccc",
                            }}
                        >
                            <option value="全て">全て</option>
                            {CIRCLE_CATEGORIES.map((cat) => (
                                <option key={cat} value={cat}>
                                    {cat}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* 検索窓 */}
                    <div style={{ marginBottom: 16 }}>
                        <input
                            type="text"
                            placeholder="サークル名で検索..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                width: "100%",
                                padding: 10,
                                fontSize: 14,
                                borderRadius: 4,
                                border: "1px solid #ccc",
                                boxSizing: "border-box"
                            }}
                        />
                        {searchQuery && (
                            <p style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                                {filteredCircles.length} 件表示
                            </p>
                        )}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {filteredCircles.length === 0 ? (
                            <p style={{ opacity: 0.6 }}>
                                {circles.length === 0 ? "サークルデータがありません" : "検索結果がありません"}
                            </p>
                        ) : (
                            filteredCircles.map((circle) => {
                                const avg = getRatingAverage(circle.key);
                                return (
                                    <button
                                        key={circle.key}
                                        onClick={() => {
                                            setSelectedCircle(circle);
                                            setErr(null);
                                            setSuccessMsg(null);
                                            setRating(5);
                                            setComment("");
                                        }}
                                        style={{
                                            padding: 12,
                                            textAlign: "left",
                                            background: selectedCircle?.key === circle.key ? "#2196F3" : "#f0f0f0",
                                            color: selectedCircle?.key === circle.key ? "white" : "black",
                                            border: "1px solid #999",
                                            borderRadius: 4,
                                            cursor: "pointer",
                                            fontSize: 14,
                                        }}
                                    >
                                        <div style={{ fontWeight: "bold" }}>{circle.display_name}</div>
                                        <div style={{ fontSize: 12, opacity: 0.8 }}>（{circle.category}）</div>
                                        {avg && (
                                            <div style={{ fontSize: 12, marginTop: 6, opacity: 0.9 }}>
                                                {renderStars(avg)} {avg.toFixed(1)}
                                            </div>
                                        )}
                                    </button>
                                );
                            })
                        )}
                    </div>

                    {/* サークル追加フォーム */}
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #ddd" }}>
                        <h3 style={{ marginBottom: 12 }}>新しいサークルを追加</h3>
                        <input
                            type="text"
                            value={addCircleKey}
                            onChange={(e) => setAddCircleKey(e.target.value)}
                            placeholder="サークルキー（例：ai-club）"
                            style={{
                                width: "100%",
                                padding: 8,
                                marginBottom: 8,
                                fontSize: 14,
                                borderRadius: 4,
                                border: "1px solid #ccc",
                                boxSizing: "border-box"
                            }}
                        />
                        <input
                            type="text"
                            value={addCircleDisplayName}
                            onChange={(e) => setAddCircleDisplayName(e.target.value)}
                            placeholder="サークル名（例：AI研究会）"
                            style={{
                                width: "100%",
                                padding: 8,
                                marginBottom: 8,
                                fontSize: 14,
                                borderRadius: 4,
                                border: "1px solid #ccc",
                                boxSizing: "border-box"
                            }}
                        />
                        <select
                            value={addCircleCategory}
                            onChange={(e) => setAddCircleCategory(e.target.value)}
                            style={{
                                width: "100%",
                                padding: 8,
                                marginBottom: 8,
                                fontSize: 14,
                                borderRadius: 4,
                                border: "1px solid #ccc",
                                boxSizing: "border-box"
                            }}
                        >
                            {CIRCLE_CATEGORIES.map((cat) => (
                                <option key={cat} value={cat}>
                                    {cat}
                                </option>
                            ))}
                        </select>
                        <button
                            onClick={addCircle}
                            disabled={isAddSubmitting}
                            style={{
                                width: "100%",
                                padding: 10,
                                backgroundColor: isAddSubmitting ? "#ccc" : "#2196F3",
                                color: "white",
                                border: "none",
                                borderRadius: 4,
                                cursor: isAddSubmitting ? "not-allowed" : "pointer",
                                fontWeight: "bold"
                            }}
                        >
                            {isAddSubmitting ? "追加中..." : "追加"}
                        </button>
                    </div>
                </div>

                {/* レビュー投稿・一覧 */}
                <div style={{ border: "1px solid #bbdefb", padding: 16, borderRadius: 8, backgroundColor: "#f8fbff" }}>
                    {selectedCircle ? (
                        <>
                            <h2>{selectedCircle.display_name}</h2>
                            <p style={{ fontSize: 12, opacity: 0.7 }}>カテゴリ: {selectedCircle.category}</p>

                            {/* レビュー投稿フォーム */}
                            <div style={{ background: "#e3f2fd", padding: 12, marginBottom: 16, borderRadius: 4 }}>
                                <h3>レビューを投稿</h3>
                                <div style={{ marginBottom: 12 }}>
                                    <label style={{ display: "block", marginBottom: 8 }}>
                                        評価:
                                        <select
                                            value={rating}
                                            onChange={(e) => setRating(Number(e.target.value))}
                                            style={{ marginLeft: 8, padding: 6 }}
                                        >
                                            <option value={1}>⭐ 1 - 悪い</option>
                                            <option value={2}>⭐⭐ 2</option>
                                            <option value={3}>⭐⭐⭐ 3 - 普通</option>
                                            <option value={4}>⭐⭐⭐⭐ 4</option>
                                            <option value={5}>⭐⭐⭐⭐⭐ 5 - 良い</option>
                                        </select>
                                    </label>
                                </div>
                                <textarea
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    placeholder="コメントを入力..."
                                    style={{
                                        width: "100%",
                                        minHeight: 100,
                                        padding: 8,
                                        fontFamily: "sans-serif",
                                        fontSize: 14,
                                        borderRadius: 4,
                                        border: "1px solid #ccc",
                                    }}
                                />
                                <button
                                    onClick={submitReview}
                                    disabled={isSubmitting}
                                    style={{
                                        marginTop: 8,
                                        padding: 10,
                                        backgroundColor: isSubmitting ? "#ccc" : "#2196F3",
                                        color: "white",
                                        border: "none",
                                        borderRadius: 4,
                                        cursor: isSubmitting ? "not-allowed" : "pointer",
                                    }}
                                >
                                    {isSubmitting ? "投稿中..." : "投稿"}
                                </button>
                            </div>

                            {/* レビュー一覧 */}
                            <h3>レビュー ({reviews.length})</h3>
                            <div style={{ maxHeight: 400, overflowY: "auto" }}>
                                {reviews.length === 0 ? (
                                    <p style={{ opacity: 0.6 }}>まだレビューがありません</p>
                                ) : (
                                    reviews.map((review) => (
                                        <div
                                            key={review.id}
                                            style={{
                                                padding: 12,
                                                marginBottom: 8,
                                                background: "#f5f5f5",
                                                borderRadius: 4,
                                                borderLeft: "4px solid #2196F3",
                                            }}
                                        >
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                <div>
                                                    <div style={{ fontWeight: "bold" }}>{review.author_handle}</div>
                                                    <div style={{ fontSize: 12, color: "#666" }}>
                                                        {"⭐".repeat(review.rating)}
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: 12, color: "#999" }}>
                                                    {new Date(review.created_at).toLocaleDateString("ja-JP")}
                                                </div>
                                            </div>
                                            <p style={{ marginTop: 8, marginBottom: 0, fontSize: 14 }}>{review.comment}</p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </>
                    ) : (
                        <p style={{ opacity: 0.6, textAlign: "center", padding: 40 }}>
                            左からサークルを選択してください
                        </p>
                    )}
                </div>
            </div>
            </div>
        </main>
    );
}
