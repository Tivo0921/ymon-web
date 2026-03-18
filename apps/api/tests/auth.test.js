import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createClient } from "@supabase/supabase-js";
import app from "../index.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

const unique = Date.now();
const testEmail = `auth-test-${unique}@ynu.jp`;
const initialPassword = "InitialPass123!";
const newPassword = "NewPass123!";
const testHandle = `auth_test_${unique}`;

let createdUserId = null;

describe("Auth API", () => {
    beforeAll(async () => {
        const { data } = await admin.auth.admin.listUsers();
        const existing = data?.users?.find((u) => u.email === testEmail);
        if (existing) {
            await admin.auth.admin.deleteUser(existing.id);
        }
    });

    afterAll(async () => {
        if (createdUserId) {
            await admin.auth.admin.deleteUser(createdUserId);
        }
    });

    it("signup できる", async () => {
        const res = await request(app)
            .post("/api/auth/signup")
            .send({
                email: testEmail,
                password: initialPassword,
            });

        expect([200, 201]).toContain(res.status);
        expect(res.body.user).toBeTruthy();
        createdUserId = res.body.user.id;
        expect(createdUserId).toBeTruthy();
    });

    it("login できる", async () => {
        const res = await request(app)
            .post("/api/auth/login")
            .send({
                email: testEmail,
                password: initialPassword,
            });

        expect(res.status).toBe(200);
        expect(res.body.user).toBeTruthy();
    });

    it("handle を設定できる", async () => {
        const res = await request(app)
            .post("/api/auth/set-handle")
            .send({
                email: testEmail,
                handle: testHandle,
            });

        expect(res.status).toBe(200);
        expect(res.body.user.handle).toBe(testHandle);
    });

    it("誤った旧パスワードでは change-password に失敗する", async () => {
        const res = await request(app)
            .post("/api/auth/change-password")
            .send({
                email: testEmail,
                oldPassword: "WrongPassword123!",
                newPassword,
            });

        expect(res.status).toBe(401);
    });

    it("正しい旧パスワードなら change-password できる", async () => {
        const res = await request(app)
            .post("/api/auth/change-password")
            .send({
                email: testEmail,
                oldPassword: initialPassword,
                newPassword,
            });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Password changed successfully");
    });

    it("旧パスワードでは login できない", async () => {
        const res = await request(app)
            .post("/api/auth/login")
            .send({
                email: testEmail,
                password: initialPassword,
            });

        expect(res.status).toBe(401);
    });

    it("新パスワードでは login できる", async () => {
        const res = await request(app)
            .post("/api/auth/login")
            .send({
                email: testEmail,
                password: newPassword,
            });

        expect(res.status).toBe(200);
        expect(res.body.user).toBeTruthy();
    });

    it("test account は change-password できない", async () => {
        const res = await request(app)
            .post("/api/auth/change-password")
            .send({
                email: "example@ynu.jp",
                oldPassword: "whatever123",
                newPassword: "AnotherPass123!",
            });

        expect(res.status).toBe(403);
    });

    it("@ynu.jp 以外は signup できない", async () => {
        const res = await request(app)
            .post("/api/auth/signup")
            .send({
                email: `bad-${Date.now()}@gmail.com`,
                password: "ValidPass123!",
            });

        expect(res.status).toBe(400);
    });

    it("短い新パスワードは change-password できない", async () => {
        const res = await request(app)
            .post("/api/auth/change-password")
            .send({
                email: testEmail,
                oldPassword: newPassword,
                newPassword: "short",
            });

        expect(res.status).toBe(400);
    });
});