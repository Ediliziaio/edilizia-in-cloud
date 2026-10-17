import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { controllaMemoria, leggiMemoria, livello, livelloPersistente, testoFoto } from "../../../scripts/sentinella-memoria.mjs";

const GiB = 2 ** 30;
const metriche = (v: { impegnata: number; disponibile: number; swapLibero?: number }) => {
  const et = 'supabase_project_ref="rsbrguhkodgnqfomrevo",service_type="db"';
  return [
    "# HELP node_memory_MemTotal_bytes x",
    `node_memory_MemTotal_bytes{${et}} ${8 * GiB}`,
    `node_memory_MemAvailable_bytes{${et}} ${v.disponibile * GiB}`,
    `node_memory_SwapTotal_bytes{${et}} ${1 * GiB}`,
    `node_memory_SwapFree_bytes{${et}} ${(v.swapLibero ?? 1) * GiB}`,
    `node_memory_Committed_AS_bytes{${et}} ${v.impegnata * GiB}`,
    `node_memory_CommitLimit_bytes{${et}} ${4.77 * GiB}`,
    // Un altro servizio con gli stessi nomi non deve confondere la lettura.
    `node_memory_MemAvailable_bytes{supabase_project_ref="x",service_type="pooler"} 1`,
  ].join("\n");
};

describe("sentinella della memoria del database", () => {
  it("legge le metriche del database e ignora gli altri servizi", () => {
    const l = leggiMemoria(metriche({ impegnata: 3.5, disponibile: 5 }))!;
    expect(Math.round(l.impegnataPct)).toBe(73);
    expect(Math.round(l.disponibilePct)).toBe(63);
    expect(l.swapPct).toBe(0);
    expect(livello(l)).toBe("ok");
  });

  it("senza tutte le metriche non inventa una lettura", () => {
    expect(leggiMemoria("node_memory_MemTotal_bytes{service_type=\"db\"} 100")).toBeNull();
    expect(leggiMemoria("")).toBeNull();
  });

  it("i livelli seguono impegnata, disponibile e swap", () => {
    expect(livello(leggiMemoria(metriche({ impegnata: 4.4, disponibile: 3 }))!)).toBe("attenzione");
    expect(livello(leggiMemoria(metriche({ impegnata: 4.7, disponibile: 3 }))!)).toBe("critico");
    expect(livello(leggiMemoria(metriche({ impegnata: 3, disponibile: 0.6 }))!)).toBe("critico");
    expect(livello(leggiMemoria(metriche({ impegnata: 3, disponibile: 4, swapLibero: 0.7 }))!)).toBe("attenzione");
  });

  it("un picco in una sola lettura non fa scattare l'avviso", () => {
    const ok = leggiMemoria(metriche({ impegnata: 3, disponibile: 4 }))!;
    const critico = leggiMemoria(metriche({ impegnata: 4.7, disponibile: 0.5 }))!;
    const attenzione = leggiMemoria(metriche({ impegnata: 4.4, disponibile: 3 }))!;
    expect(livelloPersistente([ok, critico, critico])).toBe("ok");
    expect(livelloPersistente([attenzione, critico, critico])).toBe("attenzione");
    expect(livelloPersistente([critico, critico, critico])).toBe("critico");
  });

  it("usa la chiave di servizio solo verso le metriche e fa tre letture", async () => {
    const send = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("api-keys")) return Response.json([{ name: "anon", api_key: "a" }, { name: "service_role", api_key: "segreta" }]);
      if (url.endsWith("/database/query")) return Response.json([{ foto: { query_attive: 0 } }]);
      expect(url).toBe("https://rsbrguhkodgnqfomrevo.supabase.co/customer/v1/privileged/metrics");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Basic " + Buffer.from("service_role:segreta").toString("base64"));
      return new Response(metriche({ impegnata: 4.7, disponibile: 0.5 }));
    });
    const wait = vi.fn();
    const r = await controllaMemoria({ TOKEN: "t", REF: "rsbrguhkodgnqfomrevo" }, send, wait);
    expect(r.letture).toHaveLength(3);
    expect(r.livello).toBe("critico");
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it("la prova fallisce sempre, anche con memoria sana", async () => {
    const send = vi.fn(async (url: string) =>
      url.includes("api-keys") ? Response.json([{ name: "service_role", api_key: "k" }])
        : url.endsWith("/database/query") ? Response.json([{ foto: { query_attive: 0 } }])
        : new Response(metriche({ impegnata: 2, disponibile: 6 })));
    expect((await controllaMemoria({ TOKEN: "t", REF: "rsbrguhkodgnqfomrevo", PROVA: "true" }, send, vi.fn())).livello).toBe("critico");
  });

  it("un picco in UNA sola lettura basta per la foto, ma non per l'avviso", async () => {
    let n = 0;
    const chiamate: string[] = [];
    const send = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("api-keys")) return Response.json([{ name: "service_role", api_key: "k" }]);
      if (url.endsWith("/database/query")) {
        chiamate.push(String(init?.body));
        return Response.json([{ foto: { query_attive: 3, cron_in_corso: [{ jobname: "mkt-motore-regole", da_s: 40 }] } }]);
      }
      n += 1;
      return new Response(metriche(n === 2 ? { impegnata: 4.7, disponibile: 0.5 } : { impegnata: 3, disponibile: 4 }));
    });
    const r = await controllaMemoria({ TOKEN: "t", REF: "rsbrguhkodgnqfomrevo" }, send, vi.fn());
    expect(r.livello).toBe("ok");
    expect(r.foto?.query_attive).toBe(3);
    expect(chiamate).toHaveLength(1);
    expect(chiamate[0]).toContain("memoria_scatta_foto('critico'");
  });

  it("con memoria tranquilla non disturba il database", async () => {
    const send = vi.fn(async (url: string) =>
      url.includes("api-keys") ? Response.json([{ name: "service_role", api_key: "k" }]) : new Response(metriche({ impegnata: 3, disponibile: 4 })));
    const r = await controllaMemoria({ TOKEN: "t", REF: "rsbrguhkodgnqfomrevo" }, send, vi.fn());
    expect(r.foto).toBeNull();
    expect(send.mock.calls.some(([u]) => String(u).endsWith("/database/query"))).toBe(false);
  });

  it("il riepilogo pubblico della foto non contiene il testo delle query", () => {
    const t = testoFoto({
      connessioni: [{ app: "postgrest", utente: "authenticator", n: 40, attive: 12, ferme_in_transazione: 0, attiva_da_s: 30 }],
      query_attive: 12,
      piu_lunghe: [{ app: "postgrest", stato: "active", attesa: null, durata_s: 30, query_id: "-885" }],
      cron_in_corso: [{ jobname: "liste-automatiche-nightly", da_s: 90 }],
    });
    expect(t).toContain("liste-automatiche-nightly (90 s)");
    expect(t).toContain("| postgrest | 40 | 12 | 0 | 30 |");
    expect(t).not.toMatch(/select|insert|update/i);
    expect(testoFoto(null)).toBe("");
  });

  it("la funzione della foto è chiusa e il testo delle query resta nel database", () => {
    const sql = readFileSync("supabase/migrations/20281017090000_memoria_foto_picchi.sql", "utf8");
    expect(sql).toContain("revoke all on function public.memoria_scatta_foto(text, jsonb) from public, anon, authenticated");
    expect(sql).toContain("revoke all on public.memoria_foto_picchi from public, anon, authenticated");
    expect(sql).toContain("statement_timeout = '5s'");
    const ritorno = sql.slice(sql.indexOf("return jsonb_build_object"));
    expect(ritorno).not.toContain("'query'");
  });

  it("il workflow lancia il controllo della memoria anche se il database è giù", () => {
    const yml = readFileSync(".github/workflows/sentinella-database.yml", "utf8");
    expect(yml).toContain("node scripts/sentinella-memoria.mjs");
    expect(yml).toMatch(/Controlla la memoria[\s\S]*if: always\(\)/);
  });
});
