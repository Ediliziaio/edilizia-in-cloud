/**
 * Il venduto delle fasi lo scrive solo chi vede gli importi (06/10/2026).
 *
 * order_work_phases.importo_venduto nell'app si scrive con «Ordini e Commesse»
 * e «Importi di vendita», ma le policy della tabella decidono sulla riga: dalle
 * API lo scrivevano anche l'operaio e il subappaltatore assegnati alla
 * commessa, l'ufficio senza importi (anche creando una fase) e
 * l'amministratore di un'altra azienda messo sulla commessa. Provato in una
 * transazione annullata, prima e dopo la migrazione. Il trigger
 * trg_fase_venduto_solo_con_importi rifiuta il cambio a chi non ha i due
 * permessi nell'azienda della commessa; passano il server (SECURITY DEFINER,
 * service role), il super admin e l'amministratore di quell'azienda.
 *
 * Tiene fermo:
 *   · il trigger scatta sulla creazione e sulla modifica del venduto, e
 *     confronta davvero il valore di prima con quello nuovo;
 *   · l'azienda è quella della commessa (prima e dopo), non la company_id
 *     della riga né l'azienda in cui l'utente sta lavorando;
 *   · i permessi sono quelli e solo quelli, per azienda;
 *   · la migrazione è rilanciabile e con lock_timeout;
 *   · l'app scrive il venduto in un punto solo e solo con gli stessi due
 *     permessi; il verbale SAL «Dalle fasi» (SalTab, salDaFasi) lo legge
 *     soltanto, per l'importo contrattuale delle voci.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRAZIONE = resolve(process.cwd(), "supabase/migrations/20281006130000_fasi_venduto_solo_con_importi.sql");
const sql = readFileSync(MIGRAZIONE, "utf8");
// Le istruzioni, senza i commenti (che raccontano anche com'era prima).
const codice = sql.replace(/--.*$/gm, "");

describe("migrazione fasi_venduto_solo_con_importi", () => {
  it("è rilanciabile e non aspetta i lock", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    expect(codice).toMatch(/create or replace function public\.fase_venduto_solo_con_importi\(\)/);
    expect(codice).toMatch(/create or replace trigger trg_fase_venduto_solo_con_importi/);
    expect(codice).toMatch(/set search_path = ''/);
  });

  it("scatta quando si crea una fase e quando si cambia il venduto", () => {
    expect(codice).toMatch(
      /before insert or update of importo_venduto\s+on public\.order_work_phases\s+for each row execute function public\.fase_venduto_solo_con_importi\(\);/,
    );
  });

  it("lascia passare il server, la fase creata senza venduto e il venduto rimandato uguale", () => {
    expect(codice).toMatch(/if current_user not in \('authenticated', 'anon'\) then\s+return new;/);
    expect(codice).toMatch(/if new\.importo_venduto is null then\s+return new;/);
    expect(codice).toMatch(/if new\.importo_venduto is not distinct from old\.importo_venduto then\s+return new;/);
    // Nessun'altra uscita prima del controllo dei permessi.
    expect(codice.match(/return new;/g)).toHaveLength(4);
  });

  it("guarda l'azienda della commessa, prima e dopo, mai quella della riga", () => {
    expect(codice).toContain("public.get_order_company_id(new.order_id)");
    expect(codice).toContain("public.get_order_company_id(old.order_id)");
    // company_id della riga: l'operaio la può riscrivere nella stessa richiesta.
    expect(codice).not.toMatch(/\b(new|old)\.company_id\b/);
    // has_permission guarda l'azienda in cui l'utente sta lavorando: un
    // amministratore di un'altra azienda passerebbe.
    expect(codice).not.toMatch(/public\.has_permission\(/);
    expect(codice).toContain("if v_azienda is null");
  });

  it("chiede i due permessi dell'app, in quell'azienda", () => {
    const permessi = [...codice.matchAll(/public\.has_permission_for_company\(v_utente, '(\w+)', v_azienda\)/g)].map((m) => m[1]);
    expect(permessi.sort()).toEqual(["can_edit_orders", "can_view_order_amounts"]);
    expect(codice).toMatch(/or not public\.has_permission_for_company\(v_utente, 'can_edit_orders', v_azienda\)\s+or not public\.has_permission_for_company\(v_utente, 'can_view_order_amounts', v_azienda\) then/);
    expect(codice).toMatch(/raise exception '[^']+'\s+using errcode = '42501'/);
  });

  it("il messaggio nomina i permessi come li chiama la pagina degli utenti", () => {
    const etichette = readFileSync(resolve(process.cwd(), "src/components/users/permissionsDefaults.ts"), "utf8");
    expect(etichette).toMatch(/label: "Ordini e Commesse",\s+viewKey: "can_view_orders"/);
    expect(etichette).toMatch(/label: "Importi di vendita",\s+viewKey: "can_view_order_amounts"/);
    expect(codice).toContain("«Ordini e Commesse» e «Importi di vendita»");
  });

  it("la funzione di trigger non è chiamabile da nessuno", () => {
    expect(codice).toContain("revoke all on function public.fase_venduto_solo_con_importi() from public, anon, authenticated;");
    expect(codice).not.toMatch(/grant\s+execute/i);
  });
});

describe("l'app scrive il venduto solo con gli stessi due permessi", () => {
  const file: string[] = [];
  const cammina = (cartella: string) => {
    for (const voce of readdirSync(cartella, { withFileTypes: true })) {
      const percorso = resolve(cartella, voce.name);
      if (voce.isDirectory()) {
        if (voce.name !== "test" && voce.name !== "node_modules") cammina(percorso);
      } else if (/\.(ts|tsx)$/.test(voce.name)) {
        file.push(percorso);
      }
    }
  };
  cammina(resolve(process.cwd(), "src"));
  const relativo = (p: string) => p.replace(`${process.cwd()}/`, "");

  it("il venduto compare solo nei file che già lo leggono o lo scrivono", () => {
    const conVenduto = file
      .filter((p) => !p.endsWith("integrations/supabase/types.ts"))
      .filter((p) => readFileSync(p, "utf8").includes("importo_venduto"))
      .map(relativo)
      .sort();
    // Un file nuovo qui: se scrive il venduto, deve chiedere gli stessi due
    // permessi del trigger, altrimenti l'utente vede il campo e poi un errore.
    expect(conVenduto).toEqual([
      "src/components/orders/OrderWorkPhases.tsx",
      "src/components/orders/SalTab.tsx",
      "src/hooks/useOrderWorkPhases.ts",
      "src/lib/orders/economiaFasi.ts",
      "src/lib/orders/salDaFasi.ts",
    ]);
  });

  it("il verbale SAL legge il venduto delle fasi ma non lo scrive mai", () => {
    for (const percorso of ["src/components/orders/SalTab.tsx", "src/lib/orders/salDaFasi.ts"]) {
      const senzaCommenti = readFileSync(resolve(process.cwd(), percorso), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      const tutte = senzaCommenti.match(/importo_venduto/g) ?? [];
      // Il tipo della fase, la select, e la lettura sulla fase: niente update, insert o proprietà scritte.
      const letture = senzaCommenti.match(/importo_venduto: number \| null;|\.select\("[^"]*importo_venduto"\)|\bf\.importo_venduto\b/g) ?? [];
      expect(letture, `${percorso} usa importo_venduto in un modo che non è una lettura`).toHaveLength(tutte.length);
      expect(tutte.length, `${percorso} non nomina più il venduto: togli il file dall'elenco qui sopra`).toBeGreaterThan(0);
    }
  });

  it("la pagina delle lavorazioni salva il venduto solo con i due permessi", () => {
    const pagina = readFileSync(resolve(process.cwd(), "src/components/orders/OrderWorkPhases.tsx"), "utf8");
    const salvataggi = [...pagina.matchAll(/onSalvaVenduto=\{([^?]+)\?/g)].map((m) => m[1].trim());
    expect(salvataggi).toEqual(["canEditOrders && canViewOrderAmounts", "canEditOrders && canViewOrderAmounts"]);
    // E ogni scrittura del venduto sta dentro uno di quei salvataggi.
    const scritture = pagina.match(/importo_venduto: importo\b/g) ?? [];
    const protette = pagina.match(/onSalvaVenduto=\{canEditOrders && canViewOrderAmounts \? \([^)]*\) => [^}]*importo_venduto: importo\b/g) ?? [];
    expect(scritture).toHaveLength(2);
    expect(protette).toHaveLength(scritture.length);
  });
});
