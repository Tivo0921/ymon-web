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

        // 直近のmatch（p1/p2どちらでも）
        const m = await supabase
            .from("matches")
            .select("id, p1_user_id, p2_user_id, status, created_at")
            .or(`p1_user_id.eq.${userId},p2_user_id.eq.${userId}`)
            .order("created_at", { ascending: false })
            .limit(1);

        if (m.error) return res.status(500).json({ error: m.error.message });

        return res.json({
            queued: !!q.data,
            queue: q.data ?? null,
            latest_match: (m.data ?? [])[0] ?? null
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

app.post("/api/matches/:matchId/battle", async (req, res) => {
    try {
        const matchId = req.params.matchId;

        const {
            p1_team_keys,
            p2_team_keys,
            p1_professor_key,
            p2_professor_key,
            seed
        } = req.body ?? {};

        // 単体指定も後方互換で許す（ただしMVPは3v3固定）
        const team1Keys = Array.isArray(p1_team_keys)
            ? p1_team_keys
            : p1_professor_key
                ? [p1_professor_key]
                : null;

        const team2Keys = Array.isArray(p2_team_keys)
            ? p2_team_keys
            : p2_professor_key
                ? [p2_professor_key]
                : null;

        if (!team1Keys || !team2Keys) {
            return res.status(400).json({ error: "team keys are required" });
        }
        if (team1Keys.length !== team2Keys.length) {
            return res.status(400).json({ error: "team size mismatch" });
        }
        if (team1Keys.length !== 3) {
            return res.status(400).json({ error: "MVP requires 3v3 (length=3)" });
        }

        // match取得
        const m = await supabase
            .from("matches")
            .select("id, p1_user_id, p2_user_id, status")
            .eq("id", matchId)
            .maybeSingle();

        if (m.error) return res.status(500).json({ error: m.error.message });
        if (!m.data) return res.status(404).json({ error: "match not found" });

        // ========== ここに入れる：既存battleがあれば返す（idempotent） ==========
        const existingBattle = await supabase
            .from("battles")
            .select("id, match_id, seed, state_json, status, created_at")
            .eq("match_id", matchId)
            .order("created_at", { ascending: false })
            .limit(1);

        if (existingBattle.error) {
            return res.status(500).json({ error: existingBattle.error.message });
        }

        const battle = (existingBattle.data ?? [])[0] ?? null;
        if (battle) {
            const existingResult = await supabase
                .from("results")
                .select("battle_id, winner_user_id, summary_json, created_at")
                .eq("battle_id", battle.id)
                .maybeSingle();

            if (existingResult.error) {
                return res.status(500).json({ error: existingResult.error.message });
            }

            return res.status(200).json({
                battle,
                result: existingResult.data ?? null,
                idempotent: true
            });
        }
        // ========== idempotent block ここまで ==========

        // 所有チェック
        const owned1 = await supabase
            .from("user_professors")
            .select("professor_key")
            .eq("user_id", m.data.p1_user_id)
            .in("professor_key", team1Keys);

        if (owned1.error) return res.status(500).json({ error: owned1.error.message });
        if ((owned1.data ?? []).length !== team1Keys.length) {
            return res.status(400).json({ error: "p1 does not own all selected professors" });
        }

        const owned2 = await supabase
            .from("user_professors")
            .select("professor_key")
            .eq("user_id", m.data.p2_user_id)
            .in("professor_key", team2Keys);

        if (owned2.error) return res.status(500).json({ error: owned2.error.message });
        if ((owned2.data ?? []).length !== team2Keys.length) {
            return res.status(400).json({ error: "p2 does not own all selected professors" });
        }

        // マスタからチーム構築
        const masters = loadProfessors();
        const team1 = team1Keys.map((k) => getProfessorByKey(masters, k));
        const team2 = team2Keys.map((k) => getProfessorByKey(masters, k));

        // シミュレーション（3v3）
        const sim = simulateTeamBattle(team1, team2);
        const winnerUserId = sim.winner === "p1" ? m.data.p1_user_id : m.data.p2_user_id;

        // battles insert（ここで unique(match_id) により二重作成が防がれる）
        const b = await supabase
            .from("battles")
            .insert([
                {
                    match_id: matchId,
                    seed: seed ?? null,
                    state_json: {
                        p1_team_keys: team1Keys,
                        p2_team_keys: team2Keys
                    },
                    status: "done"
                }
            ])
            .select("id, match_id, seed, status, created_at")
            .single();

        // ========== ここに入れる：ユニーク違反なら既存を返す ==========
        if (b.error) {
            const msg = String(b.error.message ?? "");
            if (
                msg.includes("duplicate") ||
                msg.includes("unique") ||
                msg.includes("battles_match_id_unique")
            ) {
                const eb = await supabase
                    .from("battles")
                    .select("id, match_id, seed, state_json, status, created_at")
                    .eq("match_id", matchId)
                    .order("created_at", { ascending: false })
                    .limit(1);

                if (eb.error) return res.status(500).json({ error: eb.error.message });

                const battle2 = (eb.data ?? [])[0] ?? null;

                const er = battle2
                    ? await supabase
                        .from("results")
                        .select("battle_id, winner_user_id, summary_json, created_at")
                        .eq("battle_id", battle2.id)
                        .maybeSingle()
                    : { data: null, error: null };

                if (er.error) return res.status(500).json({ error: er.error.message });

                return res.status(200).json({
                    battle: battle2,
                    result: er.data ?? null,
                    idempotent: true
                });
            }

            return res.status(500).json({ error: b.error.message });
        }
        // ========== unique fallback ここまで ==========

        // results insert
        const r = await supabase
            .from("results")
            .insert([
                {
                    battle_id: b.data.id,
                    winner_user_id: winnerUserId,
                    summary_json: sim
                }
            ])
            .select("battle_id, winner_user_id, summary_json, created_at")
            .single();

        if (r.error) return res.status(500).json({ error: r.error.message });

        // matchesをdoneに（best-effort）
        await supabase.from("matches").update({ status: "done" }).eq("id", matchId);

        return res.json({
            battle: b.data,
            result: r.data
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