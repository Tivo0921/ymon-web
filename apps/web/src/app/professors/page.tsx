type Professor = {
    id: number;
    key: string;
    level: number;
    hp: number;
    atk: number;
    def: number;
    spd: number;
    type: string;
    name: string;
    skills: string[];
};

export default async function ProfessorsPage() {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

    const res = await fetch(`${base}/api/professors`, { cache: "no-store" });
    const json = await res.json();
    const data: Professor[] = json.data ?? [];

    return (
        <main style={{ padding: 24, fontFamily: "ui-sans-serif, system-ui" }}>
            <h1>Professors</h1>

            <ul style={{ display: "grid", gap: 12, listStyle: "none", padding: 0 }}>
                {data.map((p) => (
                    <li
                        key={p.key}
                        style={{
                            border: "1px solid #ddd",
                            borderRadius: 12,
                            padding: 12,
                        }}
                    >
                        <div style={{ fontWeight: 700, fontSize: 18 }}>
                            {p.name} <span style={{ fontWeight: 400 }}>（{p.type} / Lv.{p.level}）</span>
                        </div>
                        <div style={{ marginTop: 6 }}>
                            HP {p.hp} / ATK {p.atk} / DEF {p.def} / SPD {p.spd}
                        </div>
                        <ol style={{ marginTop: 8 }}>
                            {p.skills.map((s, i) => (
                                <li key={i}>{s}</li>
                            ))}
                        </ol>
                    </li>
                ))}
            </ul>
        </main>
    );
}