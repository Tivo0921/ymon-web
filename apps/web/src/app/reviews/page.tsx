"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

type Course = {
    id: string;
    key: string;
    display_name: string;
    category: string;
    professor_name?: string;
    created_at: string;
};

type Review = {
    id: string;
    course_key: string;
    author_handle: string;
    rating: number;
    comment: string;
    created_at: string;
};

export default function ReviewsPage() {
    const sp = useSearchParams();
    const router = useRouter();
    const handle = sp.get("handle") ?? "";

    const [courses, setCourses] = useState<Course[]>([]);
    const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
    const [reviews, setReviews] = useState<Review[]>([]);
    const [rating, setRating] = useState<number>(5);
    const [comment, setComment] = useState<string>("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [newCourseKey, setNewCourseKey] = useState<string>("");
    const [newCourseName, setNewCourseName] = useState<string>("");
    const [newCourseProfessorName, setNewCourseProfessorName] = useState<string>("");
    const [newCourseCategory, setNewCourseCategory] = useState<string>("専門");
    const [isAddingCourse, setIsAddingCourse] = useState(false);
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [courseAverages, setCourseAverages] = useState<Record<string, number>>({});
    const CATEGORIES = ["専門", "一般教養", "専門基礎"];

    // 平均評価を計算するヘルパー関数
    const getRatingAverage = (courseKey: string) => courseAverages[courseKey];

    // 星表示のヘルパー関数
    const renderStars = (rating: number) => {
        if (!rating) return "評価なし";
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 >= 0.5;
        let stars = "★".repeat(fullStars);
        if (hasHalfStar) stars += "☆";
        return stars;
    };

    // 検索クエリに基づいて授業をフィルタリング
    const filteredCourses = courses.filter((course) =>
        course.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        course.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (course.professor_name ?? "").toLowerCase().includes(searchQuery.toLowerCase())
    );

    // 授業一覧取得
    useEffect(() => {
        const loadCourses = async () => {
            try {
                const data = await apiFetch("/api/courses");
                const courseList = data?.data ?? [];
                setCourses(courseList);

                // 全ての授業のレビュー平均を先読み計算
                const averages: Record<string, number> = {};
                for (const course of courseList) {
                    try {
                        const reviewData = await apiFetch(`/api/reviews/${encodeURIComponent(course.key)}`);
                        const reviews = reviewData?.data ?? [];
                        if (reviews.length > 0) {
                            const avg = reviews.reduce((sum: number, r: Review) => sum + r.rating, 0) / reviews.length;
                            averages[course.key] = avg;
                        }
                    } catch (e) {
                        // レビューがない場合などは無視
                    }
                }
                setCourseAverages(averages);
            } catch (e: any) {
                setErr(e?.message ?? String(e));
            }
        };
        loadCourses();
    }, []);

    // 選択された授業のレビュー取得
    useEffect(() => {
        if (!selectedCourse) {
            setReviews([]);
            return;
        }

        const loadReviews = async () => {
            try {
                const data = await apiFetch(`/api/reviews/${encodeURIComponent(selectedCourse.key)}`);
                const reviewList = data?.data ?? [];
                setReviews(reviewList);

                // 平均評価を計算
                if (reviewList.length > 0) {
                    const avg = reviewList.reduce((sum, r) => sum + r.rating, 0) / reviewList.length;
                    setCourseAverages(prev => ({ ...prev, [selectedCourse.key]: avg }));
                }
            } catch (e: any) {
                setErr(e?.message ?? String(e));
            }
        };
        loadReviews();
    }, [selectedCourse]);

    // レビュー投稿
    const submitReview = async () => {
        if (!selectedCourse || !comment.trim()) {
            setErr("授業とコメントを入力してください");
            return;
        }

        setIsSubmitting(true);
        setErr(null);
        setSuccessMsg(null);

        try {
            const result = await apiFetch("/api/reviews", {
                method: "POST",
                body: JSON.stringify({
                    handle,
                    course_key: selectedCourse.key,
                    rating,
                    comment,
                }),
            });

            setComment("");
            setRating(5);
            setSuccessMsg("レビューを投稿しました！");

            // レビュー一覧を再取得
            const data = await apiFetch(`/api/reviews/${encodeURIComponent(selectedCourse.key)}`);
            setReviews(data?.data ?? []);
        } catch (e: any) {
            setErr(e?.message ?? String(e));
        } finally {
            setIsSubmitting(false);
        }
    };

    // 授業追加
    const addCourse = async () => {
        if (!newCourseKey.trim() || !newCourseName.trim()) {
            setErr("授業コードと授業名を入力してください");
            return;
        }

        setIsAddingCourse(true);
        setErr(null);
        setSuccessMsg(null);

        try {
            const result = await apiFetch("/api/courses", {
                method: "POST",
                body: JSON.stringify({
                    key: newCourseKey,
                    display_name: newCourseName,
                    category: newCourseCategory,
                    professor_name: newCourseProfessorName,
                }),
            });

            // 授業一覧を再取得
            const data = await apiFetch("/api/courses");
            setCourses(data?.data ?? []);

            setNewCourseKey("");
            setNewCourseName("");
            setNewCourseProfessorName("");
            setNewCourseCategory("専門");
            setSuccessMsg("授業を追加しました！");
        } catch (e: any) {
            setErr(e?.message ?? String(e));
        } finally {
            setIsAddingCourse(false);
        }
    };

    if (!handle) {
        return (
            <main style={{ padding: 0, maxWidth: "100%", margin: 0 }}>
                <h1 style={{ backgroundColor: "#4CAF50", color: "white", padding: 24, margin: 0, fontSize: 32, fontWeight: "bold" }}>授業レビュー</h1>
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
            <h1 style={{ backgroundColor: "#4CAF50", color: "white", padding: 24, margin: 0, fontSize: 32, fontWeight: "bold" }}>授業レビュー</h1>
            <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
                <p>handle: <b>{sp.get("handle")}</b></p>

            <button
                onClick={() => router.push(`/matchmaking?handle=${encodeURIComponent(handle)}`)}
                style={{ padding: 10, marginBottom: 16, backgroundColor: "#e0e0e0" }}
            >
                ← matchmaking に戻る
            </button>

            {err && <div style={{ color: "crimson", marginBottom: 16, padding: 12, background: "#fee" }}>{err}</div>}
            {successMsg && <div style={{ color: "green", marginBottom: 16, padding: 12, background: "#efe" }}>{successMsg}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                {/* 授業一覧 */}
                <div style={{ border: "1px solid #ccc", padding: 16, borderRadius: 8 }}>
                    <h2>授業一覧</h2>

                    {/* 検索窓 */}
                    <div style={{ marginBottom: 16 }}>
                        <input
                            type="text"
                            placeholder="授業名または教授名で検索..."
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
                                {filteredCourses.length} 件表示
                            </p>
                        )}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                        {filteredCourses.length === 0 ? (
                            <p style={{ opacity: 0.6 }}>
                                {courses.length === 0 ? "授業データがありません" : "検索結果がありません"}
                            </p>
                        ) : (
                            filteredCourses.map((course) => {
                                const avg = getRatingAverage(course.key);
                                return (
                                    <button
                                        key={course.key}
                                        onClick={() => setSelectedCourse(course)}
                                        style={{
                                            padding: 12,
                                            textAlign: "left",
                                            background: selectedCourse?.key === course.key ? "#4CAF50" : "#f0f0f0",
                                            color: selectedCourse?.key === course.key ? "white" : "black",
                                            border: "1px solid #999",
                                            borderRadius: 4,
                                            cursor: "pointer",
                                            fontSize: 14,
                                        }}
                                    >
                                        <div style={{ fontWeight: "bold" }}>{course.display_name}</div>
                                        <div style={{ fontSize: 12, opacity: 0.8 }}>（{course.category}）</div>
                                        {course.professor_name && (
                                            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{course.professor_name}</div>
                                        )}
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

                    {/* 新規授業追加 */}
                    <div style={{ background: "#f0f8ff", padding: 12, borderRadius: 4 }}>
                        <h3 style={{ marginTop: 0 }}>新しい授業を追加</h3>
                        <input
                            type="text"
                            value={newCourseKey}
                            onChange={(e) => setNewCourseKey(e.target.value)}
                            placeholder="授業コード（例: ai-major）"
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
                            value={newCourseName}
                            onChange={(e) => setNewCourseName(e.target.value)}
                            placeholder="授業名（例：人工知能）"
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
                            value={newCourseProfessorName}
                            onChange={(e) => setNewCourseProfessorName(e.target.value)}
                            placeholder="教授名（例：四方順司）"
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
                            value={newCourseCategory}
                            onChange={(e) => setNewCourseCategory(e.target.value)}
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
                            {CATEGORIES.map((cat) => (
                                <option key={cat} value={cat}>
                                    {cat}
                                </option>
                            ))}
                        </select>
                        <button
                            onClick={addCourse}
                            disabled={isAddingCourse}
                            style={{
                                width: "100%",
                                padding: 10,
                                backgroundColor: isAddingCourse ? "#ccc" : "#4CAF50",
                                color: "white",
                                border: "none",
                                borderRadius: 4,
                                cursor: isAddingCourse ? "not-allowed" : "pointer",
                                fontWeight: "bold"
                            }}
                        >
                            {isAddingCourse ? "追加中..." : "追加"}
                        </button>
                    </div>
                </div>

                {/* レビュー投稿・一覧 */}
                <div style={{ border: "1px solid #ccc", padding: 16, borderRadius: 8 }}>
                    {selectedCourse ? (
                        <>
                            <h2>{selectedCourse.display_name}（{selectedCourse.category}）</h2>

                            {/* レビュー投稿フォーム */}
                            <div style={{ background: "#f9f9f9", padding: 12, marginBottom: 16, borderRadius: 4 }}>
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
                                        backgroundColor: isSubmitting ? "#ccc" : "#4CAF50",
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
                                                borderLeft: "4px solid #4CAF50",
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
                            左から授業を選択してください
                        </p>
                    )}
                </div>
            </div>
            </div>
        </main>
    );
}
