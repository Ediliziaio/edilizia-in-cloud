/**
 * Il ripristino reale di un'azienda purgata (25/09/2026).
 *
 * Provato sulla Demo 2 (esportata, purgata col job della notte, ripristinata,
 * tutto annullato), il vecchio `admin_ripristina_backup(dump, 'reale')` non
 * poteva riuscire: tabelle versate in ordine di nome con 2.201 chiavi esterne
 * non rinviabili, utenti saltati, trigger accesi (righe iniziali in conflitto,
 * avvisi e automazioni per ogni riga, updated_by riscritto). Col nuovo: 13.060
 * righe su 13.060, 237 tabelle identiche riga per riga, zero avvisi.
 *
 * Tiene fermo, sull'ultima definizione di ogni funzione nelle migrazioni, ciò
 * che il collaudo ha mostrato necessario. Ogni regola qui sotto è stata una
 * caduta vera del collaudo prima di esserci.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CARTELLA = join(__dirname, "../../../supabase/migrations");
const MIGRAZIONI = readdirSync(CARTELLA).filter((f) => f.endsWith(".sql")).sort();

/** Il corpo dell'ultima `CREATE OR REPLACE FUNCTION public.<nome>`, fino al suo `$function$;`. */
function ultimaDefinizione(nome: string): { file: string; corpo: string } {
  const inizio = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${nome}\\s*\\(`, "i");
  for (const file of [...MIGRAZIONI].reverse()) {
    const testo = readFileSync(join(CARTELLA, file), "utf8");
    const trovato = inizio.exec(testo);
    if (!trovato) continue;
    const fine = testo.indexOf("$function$;", trovato.index);
    return { file, corpo: testo.slice(trovato.index, fine === -1 ? undefined : fine) };
  }
  throw new Error(`nessuna migrazione definisce public.${nome}`);
}

const ripristino = () => ultimaDefinizione("admin_ripristina_backup").corpo;

describe("il ripristino reale", () => {
  it("spegne i trigger col comando SET, non con set_config (Supabase lo concede solo al SET)", () => {
    const corpo = ripristino();
    expect(corpo).toContain("SET LOCAL session_replication_role = replica;");
    expect(corpo).not.toMatch(/set_config\(\s*'session_replication_role'/);
  });

  it("li riaccende prima del controllo finale", () => {
    const corpo = ripristino();
    const spegne = corpo.indexOf("SET LOCAL session_replication_role = replica;");
    const riaccende = corpo.indexOf("SET LOCAL session_replication_role = origin;");
    const controllo = corpo.indexOf("admin_backup_collegamenti_rotti(v_company_id, v_rientrate)");
    expect(spegne).toBeGreaterThan(-1);
    expect(riaccende).toBeGreaterThan(spegne);
    expect(controllo).toBeGreaterThan(riaccende);
  });

  it("controlla ogni chiave esterna alla fine, e se qualcosa non c'è annulla tutto", () => {
    const corpo = ripristino();
    expect(corpo).toContain("IF v_rotti IS NOT NULL THEN");
    expect(corpo).toMatch(/RAISE EXCEPTION 'Ripristino reale annullato/);
    const controllo = ultimaDefinizione("admin_backup_collegamenti_rotti").corpo;
    // MATCH SIMPLE: una chiave con una colonna vuota non punta a niente.
    expect(controllo).toContain("format('t.%I IS NOT NULL', a.attname)");
    expect(controllo).toContain("NOT EXISTS (SELECT 1 FROM %s m WHERE %s)");
  });

  it("gli utenti rientrano se l'account di accesso c'è ancora (la purga cancella il profilo, non l'account)", () => {
    const corpo = ripristino();
    expect(corpo).toContain("WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = r.id)");
    expect(corpo).not.toContain("gli utenti vanno ricreati dall''auth, non da un INSERT");
  });

  it("una riga sopravvissuta alla purga torna ai valori del backup, contata a parte", () => {
    const corpo = ripristino();
    expect(corpo).toContain("ON CONFLICT ON CONSTRAINT %I DO UPDATE SET (%s) = ROW(%s)");
    expect(corpo).toContain("RETURNING (xmax = 0) AS nuova");
    expect(corpo).toContain("'righe_gia_presenti'");
  });

  it("il PIN WhatsApp di un backup vecchio passa comunque dal Vault", () => {
    expect(ripristino()).toContain("UPDATE public.ai_whatsapp_numbers SET cloud_api_pin = cloud_api_pin");
  });
});

describe("prova e ripristino prendono le colonne con la stessa regola", () => {
  // Una colonna nata dopo il backup prende il suo valore predefinito: il 20/09 la
  // prova della Demo perdeva 7 righe per una colonna NOT NULL aggiunta dopo.
  it.each([
    ["admin_ripristina_backup", "(p_dump -> v_chiave -> 0) ? a.attname"],
    ["admin_ripristino_prova_versa", "(v_righe -> 0) ? a.attname"],
  ])("%s", (nome, regola) => {
    expect(ultimaDefinizione(nome).corpo).toContain(regola);
  });
});

describe("il ripristino è del solo service role", () => {
  it.each([
    ["admin_ripristina_backup", "jsonb, text, boolean"],
    ["admin_backup_collegamenti_rotti", "uuid, text\\[\\]"],
  ])("%s", (nome, firma) => {
    const { file } = ultimaDefinizione(nome);
    const testo = readFileSync(join(CARTELLA, file), "utf8");
    expect(testo).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${nome}\\(${firma}\\) FROM PUBLIC, anon, authenticated;`));
    expect(testo).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${nome}\\(${firma}\\) TO service_role;`));
  });
});
