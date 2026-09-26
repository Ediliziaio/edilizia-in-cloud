/**
 * Senza azienda non vuol dire tutte le aziende (26/09/2026).
 *
 * 27 funzioni SECURITY DEFINER controllavano l'azienda con
 * `x <> get_my_company_id()`: per chi non ha un'azienda (chi entra con Google
 * senza invito: Supabase crea l'utente lo stesso) il confronto dà NULL e l'IF
 * non scatta. Provato in una transazione annullata con uno di quegli utenti
 * veri: prima leggeva posizione finanziaria, conto economico, stato
 * patrimoniale, marginalità delle commesse, valorizzazione del magazzino,
 * tracciamento di un contatto ed economia AI di un'altra azienda; dopo tutto
 * negato. Il commercialista idem. Membri e super admin come prima.
 *
 * Il guardiano in fondo ferma una migrazione nuova che rimetta la trappola.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");
const CARTELLA = join(ROOT, "supabase/migrations");
const QUESTA = "20280926094500";
const codice = readFileSync(join(CARTELLA, `${QUESTA}_senza_azienda_non_vuol_dire_tutte.sql`), "utf8")
  .replace(/^\s*--.*$/gm, "");
const elenco = [...codice.slice(codice.indexOf("array["), codice.indexOf("];")).matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]);

// `x <> get_my_company_id()`: con un NULL a destra il confronto è NULL e l'IF non scatta.
const TRAPPOLA = /(<>|!=)\s*\(?\s*(select\s+)?(public\.)?(get_my_company_id|get_effective_company_id|get_user_company_id)\s*\(/i;

describe("migrazione senza_azienda_non_vuol_dire_tutte", () => {
  it("non aspetta i lock e si ferma se una funzione non c'è", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    expect(codice).toContain("raise exception 'non tutte le % funzioni in elenco esistono', cardinality(elenco);");
  });

  it("27 funzioni, nessuna ripetuta, con il Controllo di Gestione e il magazzino", () => {
    expect(elenco).toHaveLength(27);
    expect(new Set(elenco).size).toBe(27);
    expect(elenco.filter((f) => f.startsWith("cg_"))).toHaveLength(18);
    for (const f of ["wh_get_valorizzazione", "wh_get_lotti_in_scadenza", "get_contact_tracking", "set_default_warehouse"]) {
      expect(elenco, f).toContain(f);
    }
  });

  it("il confronto diventa IS DISTINCT FROM, una volta sola per funzione", () => {
    expect(codice).toContain("confronto constant text := '(\\S+) <> public\\.(get_my_company_id|get_effective_company_id)\\(\\)';");
    expect(codice).toContain("execute regexp_replace(v_def, confronto, '\\1 IS DISTINCT FROM public.\\2()');");
    expect(codice).toContain("raise exception '%: confronto trovato % volte invece di una', f.firma, v_volte;");
  });

  it("l'economia AI la vede solo il super admin, anche per una sola azienda", () => {
    expect(codice).toContain("'public.get_ai_economics_dashboard(text,uuid)', 'costi veri e i margini della piattaforma',");
    expect(codice).toMatch(/IF NOT v_is_super THEN\n\s+RAISE EXCEPTION 'Permesso negato: solo super_admin' USING ERRCODE = '42501';/);
  });

  it("variante del prompt e utente da un canale: solo il servizio", () => {
    for (const firma of ["ai_get_prompt_variant(text, uuid, uuid, uuid)", "silvio_canale_risolvi_utente(text, text)"]) {
      expect(codice).toContain(`revoke all on function public.${firma} from public, anon, authenticated;`);
      expect(codice).toContain(`grant execute on function public.${firma} to service_role;`);
    }
  });
});

describe("guardiano", () => {
  it("nessuna migrazione nuova confronta l'azienda con <> o !=", () => {
    const nuove = readdirSync(CARTELLA).filter((f) => /^\d{14}_.*\.sql$/.test(f) && f.slice(0, 14) > QUESTA);
    const colpevoli = nuove.filter((f) =>
      readFileSync(join(CARTELLA, f), "utf8").replace(/--.*$/gm, "").split("\n").some((riga) => TRAPPOLA.test(riga)));
    expect(colpevoli, "usare IS DISTINCT FROM: con un NULL il <> lascia passare").toEqual([]);
  });

  it("il guardiano riconosce la trappola", () => {
    expect(TRAPPOLA.test("IF v_company_id <> public.get_my_company_id() THEN")).toBe(true);
    expect(TRAPPOLA.test("IF c.company_id != get_effective_company_id() THEN")).toBe(true);
    expect(TRAPPOLA.test("IF v_company_id IS DISTINCT FROM public.get_my_company_id() THEN")).toBe(false);
  });
});
