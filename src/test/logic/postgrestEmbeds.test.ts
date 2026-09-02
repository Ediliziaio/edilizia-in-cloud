/**
 * Guardia sugli embed PostgREST del frontend.
 *
 * Un `.select("…, profile:profiles!user_id(…)")` funziona SOLO se tra le due
 * tabelle esiste una foreign key che PostgREST conosce. Quando manca (tipico:
 * user_id → auth.users, non → profiles) la risposta è un 400 PGRST200 muto e
 * la pagina resta vuota o senza nomi. È successo in 5 punti diversi
 * (panoramiche email/calendari in Integrazioni, commenti attività, team
 * studio commercialista, audit white-label).
 *
 * Qui ogni embed trovato nel codice viene confrontato con le Relationships dei
 * tipi generati da Supabase (src/integrations/supabase/types.ts), che
 * fotografano le FK reali del DB. Gli embed nidificati vengono risolti
 * seguendo la tabella padre.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "../../..");

interface Rel { fk: string; columns: string[]; target: string }

/** tabella → relazioni (FK in uscita) lette dai tipi generati. */
function relazioniDaiTipi(): Map<string, Rel[]> {
  const righe = readFileSync(join(ROOT, "src/integrations/supabase/types.ts"), "utf8").split("\n");
  const out = new Map<string, Rel[]>();
  let tabella: string | null = null;
  let corrente: Partial<Rel> | null = null;
  for (const r of righe) {
    const apri = /^ {6}(\w+): \{$/.exec(r);
    if (apri) { tabella = apri[1]; if (!out.has(tabella)) out.set(tabella, []); continue; }
    if (!tabella) continue;
    const fk = /foreignKeyName: "([^"]+)"/.exec(r);
    if (fk) { corrente = { fk: fk[1] }; continue; }
    if (!corrente) continue;
    const cols = /columns: \[([^\]]*)\]/.exec(r);
    if (cols) { corrente.columns = [...cols[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]); continue; }
    const tgt = /referencedRelation: "([^"]+)"/.exec(r);
    if (tgt) {
      corrente.target = tgt[1];
      out.get(tabella)!.push(corrente as Rel);
      corrente = null;
    }
  }
  return out;
}

const REL = relazioniDaiTipi();

function fileSorgente(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) { if (!p.includes("/src/test")) fileSorgente(p, acc); continue; }
    if (/\.(ts|tsx)$/.test(nome) && !nome.endsWith(".d.ts")) acc.push(p);
  }
  return acc;
}

interface Embed { file: string; from: string; padre: string; target: string; hint: string | null; select: string }

/**
 * Estrae gli embed di un select seguendo le parentesi: a profondità 0 il padre
 * è la tabella del .from(), dentro un embed il padre è la tabella dell'embed.
 */
function embedDelSelect(select: string, from: string, file: string, note: Set<string>): Embed[] {
  const out: Embed[] = [];
  const stack: string[] = [from];
  // `tabella!fk!inner(`, `tabella!inner(`, `alias:tabella(`: `inner`/`left`
  // sono modificatori del join, non nomi di FK.
  const re = /(?:(\w+):)?(\w+)((?:!\w+)*)\s*\(|\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(select))) {
    if (m[0] === ")") { if (stack.length > 1) stack.pop(); continue; }
    const target = m[2];
    const hint = (m[3] ?? "").split("!").filter((h) => h && h !== "inner" && h !== "left")[0] ?? null;
    const padre = stack[stack.length - 1];
    // Embed via colonna FK (`scadenze:scadenza_id(…)`): il target è la tabella
    // referenziata da quella colonna del padre.
    const viaColonna = (REL.get(padre) ?? []).find((r) => r.columns.length === 1 && r.columns[0] === target);
    if (!note.has(target) && viaColonna) { stack.push(viaColonna.target); continue; }
    // Non è un embed se il nome non è una tabella/vista nota (es. count(), funzioni).
    if (!note.has(target)) { stack.push(padre); continue; }
    out.push({ file, from, padre: stack[stack.length - 1], target, hint, select: select.replace(/\s+/g, " ").slice(0, 160) });
    stack.push(target);
  }
  return out;
}

function tuttiGliEmbed(note: Set<string>): Embed[] {
  const out: Embed[] = [];
  for (const f of fileSorgente(join(ROOT, "src"))) {
    const s = readFileSync(f, "utf8");
    const re = /\.from\(\s*["'`](\w+)["'`](?:\s+as\s+\w+)?\s*\)([\s\S]{0,400}?)\.select\(\s*(["'`])([\s\S]*?)\3/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      const from = m[1];
      if (!note.has(from)) continue; // tabella fuori dai tipi (cast as never): non verificabile
      out.push(...embedDelSelect(m[4], from, f.replace(ROOT + "/", ""), note));
    }
  }
  return out;
}

/**
 * FK presenti nel DB (verificate su pg_constraint il 2026-09-02) ma non ancora
 * nei tipi generati, che sono del 2026-07-27. Rigenerando types.ts queste
 * eccezioni vanno tolte.
 */
const FK_NON_ANCORA_NEI_TIPI = new Set(["hr_timbrature→orders", "ritenute_garanzia→orders"]);

describe("embed PostgREST ↔ foreign key reali", () => {
  const note = new Set(REL.keys());

  it("i tipi generati sono leggibili (sanity)", () => {
    expect(note.has("profiles")).toBe(true);
    expect((REL.get("tasks") ?? []).some((r) => r.fk === "tasks_assigned_to_fkey" && r.target === "profiles")).toBe(true);
  });

  it("ogni embed ha UNA FK che PostgREST può seguire (niente 400 PGRST200/PGRST201 muti)", () => {
    const rotti: string[] = [];
    for (const e of tuttiGliEmbed(note)) {
      if (FK_NON_ANCORA_NEI_TIPI.has(`${e.padre}→${e.target}`)) continue;
      const daPadre = (REL.get(e.padre) ?? []).filter((r) => r.target === e.target);
      const inverse = (REL.get(e.target) ?? []).filter((r) => r.target === e.padre);
      if (e.hint) {
        const ok = daPadre.some((r) => r.fk === e.hint || r.columns.includes(e.hint!))
          || inverse.some((r) => r.fk === e.hint || r.columns.includes(e.hint!));
        if (!ok) rotti.push(`${e.file}: ${e.padre} → ${e.target}!${e.hint} — nessuna FK con quel nome/colonna  [${e.select}]`);
        continue;
      }
      // Senza hint PostgREST deve trovare ESATTAMENTE una strada: zero = PGRST200,
      // due o più (es. user_id e assigned_by entrambi → profiles) = PGRST201.
      const strade = daPadre.length + inverse.length;
      if (strade === 0) rotti.push(`${e.file}: ${e.padre} → ${e.target} — nessuna FK (PGRST200)  [${e.select}]`);
      if (strade > 1) rotti.push(`${e.file}: ${e.padre} → ${e.target} — ${strade} FK candidate, serve l'hint !nome_fk (PGRST201)  [${e.select}]`);
    }
    expect(rotti, `Embed che PostgREST rifiuta con 400:\n${rotti.join("\n")}`).toEqual([]);
  });
});
