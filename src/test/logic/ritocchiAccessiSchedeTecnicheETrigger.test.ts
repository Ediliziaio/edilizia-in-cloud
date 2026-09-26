/**
 * Tre ritocchi di igiene dal censimento degli accessi (26/09/2026).
 *
 * 1. Schede tecniche dei preventivi (bucket quote-materials): le policy
 *    guardavano solo la cartella dell'azienda. In transazioni annullate il
 *    cliente esterno col portale acceso elencava, leggeva, cancellava e
 *    caricava file nella cartella della sua azienda, e l'utente bloccato li
 *    leggeva. Ora resta la sola lettura, per chi lavora nell'azienda e non è
 *    bloccato: nessuna pagina scrive in quel bucket, e generate-quote-pdf li
 *    scarica col service role.
 * 2. appuntamenti_orari_riallineati riceve la RESTRICTIVE sul blocco utente.
 *    Era nata in una migrazione coi trigger spenti (session_replication_role =
 *    replica), e in quella modalità l'event trigger che la aggiunge da solo
 *    non scatta. Il guardiano in fondo ferma una migrazione nuova che rifaccia
 *    lo stesso.
 * 3. Due funzioni di trigger eseguibili da anon: EXECUTE tolto a tutti (allo
 *    scatto del trigger il privilegio non si controlla).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");
const CARTELLA = join(ROOT, "supabase/migrations");
const QUESTA = "20280926124500";
const codice = readFileSync(join(CARTELLA, `${QUESTA}_ritocchi_accessi_schede_tecniche_e_trigger.sql`), "utf8")
  .replace(/--.*$/gm, "");

describe("migrazione ritocchi_accessi_schede_tecniche_e_trigger", () => {
  it("non aspetta i lock, e lo storage viene per ultimo", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    const primoStorage = codice.indexOf("on storage.objects");
    expect(primoStorage).toBeGreaterThan(codice.lastIndexOf("on public."));
    expect(primoStorage).toBeGreaterThan(codice.lastIndexOf("on function"));
  });

  it("schede tecniche: nessuna scrittura dal browser", () => {
    for (const nome of ["qm_ins", "qm_upd", "qm_del"]) {
      expect(codice).toContain(`drop policy if exists ${nome} on storage.objects;`);
      expect(codice).not.toMatch(new RegExp(`create policy ${nome}\\b`));
    }
    expect(codice).not.toContain("raw_app_meta_data");
  });

  it("schede tecniche: le legge chi lavora nell'azienda, non il cliente esterno né l'utente bloccato", () => {
    expect(codice).toContain("drop policy if exists qm_sel on storage.objects;");
    const m = codice.match(/create policy qm_sel on storage\.objects\s+for (\w+) to (\w+)\s+using \(([\s\S]*?)\);/);
    expect(m).not.toBeNull();
    expect([m![1], m![2]]).toEqual(["select", "authenticated"]);
    expect(m![3].split(/\s+and\s+/).map((c) => c.trim())).toEqual([
      "bucket_id = 'quote-materials'",
      "(storage.foldername(name))[1] = (select public.get_my_company_id())::text",
      "not (select public.utente_e_cliente_esterno())",
      "not (select public.utente_bloccato())",
    ]);
  });

  it("orari riallineati: la RESTRICTIVE sul blocco utente, nella forma di tutte le altre tabelle", () => {
    expect(codice).toContain("drop policy if exists blocco_utente_bloccato on public.appuntamenti_orari_riallineati;");
    expect(codice).toMatch(
      /create policy blocco_utente_bloccato on public\.appuntamenti_orari_riallineati\s+as restrictive for all to authenticated\s+using \(not \(select public\.utente_bloccato\(\)\)\)\s+with check \(not \(select public\.utente_bloccato\(\)\)\);/,
    );
  });

  it("funzioni di trigger: EXECUTE tolto a tutti, e nessuno lo ridà", () => {
    for (const f of ["nota_scheda_nel_registro", "trg_update_paid_amount"]) {
      expect(codice).toContain(`revoke all on function public.${f}() from public, anon, authenticated;`);
      expect(codice).not.toMatch(new RegExp(`grant [^;]*on function public\\.${f}\\(`));
    }
  });

  it("cambia solo policy e privilegi, nessuna riga", () => {
    expect(codice).not.toMatch(/\b(insert\s+into|update\s+[\w.]+\s+set|delete\s+from|truncate)\b/i);
  });
});

describe("il resto dell'app dice la stessa cosa", () => {
  const sorgenti = (dir: string): string[] =>
    readdirSync(dir).flatMap((nome) => {
      const p = join(dir, nome);
      if (statSync(p).isDirectory()) return nome === "test" ? [] : sorgenti(p);
      return /\.(ts|tsx)$/.test(nome) ? [p] : [];
    });

  it("nessuna pagina scrive nel bucket delle schede tecniche", () => {
    const scrivono = sorgenti(join(ROOT, "src")).filter((p) =>
      /\.from\(\s*["'`]quote-materials["'`]\s*\)\s*\.(upload|update|remove|move|copy)\(/.test(readFileSync(p, "utf8")));
    expect(scrivono).toEqual([]);
  });
});

// Con session_replication_role = replica gli event trigger non scattano:
// check_new_table_rls() non aggiunge la RESTRICTIVE, e la tabella nasce senza.
const REPLICA = /session_replication_role['"]?\s*(?:=|to|,)\s*'?replica/i;

/** Tabelle con company_id create da una migrazione coi trigger spenti senza la policy sul blocco utente. */
function tabelleSenzaBlocco(sql: string): string[] {
  // Contano le istruzioni della migrazione, non i corpi $$…$$ di funzioni e DO.
  const istruzioni = sql.replace(/--.*$/gm, "").replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, "");
  if (!REPLICA.test(istruzioni)) return [];
  return [...istruzioni.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?\s*\(([\s\S]*?)\n\s*\)\s*;/gi)]
    .filter((m) => /\bcompany_id\b/i.test(m[2]))
    .map((m) => m[1])
    .filter((tabella) => !new RegExp(
      `create\\s+policy\\s+"?blocco_utente_bloccato"?\\s+on\\s+(?:public\\.)?"?${tabella}"?\\s+as\\s+restrictive`, "i",
    ).test(istruzioni));
}

describe("guardiano: una tabella nata coi trigger spenti non resta senza blocco utente", () => {
  it("riconosce il caso degli orari riallineati", () => {
    const origine = readFileSync(join(CARTELLA, "20280919120500_orari_google_in_ora_italiana.sql"), "utf8");
    expect(tabelleSenzaBlocco(origine)).toEqual(["appuntamenti_orari_riallineati"]);
  });

  it("le migrazioni nuove coi trigger spenti creano da sé la policy", () => {
    const mancanti = readdirSync(CARTELLA)
      .filter((f) => /^\d{14}_.*\.sql$/.test(f) && f.slice(0, 14) > QUESTA)
      .flatMap((f) => tabelleSenzaBlocco(readFileSync(join(CARTELLA, f), "utf8")).map((t) => `${f}: ${t}`));
    expect(mancanti).toEqual([]);
  });
});
