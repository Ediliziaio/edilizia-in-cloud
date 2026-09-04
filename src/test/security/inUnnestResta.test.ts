import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Perché la voce 1.1 del piano non si può fare come è scritta.
 *
 * Il briefing dice di riscrivere `company_id IN (SELECT unnest(f()))` come
 * `= ANY(f())`. Sulla condizione isolata la raccomandazione è giusta:
 *   IN ( SELECT unnest(f()) ) ... 31,9 ms
 *   = ANY(f()) .................   4,6 ms
 *
 * L'ho applicata a 10 policy su 6 tabelle del CRM, su produzione. La lettura di
 * marketing_contacts è passata da circa due secondi a **oltre centodieci**: la
 * funzione veniva chiamata riga per riga, 90.382 volte, e ognuna è una
 * SECURITY DEFINER che interroga altre tabelle. Ripristinate tutte e dieci da
 * zz_policy_backup in pochi minuti; righe viste tornate identiche (834, 132,
 * 241, 132, 0, 0 per lo staff di prova) e tempi rientrati.
 *
 * Il motivo per cui la misura isolata inganna: una policy non vive da sola.
 * Postgres somma in OR le condizioni di tutte le policy permissive che valgono
 * per quella lettura — su marketing_contacts sono quattro. Dentro un OR
 * l'indice non si usa comunque, la condizione diventa un filtro, e conta solo
 * quante volte viene valutata la funzione. Ricostruendo la stessa struttura:
 *   OR + IN ( SELECT unnest(f()) ) ....... 325,7 ms   ← la forma in uso
 *   OR + = ANY(f()) ...................... 890,1 ms
 *   OR + = ANY( (SELECT f())::uuid[] ) ... 860,9 ms
 *
 * `IN ( SELECT ... )` diventa un SubPlan con hash: funzione eseguita una volta,
 * poi una ricerca hash per riga. Nella pila di policy reale è la forma che
 * protegge, e nemmeno il sottoselect la batte.
 *
 * Il guadagno vero su quelle letture sta nel numero di policy sommate in OR:
 * è il punto 1.2, e su quelle tabelle è ancora da fare.
 */

const dir = resolve(__dirname, "../../../supabase/migrations");
const nome = readdirSync(dir).find((f) => f.includes("perche_in_select_unnest_resta"));
if (!nome) throw new Error("migrazione perche_in_select_unnest_resta non trovata");
const sql = readFileSync(resolve(dir, nome), "utf8");

describe("il tentativo è raccontato, non cancellato", () => {
  it("dice che la raccomandazione isolata è giusta", () => {
    expect(sql).toMatch(/31,9 ms/);
    expect(sql).toMatch(/= ANY\(f\(\)\) \.+\s+4,6 ms/);
  });

  it("dice cosa è successo davvero in produzione", () => {
    expect(sql).toMatch(/da circa due secondi a \*\*oltre centodieci\*\*/);
    expect(sql).toMatch(/chiamata riga per riga/);
  });

  it("dice che è stato ripristinato e come lo si è verificato", () => {
    expect(sql).toMatch(/Ho ripristinato\s*\n--\s*tutte e dieci le policy da zz_policy_backup/);
    expect(sql).toMatch(/righe viste tornassero identiche \(834, 132, 241, 132, 0, 0/);
  });
});

describe("la spiegazione, non solo il numero", () => {
  it("nomina la causa: le policy si sommano in OR", () => {
    expect(sql).toMatch(/somma in OR le condizioni di tutte le policy permissive/);
    expect(sql).toMatch(/su marketing_contacts sono quattro/);
  });

  it("riporta le tre forme misurate nel contesto vero", () => {
    expect(sql).toMatch(/OR \+ IN \( SELECT unnest\(f\(\)\) \) \.+ 325,7 ms/);
    expect(sql).toMatch(/OR \+ = ANY\(f\(\)\) \.+ 890,1 ms/);
    expect(sql).toMatch(/860,9 ms/);
  });

  it("spiega il meccanismo, così non serve rifare la prova", () => {
    expect(sql).toMatch(/diventa un SubPlan con hash: la funzione viene eseguita\s*\n--\s*una volta sola/);
  });

  it("indica dove sta il guadagno vero", () => {
    expect(sql).toMatch(/non sta nella\s*\n--\s*forma della condizione ma nel numero di policy sommate in OR/);
    expect(sql).toMatch(/e' il punto 1\.2\s*\n--\s*del piano, e su quelle tabelle e' ancora da fare/);
  });
});

describe("gli attrezzi sbagliati non restano in giro", () => {
  it("le due funzioni della riscrittura vengono rimosse", () => {
    expect(sql).toMatch(/drop function if exists public\.policy_riscrivi_any\(regclass\)/);
    expect(sql).toMatch(/drop function if exists public\.espressione_any\(text\)/);
  });

  it("ed è detto perché: perché nessuno le riusi credendole un miglioramento", () => {
    expect(sql).toMatch(/nessuno le trova e le riusa credendo che siano un miglioramento/);
  });
});
