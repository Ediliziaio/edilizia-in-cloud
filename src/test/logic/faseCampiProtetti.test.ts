/**
 * Fasi della commessa: dal cantiere si cambiano solo stato, avanzamento e foto,
 * e una fase non esce dall'azienda della sua commessa (06/10/2026).
 *
 * La policy «Campo workers can update phases of assigned orders» controlla solo
 * che l'utente sia assegnato alla commessa: dalle API l'operaio rinominava la
 * fase, ne spostava le date (e con loro le squadre), la portava su un'altra
 * commessa o in un'altra azienda, dove la vedevano e la modificavano gli
 * amministratori di là. Anche ufficio e amministratore potevano mettere a una
 * fase l'azienda di un altro o portarla nella commessa di un'altra azienda.
 * Provato in una transazione annullata, prima e dopo la migrazione. Il trigger
 * trg_fase_campi_protetti rifiuta, per le richieste degli utenti:
 *   · per tutti: una fase con un'azienda diversa da quella della commessa, il
 *     cambio della company_id, lo spostamento in una commessa di un'altra azienda;
 *   · per chi nell'azienda della commessa non ha «Ordini e Commesse»: ogni
 *     colonna che l'app di cantiere non scrive.
 * Passano il server (SECURITY DEFINER, service role).
 *
 * Tiene fermo:
 *   · il trigger scatta su ogni creazione e su ogni modifica, non su un elenco
 *     di colonne, e non cambia la riga;
 *   · l'azienda si guarda per tutti, prima dei permessi, ed è quella della
 *     commessa;
 *   · le colonne del cantiere sono quelle e solo quelle, e sono le stesse che
 *     l'app di cantiere scrive; il venduto lo lascia a
 *     trg_fase_venduto_solo_con_importi, che scatta dopo;
 *   · il permesso è «Ordini e Commesse» nell'azienda della commessa;
 *   · la migrazione è rilanciabile e con lock_timeout;
 *   · nell'app scrivono le fasi tre file soli: un nuovo punto va guardato.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");
const MIGRAZIONE = "supabase/migrations/20281006150000_fasi_campi_protetti.sql";
const VENDUTO = "supabase/migrations/20281006130000_fasi_venduto_solo_con_importi.sql";
// Le istruzioni, senza i commenti (che raccontano anche com'era prima).
const senzaCommenti = (sql: string) => sql.replace(/--.*$/gm, "");
const codice = senzaCommenti(leggi(MIGRAZIONE));

const CANTIERE = ["completata_da", "completata_il", "foto_urls", "percentuale", "status", "updated_at"];

/** Gli elementi di `nome constant text[] := array[...]` nella funzione. */
function elenco(nome: string): string[] {
  const m = codice.match(new RegExp(`${nome} constant text\\[\\] := array\\[([^\\]]*)\\];`));
  expect(m, `manca ${nome}`).not.toBeNull();
  return [...m![1].matchAll(/'(\w+)'/g)].map((x) => x[1]);
}

describe("migrazione fasi_campi_protetti", () => {
  it("è rilanciabile e non aspetta i lock", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    expect(codice).toMatch(/create or replace function public\.fase_campi_protetti\(\)/);
    expect(codice).toMatch(/create or replace trigger trg_fase_campi_protetti/);
    expect(codice).toMatch(/set search_path = ''/);
  });

  it("scatta su ogni creazione e ogni modifica, e non cambia la riga", () => {
    expect(codice).toMatch(
      /create or replace trigger trg_fase_campi_protetti\s+before insert or update\s+on public\.order_work_phases\s+for each row execute function public\.fase_campi_protetti\(\);/,
    );
    // Un elenco di colonne lascerebbe fuori quelle nuove.
    expect(codice).not.toMatch(/update of/i);
    // Solo controlli: così l'ordine col trigger del venduto non cambia l'esito.
    expect(codice).not.toMatch(/\bnew\.\w+\s*:=/);
  });

  it("lascia passare solo il server, prima di ogni controllo", () => {
    expect(codice).toMatch(/if current_user not in \('authenticated', 'anon'\) then\s+return new;/);
    expect(codice.indexOf("if current_user not in")).toBeLessThan(codice.indexOf("v_azienda_giusta :="));
    // Server, fase creata giusta, solo colonne del cantiere, «Ordini e Commesse».
    expect(codice.match(/return new;/g)).toHaveLength(4);
  });

  it("l'azienda: per tutti, fissa, e quella della commessa", () => {
    expect(codice).toMatch(
      /if tg_op = 'INSERT' then\s+v_azienda_giusta := new\.company_id is not distinct from public\.get_order_company_id\(new\.order_id\);/,
    );
    expect(codice).toMatch(/elsif new\.company_id is distinct from old\.company_id then\s+v_azienda_giusta := false;/);
    expect(codice).toMatch(
      /elsif new\.order_id is distinct from old\.order_id then\s+v_azienda_giusta := new\.company_id is not distinct from public\.get_order_company_id\(new\.order_id\);/,
    );
    expect(codice).toMatch(
      /if not v_azienda_giusta then\s+raise exception 'Una fase resta nell''azienda della sua commessa\.'\s+using errcode = '42501';/,
    );
    // Prima dei permessi: vale anche per il super admin e l'amministratore.
    expect(codice.indexOf("if not v_azienda_giusta")).toBeLessThan(codice.indexOf("has_permission_for_company"));
    expect(codice.indexOf("if not v_azienda_giusta")).toBeLessThan(codice.indexOf("to_jsonb(new)"));
  });

  it("le colonne del cantiere sono quelle e solo quelle, confrontate col valore di prima", () => {
    expect([...elenco("v_cantiere")].sort()).toEqual(CANTIERE);
    expect(elenco("v_altrove")).toEqual(["importo_venduto"]);
    expect(codice).toMatch(
      /if \(to_jsonb\(new\) - v_cantiere - v_altrove\) = \(to_jsonb\(old\) - v_cantiere - v_altrove\) then\s+return new;/,
    );
  });

  it("il resto lo cambia chi ha «Ordini e Commesse» nell'azienda della commessa", () => {
    expect(codice).toMatch(/v_utente uuid := \(select auth\.uid\(\)\);/);
    const permessi = [...codice.matchAll(/public\.has_permission_for_company\(([^;]*?)\) then/g)].map((m) => m[1]);
    expect(permessi).toEqual(["v_utente, 'can_edit_orders', public.get_order_company_id(old.order_id)"]);
    expect(codice).toMatch(
      /if public\.has_permission_for_company\(v_utente, 'can_edit_orders', public\.get_order_company_id\(old\.order_id\)\) then\s+return new;\s+end if;\s+raise exception '[^']+'\s+using errcode = '42501';/,
    );
    // has_permission guarda l'azienda in cui l'utente sta lavorando: un
    // amministratore di un'altra azienda passerebbe.
    expect(codice).not.toMatch(/public\.has_permission\(/);
  });

  it("il messaggio nomina il permesso come la pagina degli utenti", () => {
    expect(leggi("src/components/users/permissionsDefaults.ts")).toMatch(
      /label: "Ordini e Commesse",\s+viewKey: "can_view_orders"/,
    );
    expect(codice).toMatch(/raise exception 'Dal cantiere [^']*«Ordini e Commesse»[^']*'/);
  });

  it("la funzione di trigger non è chiamabile da nessuno", () => {
    expect(codice).toContain("revoke all on function public.fase_campi_protetti() from public, anon, authenticated;");
    expect(codice).not.toMatch(/grant\s+execute/i);
  });
});

describe("convive col trigger del venduto", () => {
  const venduto = senzaCommenti(leggi(VENDUTO));

  it("il venduto lo guarda l'altro trigger, che scatta dopo", () => {
    // I trigger BEFORE vanno in ordine alfabetico.
    expect("trg_fase_campi_protetti" < "trg_fase_venduto_solo_con_importi").toBe(true);
    expect(venduto).toMatch(/create or replace trigger trg_fase_venduto_solo_con_importi\s+before insert or update of importo_venduto/);
    // Chi qui non ha «Ordini e Commesse» là è fermato comunque.
    expect(venduto).toContain("or not public.has_permission_for_company(v_utente, 'can_edit_orders', v_azienda)");
  });
});

describe("nell'app le fasi le scrivono tre file, e il cantiere solo le sue colonne", () => {
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
  const SCRITTURA = /\.from\(\s*["']order_work_phases["']\s*\)\s*\.(update|insert|upsert|delete)\(/;

  it("solo questi file scrivono order_work_phases", () => {
    const scrivono = file.filter((p) => SCRITTURA.test(readFileSync(p, "utf8"))).map(relativo).sort();
    // Un file nuovo qui: se lo usa il cantiere, ogni colonna che scrive va in
    // v_cantiere (migrazione nuova); se è dell'ufficio, deve chiedere
    // «Ordini e Commesse», altrimenti l'utente vede il bottone e poi un errore.
    expect(scrivono).toEqual([
      "src/components/orders/OrdineRapportiniCampo.tsx",
      "src/hooks/useOrderWorkPhases.ts",
      "src/pages/campo/CampoAvanzamento.tsx",
    ]);
  });

  it("l'app di cantiere scrive solo colonne del cantiere", () => {
    const pagina = leggi("src/pages/campo/CampoAvanzamento.tsx");
    const re = /\.from\(\s*["']order_work_phases["']\s*\)\s*\.update\(([\s\S]*?)\)\s*\.eq\(/g;
    const scritture = [...pagina.matchAll(re)].map((m) => m[1]);
    // Chiude/riapre, aggiunge foto, toglie foto.
    expect(scritture).toHaveLength(3);
    const colonne = new Set(scritture.flatMap((s) => [...s.matchAll(/(\w+)\s*:/g)].map((m) => m[1])));
    expect([...colonne].sort()).toEqual(["completata_da", "completata_il", "foto_urls", "percentuale", "status"]);
    expect(pagina).not.toMatch(/\.from\(\s*["']order_work_phases["']\s*\)\s*\.(insert|upsert|delete)\(/);
  });

  it("l'approvazione dei rapportini alza l'avanzamento con colonne del cantiere", () => {
    const pagina = leggi("src/components/orders/OrdineRapportiniCampo.tsx");
    expect(pagina).toMatch(/\.from\("order_work_phases"\)\.update\(patch\)/);
    const letterale = pagina.match(/const patch: Record<string, unknown> = \{([^}]*)\};/);
    expect(letterale).not.toBeNull();
    const colonne = new Set([
      ...[...letterale![1].matchAll(/(\w+)\s*:/g)].map((m) => m[1]),
      ...[...pagina.matchAll(/\bpatch\.(\w+)\s*=/g)].map((m) => m[1]),
    ]);
    expect([...colonne].sort()).toEqual(["percentuale", "status", "updated_at"]);
    expect([...colonne].every((c) => CANTIERE.includes(c))).toBe(true);
    // E la fa solo chi ha «Ordini e Commesse».
    expect(pagina).toMatch(/const canApprove = canEditOrders && /);
  });

  it("l'ufficio crea le fasi nell'azienda in cui lavora e non sposta azienda o commessa", () => {
    const hook = leggi("src/hooks/useOrderWorkPhases.ts");
    expect(hook).toContain("const companyId = effectiveCompany?.id;");
    // addPhase inserisce da sé, nell'azienda in cui lavora; applyTemplate passa da
    // aggiungi_fasi_commessa, che prende l'azienda dalla commessa e non la riceve dal client.
    expect(hook.match(/company_id: companyId, order_id: orderId/g)).toHaveLength(1);
    expect(hook).toContain('db.rpc("aggiungi_fasi_commessa", { p_order_id: orderId, p_fasi: fasi })');
    const pick = hook.match(/Partial<Pick<WorkPhase, ([^>]*)>>/);
    expect(pick).not.toBeNull();
    expect(pick![1]).not.toMatch(/"company_id"|"order_id"/);
  });
});
