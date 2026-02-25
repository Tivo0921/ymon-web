import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** helpers */
async function getUserIdByHandle(handle) {
    const u = await supabase.from("users").select("id").eq("handle", handle).maybeSingle();
    if (u.error) throw new Error(u.error.message);
    if (!u.data) return null;
    return u.data.id;
}

async function getQueuedRowByUserId(userId) {
    return await supabase
        .from("matchmaking_queue")
        .select("id, user_id, mode, queued_at")
        .eq("user_id", userId)
        .maybeSingle();
}

async function getOldestQueuedRowByMode(mode) {
    return await supabase
        .from("matchmaking_queue")
        .select("id, user_id, mode, queued_at")
        .eq("mode", mode)
        .order("queued_at", { ascending: true })
        .limit(1);
}

/** health */
app.get("/health", (_req, res) => res.json({ ok: true }));

/** master: professors */
app.get("/api/professors", (_req, res) => {
    try {
        const p = path.join(__dirname, "master", "professors.json");
        const raw = fs.readFileSync(p, "utf-8");
        const data = JSON.parse(raw);
        res.json({ data });
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

/** users: create-or-get */
app.post("/api/users", async (req, res) => {
    try {
        const { handle, display_name } = req.body ?? {};
        if (!handle) return res.status(400).json({ error: "handle is required" });

        const existing = await supabase
            .from("users")
            .select("id, handle, display_name, created_at")
            .eq("handle", handle)
            .maybeSingle();

        if (existing.error) return res.status(500).json({ error: existing.error.message });
        if (existing.data) return res.json({ data: existing.data, created: false });

        const created = await supabase
            .from("users")
            .insert([{ handle, display_name }])
            .select("id, handle, display_name, created_at")
            .single();

        if (created.error) return res.status(500).json({ error: created.error.message });
        return res.status(201).json({ data: created.data, created: true });
    } catch (e) {
        return res.status(500).json({ error: String(e) });
    }
});

/** users: list */
app.get("/api/users", async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit ?? "10", 10) || 10, 50);

        const { data, error } = await supabase
            .from("users")
            .select("id, handle, display_name, created_at")
            .order("created_at", { ascending: false })
            .limit(limit);

        if (error) return res.status(500).json({ error: error.message });
        res.json({ data });
    } catch (e) {
        return res.status(500).json({ error: String(e) });
    }
});

/** users: get by handle */
app.get("/api/users/:handle", async (req, res) => {
    try {
        const handle = req.params.handle;

        const { data, error } = await supabase
            .from("users")
            .select("id, handle, display_name, created_at")
            .eq("handle", handle)
            .maybeSingle();

        if (error) return res.status(500).json({ error: error.message });
        if (!data) return res.status(404).json({ error: "user not found" });
        res.json({ data });
    } catch (e) {
        return res.status(500).json({ error: String(e) });
    }
});

app.get("/api/users/:handle/matches", async (req, res) => {
    try {
        const handle = req.params.handle;
        const userId = await getUserIdByHandle(handle);
        if (!userId) return res.status(404).json({ error: "user not found" });

        const limit = Math.min(parseInt(req.query.limit ?? "20", 10) || 20, 50);

        const m = await supabase
            .from("matches")
            .select("id, p1_user_id, p2_user_id, status, created_at")
            .or(`p1_user_id.eq.${userId},p2_user_id.eq.${userId}`)
            .order("created_at", { ascending: false })
            .limit(limit);

        if (m.error) return res.status(500).json({ error: m.error.message });

        return res.json({ data: m.data ?? [] });
    } catch (e) {
        return res.status(500).json({ error: String(e) });
    }
});

/** owned professors: list */
app.get("/api/users/:handle/professors", async (req, res) => {
    try {
        const handle = req.params.handle;
        const userId = await getUserIdByHandle(handle);
        if (!userId) return res.status(404).json({ error: "user not found" });

        const { data, error } = await supabase
            .from("user_professors")
            .select("professor_key, level, exp, state_json")
            .eq("user_id", userId);

        if (error) return res.status(500).json({ error: error.message });
        res.json({ data });
    } catch (e) {
        return res.status(500).json({ error: String(e) });
    }
});

/** owned professors: upsert */
app.post("/api/users/:handle/professors", async (req, res) => {
    try {
        const handle = req.params.handle;
        const { professor_key, level, exp, state_json } = req.body ?? {};
        if (!professor_key) return res.status(400).json({ error: "professor_key is required" });

        const userId = await getUserIdByHandle(handle);
        if (!userId) return res.status(404).json({ error: "user not found" });

        const { data, error } = await supabase
            .from("user_professors")
            .upsert(
                [{
                    user_id: userId,
                    professor_key,
                    level: level ?? 1,
                    exp: exp ?? 0,
                    state_json: state_json ?? {}
                }],
                { onConflict: "user_id,professor_key" }
            )
            .select("professor_key, level, exp, state_json")
            .single();

        if (error) return res.status(500).json({ error: error.message });
        res.status(201).json({ data });
    } catch (e) {
        return res.status(500).json({ error: String(e) });
    }
});

// owned professors with master details
app.get("/api/users/:handle/owned-professors", async (req, res) => {
    try {
        const handle = req.params.handle;
        const userId = await getUserIdByHandle(handle);
        if (!userId) return res.status(404).json({ error: "user not found" });

        const { data: owned, error } = await supabase
            .from("user_professors")
            .select("professor_key, level, exp, state_json")
            .eq("user_id", userId);

        if (error) return res.status(500).json({ error: error.message });

        // master join (from professors.json)
        const masters = loadProfessors();
        const masterMap = new Map(masters.map((p) => [p.key, p]));

        const merged = (owned ?? []).map((o) => ({
            ...o,
            master: masterMap.get(o.professor_key) ?? null,
        }));

        return res.json({ data: merged });
    } catch (e) {
        return res.status(500).json({ error: String(e) });
    }
});

/**
 * MATCHMAKING (MVP)
 * - join: queueに入る → 同modeで2人揃っていたら match 作って両方queueから消す
 * - status: 自分がqueueに居るか / 直近matchを返す
 * - leave: queueから抜ける
 */

app.post("/api/matchmaking/join", async (req, res) => {
    try {
        const { handle, mode } = req.body ?? {};
        if (!handle || !mode) {
            return res.status(400).json({ error: "handle and mode are required" });
        }

        const userId = await getUserIdByHandle(handle);
        if (!userId) return res.status(404).json({ error: "user not found" });

        // 1) すでにこのユーザーが並んでいるなら、それを返す（idempotent）
        const already = await getQueuedRowByUserId(userId);
        if (already.error) return res.status(500).json({ error: already.error.message });
        if (already.data) {
            return res.status(200).json({
                queued: true,
                matched: false,
                queue: already.data,
                idempotent: true
            });
        }

        // 2) 同じmodeで待っている相手を探す（最古を取る）
        const opp = await getOldestQueuedRowByMode(mode);
        if (opp.error) return res.status(500).json({ error: opp.error.message });
        const opponentRow = (opp.data ?? [])[0] ?? null;

        // 相手がいて、かつ自分じゃないならマッチ作成
        if (opponentRow && opponentRow.user_id !== userId) {
            // 相手をキューから消す（best-effort：消せなければ後で整合性が崩れるのでここは本当はtransactionにしたい）
            // 相手をキューから消す（countに頼らず、残存チェックで判定する）
            const delOpp = await supabase
                .from("matchmaking_queue")
                .delete()
                .eq("id", opponentRow.id);

            if (delOpp.error) return res.status(500).json({ error: delOpp.error.message });

            // 本当に消えたか確認（消えていなければ相手が先に取られた可能性）
            const stillThere = await supabase
                .from("matchmaking_queue")
                .select("id")
                .eq("id", opponentRow.id)
                .maybeSingle();

            if (stillThere.error) return res.status(500).json({ error: stillThere.error.message });

            if (stillThere.data) {
                // 相手がまだいる＝自分のdeleteが効いてない（競合など）
                // → 自分をqueueに入れる方へフォールバック（既存の3) insertと同じ）
                const ins = await supabase
                    .from("matchmaking_queue")
                    .insert([{ user_id: userId, mode }])
                    .select("id, user_id, mode, queued_at")
                    .single();

                if (ins.error) {
                    const msg = String(ins.error.message ?? "");
                    if (msg.includes("duplicate") || msg.includes("unique") || msg.includes("matchmaking_queue_user_id_key")) {
                        const q2 = await getQueuedRowByUserId(userId);
                        if (q2.error) return res.status(500).json({ error: q2.error.message });

                        return res.status(200).json({
                            queued: true,
                            matched: false,
                            queue: q2.data ?? null,
                            idempotent: true
                        });
                    }
                    return res.status(500).json({ error: ins.error.message });
                }

                return res.status(200).json({
                    queued: true,
                    matched: false,
                    queue: ins.data,
                    fallback: "opponent_taken"
                });
            }

            // ここまで来たら相手は消せているので match 作成に進む
            // matches作成
            const match = await supabase
                .from("matches")
                .insert([
                    {
                        p1_user_id: opponentRow.user_id,
                        p2_user_id: userId,
                        status: "created"
                    }
                ])
                .select("id, p1_user_id, p2_user_id, status, created_at")
                .single();

            if (match.error) return res.status(500).json({ error: match.error.message });

            return res.status(200).json({
                queued: false,
                matched: true,
                match: match.data
            });
        }

        // 3) 相手がいないので自分をキューに入れる
        const ins = await supabase
            .from("matchmaking_queue")
            .insert([{ user_id: userId, mode }])
            .select("id, user_id, mode, queued_at")
            .single();

        // 3') ここがユニーク制約に引っかかることがある（レース / 連打）
        if (ins.error) {
            const msg = String(ins.error.message ?? "");
            if (msg.includes("duplicate") || msg.includes("unique") || msg.includes("matchmaking_queue_user_id_unique")) {
                const q2 = await getQueuedRowByUserId(userId);
                if (q2.error) return res.status(500).json({ error: q2.error.message });

                return res.status(200).json({
                    queued: true,
                    matched: false,
                    queue: q2.data ?? null,
                    idempotent: true
                });
            }
            return res.status(500).json({ error: ins.error.message });
        }

        return res.status(200).json({
            queued: true,
            matched: false,
            queue: ins.data
        });
    } catch (e) {
        return res.status(500).json({ error: String(e) });
    }
});

app.post("/api/matchmaking/leave", async (req, res) => {
    try {
        const { handle } = req.body ?? {};
        if (!handle) return res.status(400).json({ error: "handle is required" });

        const userId = await getUserIdByHandle(handle);
        if (!userId) return res.status(404).json({ error: "user not found" });

        // まず居るか確認（idempotentのため）
        const q = await getQueuedRowByUserId(userId);
        if (q.error) return res.status(500).json({ error: q.error.message });

        if (!q.data) {
            return res.status(200).json({ ok: true, left: false, idempotent: true });
        }

        const del = await supabase
            .from("matchmaking_queue")
            .delete()
            .eq("id", q.data.id);

        if (del.error) return res.status(500).json({ error: del.error.message });

        return res.status(200).json({ ok: true, left: true });
    } catch (e) {
        return res.status(500).json({ error: String(e) });
    }
});

app.get("/api/matchmaking/status/:handle", async (req, res) => {
    try {
        const handle = req.params.handle;
        const userId = await getUserIdByHandle(handle);
        if (!userId) return res.status(404).json({ error: "user not found" });

        const q = await supabase
            .from("matchmaking_queue")
            .select("id, mode, queued_at")
            .eq("user_id", userId)
            .maybeSingle();

        if (q.error) return res.status(500).json({ error: q.error.message });

        // 直近でstatus="created"のmatch（battleが in_progress 或いは存在しないもの）
        const m = await supabase
            .from("matches")
            .select("id, p1_user_id, p2_user_id, status, created_at")
            .or(`p1_user_id.eq.${userId},p2_user_id.eq.${userId}`)
            .eq("status", "created")
            .order("created_at", { ascending: false });

        if (m.error) return res.status(500).json({ error: m.error.message });

        // 各matchに対応するbattleをチェックして、バトル未開始のものだけを返す
        let validMatch = null;
        for (const match of m.data || []) {
            const b = await supabase
                .from("battles")
                .select("id, status")
                .eq("match_id", match.id)
                .maybeSingle();

            if (b.error) continue;

            // battleが存在しない（バトル未開始）のみを有効と判定
            // in_progressやcompletedは使用可能ではないので除外
            if (!b.data) {
                validMatch = match;
                break;
            }
        }

        return res.json({
            queued: !!q.data,
            queue: q.data ?? null,
            latest_match: validMatch ?? null
        });
    } catch (e) {
        return res.status(500).json({ error: String(e) });
    }
});

/** legacy debug endpoints (optional) */
app.get("/debug/users", async (_req, res) => {
    const { data, error } = await supabase
        .from("users")
        .select("id, handle, display_name, created_at")
        .order("created_at", { ascending: false })
        .limit(10);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ data });
});

// ===== Reviews (授業レビュー) =====

/** 授業一覧取得 */
app.get("/api/courses", async (_req, res) => {
    try {
        const courses = await supabase
            .from("courses")
            .select("id, key, display_name, category, created_at")
            .order("created_at", { ascending: true });

        if (courses.error) {
            return res.status(500).json({ error: courses.error.message });
        }

        res.json({ data: courses.data ?? [] });
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

/** 授業追加 */
app.post("/api/courses", async (req, res) => {
    try {
        const { key, display_name, category } = req.body ?? {};

        if (!key || !display_name || !category) {
            return res.status(400).json({ error: "key, display_name, and category are required" });
        }

        const course = await supabase
            .from("courses")
            .insert([{
                key: key.trim(),
                display_name: display_name.trim(),
                category: category.trim()
            }])
            .select("id, key, display_name, category, created_at")
            .single();

        if (course.error) {
            return res.status(500).json({ error: course.error.message });
        }

        res.status(201).json({ data: course.data });
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

/** 授業別レビュー取得 */
app.get("/api/reviews/:courseKey", async (req, res) => {
    try {
        const courseKey = decodeURIComponent(req.params.courseKey);

        const reviews = await supabase
            .from("reviews")
            .select("id, course_key, author_handle, rating, comment, created_at")
            .eq("course_key", courseKey)
            .order("created_at", { ascending: false });

        if (reviews.error) {
            return res.status(500).json({ error: reviews.error.message });
        }

        res.json({ data: reviews.data ?? [] });
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

/** レビュー投稿 */
app.post("/api/reviews", async (req, res) => {
    try {
        const { handle, course_key, rating, comment } = req.body ?? {};

        if (!handle || !course_key || !rating || !comment) {
            return res.status(400).json({ error: "handle, course_key, rating, comment are required" });
        }

        const review = await supabase
            .from("reviews")
            .insert([{
                course_key,
                author_handle: handle,
                rating: Math.max(1, Math.min(5, rating)),
                comment
            }])
            .select("id, course_key, author_handle, rating, comment, created_at")
            .single();

        if (review.error) {
            return res.status(500).json({ error: review.error.message });
        }

        res.status(201).json({ data: review.data });
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`API running on http://localhost:${port}`));
// ===== Battle (MVP) =====

function loadProfessors() {
    const p = path.join(__dirname, "master", "professors.json");
    const raw = fs.readFileSync(p, "utf-8");
    return JSON.parse(raw);
}

function getProfessorByKey(all, key) {
    const found = all.find((x) => x.key === key);
    if (!found) throw new Error(`professor not found: ${key}`);
    return found;
}

function simulateBattle(p1, p2) {
    const a = { ...p1, cur_hp: p1.hp };
    const b = { ...p2, cur_hp: p2.hp };

    const dmg = (att, def) => Math.max(1, att.atk - Math.floor(def.def / 2));

    const log = [];
    const aFirst = a.spd >= b.spd;
    let turn = aFirst ? "a" : "b";

    let round = 0;
    while (a.cur_hp > 0 && b.cur_hp > 0 && round < 999) {
        round += 1;
        if (turn === "a") {
            const d = dmg(a, b);
            b.cur_hp -= d;
            log.push({ attacker: a.key, defender: b.key, damage: d, defender_hp: Math.max(0, b.cur_hp) });
            turn = "b";
        } else {
            const d = dmg(b, a);
            a.cur_hp -= d;
            log.push({ attacker: b.key, defender: a.key, damage: d, defender_hp: Math.max(0, a.cur_hp) });
            turn = "a";
        }
    }

    const winner = a.cur_hp > 0 ? "p1" : "p2";
    return {
        winner,
        p1_final_hp: Math.max(0, a.cur_hp),
        p2_final_hp: Math.max(0, b.cur_hp),
        turns: log.length,
        log
    };
}

// ===== ターン制バトル初期化 =====
app.post("/api/matches/:matchId/battle", async (req, res) => {
    try {
        const matchId = req.params.matchId;
        const { p1_team_keys, p2_team_keys } = req.body ?? {};

        if (!Array.isArray(p1_team_keys) || !Array.isArray(p2_team_keys)) {
            return res.status(400).json({ error: "p1_team_keys and p2_team_keys must be arrays" });
        }
        if (p1_team_keys.length !== 3 || p2_team_keys.length !== 3) {
            return res.status(400).json({ error: "MVP requires 3v3" });
        }

        // match 取得
        const m = await supabase
            .from("matches")
            .select("id, p1_user_id, p2_user_id, status")
            .eq("id", matchId)
            .maybeSingle();

        if (m.error) return res.status(500).json({ error: m.error.message });
        if (!m.data) return res.status(404).json({ error: "match not found" });

        // 既存バトルをチェック（in_progress中は再開）
        const existingBattle = await supabase
            .from("battles")
            .select("id, status")
            .eq("match_id", matchId)
            .maybeSingle();

        if (existingBattle.error) return res.status(500).json({ error: existingBattle.error.message });
        if (existingBattle.data) {
            // in_progress なら再開
            if (existingBattle.data.status === "in_progress") {
                return res.status(200).json({ battleId: existingBattle.data.id, status: "in_progress" });
            }
            // completed なら新しいバトル作成不可（既にこのマッチは終了）
            if (existingBattle.data.status === "completed") {
                return res.status(400).json({ error: "This match's battle has already been completed. Please create a new match via matchmaking." });
            }
        }

        // 所有チェック
        const owned1 = await supabase
            .from("user_professors")
            .select("professor_key")
            .eq("user_id", m.data.p1_user_id)
            .in("professor_key", p1_team_keys);

        if (owned1.error) return res.status(500).json({ error: owned1.error.message });
        if ((owned1.data ?? []).length !== p1_team_keys.length) {
            return res.status(400).json({ error: "p1 does not own all selected professors" });
        }

        const owned2 = await supabase
            .from("user_professors")
            .select("professor_key")
            .eq("user_id", m.data.p2_user_id)
            .in("professor_key", p2_team_keys);

        if (owned2.error) return res.status(500).json({ error: owned2.error.message });
        if ((owned2.data ?? []).length !== p2_team_keys.length) {
            return res.status(400).json({ error: "p2 does not own all selected professors" });
        }

        // マスタからチーム構築
        const masters = loadProfessors();
        const team1 = p1_team_keys.map((k) => getProfessorByKey(masters, k));
        const team2 = p2_team_keys.map((k) => getProfessorByKey(masters, k));

        // battle 作成
        const battleInsert = await supabase
            .from("battles")
            .insert([{
                match_id: matchId,
                status: "in_progress",
                current_turn: 0,
                p1_team_keys,
                p2_team_keys
            }])
            .select("id")
            .single();

        let battleId;
        if (battleInsert.error) {
            // ユニーク制約エラーなら、既に別のリクエストがバトルを作った可能性
            if (String(battleInsert.error.message).includes("unique") || String(battleInsert.error.message).includes("duplicate")) {
                const existingBattle2 = await supabase
                    .from("battles")
                    .select("id")
                    .eq("match_id", matchId)
                    .eq("status", "in_progress")
                    .maybeSingle();

                if (existingBattle2.error) return res.status(500).json({ error: existingBattle2.error.message });
                if (existingBattle2.data) {
                    return res.status(200).json({ battleId: existingBattle2.data.id, status: "in_progress" });
                }
            }
            return res.status(500).json({ error: battleInsert.error.message });
        }
        battleId = battleInsert.data.id;

        // battle_state 初期化（SPD順で初手決定）
        const initialP1Team = team1.map(p => ({ key: p.key, cur_hp: p.hp, hp: p.hp, atk: p.atk, def: p.def, spd: p.spd }));
        const initialP2Team = team2.map(p => ({ key: p.key, cur_hp: p.hp, hp: p.hp, atk: p.atk, def: p.def, spd: p.spd }));

        const stateInsert = await supabase
            .from("battle_states")
            .insert([{
                battle_id: battleId,
                p1_team_json: initialP1Team,
                p2_team_json: initialP2Team,
                p1_active_index: 0,
                p2_active_index: 0,
                current_turn_side: "p1",
                round_number: 1,
                round_speed_order: null
            }])
            .select("id")
            .single();

        if (stateInsert.error) return res.status(500).json({ error: stateInsert.error.message });

        return res.status(201).json({ battleId, status: "in_progress" });
    } catch (e) {
        return res.status(500).json({ error: String(e) });
    }
});

// ===== バトル状態取得 =====
app.get("/api/battles/:battleId", async (req, res) => {
    try {
        const battleId = req.params.battleId;

        const battle = await supabase
            .from("battles")
            .select("id, match_id, status, current_turn, p1_team_keys, p2_team_keys")
            .eq("id", battleId)
            .maybeSingle();

        if (battle.error) return res.status(500).json({ error: battle.error.message });
        if (!battle.data) return res.status(404).json({ error: "battle not found" });

        const state = await supabase
            .from("battle_states")
            .select("p1_team_json, p2_team_json, p1_active_index, p2_active_index, current_turn_side, round_number, round_speed_order")
            .eq("battle_id", battleId)
            .maybeSingle();

        if (state.error) return res.status(500).json({ error: state.error.message });

        const turns = await supabase
            .from("battle_turns")
            .select("*")
            .eq("battle_id", battleId)
            .order("turn_number", { ascending: true });

        if (turns.error) return res.status(500).json({ error: turns.error.message });

        return res.json({
            battleId,
            status: battle.data.status,
            currentTurn: battle.data.current_turn,
            currentTurnSide: state.data?.current_turn_side ?? "p1",
            roundNumber: state.data?.round_number ?? 1,
            p1TeamKeys: battle.data.p1_team_keys,
            p2TeamKeys: battle.data.p2_team_keys,
            p1Team: state.data?.p1_team_json ?? [],
            p2Team: state.data?.p2_team_json ?? [],
            p1ActiveIndex: state.data?.p1_active_index ?? 0,
            p2ActiveIndex: state.data?.p2_active_index ?? 0,
            turns: turns.data ?? []
        });
    } catch (e) {
        return res.status(500).json({ error: String(e) });
    }
});

// ===== ターン進行 =====
app.post("/api/battles/:battleId/next-turn", async (req, res) => {
    try {
        const battleId = req.params.battleId;
        const { action, target_index } = req.body ?? {};

        if (!action || !["attack", "switch"].includes(action)) {
            return res.status(400).json({ error: "action must be 'attack' or 'switch'" });
        }

        const battle = await supabase
            .from("battles")
            .select("id, status, current_turn, p1_team_keys, p2_team_keys")
            .eq("id", battleId)
            .maybeSingle();

        if (battle.error) return res.status(500).json({ error: battle.error.message });
        if (!battle.data) return res.status(404).json({ error: "battle not found" });
        if (battle.data.status !== "in_progress") {
            return res.status(400).json({ error: "battle is not in progress" });
        }

        const state = await supabase
            .from("battle_states")
            .select("*")
            .eq("battle_id", battleId)
            .maybeSingle();

        if (state.error) return res.status(500).json({ error: state.error.message });
        if (!state.data) return res.status(404).json({ error: "battle state not found" });

        const p1Team = state.data.p1_team_json;
        const p2Team = state.data.p2_team_json;
        let p1Idx = state.data.p1_active_index;
        let p2Idx = state.data.p2_active_index;

        // current_turn_side の初期化（互換性のため）
        let currentTurnSide = state.data.current_turn_side ?? "p1";
        let roundNumber = state.data.round_number ?? 1;
        let roundSpeedOrder = state.data.round_speed_order;

        // ラウンド開始時に SPD 比較してあったかなかったか決定
        if (!roundSpeedOrder) {
            const p1Speed = p1Team[p1Idx]?.spd ?? 0;
            const p2Speed = p2Team[p2Idx]?.spd ?? 0;
            roundSpeedOrder = p1Speed >= p2Speed ? "p1_first" : "p2_first";
            currentTurnSide = roundSpeedOrder === "p1_first" ? "p1" : "p2";
        }

        // アクティブキャラの生死確認
        const nextAlive = (team, idx) => {
            let i = idx;
            while (i < team.length && team[i].cur_hp <= 0) i++;
            return i;
        };

        p1Idx = nextAlive(p1Team, p1Idx);
        p2Idx = nextAlive(p2Team, p2Idx);

        // バトル終了判定
        if (p1Idx >= p1Team.length || p2Idx >= p2Team.length) {
            const winner = p1Idx < p1Team.length ? "p1" : "p2";
            await supabase.from("battles").update({ status: "completed" }).eq("id", battleId);
            return res.json({ status: "completed", winner });
        }

        // ターンのプレイヤーが正しいか確認
        const playerTakingTurn = currentTurnSide;
        let eventRecord = null;

        if (action === "switch") {
            // スイッチアクション
            if (target_index === null || target_index === undefined) {
                return res.status(400).json({ error: "target_index required for switch action" });
            }

            if (playerTakingTurn === "p1") {
                if (target_index < 0 || target_index >= p1Team.length) {
                    return res.status(400).json({ error: "invalid target_index for p1" });
                }
                if (p1Team[target_index].cur_hp <= 0) {
                    return res.status(400).json({ error: "target professor is fainted" });
                }
                p1Idx = target_index;
            } else {
                if (target_index < 0 || target_index >= p2Team.length) {
                    return res.status(400).json({ error: "invalid target_index for p2" });
                }
                if (p2Team[target_index].cur_hp <= 0) {
                    return res.status(400).json({ error: "target professor is fainted" });
                }
                p2Idx = target_index;
            }

            eventRecord = {
                battle_id: battleId,
                turn_number: battle.data.current_turn + 1,
                attacker_side: playerTakingTurn,
                attacker_key: playerTakingTurn === "p1" ? p1Team[p1Idx].key : p2Team[p2Idx].key,
                defender_key: null,
                damage_dealt: 0,
                defender_hp_after: null,
                event: "switch"
            };
        } else {
            // 攻撃アクション
            if (target_index === null || target_index === undefined) {
                return res.status(400).json({ error: "target_index required for attack action" });
            }

            const dmg = (att, def) => Math.max(1, att.atk - Math.floor(def.def / 2));
            let atkKey, defKey, damage, defenderTeam, defenderIdx;

            if (playerTakingTurn === "p1") {
                if (target_index < 0 || target_index >= p2Team.length) {
                    return res.status(400).json({ error: "invalid target_index" });
                }
                if (p2Team[target_index].cur_hp <= 0) {
                    return res.status(400).json({ error: "target is already fainted" });
                }
                atkKey = p1Team[p1Idx].key;
                defKey = p2Team[target_index].key;
                damage = dmg(p1Team[p1Idx], p2Team[target_index]);
                p2Team[target_index].cur_hp = Math.max(0, p2Team[target_index].cur_hp - damage);
                defenderTeam = p2Team;
                defenderIdx = target_index;
            } else {
                if (target_index < 0 || target_index >= p1Team.length) {
                    return res.status(400).json({ error: "invalid target_index" });
                }
                if (p1Team[target_index].cur_hp <= 0) {
                    return res.status(400).json({ error: "target is already fainted" });
                }
                atkKey = p2Team[p2Idx].key;
                defKey = p1Team[target_index].key;
                damage = dmg(p2Team[p2Idx], p1Team[target_index]);
                p1Team[target_index].cur_hp = Math.max(0, p1Team[target_index].cur_hp - damage);
                defenderTeam = p1Team;
                defenderIdx = target_index;
            }

            eventRecord = {
                battle_id: battleId,
                turn_number: battle.data.current_turn + 1,
                attacker_side: playerTakingTurn,
                attacker_key: atkKey,
                defender_key: defKey,
                damage_dealt: damage,
                defender_hp_after: defenderTeam[defenderIdx].cur_hp,
                event: defenderTeam[defenderIdx].cur_hp <= 0 ? "faint" : "attack"
            };
        }

        // ターン記録（攻撃のみ。交替は記録しない）
        if (action === "attack") {
            const turnInsert = await supabase
                .from("battle_turns")
                .insert([eventRecord])
                .select("*")
                .single();

            if (turnInsert.error) return res.status(500).json({ error: turnInsert.error.message });
        }

        // 次のターンサイドを決定
        let nextTurnSide = currentTurnSide === "p1" ? "p2" : "p1";
        let nextRoundNumber = roundNumber;
        let nextRoundSpeedOrder = roundSpeedOrder;

        // P1, P2 両方が行動したらラウンド終了
        if (nextTurnSide === "p1") {
            // P2 が終わったので、ラウンド開始
            nextRoundNumber = roundNumber + 1;
            nextRoundSpeedOrder = null; // 次のラウンド開始時に再計算
        }

        // state 更新
        const stateUpdate = await supabase
            .from("battle_states")
            .update({
                p1_team_json: p1Team,
                p2_team_json: p2Team,
                p1_active_index: p1Idx,
                p2_active_index: p2Idx,
                current_turn_side: nextTurnSide,
                round_number: nextRoundNumber,
                round_speed_order: nextRoundSpeedOrder
            })
            .eq("battle_id", battleId);

        if (stateUpdate.error) return res.status(500).json({ error: stateUpdate.error.message });

        // battle ターン数更新
        await supabase.from("battles").update({ current_turn: battle.data.current_turn + 1 }).eq("id", battleId);

        return res.json({
            status: "in_progress",
            action,
            currentTurnSide: nextTurnSide,
            gameOver: false
        });
    } catch (e) {
        return res.status(500).json({ error: String(e) });
    }
});

app.get("/api/users/:handle/matches", async (req, res) => {
    try {
        const handle = req.params.handle;
        const userId = await getUserIdByHandle(handle);
        if (!userId) return res.status(404).json({ error: "user not found" });

        const limit = Math.min(parseInt(req.query.limit ?? "20", 10) || 20, 50);

        const m = await supabase
            .from("matches")
            .select("id, p1_user_id, p2_user_id, status, created_at")
            .or(`p1_user_id.eq.${userId},p2_user_id.eq.${userId}`)
            .order("created_at", { ascending: false })
            .limit(limit);

        if (m.error) return res.status(500).json({ error: m.error.message });

        return res.json({ data: m.data ?? [] });
    } catch (e) {
        return res.status(500).json({ error: String(e) });
    }
});

app.get("/api/matches/:matchId", async (req, res) => {
    try {
        const matchId = req.params.matchId;

        const m = await supabase
            .from("matches")
            .select("id, p1_user_id, p2_user_id, status, created_at")
            .eq("id", matchId)
            .maybeSingle();

        if (m.error) return res.status(500).json({ error: m.error.message });
        if (!m.data) return res.status(404).json({ error: "match not found" });

        // p1/p2 handle を引く
        const users = await supabase
            .from("users")
            .select("id, handle, display_name")
            .in("id", [m.data.p1_user_id, m.data.p2_user_id]);

        if (users.error) return res.status(500).json({ error: users.error.message });

        const uMap = new Map((users.data ?? []).map((u) => [u.id, u]));
        const p1 = uMap.get(m.data.p1_user_id) ?? null;
        const p2 = uMap.get(m.data.p2_user_id) ?? null;

        // 最新battle
        const b = await supabase
            .from("battles")
            .select("id, match_id, seed, state_json, status, created_at")
            .eq("match_id", matchId)
            .order("created_at", { ascending: false })
            .limit(1);

        if (b.error) return res.status(500).json({ error: b.error.message });

        const battle = (b.data ?? [])[0] ?? null;

        // result
        let result = null;
        if (battle) {
            const r = await supabase
                .from("results")
                .select("battle_id, winner_user_id, summary_json, created_at")
                .eq("battle_id", battle.id)
                .maybeSingle();

            if (r.error) return res.status(500).json({ error: r.error.message });
            result = r.data ?? null;
        }

        return res.json({
            match: m.data,
            players: { p1, p2 },
            battle,
            result
        });
    } catch (e) {
        return res.status(500).json({ error: String(e) });
    }
});

function simulateTeamBattle(team1, team2) {
    const t1 = team1.map((p) => ({ ...p, cur_hp: p.hp }));
    const t2 = team2.map((p) => ({ ...p, cur_hp: p.hp }));

    const dmg = (att, def) => Math.max(1, att.atk - Math.floor(def.def / 2));
    const log = [];

    const nextAlive = (t, i) => {
        let j = i;
        while (j < t.length && t[j].cur_hp <= 0) j++;
        return j;
    };

    let i1 = nextAlive(t1, 0);
    let i2 = nextAlive(t2, 0);

    // 初手だけSPDで決める。その後は交互
    let turn = (t1[i1].spd >= t2[i2].spd) ? "t1" : "t2";

    while (i1 < t1.length && i2 < t2.length) {
        const attacker = turn === "t1" ? t1[i1] : t2[i2];
        const defender = turn === "t1" ? t2[i2] : t1[i1];

        const damage = dmg(attacker, defender);
        defender.cur_hp -= damage;

        log.push({
            attacker: attacker.key,
            defender: defender.key,
            damage,
            defender_hp: Math.max(0, defender.cur_hp),
            t1_index: i1,
            t2_index: i2,
            t1_active: t1[i1].key,
            t2_active: t2[i2].key,
        });

        // 倒れたら交代（交代後もターンは進む）
        if (t1[i1].cur_hp <= 0) {
            log.push({ event: "faint", side: "t1", key: t1[i1].key, index: i1 });
            i1 = nextAlive(t1, i1 + 1);
        }
        if (t2[i2].cur_hp <= 0) {
            log.push({ event: "faint", side: "t2", key: t2[i2].key, index: i2 });
            i2 = nextAlive(t2, i2 + 1);
        }

        if (i1 >= t1.length || i2 >= t2.length) break;

        // ターン交代（ここがポイント）
        turn = (turn === "t1") ? "t2" : "t1";
    }

    const winner =
        i1 < t1.length && i2 >= t2.length ? "p1" :
            i2 < t2.length && i1 >= t1.length ? "p2" :
                (i1 < t1.length ? "p1" : "p2");

    return {
        mode: "team_3v3",
        winner,
        p1_remaining: t1.map((p) => ({ key: p.key, hp: Math.max(0, p.cur_hp) })),
        p2_remaining: t2.map((p) => ({ key: p.key, hp: Math.max(0, p.cur_hp) })),
        turns: log.length,
        log,
    };
}

// ====== DEBUG ======
app.get("/api/debug/match/:matchId", async (req, res) => {
    try {
        const matchId = req.params.matchId;

        const m = await supabase
            .from("matches")
            .select("*")
            .eq("id", matchId)
            .maybeSingle();

        const b = await supabase
            .from("battles")
            .select("*")
            .eq("match_id", matchId);

        const s = await supabase
            .from("battle_states")
            .select("*")
            .in("battle_id", (b.data ?? []).map(x => x.id));

        return res.json({
            match: m.data,
            battles: b.data,
            battle_states: s.data
        });
    } catch (e) {
        return res.status(500).json({ error: String(e) });
    }
});