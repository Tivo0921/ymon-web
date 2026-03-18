import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcrypt";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY in .env");
    process.exit(1);
}

// 管理者用: DB操作や Auth admin 用
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

// 一般用: サインイン確認用
const supabasePublic = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

// 既存コードとの互換のため、当面 supabase は admin を指す
const supabase = supabaseAdmin;

// Class periods (時限) - start time, end time (HH:MM)
const CLASS_PERIODS = {
    1: { name: "1限", start: "08:50", end: "10:20" },
    2: { name: "2限", start: "10:30", end: "12:00" },
    3: { name: "3限", start: "13:00", end: "14:30" },
    4: { name: "4限", start: "14:40", end: "16:10" },
    5: { name: "5限", start: "16:15", end: "17:45" },
    6: { name: "6限", start: "17:50", end: "19:20" },
    7: { name: "7限", start: "19:25", end: "20:55" },
};

// University campus coordinates (横国 理工学部講義棟A)
// 将来的には classrooms テーブルで教室ごとに設定可能
const CAMPUS_LOCATION = { latitude: 35.4736177, longitude: 139.5886936 };
const CAMPUS_RADIUS_METERS = 500; // キャンパス半径 500m

// IP whitelist (大学ネットワーク IP range)
const ALLOWED_IP_PREFIX = ["133.34"];

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

// Check if current time is within any class period
function getCurrentClassPeriod() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const currentTime = `${hours}:${minutes}`;

    for (const [period, info] of Object.entries(CLASS_PERIODS)) {
        if (currentTime >= info.start && currentTime <= info.end) {
            return parseInt(period);
        }
    }
    return null;
}

// Calculate distance between two coordinates (meters)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

// Check if IP is allowed (university network)
function isIpAllowed(ip) {
    // Extract client IP (handle proxy/load balancer)
    const clientIp = ip || "0.0.0.0";
    return ALLOWED_IP_PREFIX.some(prefix => clientIp.startsWith(prefix));
}

/** health */
app.get("/health", (_req, res) => res.json({ ok: true }));

/** master: professors */
app.get("/api/professors", async (_req, res) => {
    try {
        const { data, error } = await supabase
            .from("professors")
            .select("*")
            .order("id", { ascending: true });

        if (error) return res.status(500).json({ error: error.message });
        res.json({ data: data ?? [] });
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

/** users: create-or-get */
app.post("/api/users", async (req, res) => {
    try {
        console.log("[POST /api/users] Request body:", req.body);
        const { handle } = req.body ?? {};
        if (!handle) return res.status(400).json({ error: "handle is required" });

        console.log("[POST /api/users] Checking existing user with handle:", handle);
        const existing = await supabase
            .from("users")
            .select("id, handle, created_at")
            .eq("handle", handle)
            .maybeSingle();

        if (existing.error) {
            console.error("[POST /api/users] Existing user query error:", existing.error);
            return res.status(500).json({ error: existing.error.message });
        }
        if (existing.data) {
            console.log("[POST /api/users] User already exists:", existing.data);
            return res.json({ data: existing.data, created: false });
        }

        console.log("[POST /api/users] Creating new user with handle:", handle);
        const created = await supabase
            .from("users")
            .insert([{ handle }])
            .select("id, handle, created_at")
            .single();

        if (created.error) {
            console.error("[POST /api/users] User insert error:", created.error);
            return res.status(500).json({ error: created.error.message });
        }

        console.log("[POST /api/users] User created successfully:", created.data);

        // デフォルト教授を付与（prof_0, prof_1, prof_2）
        const defaultProfessors = ["prof_0", "prof_1", "prof_2"];
        const professorRecords = defaultProfessors.map(key => ({
            user_id: created.data.id,
            professor_key: key
        }));

        console.log("[POST /api/users] Inserting default professors:", professorRecords);
        const professorInsert = await supabase
            .from("user_professors")
            .insert(professorRecords);

        if (professorInsert.error) {
            console.error("[POST /api/users] Professor insert error:", professorInsert.error);
            return res.status(500).json({ error: `教授の追加に失敗: ${professorInsert.error.message}` });
        }

        console.log("[POST /api/users] Successfully completed");
        return res.status(201).json({ data: created.data, created: true });
    } catch (e) {
        console.error("[POST /api/users] Exception:", e);
        return res.status(500).json({ error: String(e) });
    }
});

/** users: list */
app.get("/api/users", async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit ?? "10", 10) || 10, 50);

        const { data, error } = await supabase
            .from("users")
            .select("id, handle, created_at")
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
            .select("id, handle, created_at")
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

        // master join (from Supabase)
        const masters = await loadProfessors();
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
                queue: already.data,
                idempotent: true
            });
        }

        // 2) 自分をキューに入れる（ロビーに参加）
        // ロビー型なので自動マッチングはしず、単に追加するだけ
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
                    queue: q2.data ?? null,
                    idempotent: true
                });
            }
            return res.status(500).json({ error: ins.error.message });
        }

        return res.status(200).json({
            queued: true,
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

        // 招待側：自分が送った招待で accepted なものをチェック
        const sentAcceptedInvitation = await supabase
            .from("matchmaking_invitations")
            .select("id, invitee_user_id, status")
            .eq("inviter_user_id", userId)
            .eq("status", "accepted")
            .order("created_at", { ascending: false })
            .limit(1);

        if (sentAcceptedInvitation.error) {
            // エラーは無視（accepted 招待がないと判定）
        }

        return res.json({
            queued: !!q.data,
            queue: q.data ?? null,
            latest_match: validMatch ?? null,
            invitation_accepted: (sentAcceptedInvitation.data?.length ?? 0) > 0
        });
    } catch (e) {
        return res.status(500).json({ error: String(e) });
    }
});

/** ロビー: キュー内のプレイヤー一覧取得 */
app.get("/api/matchmaking/lobby/:mode", async (req, res) => {
    try {
        const mode = req.params.mode;
        if (!mode) {
            return res.status(400).json({ error: "mode is required" });
        }

        // キューに登録されているプレイヤー一覧を取得
        const { data: queued, error } = await supabase
            .from("matchmaking_queue")
            .select("user_id, mode, queued_at")
            .eq("mode", mode)
            .order("queued_at", { ascending: true });

        if (error) return res.status(500).json({ error: error.message });

        // 各プレイヤーのユーザー情報を取得
        const userIds = (queued ?? []).map(q => q.user_id);
        if (userIds.length === 0) {
            return res.json({ data: [] });
        }

        const { data: users, error: usersError } = await supabase
            .from("users")
            .select("id, handle, created_at")
            .in("id", userIds);

        if (usersError) return res.status(500).json({ error: usersError.message });

        // キュー情報とユーザー情報をマージ
        const userMap = new Map((users ?? []).map(u => [u.id, u]));
        const lobby = (queued ?? []).map(q => ({
            user_id: q.user_id,
            user: userMap.get(q.user_id) ?? null,
            mode: q.mode,
            queued_at: q.queued_at
        }));

        return res.json({ data: lobby });
    } catch (e) {
        return res.status(500).json({ error: String(e) });
    }
});

/** ロビー: 相手プレイヤーに招待通知を送信 */
app.post("/api/matchmaking/invite", async (req, res) => {
    try {
        const { handle, opponent_user_id } = req.body ?? {};
        if (!handle || !opponent_user_id) {
            return res.status(400).json({ error: "handle and opponent_user_id are required" });
        }

        const userId = await getUserIdByHandle(handle);
        if (!userId) return res.status(404).json({ error: "user not found" });

        // 同じプレイヤーに招待できない
        if (userId === opponent_user_id) {
            return res.status(400).json({ error: "cannot invite yourself" });
        }

        // 相手がロビーに居るか確認
        const oppQueue = await supabase
            .from("matchmaking_queue")
            .select("id, user_id, mode, queued_at")
            .eq("user_id", opponent_user_id)
            .maybeSingle();

        if (oppQueue.error) return res.status(500).json({ error: oppQueue.error.message });
        if (!oppQueue.data) {
            return res.status(400).json({ error: "opponent is not in the lobby" });
        }

        // 既に pending 状態の招待があるか確認
        const existingInvite = await supabase
            .from("matchmaking_invitations")
            .select("id, inviter_user_id, invitee_user_id, status, created_at")
            .eq("inviter_user_id", userId)
            .eq("invitee_user_id", opponent_user_id)
            .eq("status", "pending")
            .maybeSingle();

        if (existingInvite.error) return res.status(500).json({ error: existingInvite.error.message });

        // 既に pending 招待が存在する場合はそれを返す（重複防止）
        if (existingInvite.data) {
            return res.json({
                invited: true,
                invitation: existingInvite.data,
                already_invited: true
            });
        }

        // 新規招待通知を記録（マッチングはしない、相手の承認待ち）
        const invite = await supabase
            .from("matchmaking_invitations")
            .insert([
                {
                    inviter_user_id: userId,
                    invitee_user_id: opponent_user_id,
                    status: "pending"
                }
            ])
            .select("id, inviter_user_id, invitee_user_id, status, created_at")
            .single();

        if (invite.error) return res.status(500).json({ error: invite.error.message });

        return res.json({
            invited: true,
            invitation: invite.data
        });
    } catch (e) {
        return res.status(500).json({ error: String(e) });
    }
});

/** ロビー: 自分への招待通知一覧を取得 */
app.get("/api/matchmaking/invitations/:handle", async (req, res) => {
    try {
        const handle = req.params.handle;
        const userId = await getUserIdByHandle(handle);
        if (!userId) return res.status(404).json({ error: "user not found" });

        // pending 状態の招待を取得
        const { data: invitations, error } = await supabase
            .from("matchmaking_invitations")
            .select("id, inviter_user_id, invitee_user_id, status, created_at")
            .eq("invitee_user_id", userId)
            .eq("status", "pending")
            .order("created_at", { ascending: false });

        if (error) return res.status(500).json({ error: error.message });

        // 各招待者のユーザー情報を取得
        const inviterIds = (invitations ?? []).map(inv => inv.inviter_user_id);
        if (inviterIds.length === 0) {
            return res.json({ data: [] });
        }

        const { data: users, error: usersError } = await supabase
            .from("users")
            .select("id, handle")
            .in("id", inviterIds);

        if (usersError) return res.status(500).json({ error: usersError.message });

        // 招待情報とユーザー情報をマージ
        const userMap = new Map((users ?? []).map(u => [u.id, u]));
        const result = (invitations ?? []).map(inv => ({
            invitation_id: inv.id,
            inviter: userMap.get(inv.inviter_user_id) ?? null,
            status: inv.status,
            created_at: inv.created_at
        }));

        return res.json({ data: result });
    } catch (e) {
        return res.status(500).json({ error: String(e) });
    }
});

/** ロビー: 招待を承認してマッチング */
app.post("/api/matchmaking/accept-invite", async (req, res) => {
    try {
        const { handle, invitation_id } = req.body ?? {};
        if (!handle || !invitation_id) {
            return res.status(400).json({ error: "handle and invitation_id are required" });
        }

        const userId = await getUserIdByHandle(handle);
        if (!userId) return res.status(404).json({ error: "user not found" });

        // 招待を取得
        const { data: invite, error: inviteError } = await supabase
            .from("matchmaking_invitations")
            .select("id, inviter_user_id, invitee_user_id, status")
            .eq("id", invitation_id)
            .eq("invitee_user_id", userId)
            .eq("status", "pending")
            .maybeSingle();

        if (inviteError) return res.status(500).json({ error: inviteError.message });
        if (!invite) return res.status(404).json({ error: "invitation not found or already processed" });

        const inviterId = invite.inviter_user_id;

        // 招待者と被招待者の両方がロビーに居るか確認
        const inviterQueue = await getQueuedRowByUserId(inviterId);
        if (inviterQueue.error) return res.status(500).json({ error: inviterQueue.error.message });
        if (!inviterQueue.data) {
            return res.status(400).json({ error: "inviter is no longer in the lobby" });
        }

        const inviteeQueue = await getQueuedRowByUserId(userId);
        if (inviteeQueue.error) return res.status(500).json({ error: inviteeQueue.error.message });
        if (!inviteeQueue.data) {
            return res.status(400).json({ error: "you are no longer in the lobby" });
        }

        // マッチ作成
        const match = await supabase
            .from("matches")
            .insert([
                {
                    p1_user_id: inviterId,
                    p2_user_id: userId,
                    status: "created"
                }
            ])
            .select("id, p1_user_id, p2_user_id, status, created_at")
            .single();

        if (match.error) return res.status(500).json({ error: match.error.message });

        // 両者をロビーから削除
        const delInviter = await supabase
            .from("matchmaking_queue")
            .delete()
            .eq("id", inviterQueue.data.id);

        const delInvitee = await supabase
            .from("matchmaking_queue")
            .delete()
            .eq("id", inviteeQueue.data.id);

        if (delInviter.error) return res.status(500).json({ error: delInviter.error.message });
        if (delInvitee.error) return res.status(500).json({ error: delInvitee.error.message });

        // 招待ステータスを accepted に更新
        const updateInvite = await supabase
            .from("matchmaking_invitations")
            .update({ status: "accepted" })
            .eq("id", invitation_id);

        if (updateInvite.error) return res.status(500).json({ error: updateInvite.error.message });

        return res.json({
            matched: true,
            match: match.data
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
            .select("id, key, display_name, category, professor_name, created_at")
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
        const { key, display_name, category, professor_name } = req.body ?? {};

        if (!key || !display_name || !category) {
            return res.status(400).json({ error: "key, display_name, and category are required" });
        }

        const course = await supabase
            .from("courses")
            .insert([{
                key: key.trim(),
                display_name: display_name.trim(),
                category: category.trim(),
                professor_name: (professor_name ?? "").trim()
            }])
            .select("id, key, display_name, category, professor_name, created_at")
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

// ===== Circle Reviews (サークルレビュー) =====

/** マスターデータ（circles）をDBにセットアップ */

/** サークル一覧取得（DB から） */
app.get("/api/circles", async (_req, res) => {
    try {
        const { data, error } = await supabase
            .from("circles")
            .select("id, key, display_name, category, created_at")
            .order("created_at", { ascending: true });

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        res.json({ data: data ?? [] });
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

/** サークル作成 */
app.post("/api/circles", async (req, res) => {
    try {
        const { key, display_name, category } = req.body ?? {};

        if (!key || !display_name || !category) {
            return res.status(400).json({ error: "key, display_name, category are required" });
        }

        // キーの一意性を確認
        const existing = await supabase
            .from("circles")
            .select("id")
            .eq("key", key)
            .maybeSingle();

        if (existing.error) {
            return res.status(500).json({ error: existing.error.message });
        }

        if (existing.data) {
            return res.status(400).json({ error: "Circle key already exists" });
        }

        const { data, error } = await supabase
            .from("circles")
            .insert([{ key, display_name, category }])
            .select("id, key, display_name, category, created_at")
            .single();

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        res.status(201).json({ data });
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

/** サークル別レビュー取得 */
app.get("/api/circle-reviews/:circleKey", async (req, res) => {
    try {
        const circleKey = decodeURIComponent(req.params.circleKey);

        const reviews = await supabase
            .from("circle_reviews")
            .select("id, circle_key, author_handle, rating, comment, created_at")
            .eq("circle_key", circleKey)
            .order("created_at", { ascending: false });

        if (reviews.error) {
            return res.status(500).json({ error: reviews.error.message });
        }

        res.json({ data: reviews.data ?? [] });
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

/** サークルレビュー投稿 */
app.post("/api/circle-reviews", async (req, res) => {
    try {
        const { handle, circle_key, rating, comment } = req.body ?? {};

        console.log("POST /api/circle-reviews received:", { handle, circle_key, rating, comment });

        if (!handle || !circle_key || !rating || !comment) {
            console.log("Missing required fields:", { handle, circle_key, rating, comment });
            return res.status(400).json({ error: "handle, circle_key, rating, comment are required" });
        }

        const parsedRating = Number.parseInt(rating, 10);
        if (Number.isNaN(parsedRating) || !Number.isInteger(parsedRating)) {
            console.log("Invalid rating value:", { rating });
            return res.status(400).json({ error: "rating must be an integer between 1 and 5" });
        }
        const clampedRating = Math.max(1, Math.min(5, parsedRating));

        const review = await supabase
            .from("circle_reviews")
            .insert([{
                circle_key,
                author_handle: handle,
                rating: clampedRating,
                comment
            }])
            .select("id, circle_key, author_handle, rating, comment, created_at")
            .single();

        if (review.error) {
            console.error("Supabase error:", review.error);
            return res.status(500).json({ error: review.error.message });
        }

        console.log("Review inserted successfully:", review.data);
        res.status(201).json({ data: review.data });
    } catch (e) {
        console.error("Exception in POST /api/circle-reviews:", e);
        res.status(500).json({ error: String(e) });
    }
});

// ===== Initialization =====

const port = process.env.PORT || 3001;

if (process.env.NODE_ENV !== "test") {
    app.listen(port, () => {
        console.log(`API running on http://localhost:${port}`);
    });
}

export default app;
// ===== Battle (MVP) =====

async function loadProfessors() {
    const { data, error } = await supabase
        .from("professors")
        .select("*")
        .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    return data ?? [];
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
        const masters = await loadProfessors();
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

        // ★ バトル開始時に SPD を比較して初手を決定
        const p1Speed = initialP1Team[0]?.spd ?? 0;
        const p2Speed = initialP2Team[0]?.spd ?? 0;
        const initialRoundSpeedOrder = p1Speed >= p2Speed ? "p1_first" : "p2_first";
        const initialCurrentTurnSide = initialRoundSpeedOrder === "p1_first" ? "p1" : "p2";

        const stateInsert = await supabase
            .from("battle_states")
            .insert([{
                battle_id: battleId,
                p1_team_json: initialP1Team,
                p2_team_json: initialP2Team,
                p1_active_index: 0,
                p2_active_index: 0,
                current_turn_side: initialCurrentTurnSide,
                round_number: 1,
                round_speed_order: initialRoundSpeedOrder
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

/** Table structure inspection (development only) */
const ALLOWED_DEBUG_TABLES = new Set([
    "battle_states",
    "battle_turns",
    "battles",
    "circle_reviews",
    "circles",
    "courses",
    "matches",
    "matchmaking_invitations",
    "matchmaking_queue",
    "professors",
    "results",
    "reviews",
    "user_professors",
    "users",
]);

// ===== Authentication (Supabase Auth) =====

/** Auth: Signup with email and password */
app.post("/api/auth/signup", async (req, res) => {
    try {
        console.log("[POST /api/auth/signup] Request body:", { email: req.body?.email });
        const { email, password } = req.body ?? {};

        if (!email || !password) {
            return res.status(400).json({ error: "email and password are required" });
        }

        // Validate @ynu.jp email
        if (!email.endsWith("@ynu.jp")) {
            console.log("[POST /api/auth/signup] Invalid email domain:", email);
            return res.status(400).json({ error: "Only @ynu.jp email addresses are allowed" });
        }

        // Validate password strength
        if (password.length < 8) {
            return res.status(400).json({ error: "Password must be at least 8 characters" });
        }

        // Check if email already exists
        const { data: existingUser } = await supabase
            .from("users")
            .select("id")
            .eq("email", email)
            .maybeSingle();

        if (existingUser) {
            console.log("[POST /api/auth/signup] Email already exists:", email);
            return res.status(400).json({ error: "Email already registered" });
        }

        // Create user in Supabase Auth
        console.log("[POST /api/auth/signup] Creating auth user:", email);
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: process.env.EMAIL_REDIRECT_TO ?? 'http://localhost:3000/auth/verify'
            }
        });

        if (authError) {
            console.error("[POST /api/auth/signup] Auth error:", authError);
            return res.status(400).json({ error: authError.message });
        }

        console.log("[POST /api/auth/signup] Auth user created:", authData.user?.id);

        // Generate a default handle (can be changed later)
        const defaultHandle = `user_${authData.user.id.substring(0, 8)}`;

        // Create corresponding user entry in users table (without handle - will be set later)
        const { data: userData, error: userError } = await supabase
            .from("users")
            .insert([{
                id: authData.user.id,
                email,
                email_verified: false,
                handle: defaultHandle // Use temporary default handle
            }])
            .select("id, email, email_verified, handle, coin")
            .single();

        if (userError) {
            console.error("[POST /api/auth/signup] User table error:", userError);
            return res.status(500).json({ error: userError.message });
        }

        console.log("[POST /api/auth/signup] User created successfully");

        return res.status(200).json({
            user: userData,
            session: authData.session,
            message: "User created. Please check your email for verification link."
        });
    } catch (e) {
        console.error("[POST /api/auth/signup] Exception:", e);
        return res.status(500).json({ error: String(e) });
    }
});

/** Auth: Login with email and password */
app.post("/api/auth/login", async (req, res) => {
    try {
        console.log("[POST /api/auth/login] Request body:", { email: req.body?.email });
        const { email, password } = req.body ?? {};

        if (!email || !password) {
            return res.status(400).json({ error: "email and password are required" });
        }

        // Get user data from DB including password hash
        const { data: userData, error: userError } = await supabase
            .from("users")
            .select("id, email, handle, coin, email_verified, created_at, password")
            .eq("email", email)
            .single();

        if (userError || !userData) {
            console.error("[POST /api/auth/login] Test user not found");
            return res.status(401).json({ error: "Login failed" });
        }

        // Verify password using bcrypt
        if (!userData.password) {
            console.error("[POST /api/auth/login] No password hash for test user");
            return res.status(401).json({ error: "Login failed" });
        }

        try {
            console.log("[POST /api/auth/login] Comparing password...");
            console.log("[POST /api/auth/login] Input password:", password);
            console.log("[POST /api/auth/login] Stored hash:", userData.password);
            const passwordMatch = await bcrypt.compare(password, userData.password);
            console.log("[POST /api/auth/login] bcrypt.compare result:", passwordMatch);
            if (!passwordMatch) {
                console.error("[POST /api/auth/login] Wrong password for test user");
                return res.status(401).json({ error: "Invalid email or password" });
            }
        } catch (bcryptError) {
            console.error("[POST /api/auth/login] Bcrypt error:", bcryptError);
            return res.status(401).json({ error: "Login failed" });
        }

        console.log("[POST /api/auth/login] Test user logged in:", userData.id);
        return res.status(200).json({
            data: {
                id: userData.id,
                email: userData.email,
                handle: userData.handle,
                coin: userData.coin,
                email_verified: userData.email_verified,
                created_at: userData.created_at
            },
            message: "Test account login successful"
        });
    }

        // Sign in with email and password (normal users)
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (authError) {
        console.error("[POST /api/auth/login] Auth error:", authError);
        return res.status(401).json({ error: authError.message });
    }

    console.log("[POST /api/auth/login] User logged in:", authData.user?.id);

    // Get user data including handle and coin
    const { data: userData, error: userError } = await supabase
        .from("users")
        .select("id, email, handle, coin, email_verified, created_at")
        .eq("id", authData.user.id)
        .single();

    if (userError) {
        console.error("[POST /api/auth/login] User fetch error:", userError);
        return res.status(500).json({ error: userError.message });
    }

    return res.status(200).json({
        session: authData.session,
        user: userData,
        message: "Login successful"
    });
} catch (e) {
    console.error("[POST /api/auth/login] Exception:", e);
    return res.status(500).json({ error: String(e) });
}
});

/** Auth: Set handle for authenticated user */
app.post("/api/auth/set-handle", async (req, res) => {
    try {
        console.log("[POST /api/auth/set-handle] Request body:", { email: req.body?.email, handle: req.body?.handle });
        const { email, handle } = req.body ?? {};

        if (!email || !handle) {
            return res.status(400).json({ error: "email and handle are required" });
        }

        // Get user by email
        const { data: userData, error: userError } = await supabase
            .from("users")
            .select("id, handle")
            .eq("email", email)
            .single();

        if (userError) {
            console.error("[POST /api/auth/set-handle] User fetch error:", userError);
            return res.status(404).json({ error: "User not found" });
        }

        const userId = userData.id;

        // Check if handle already exists (for other users)
        const { data: handleList, error: handleError } = await supabase
            .from("users")
            .select("id, handle")
            .eq("handle", handle);

        if (handleError) {
            console.error("[POST /api/auth/set-handle] Handle check error:", handleError);
        } else if (handleList && handleList.length > 0) {
            const otherUser = handleList.find(u => u.id !== userId);
            if (otherUser) {
                console.log("[POST /api/auth/set-handle] Handle already taken:", handle);
                return res.status(400).json({ error: "Handle is already taken" });
            }
        }

        // Update handle
        const { data: updated, error: updateError } = await supabase
            .from("users")
            .update({ handle })
            .eq("id", userId)
            .select("id, email, handle, coin, email_verified, created_at")
            .single();

        if (updateError) {
            console.error("[POST /api/auth/set-handle] Update error:", updateError);
            return res.status(500).json({ error: updateError.message });
        }

        // Add default professors (only if not already added)
        const existingProfs = await supabase
            .from("user_professors")
            .select("professor_key")
            .eq("user_id", userId);

        if (!existingProfs.error && (!existingProfs.data || existingProfs.data.length === 0)) {
            const defaultProfessors = ["prof_0", "prof_1", "prof_2"];
            const professorRecords = defaultProfessors.map(key => ({
                user_id: userId,
                professor_key: key
            }));

            const { error: professorError } = await supabase
                .from("user_professors")
                .insert(professorRecords);

            if (professorError) {
                console.error("[POST /api/auth/set-handle] Professor insert error:", professorError);
                // Don't fail - user handle is set, professors can be added later
            }
        }

        console.log("[POST /api/auth/set-handle] Handle set successfully");

        return res.status(200).json({
            user: updated,
            message: "Handle set successfully"
        });
    } catch (e) {
        console.error("[POST /api/auth/set-handle] Exception:", e);
        return res.status(500).json({ error: String(e) });
    }
});

/** Auth: Get user by email */
app.get("/api/auth/user/:email", async (req, res) => {
    try {
        const email = decodeURIComponent(req.params.email);
        console.log("[GET /api/auth/user] Email:", email);

        const { data: userData, error: userError } = await supabase
            .from("users")
            .select("id, email, handle, coin, email_verified, created_at")
            .eq("email", email)
            .single();

        if (userError) {
            console.error("[GET /api/auth/user] User fetch error:", userError);
            return res.status(404).json({ error: "User not found" });
        }

        return res.status(200).json({
            user: userData
        });
    } catch (e) {
        console.error("[GET /api/auth/user] Exception:", e);
        return res.status(500).json({ error: String(e) });
    }
});
/** Auth: Change password (requires email and old password for verification) */
app.post("/api/auth/change-password", async (req, res) => {
    try {
        console.log("[POST /api/auth/change-password] Request body:", { email: req.body?.email });
        const { email, oldPassword, newPassword } = req.body ?? {};

        if (!email || !oldPassword || !newPassword) {
            return res.status(400).json({ error: "email, oldPassword, and newPassword are required" });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ error: "New password must be at least 8 characters" });
        }

        // テストアカウントは現行どおり変更不可
        if (email === "example@ynu.jp") {
            return res.status(403).json({ error: "Cannot change password for test account" });
        }

        // 1. 旧パスワード確認: 一般ユーザーとしてログインできるか確認
        const { data: signInData, error: signInError } = await supabasePublic.auth.signInWithPassword({
            email,
            password: oldPassword,
        });

        if (signInError || !signInData?.user) {
            console.error("[POST /api/auth/change-password] Authentication failed:", signInError);
            return res.status(401).json({ error: "Current password is incorrect" });
        }

        // 2. 管理者権限でパスワード更新
        const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
            signInData.user.id,
            { password: newPassword }
        );

        if (error) {
            console.error("[POST /api/auth/change-password] Update failed:", error);
            return res.status(500).json({ error: error.message });
        }

        console.log("[POST /api/auth/change-password] Password changed successfully");

        return res.status(200).json({
            message: "Password changed successfully",
            userId: data.user.id,
        });
    } catch (e) {
        console.error("[POST /api/auth/change-password] Exception:", e);
        return res.status(500).json({ error: String(e) });
    }
});

/** Auth: Update handle for authenticated user */
app.post("/api/auth/update-handle", async (req, res) => {
    try {
        console.log("[POST /api/auth/update-handle] Request body:", { email: req.body?.email, newHandle: req.body?.newHandle });
        const { email, newHandle } = req.body ?? {};

        if (!email || !newHandle) {
            return res.status(400).json({ error: "email and newHandle are required" });
        }

        // Validate newHandle (3+ chars, alphanumeric + underscore/hyphen)
        if (newHandle.length < 3) {
            return res.status(400).json({ error: "Handle must be at least 3 characters" });
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(newHandle)) {
            return res.status(400).json({ error: "Handle can only contain letters, numbers, underscores, and hyphens" });
        }

        // Get current user by email
        const { data: userData, error: userError } = await supabase
            .from("users")
            .select("id, email, handle")
            .eq("email", email)
            .single();

        if (userError || !userData) {
            console.error("[POST /api/auth/update-handle] User fetch error:", userError);
            return res.status(404).json({ error: "User not found" });
        }

        // Check if newHandle is already taken by another user
        const { data: existingHandle } = await supabase
            .from("users")
            .select("id")
            .eq("handle", newHandle)
            .maybeSingle();

        if (existingHandle && existingHandle.id !== userData.id) {
            console.log("[POST /api/auth/update-handle] Handle already taken:", newHandle);
            return res.status(409).json({ error: "Handle is already taken" });
        }

        // Update handle
        const { data: updated, error: updateError } = await supabase
            .from("users")
            .update({ handle: newHandle })
            .eq("id", userData.id)
            .select("id, email, handle, coin, email_verified, created_at")
            .single();

        if (updateError) {
            console.error("[POST /api/auth/update-handle] Update error:", updateError);
            return res.status(500).json({ error: updateError.message });
        }

        console.log("[POST /api/auth/update-handle] Handle updated successfully:", newHandle);

        return res.status(200).json({
            user: updated,
            message: "Handle updated successfully"
        });
    } catch (e) {
        console.error("[POST /api/auth/update-handle] Exception:", e);
        return res.status(500).json({ error: String(e) });
    }
});

/** Auth: Check in and gain coins (with conditions: time, location, IP) */
app.post("/api/auth/checkin", async (req, res) => {
    try {
        console.log("[POST /api/auth/checkin] Request body:", { email: req.body?.email });
        const { email, latitude, longitude } = req.body ?? {};

        if (!email) {
            return res.status(400).json({ error: "email is required" });
        }

        // Get current user and coin balance
        const { data: userData, error: userError } = await supabase
            .from("users")
            .select("id, email, handle, coin, email_verified, created_at")
            .eq("email", email)
            .single();

        if (userError || !userData) {
            console.error("[POST /api/auth/checkin] User fetch error:", userError);
            return res.status(404).json({ error: "User not found" });
        }

        // === Condition 1: Check if current time is within class period ===
        const currentPeriod = getCurrentClassPeriod();
        if (!currentPeriod) {
            return res.status(400).json({ error: "授業時間帯外です。授業時間内に出席してください。" });
        }

        // Get user's schedule for today
        const now = new Date();
        const weekday = now.getDay(); // 0=Sun, 1=Mon, etc.

        const { data: schedule, error: scheduleError } = await supabase
            .from("users_schedule")
            .select("subject")
            .eq("user_id", userData.id)
            .eq("weekday", weekday)
            .eq("period", currentPeriod)
            .maybeSingle();

        if (scheduleError) {
            console.error("[POST /api/auth/checkin] Schedule fetch error:", scheduleError);
            return res.status(500).json({ error: scheduleError.message });
        }

        if (!schedule) {
            return res.status(400).json({ error: "この時間に授業がありません。" });
        }

        // === Condition 2: Check GPS location ===
        if (latitude === undefined || longitude === undefined) {
            return res.status(400).json({ error: "位置情報が必要です。位置情報許可を有効にしてください。" });
        }

        const distance = calculateDistance(CAMPUS_LOCATION.latitude, CAMPUS_LOCATION.longitude, latitude, longitude);
        console.log(`[POST /api/auth/checkin] Distance from campus: ${distance.toFixed(2)}m`);

        if (distance > CAMPUS_RADIUS_METERS) {
            return res.status(400).json({
                error: `キャンパス内にいません。キャンパスから ${distance.toFixed(0)}m 離れています。`
            });
        }

        // === Condition 3: Check IP address ===
        const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress;
        console.log(`[POST /api/auth/checkin] Client IP: ${clientIp}`);

        if (!isIpAllowed(clientIp)) {
            return res.status(400).json({
                error: "大学ネットワークからのアクセスが必要です。"
            });
        }

        // All conditions passed - increment coin by 1
        const newCoin = (userData.coin ?? 0) + 1;

        // Update coin
        const { data: updated, error: updateError } = await supabase
            .from("users")
            .update({ coin: newCoin })
            .eq("id", userData.id)
            .select("id, email, handle, coin, email_verified, created_at")
            .single();

        if (updateError) {
            console.error("[POST /api/auth/checkin] Update error:", updateError);
            return res.status(500).json({ error: updateError.message });
        }

        console.log("[POST /api/auth/checkin] Check-in successful, new coin count:", newCoin);

        return res.status(200).json({
            user: updated,
            message: "出席しました！コイン +1",
            checkinDetails: {
                period: currentPeriod,
                subject: schedule.subject,
                distance: distance.toFixed(2),
                ip: clientIp
            }
        });
    } catch (e) {
        console.error("[POST /api/auth/checkin] Exception:", e);
        return res.status(500).json({ error: String(e) });
    }
});

/** Schedule: Get user's schedule */
app.get("/api/schedule/:handle", async (req, res) => {
    try {
        const handle = req.params.handle;
        const userId = await getUserIdByHandle(handle);

        if (!userId) {
            return res.status(404).json({ error: "User not found" });
        }

        const { data, error } = await supabase
            .from("users_schedule")
            .select("id, weekday, period, subject, room")
            .eq("user_id", userId)
            .order("weekday", { ascending: true })
            .order("period", { ascending: true });

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        // Add period info (name, start time, end time)
        const scheduleWithDetails = (data ?? []).map((item) => ({
            ...item,
            periodInfo: CLASS_PERIODS[item.period] || null,
        }));

        res.status(200).json({ data: scheduleWithDetails });
    } catch (e) {
        return res.status(500).json({ error: String(e) });
    }
});

/** Schedule: Update user's schedule (upsert) */
app.post("/api/schedule/:handle", async (req, res) => {
    try {
        const handle = req.params.handle;
        const { weekday, period, subject, room } = req.body ?? {};

        if (weekday === undefined || period === undefined) {
            return res.status(400).json({ error: "weekday and period are required" });
        }

        if (weekday < 0 || weekday > 6 || period < 1 || period > 7) {
            return res.status(400).json({ error: "Invalid weekday or period" });
        }

        const userId = await getUserIdByHandle(handle);
        if (!userId) {
            return res.status(404).json({ error: "User not found" });
        }

        // Upsert schedule
        const { data, error } = await supabase
            .from("users_schedule")
            .upsert({
                user_id: userId,
                weekday,
                period,
                subject: subject || null,
                room: room || null,
            }, { onConflict: "user_id,weekday,period" })
            .select("id, weekday, period, subject, room");

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        res.status(200).json({ data: data?.[0] || null });
    } catch (e) {
        return res.status(500).json({ error: String(e) });
    }
});

/** Schedule: Delete schedule entry */
app.delete("/api/schedule/:handle", async (req, res) => {
    try {
        const handle = req.params.handle;
        const { weekday, period } = req.body ?? {};

        if (weekday === undefined || period === undefined) {
            return res.status(400).json({ error: "weekday and period are required" });
        }

        const userId = await getUserIdByHandle(handle);
        if (!userId) {
            return res.status(404).json({ error: "User not found" });
        }

        const { error } = await supabase
            .from("users_schedule")
            .delete()
            .eq("user_id", userId)
            .eq("weekday", weekday)
            .eq("period", period);

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        res.status(200).json({ message: "Schedule deleted" });
    } catch (e) {
        return res.status(500).json({ error: String(e) });
    }
});

/** DEBUG: Check test account status */
app.get("/api/debug/test-account", async (_req, res) => {
    try {
        // Check by handle
        const { data: byHandle, error: handleError } = await supabase
            .from("users")
            .select("id, email, handle, password")
            .eq("handle", "example")
            .single();

        // Check by email
        const { data: byEmail, error: emailError } = await supabase
            .from("users")
            .select("id, email, handle, password")
            .eq("email", "example@ynu.jp")
            .maybeSingle();

        return res.status(200).json({
            byHandle: { data: byHandle, error: handleError },
            byEmail: { data: byEmail, error: emailError }
        });
    } catch (e) {
        return res.status(500).json({ error: String(e) });
    }
});