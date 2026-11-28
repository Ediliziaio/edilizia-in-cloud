/**
 * Destinazione: src/test/logic/avanzamentoColonneProtette.test.ts
 *
 * Le colonne che decidono l'avanzamento le scrive solo il database (28/11/2026).
 *
 * `order_work_subphases.a_movimenti`, `modo_avanzamento`, `quantita_contratto` e
 * `unita_contratto` decidono se e come l'avanzamento viene derivato dai movimenti, e su
 * quale base di contratto. Il GRANT di sola SELECT non basta: il GRANT di tabella
 * comprende UPDATE su ogni colonna. Provato in transazione annullata: prima, chi ha
 * «Commesse → modifica» le cambiava tutte e quattro (1 riga); dopo, 42501. Continuano a
 * funzionare la modifica normale (nome: 1 riga), il cantiere che spunta `fatta` (1 riga),
 * il service role (1 riga) e la catena definer `avanzamento_registra` + `avanzamento_ricalcola`
 * (percentuale derivata 40 su 4/10, prima e dopo).
 *
 * Questo test tiene fermi i punti che contano, e soprattutto l'invariante: ogni colonna di
 * `order_work_subphases` che nasce con un GRANT di sola SELECT dev'essere nominata nella
 * guardia. Una colonna nuova aggiunta là e dimenticata qui fa rosso.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");
const senzaCommenti = (s: string) => s.replace(/--.*$/gm, "");

const MOVIMENTI = "supabase/migrations/20290630110000_avanzamento_movimenti.sql";
const RETTIFICA = "supabase/migrations/20290630120000_avanzamento_rettifica_ordine.sql";
const PROTETTE = "supabase/migrations/20290630130000_avanzamento_colonne_protette.sql";

const protette = senzaCommenti(leggi(PROTETTE));
const guardia = protette.slice(protette.indexOf("create or replace function public.sottofase_guardia()"));

// Le colonne di order_work_subphases che nascono con il solo SELECT, lette dalle migrazioni
// che le creano: è questo elenco che la guardia deve coprire.
const colonneSoloSelect = (sql: string): string[] =>
  [...senzaCommenti(sql).matchAll(/grant select \(([^)]*)\)\s*\n?\s*on public\.order_work_subphases/gi)]
    .flatMap((m) => m[1].split(",").map((c) => c.trim()))
    .filter(Boolean);

describe("avanzamento: le colonne che decidono il calcolo", () => {
  const colonne = [...colonneSoloSelect(leggi(MOVIMENTI)), ...colonneSoloSelect(leggi(RETTIFICA))];

  it("ne trova l'elenco nelle migrazioni che le creano", () => {
    expect(colonne.sort()).toEqual(["a_movimenti", "modo_avanzamento", "quantita_contratto", "unita_contratto"]);
  });

  it.each(colonne)("la guardia rifiuta la modifica di %s dal browser", (colonna) => {
    expect(guardia).toContain(`new.${colonna} is distinct from old.${colonna}`);
  });

  it.each(colonne)("una sottofase nuova nasce con %s spenta", (colonna) => {
    expect(guardia).toMatch(new RegExp(`new\\.${colonna} := (false|null);`));
  });

  it("rifiuta con 42501 e un messaggio che dice chi decide", () => {
    const blocco = guardia.slice(guardia.indexOf("elsif new.a_movimenti"));
    expect(blocco).toMatch(/raise exception 'Come si misura[\s\S]*?using errcode = '42501'/);
  });

  it("le quattro colonne non entrano nella lista del cantiere", () => {
    const cantiere = guardia.match(/v_cantiere constant text\[\] := array\[([^\]]*)\]/)![1];
    for (const colonna of colonne) expect(cantiere).not.toContain(colonna);
  });

  it("il controllo sta dopo il passaggio del proprietario e prima del permesso Commesse", () => {
    const proprietario = guardia.indexOf("current_user not in ('authenticated', 'anon')");
    const controllo = guardia.indexOf("elsif new.a_movimenti");
    const permesso = guardia.indexOf("has_permission_for_company(v_utente, 'can_edit_orders'");
    expect(proprietario).toBeGreaterThan(-1);
    expect(controllo).toBeGreaterThan(proprietario);
    expect(permesso).toBeGreaterThan(controllo);
  });

  it("la guardia resta invoker: le funzioni definer passano come proprietario", () => {
    expect(guardia).not.toMatch(/security definer/i);
  });
});

describe("avanzamento_movimenti: dal client solo lettura", () => {
  it("toglie anche il TRUNCATE ad authenticated", () => {
    expect(protette).toMatch(/revoke truncate on public\.avanzamento_movimenti from authenticated/i);
  });

  it("ad anon non lascia niente", () => {
    expect(protette).toMatch(/revoke all on public\.avanzamento_movimenti from anon/i);
  });

  it("chiude l'EXECUTE delle due funzioni di trigger", () => {
    for (const fn of ["avanzamento_movimento_imposta", "avanzamento_movimento_applica"]) {
      expect(protette).toMatch(
        new RegExp(`revoke all on function private\\.${fn}\\(\\) from public, anon, authenticated`, "i"),
      );
    }
  });

  it("resta idempotente: solo revoke e create or replace", () => {
    expect(protette).toMatch(/create or replace function public\.sottofase_guardia\(\)/);
    expect(protette).toMatch(/SET LOCAL lock_timeout = '3s'/i);
    expect(protette).not.toMatch(/\bcreate (table|policy|index)\b/i);
  });
});
