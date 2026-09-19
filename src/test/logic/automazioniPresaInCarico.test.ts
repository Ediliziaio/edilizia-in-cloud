import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { prendiInCarico } from "../../../supabase/functions/_shared/presaInCarico";

// 19/09/2026 — collaudo del flusso «Download Risorse — PDF Vendita»: due giri
// del cron sovrapposti hanno eseguito due volte ogni passo (due notifiche W1,
// due email L1 in coda). Ogni riga di coda deve essere presa da un giro solo.

type Riga = Record<string, unknown> & { id: string };

// Tabella finta con la semantica di Postgres: l'UPDATE … WHERE è atomico, e chi
// arriva secondo rilegge la condizione sul valore già cambiato.
function databaseFinto(righe: Riga[]) {
  const tabella = new Map(righe.map((r) => [r.id, { ...r }]));
  return {
    tabella,
    from() {
      return {
        update(nuovo: Record<string, unknown>) {
          const filtri: Array<[string, unknown]> = [];
          const catena = {
            eq(colonna: string, valore: unknown) {
              filtri.push([colonna, valore]);
              return catena;
            },
            async select() {
              await Promise.resolve(); // due giri «insieme»: si intrecciano qui
              const toccate = [...tabella.values()].filter((r) => filtri.every(([c, v]) => r[c] === v));
              for (const r of toccate) Object.assign(r, nuovo);
              return { data: toccate.map((r) => ({ id: r.id })), error: null as { message: string } | null };
            },
          };
          return catena;
        },
      };
    },
  };
}

describe("presa in carico di una riga di coda", () => {
  it("due giri sovrapposti: la prende uno solo", async () => {
    const db = databaseFinto([{ id: "passo-1", status: "pending" }]);
    const [a, b] = await Promise.all([
      prendiInCarico(db, "automation_queue", "passo-1", "status", "pending", { status: "processing" }),
      prendiInCarico(db, "automation_queue", "passo-1", "status", "pending", { status: "processing" }),
    ]);
    expect([a.presa, b.presa].filter(Boolean)).toHaveLength(1);
    expect(db.tabella.get("passo-1")?.status).toBe("processing");
  });

  it("un evento già preso non si riprende", async () => {
    const db = databaseFinto([{ id: "evt-1", processed: true }]);
    const r = await prendiInCarico(db, "automation_trigger_events", "evt-1", "processed", false, { processed: true });
    expect(r.presa).toBe(false);
  });

  it("se l'UPDATE fallisce la riga non risulta presa, e l'errore si vede", async () => {
    const rotto = {
      from: () => ({
        update: () => {
          const c = { eq: () => c, select: async () => ({ data: null as unknown, error: { message: "timeout" } }) };
          return c;
        },
      }),
    };
    const r = await prendiInCarico(rotto, "automation_queue", "x", "status", "pending", { status: "processing" });
    expect(r).toEqual({ presa: false, errore: "timeout" });
  });
});

describe("il motore prende ogni riga in modo atomico", () => {
  const motore = readFileSync(join(__dirname, "../../../supabase/functions/process-automation/index.ts"), "utf8");

  it("passi in coda, eventi, attese scadute e attese risolte", () => {
    expect(motore).toContain('prendiInCarico(supabase, "automation_queue", item.id, "status", "pending"');
    expect(motore).toContain('prendiInCarico(supabase, "automation_trigger_events", evt.id, "processed", false');
    expect(motore.match(/prendiInCarico\(supabase, "automation_queue", item\.id, "status", "waiting"/g)).toHaveLength(2);
  });

  it("niente più «segna come fatto» senza condizione", () => {
    // Il vecchio passo: UPDATE processing su id soltanto, prima di eseguire.
    expect(motore).not.toMatch(/\.update\(\{ status: "processing", updated_at: now \}\)\s*\.eq\("id", item\.id\);/);
    // Il vecchio evento: processed=true DOPO averlo gestito.
    expect(motore).not.toMatch(/\.update\(\{ processed: true \}\)\s*\.eq\("id", evt\.id\);/);
    // Se la gestione fallisce l'evento torna in coda.
    expect(motore).toContain('update({ processed: false }).eq("id", evt.id)');
  });
});

// automation_enrollments_status_check ammette solo questi stati. Uno diverso fa
// fallire l'UPDATE senza che nessuno se ne accorga: dal 05/09 «Interrompi su
// risposta» scriveva «stopped» e l'iscrizione restava «active» per sempre.
describe("le funzioni scrivono sulle iscrizioni solo stati ammessi", () => {
  const AMMESSI = new Set(["active", "paused", "completed", "canceled", "waiting", "removed", "failed"]);
  const radice = join(__dirname, "../../../supabase/functions");

  it("nessuno stato fuori elenco su automation_enrollments", () => {
    const fuori: string[] = [];
    for (const cartella of readdirSync(radice)) {
      let testo: string;
      try {
        testo = readFileSync(join(radice, cartella, "index.ts"), "utf8");
      } catch {
        continue;
      }
      // Ogni scrittura: from("automation_enrollments") … update/insert({ … status: "x"
      const scritture = testo.matchAll(/from\("automation_enrollments"\)\s*\.(?:update|insert)\(\{[^}]*?status: "([a-z_]+)"/g);
      for (const m of scritture) if (!AMMESSI.has(m[1])) fuori.push(`${cartella}: ${m[1]}`);
    }
    expect(fuori).toEqual([]);
  });

  it("chi si ferma per una risposta finisce «canceled»", () => {
    const motore = readFileSync(join(radice, "process-automation/index.ts"), "utf8");
    expect(motore).toMatch(/from\("automation_enrollments"\)\s*\.update\(\{ status: "canceled"/);
  });
});
