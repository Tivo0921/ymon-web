export default async function DebugPage() {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

    const healthRes = await fetch(`${base}/health`, { cache: "no-store" });
    const health = await healthRes.json();

    const usersRes = await fetch(`${base}/debug/users`, { cache: "no-store" });
    const users = await usersRes.json();

    return (
        <main style={{ padding: 24, fontFamily: "ui-sans-serif, system-ui" }}>
            <h1>ymon-web Debug</h1>

            <section style={{ marginTop: 16 }}>
                <h2>API Health</h2>
                <pre>{JSON.stringify(health, null, 2)}</pre>
            </section>

            <section style={{ marginTop: 16 }}>
                <h2>Latest Users</h2>
                <pre>{JSON.stringify(users, null, 2)}</pre>
            </section>
        </main>
    );
}