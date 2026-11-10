/**
 * Una vista che leggeva coi permessi di chi chiede deve continuare a farlo (10/11/2026).
 *
 * `CREATE OR REPLACE VIEW` senza `WITH (security_invoker = on)` toglie l'impostazione in
 * silenzio: la vista torna a girare coi permessi del proprietario e scavalca le regole per
 * azienda. Così dal 09/11 `v_cg_costi_classificati` mostrava a ogni utente collegato i costi e i
 * movimenti bancari di tutte le aziende, e nessun controllo se n'è accorto.
 *
 * Regola: se una vista è mai stata dichiarata `security_invoker`, dopo la sua ultima riscrittura
 * l'impostazione deve tornare, nello stesso file o in uno successivo.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = join(__dirname, "../../..", "supabase/migrations");
const files = readdirSync(DIR)
  .filter((f) => /^\d{14}_.+\.sql$/.test(f))
  .sort();

const rigaInvoker = (vista: string) =>
  new RegExp(
    `(view\\s+public\\.${vista}\\s+with\\s*\\([^)]*security_invoker\\s*=\\s*(on|true))|` +
      `(alter\\s+view\\s+(if\\s+exists\\s+)?public\\.${vista}\\s+set\\s*\\([^)]*security_invoker\\s*=\\s*(on|true))`,
    "i",
  );

/**
 * Controllate sul database il 10/11/2026. Le prime quattro hanno `security_invoker=on`, dato da
 * un ciclo `DO … format()` che questo test non sa leggere (20260527142817, 20280227000001).
 * L'ultima è pubblica di proposito: gli orari liberi per le prenotazioni, letti anche da anon.
 */
const VERIFICATE_SUL_DATABASE = new Set([
  "company_renders_recent",
  "v_my_email_inbox",
  "v_my_email_threads",
  "referral_leaderboard",
  "public_appointment_slots",
]);

/** Per ogni vista: in quali file è (ri)creata e in quali le si dà l'impostazione. */
function censimento() {
  const definita = new Map<string, number[]>();
  const invoker = new Map<string, number[]>();
  files.forEach((f, i) => {
    const sql = readFileSync(join(DIR, f), "utf8");
    for (const m of sql.matchAll(/create\s+(or\s+replace\s+)?view\s+(if\s+not\s+exists\s+)?public\.(\w+)/gi)) {
      const v = m[3].toLowerCase();
      definita.set(v, [...(definita.get(v) ?? []), i]);
      if (rigaInvoker(v).test(sql)) invoker.set(v, [...(invoker.get(v) ?? []), i]);
    }
    for (const m of sql.matchAll(/alter\s+view\s+(if\s+exists\s+)?public\.(\w+)\s+set\s*\([^)]*security_invoker\s*=\s*(on|true)/gi)) {
      const v = m[2].toLowerCase();
      invoker.set(v, [...(invoker.get(v) ?? []), i]);
    }
  });
  return { definita, invoker };
}

describe("Viste che leggono coi permessi di chi chiede", () => {
  it("non perdono l'impostazione quando vengono riscritte", () => {
    const { definita, invoker } = censimento();
    const perse: string[] = [];
    for (const [vista, volte] of definita) {
      const conInvoker = invoker.get(vista);
      if (!conInvoker?.length) continue; // mai stata invoker: è una scelta, non una svista
      if (VERIFICATE_SUL_DATABASE.has(vista)) continue;
      const ultimaRiscrittura = Math.max(...volte);
      const ultimoInvoker = Math.max(...conInvoker);
      if (ultimoInvoker < ultimaRiscrittura) perse.push(`${vista} (riscritta in ${files[ultimaRiscrittura]})`);
    }
    expect(perse).toEqual([]);
  });

  it("i costi del Controllo di Gestione si leggono coi permessi di chi chiede", () => {
    const { definita, invoker } = censimento();
    expect(Math.max(...(invoker.get("v_cg_costi_classificati") ?? [-1]))).toBeGreaterThanOrEqual(
      Math.max(...(definita.get("v_cg_costi_classificati") ?? [])),
    );
  });
});
