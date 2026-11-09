/**
 * I costi nelle voci giuste, su tutte le aziende (09/11/2026).
 *
 * Due difetti rendevano i costi classificati allo 0% su ogni azienda vera:
 * l'elenco delle categorie esisteva solo per le demo, e l'abbinamento era
 * carattere per carattere. Questo test sorveglia i tre punti in cui si può
 * tornare a sbagliare:
 *  - l'abbinamento tollerante non deve contare un costo due volte;
 *  - l'elenco deve essere scritto in forma normalizzata, altrimenti due voci
 *    dello stesso concetto finiscono nella stessa azienda;
 *  - la semina deve valere per le aziende nuove, non solo per un bottone.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");
const sql = readFileSync(
  join(ROOT, "supabase/migrations/20290116140000_costi_classificati_per_tutti.sql"),
  "utf8",
);

/** Le righe dell'elenco seminato: (chiave, descrizione, macro, tipo, tabella, valore, ordine). */
function righeElenco() {
  // Una riga per riga del file: le descrizioni contengono parentesi, quindi
  // non si possono cercare «gruppi fra tonde».
  const blocco = sql.slice(sql.indexOf("from (values"), sql.indexOf("as v(chiave"));
  const righe = blocco
    .split("\n")
    .map((r) => r.trim())
    .filter((r) => /^\('.+,\s*\d+\),?$/.test(r));
  return righe.map((r) => {
    const campi = r.match(/'((?:[^']|'')*)'/g)!.map((c) => c.slice(1, -1).replace(/''/g, "'"));
    return {
      chiave: campi[0], descrizione: campi[1], macro: campi[2],
      tipo: campi[3], tabella: campi[4], valore: campi[5],
    };
  });
}

describe("L'abbinamento tollerante", () => {
  it("ignora maiuscole, separatori e accenti", () => {
    expect(sql).toContain("create or replace function public.cg_norm_voce");
    expect(sql).toContain("immutable");
    expect(sql).toContain("lower(p_valore)");
    // Underscore e trattino diventano spazi; gli accenti cadono.
    expect(sql).toContain("'_-àáâäèéêëìíîïòóôöùúûüç'");
  });

  it("la tabella di traduzione ha i due lati della stessa lunghezza", () => {
    const [da, a] = sql
      .match(/translate\(lower\(p_valore\), '([^']+)', '([^']+)'\)/)!
      .slice(1);
    expect([...da].length).toBe([...a].length);
  });

  it("prende UNA sola classificazione per riga: mai due", () => {
    expect(sql).toContain("left join lateral (");
    const lateral = sql.slice(sql.indexOf("left join lateral ("));
    expect(lateral).toContain("limit 1");
    // La regola scritta esattamente come la categoria vince sulle altre.
    expect(lateral).toContain("order by (c.source_value = u.source_value) desc");
  });

  it("ha l'indice sul nome normalizzato, o la vista scandisce la tabella", () => {
    expect(sql).toContain("idx_cg_class_lookup_norm");
    expect(sql).toContain("public.cg_norm_voce(source_value)");
  });

  it("non tocca le date: restano quelle della competenza", () => {
    const prosa = sql.replace(/\s+/g, " ");
    expect(prosa).toContain(
      "coalesce( cc.mese_competenza, cc.documento_data, fr.data_fattura, cc.due_date, cc.paid_date )",
    );
  });
});

describe("L'elenco standard delle categorie", () => {
  const righe = righeElenco();

  it("non è vuoto e copre tutte le macro-voci di costo", () => {
    expect(righe.length).toBeGreaterThan(60);
    const macro = new Set(righe.map((r) => r.macro));
    for (const attesa of [
      "acquisti_materie", "costi_produttivi", "costo_personale",
      "costi_commerciali", "costi_amministrativi", "ammortamenti",
      "oneri_tributari", "oneri_finanziari", "costi_extra",
    ]) {
      expect(macro).toContain(attesa);
    }
  });

  it("copre le categorie che le aziende usano davvero", () => {
    const valori = new Set(righe.map((r) => r.valore));
    // «materiali» è la categoria più costosa sui dati veri: mancava.
    for (const atteso of [
      "materiali", "materiali edili", "subappalti", "manodopera", "trasporti",
      "consulenze professionali", "oneri urbanistici", "affitto", "utenze",
      "personale", "viaggi trasferte", "marketing pubblicita",
    ]) {
      expect(valori).toContain(atteso);
    }
  });

  it("i nomi sono già normalizzati: niente maiuscole né underscore", () => {
    // Altrimenti l'abbinamento tollerante troverebbe due regole per lo stesso
    // concetto nella stessa azienda. Fanno eccezione le voci tecniche, che non
    // arrivano da una categoria scritta a mano.
    const tecniche = new Set(["manual", "prima_nota"]);
    for (const r of righe) {
      if (tecniche.has(r.tabella)) continue;
      expect(r.valore, `categoria «${r.valore}»`).toBe(r.valore.toLowerCase());
      expect(r.valore, `categoria «${r.valore}»`).not.toMatch(/[_-]/);
    }
  });

  it("nessuna coppia (tabella, categoria) ripetuta: una regola per concetto", () => {
    const viste = new Set<string>();
    for (const r of righe) {
      const k = `${r.tabella}|${r.valore}`;
      expect(viste.has(k), `ripetuta: ${k}`).toBe(false);
      viste.add(k);
    }
  });

  it("nessuna chiave ripetuta: la chiave è unica per azienda", () => {
    const chiavi = righe.map((r) => r.chiave);
    expect(new Set(chiavi).size).toBe(chiavi.length);
  });

  it("lascia fuori «altro» e gli acquisti di terreni e immobili", () => {
    const valori = righe.map((r) => r.valore);
    expect(valori).not.toContain("altro");
    expect(valori).not.toContain("acquisto terreno");
    expect(valori).not.toContain("acquisto immobile");
    expect(valori).not.toContain("terreni");
  });

  it("si semina da sola: per le aziende di oggi e per quelle che nascono", () => {
    expect(sql).toContain("perform public.cg_semina_classificazione_voci(r.id)");
    expect(sql).toContain("create trigger trg_cg_semina_classificazione");
    expect(sql).toContain("after insert on public.companies");
    // Girare due volte non deve raddoppiare niente.
    expect(sql).toContain("on conflict (company_id, voce_chiave, source_table, source_value) do nothing");
  });

  it("la semina non è chiamabile dal browser", () => {
    expect(sql).toMatch(
      /revoke all on function public\.cg_semina_classificazione_voci\(uuid\) from public, anon, authenticated/,
    );
  });
});

describe("L'elenco di quello che resta da sistemare", () => {
  it("elenca solo le categorie senza voce, dalla più costosa", () => {
    const fn = sql.slice(sql.indexOf("create or replace function public.cg_voci_non_classificate"));
    expect(fn).toContain("c.macro_voce is null");
    expect(fn).toContain("order by t.ordine desc");
    expect(fn).toContain("limit 50");
  });

  it("non è aperta ad anon e rifiuta l'azienda di un altro", () => {
    expect(sql).toMatch(/revoke all on function public\.cg_voci_non_classificate[^\n]*from public, anon/);
    expect(sql).toMatch(/grant execute on function public\.cg_voci_non_classificate[^\n]*to authenticated/);
    expect(sql).toContain("Accesso negato: company_id non autorizzato");
  });
});
