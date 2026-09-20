/**
 * La prova di ripristino dei backup a blocchi (20/09/2026).
 *
 * Le aziende grandi — BeMade, Best Infissi, Il Bagno Group, la Demo, l'area
 * super admin — si salvano a blocchi, e per quel formato la prova non c'era:
 * company-restore rispondeva 422 e la scheda nascondeva il pulsante. «Un
 * backup che non ha passato la prova non è un backup».
 *
 * Tiene fermo:
 *   · dell'indice non ci si fida: azienda, nomi di tabella e cartelle dei file;
 *   · il file del blocco va a «versa» così com'è, senza aprirlo;
 *   · un blocco non passato si riprova a pezzi solo se il guaio è peso o tempo,
 *     e i pezzi sono sempre gli stessi (il cursore è passo + pezzo);
 *   · «integro» vuol dire indice, file e righe contate d'accordo su ogni tabella;
 *   · le tre funzioni del database sono chiuse a tutti tranne il service role,
 *     e creano/inseriscono come admin_ripristina_backup;
 *   · la scheda offre la prova anche per i backup a blocchi e ne segue lo stato.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PEZZI_PER_BLOCCO,
  SILENZIO_MASSIMO_MS,
  TETTO_GIRO_MS,
  componiEsito,
  corpoAttornoAlFile,
  cursoreDopo,
  dividiInPezzi,
  giroFinito,
  leggiPercorsoIndice,
  pianoDellaProva,
  provaChiusa,
  provaInterrotta,
  riassuntoAvanzamento,
  vaRiprovatoAPezzi,
  type IndiceABlocchi,
} from "../../../supabase/functions/_shared/ripristinoBlocchi";

const ROOT = join(__dirname, "../../..");
const leggi = (f: string) => readFileSync(join(ROOT, f), "utf8");

const AZIENDA = "421f4929-04bc-406d-b0fd-3ff4d57a64ee";
const BASE = `${AZIENDA}/2026-09-20`;
const PERCORSO = `${BASE}/indice.json`;

const indice = (tabelle: IndiceABlocchi["tabelle"], altro: Partial<IndiceABlocchi> = {}): IndiceABlocchi => ({
  esportato_il: "2026-09-20T02:31:00.000Z",
  azienda: { id: AZIENDA, name: "Best Infissi S.r.l." },
  a_blocchi: true,
  completo: true,
  tabelle,
  ...altro,
});

describe("il percorso dell'indice", () => {
  it("<azienda>/<data>/indice.json, e nient'altro", () => {
    expect(leggiPercorsoIndice(PERCORSO)).toEqual({ companyId: AZIENDA, data: "2026-09-20", base: BASE });
    expect(leggiPercorsoIndice(`${AZIENDA}/2026-09-20-backup.json`)).toBe(null); // il file unico
    expect(leggiPercorsoIndice(`${BASE}/scadenze/001.json`)).toBe(null);
    expect(leggiPercorsoIndice(`../${PERCORSO}`)).toBe(null);
    expect(leggiPercorsoIndice(`non-un-uuid/2026-09-20/indice.json`)).toBe(null);
    expect(leggiPercorsoIndice("")).toBe(null);
  });
});

describe("dall'indice al piano", () => {
  it("prima la riga dell'azienda, poi i file di ogni tabella nell'ordine dell'indice", () => {
    const piano = pianoDellaProva(indice([
      { tabella: "scadenze", righe_attese: 2216, righe_salvate: 2216, file: [`${BASE}/scadenze/001.json`, `${BASE}/scadenze/002.json`] },
      { tabella: "invoices", righe_attese: 2208, righe_salvate: 2208, file: [`${BASE}/invoices/001.json`] },
    ]), PERCORSO);
    expect(piano.ok).toBe(true);
    if (!piano.ok) return;
    expect(piano.companyId).toBe(AZIENDA);
    expect(piano.tabelle).toEqual(["scadenze", "invoices"]);
    expect(piano.righe).toBe(4424);
    expect(piano.piano).toEqual([
      { tabella: "companies", file: `${BASE}/azienda.json`, azienda: true },
      { tabella: "scadenze", file: `${BASE}/scadenze/001.json` },
      { tabella: "scadenze", file: `${BASE}/scadenze/002.json` },
      { tabella: "invoices", file: `${BASE}/invoices/001.json` },
    ]);
  });

  it("una tabella senza file (backup fallito su quella) resta nell'elenco ma non ha passi", () => {
    const piano = pianoDellaProva(indice([{ tabella: "email_inbox", righe_attese: 900, righe_salvate: 0, file: [], errore: "tempo finito" }]), PERCORSO);
    expect(piano.ok && piano.tabelle).toEqual(["email_inbox"]);
    expect(piano.ok && piano.piano.length).toBe(1);
  });

  it("non è un indice a blocchi → no", () => {
    expect(pianoDellaProva({ azienda: { id: AZIENDA }, scadenze: [] }, PERCORSO).ok).toBe(false); // un dump unico
    expect(pianoDellaProva(null, PERCORSO).ok).toBe(false);
    expect(pianoDellaProva(indice([]), `${AZIENDA}/2026-09-20-backup.json`).ok).toBe(false);
  });

  it("l'indice di un'altra azienda nella cartella di questa → no", () => {
    const altra = indice([], { azienda: { id: "1b4ef4f7-87a6-4313-9ac6-cd53a7c14ce7", name: "BeMade S.r.l." } });
    // Letto cosi' perche' il tsconfig dell'app ha strict: false, e senza
    // strictNullChecks il ramo { ok: false } dell'unione non si restringe.
    const esito = pianoDellaProva(altra, PERCORSO) as { ok: boolean; errore?: string };
    expect(esito.ok).toBe(false);
    expect(esito.errore).toMatch(/altra azienda/);
  });

  it("un file fuori dalla cartella della sua tabella → no", () => {
    const fuori = [
      `1b4ef4f7-87a6-4313-9ac6-cd53a7c14ce7/2026-09-20/scadenze/001.json`, // un'altra azienda
      `${BASE}/invoices/001.json`, // un'altra tabella
      `${BASE}/scadenze/../invoices/001.json`,
      `${BASE}/scadenze/sotto/001.json`,
      `${BASE}/scadenze/001.txt`,
    ];
    for (const file of fuori) {
      const esito = pianoDellaProva(indice([{ tabella: "scadenze", righe_salvate: 1, file: [file] }]), PERCORSO);
      expect(esito.ok, file).toBe(false);
    }
  });

  it("un nome di tabella che non è un nome di tabella → no", () => {
    for (const tabella of ["", "Scadenze", "scadenze; drop table x", "public.scadenze", "companies", "a".repeat(64)]) {
      expect(pianoDellaProva(indice([{ tabella, righe_salvate: 0, file: [] }]), PERCORSO).ok, tabella).toBe(false);
    }
    const doppia = indice([{ tabella: "scadenze", file: [] }, { tabella: "scadenze", file: [] }]);
    expect(pianoDellaProva(doppia, PERCORSO).ok).toBe(false);
  });
});

describe("il corpo della chiamata a «versa»", () => {
  const PROVA = "14a5d2f4-4d55-4233-8b24-d5840556330f";

  it("attorno al file di un blocco, senza aprirlo: il file diventa p_righe così com'è", () => {
    const file = JSON.stringify({ n: 2, righe: [{ id: "a" }, { id: "b" }], finito: true, ultimo: "b" });
    const { prima, dopo } = corpoAttornoAlFile({ provaId: PROVA, tabella: "scadenze", passo: 7 });
    expect(JSON.parse(prima + file + dopo)).toEqual({
      p_prova_id: PROVA, p_tabella: "scadenze", p_passo: 7, p_pezzo: 0, p_ultimo_pezzo: true,
      p_righe: { n: 2, righe: [{ id: "a" }, { id: "b" }], finito: true, ultimo: "b" },
    });
  });

  it("la riga dell'azienda è un oggetto solo: finisce tra quadre", () => {
    const file = JSON.stringify({ id: AZIENDA, name: "Best Infissi S.r.l." });
    const { prima, dopo } = corpoAttornoAlFile({ provaId: PROVA, tabella: "companies", passo: 0 }, true);
    expect(JSON.parse(prima + file + dopo).p_righe).toEqual([{ id: AZIENDA, name: "Best Infissi S.r.l." }]);
  });

  it("un nome strano non rompe il JSON", () => {
    const { prima, dopo } = corpoAttornoAlFile({ provaId: PROVA, tabella: 'con"virgolette', passo: 1 });
    expect(JSON.parse(`${prima}[]${dopo}`).p_tabella).toBe('con"virgolette');
  });
});

describe("un blocco non passato", () => {
  it("si riprova a pezzi se il guaio è il peso o il tempo", () => {
    expect(vaRiprovatoAPezzi(500, '{"code":"57014","message":"canceling statement due to statement timeout"}')).toBe(true);
    expect(vaRiprovatoAPezzi(504, "")).toBe(true);
    expect(vaRiprovatoAPezzi(413, "Payload Too Large")).toBe(true);
    expect(vaRiprovatoAPezzi(502, "")).toBe(true);
    expect(vaRiprovatoAPezzi(0, "The signal has been aborted")).toBe(true);
  });

  it("non si riprova se è un rifiuto: tornerebbe uguale anche con un quarto delle righe", () => {
    expect(vaRiprovatoAPezzi(400, '{"message":"Passo 9.0 fuori ordine: la prova è al 6.0"}')).toBe(false);
    expect(vaRiprovatoAPezzi(401, "")).toBe(false);
    expect(vaRiprovatoAPezzi(403, '{"code":"42501","message":"Riservato al super admin"}')).toBe(false);
    expect(vaRiprovatoAPezzi(404, "")).toBe(false);
    expect(vaRiprovatoAPezzi(409, "")).toBe(false);
    expect(vaRiprovatoAPezzi(500, '{"message":"out of shared memory"}')).toBe(false);
  });

  it("la prova chiusa da qualcun altro ferma chi sta versando", () => {
    expect(provaChiusa(409, "")).toBe(true);
    expect(provaChiusa(400, '{"code":"PT409","message":"La prova di ripristino x non è più in corso (fallita)"}')).toBe(true);
    expect(provaChiusa(500, '{"code":"57014"}')).toBe(false);
  });

  it("i pezzi sono sempre gli stessi, senza buchi e senza doppioni", () => {
    const righe = Array.from({ length: 5000 }, (_, i) => i);
    const pezzi = dividiInPezzi(righe);
    expect(pezzi).toHaveLength(PEZZI_PER_BLOCCO);
    expect(pezzi.map((p) => p.length)).toEqual([1250, 1250, 1250, 1250]);
    expect(pezzi.flat()).toEqual(righe);
    expect(dividiInPezzi(righe)).toEqual(pezzi); // chi riprende da metà ritrova gli stessi
  });

  it("nessun pezzo vuoto, e un blocco di una riga non si divide", () => {
    expect(dividiInPezzi([1, 2, 3]).map((p) => p.length)).toEqual([1, 1, 1]);
    expect(dividiInPezzi([1, 2, 3, 4, 5]).map((p) => p.length)).toEqual([2, 2, 1]);
    expect(dividiInPezzi([1])).toEqual([[1]]);
    expect(dividiInPezzi([])).toEqual([[]]);
  });
});

describe("il cursore", () => {
  it("di norma un posto più avanti: il pezzo dopo, o il passo dopo se era l'ultimo", () => {
    const buona = JSON.stringify({ tabella: "scadenze", nel_blocco: 50, inserite: 50 });
    expect(cursoreDopo(buona, 7, 0, true)).toEqual({ passo: 8, pezzo: 0 });
    expect(cursoreDopo(buona, 7, 1, false)).toEqual({ passo: 7, pezzo: 2 });
    expect(cursoreDopo(buona, 7, 3, true)).toEqual({ passo: 8, pezzo: 0 });
  });

  it("blocco già versato → si riparte da dove dice il database", () => {
    const gia = JSON.stringify({ tabella: "scadenze", gia_versato: true, passo: 12, pezzo: 0 });
    expect(cursoreDopo(gia, 7, 0, true)).toEqual({ passo: 12, pezzo: 0 });
    const stessoPasso = JSON.stringify({ gia_versato: true, passo: 7, pezzo: 3 });
    expect(cursoreDopo(stessoPasso, 7, 1, false)).toEqual({ passo: 7, pezzo: 3 });
  });

  it("una risposta buona ma illeggibile non ferma la prova", () => {
    expect(cursoreDopo("", 7, 0, true)).toEqual({ passo: 8, pezzo: 0 });
    expect(cursoreDopo("<html>", 7, 0, false)).toEqual({ passo: 7, pezzo: 1 });
  });
});

describe("il tempo", () => {
  it("un giro lascia il tempo di finire il blocco e far partire il successivo (limite 400 s)", () => {
    expect(TETTO_GIRO_MS).toBeLessThanOrEqual(300_000);
    expect(giroFinito(0, TETTO_GIRO_MS)).toBe(false);
    expect(giroFinito(0, TETTO_GIRO_MS + 1)).toBe(true);
  });

  it("una prova muta da più di dieci minuti è morta; una chiusa non lo è mai", () => {
    const adesso = Date.parse("2026-09-20T18:00:00Z");
    expect(provaInterrotta("in_corso", "2026-09-20T17:55:00Z", adesso)).toBe(false);
    expect(provaInterrotta("in_corso", "2026-09-20T17:49:59Z", adesso)).toBe(true);
    expect(provaInterrotta("in_corso", null, adesso)).toBe(true);
    expect(provaInterrotta("finita", "2026-09-19T00:00:00Z", adesso)).toBe(false);
    expect(provaInterrotta("fallita", "2026-09-19T00:00:00Z", adesso)).toBe(false);
  });

  it("lo stesso silenzio vale nel database, che ripulisce le prove morte in «apri»", () => {
    expect(SILENZIO_MASSIMO_MS).toBe(10 * 60_000);
    expect(leggi("supabase/migrations/20280920224500_prova_ripristino_a_blocchi.sql"))
      .toContain("aggiornata_il < now() - interval '10 minutes'");
  });
});

describe("l'esito", () => {
  const QUANDO = "2026-09-20T18:00:00.000Z";
  const dueTabelle = indice([
    { tabella: "scadenze", righe_attese: 2216, righe_salvate: 2216, file: [`${BASE}/scadenze/001.json`] },
    { tabella: "invoices", righe_attese: 2208, righe_salvate: 2208, file: [`${BASE}/invoices/001.json`] },
  ]);

  it("tutto rientrato → integro, col formato che la scheda sa già mostrare", () => {
    const esito = componiEsito(dueTabelle, PERCORSO,
      { companies: { nel_file: 1, inserite: 1 }, scadenze: { nel_file: 2216, inserite: 2216 }, invoices: { nel_file: 2208, inserite: 2208 } },
      { companies: 1, scadenze: 2216, invoices: 2208 }, QUANDO);
    expect(esito).toMatchObject({
      modo: "prova", a_blocchi: true, percorso: PERCORSO, azienda: "Best Infissi S.r.l.", company_id: AZIENDA,
      esportato_il: "2026-09-20T02:31:00.000Z", backup_completo: true,
      righe_nel_file: 4424, righe_ripristinate: 4424, integro: true, eseguito_il: QUANDO,
    });
    // La riga dell'azienda si elenca ma non entra nei totali, come nella prova del file unico.
    expect(esito.tabelle).toEqual([
      { tabella: "companies", nel_file: 1, ripristinate: 1 },
      { tabella: "scadenze", nel_file: 2216, ripristinate: 2216 },
      { tabella: "invoices", nel_file: 2208, ripristinate: 2208 },
    ]);
  });

  it("un blocco che non entra → non integro, con il motivo sulla tabella", () => {
    const esito = componiEsito(dueTabelle, PERCORSO,
      { companies: { nel_file: 1, inserite: 1 }, scadenze: { nel_file: 2216, inserite: 1716, errore: 'invalid input value for enum x: "y"' }, invoices: { nel_file: 2208, inserite: 2208 } },
      { companies: 1, scadenze: 1716, invoices: 2208 }, QUANDO);
    expect(esito.integro).toBe(false);
    expect(esito.righe_ripristinate).toBe(3924);
    expect(esito.tabelle[1]).toEqual({ tabella: "scadenze", nel_file: 2216, ripristinate: 1716, errore: 'invalid input value for enum x: "y"' });
  });

  it("nei file meno righe di quante l'indice ne dichiara → non integro, anche senza errori", () => {
    const esito = componiEsito(dueTabelle, PERCORSO,
      { companies: { nel_file: 1, inserite: 1 }, scadenze: { nel_file: 2000, inserite: 2000 }, invoices: { nel_file: 2208, inserite: 2208 } },
      { companies: 1, scadenze: 2000, invoices: 2208 }, QUANDO);
    expect(esito.integro).toBe(false);
    expect(esito.tabelle[1].errore).toBe("nei file ci sono 2.000 righe, l'indice ne dichiara 2.216");
  });

  it("«versa» dice di averle messe ma nello schema non ci sono → non integro: conta quello che c'è", () => {
    const esito = componiEsito(dueTabelle, PERCORSO,
      { companies: { nel_file: 1, inserite: 1 }, scadenze: { nel_file: 2216, inserite: 2216 }, invoices: { nel_file: 2208, inserite: 2208 } },
      { companies: 1, scadenze: 2216, invoices: 2200 }, QUANDO);
    expect(esito.integro).toBe(false);
    expect(esito.tabelle[2].errore).toBe("rientrate 2.200 righe su 2.208");
  });

  it("una prova interrotta a metà → le tabelle mai raggiunte contano zero", () => {
    const esito = componiEsito(dueTabelle, PERCORSO,
      { companies: { nel_file: 1, inserite: 1 }, scadenze: { nel_file: 2216, inserite: 2216 } },
      { companies: 1, scadenze: 2216 }, QUANDO);
    expect(esito.integro).toBe(false);
    expect(esito.tabelle[2]).toMatchObject({ tabella: "invoices", nel_file: 2208, ripristinate: 0 });
  });

  it("senza la riga dell'azienda non è integro", () => {
    const esito = componiEsito(dueTabelle, PERCORSO,
      { scadenze: { nel_file: 2216, inserite: 2216 }, invoices: { nel_file: 2208, inserite: 2208 } },
      { scadenze: 2216, invoices: 2208 }, QUANDO);
    expect(esito.integro).toBe(false);
    expect(esito.tabelle[0].errore).toBe("la riga dell'azienda non è rientrata");
  });

  it("quello che mancava già nel backup si dice, ma non è colpa della prova", () => {
    const aMeta = indice([
      { tabella: "email_inbox", righe_attese: 900, righe_salvate: 500, file: [`${BASE}/email_inbox/001.json`], errore: "tempo finito" },
      { tabella: "scadenze", righe_attese: 2216, righe_salvate: 2000, file: [`${BASE}/scadenze/001.json`] },
    ], { completo: false });
    const esito = componiEsito(aMeta, PERCORSO,
      { companies: { nel_file: 1, inserite: 1 }, email_inbox: { nel_file: 500, inserite: 500 }, scadenze: { nel_file: 2000, inserite: 2000 } },
      { companies: 1, email_inbox: 500, scadenze: 2000 }, QUANDO);
    expect(esito.integro).toBe(true); // quello che c'è rientra tutto…
    expect(esito.backup_completo).toBe(false); // …ma il backup era a metà, e lo si dice
    expect(esito.tabelle[1].nota).toBe("il backup di questa tabella si era fermato: tempo finito");
    expect(esito.tabelle[2].nota).toBe("il backup ne aveva salvate 2.000 su 2.216");
  });

  it("l'avanzamento per la scheda: righe versate senza la riga dell'azienda", () => {
    expect(riassuntoAvanzamento({
      passo: 40, passi_totali: 118, righe_attese: 37236,
      avanzamento: { companies: { inserite: 1 }, scadenze: { inserite: 2216 }, invoices: { inserite: 1000 } },
    })).toEqual({ passo: 40, passi: 118, righe_versate: 3216, righe_totali: 37236 });
    expect(riassuntoAvanzamento({})).toEqual({ passo: 0, passi: 0, righe_versate: 0, righe_totali: 0 });
  });
});

describe("le funzioni del database", () => {
  const migrazione = leggi("supabase/migrations/20280920224500_prova_ripristino_a_blocchi.sql");
  const fileUnico = leggi("supabase/migrations/20280911100003_ripristino_da_backup.sql");

  it("nascono chiuse: REVOKE da PUBLIC, anon e authenticated, GRANT al solo service role", () => {
    for (const firma of [
      "admin_ripristino_prova_apri(uuid, text, text[], integer, bigint)",
      "admin_ripristino_prova_versa(uuid, text, jsonb, integer, integer, boolean, text)",
      "admin_ripristino_prova_chiudi(uuid, text, text)",
    ]) {
      expect(migrazione).toContain(`REVOKE ALL ON FUNCTION public.${firma} FROM PUBLIC, anon, authenticated;`);
      expect(migrazione).toContain(`GRANT EXECUTE ON FUNCTION public.${firma} TO service_role;`);
    }
    expect(migrazione).not.toMatch(/GRANT EXECUTE[^;]*TO[^;]*(anon|authenticated)/);
    expect(migrazione.match(/Riservato al super admin/g)).toHaveLength(3);
  });

  it("il registro delle prove è del solo service role, e non finisce nel backup delle aziende", () => {
    expect(migrazione).toContain("ALTER TABLE public.backup_prove_ripristino ENABLE ROW LEVEL SECURITY;");
    expect(migrazione).toContain("REVOKE ALL ON TABLE public.backup_prove_ripristino FROM PUBLIC, anon, authenticated;");
    expect(migrazione).not.toMatch(/CREATE POLICY/);
    // Il catalogo del backup prende ogni tabella con una company_id: qui si chiama azienda_id apposta.
    expect(migrazione).toMatch(/azienda_id\s+uuid NOT NULL/);
    expect(migrazione).not.toMatch(/^\s*company_id\s+uuid/m);
  });

  it("creano e inseriscono come admin_ripristina_backup: se una riga non entra qui, non entra nemmeno là", () => {
    expect(fileUnico).toContain("(LIKE public.%I INCLUDING DEFAULTS)");
    expect(migrazione).toContain("(LIKE public.%I INCLUDING DEFAULTS)");
    const inserimento = "SELECT %s FROM jsonb_populate_recordset(NULL::public.%I, $1)";
    expect(fileUnico).toContain(inserimento);
    expect(migrazione).toContain(inserimento);
    const colonne = "AND NOT a.attisdropped AND a.attgenerated = ''";
    expect(fileUnico).toContain(colonne);
    expect(migrazione).toContain(colonne);
  });

  it("lo schema non arriva mai da fuori, e si ricontrolla prima di scriverci", () => {
    expect(migrazione).not.toMatch(/p_schema/);
    expect(migrazione.match(/schema_prova !~ '\^ripristino_prova_\[0-9a-f\]\{8\}_blocchi\$'/g)).toHaveLength(2);
    expect(migrazione).toContain("|| '_blocchi'");
  });

  it("una prova per azienda alla volta, e un blocco non si versa due volte", () => {
    expect(migrazione).toContain("ON public.backup_prove_ripristino (azienda_id) WHERE stato = 'in_corso'");
    expect(migrazione).toContain("pg_advisory_xact_lock");
    expect(migrazione).toContain("IF (p_passo, v_pezzo) < (v_prova.passo, v_prova.pezzo) THEN");
    expect(migrazione).toContain("'gia_versato', true");
  });

  it("le tabelle nascono tutte in «apri» e sono UNLOGGED; il modo reale non si tocca", () => {
    expect(migrazione.match(/CREATE UNLOGGED TABLE/g)).toHaveLength(2);
    expect(migrazione).not.toMatch(/CREATE OR REPLACE FUNCTION public\.admin_ripristina_backup/);
    expect(migrazione).toContain("SET lock_timeout TO");
  });
});

describe("company-restore", () => {
  const funzione = leggi("supabase/functions/company-restore/index.ts");

  it("la prova di un indice parte, risponde subito e lavora in sottofondo", () => {
    expect(funzione).not.toContain("la prova di ripristino per questo formato non è ancora disponibile");
    expect(funzione).toContain('db.rpc("admin_ripristino_prova_apri"');
    expect(funzione).toContain("await inSottofondo(giro(db, prova.prova_id))");
    expect(funzione).toContain("runtime.waitUntil(lavoro)");
    expect(funzione).toMatch(/in_corso: true, prova_id: prova\.prova_id, percorso \}, 202\)/);
  });

  it("il file del blocco va a «versa» così com'è: niente JSON.parse sulla strada normale", () => {
    expect(funzione).toContain("new Blob([prima, blob, dopo], { type: \"application/json\" })");
    const stradaNormale = funzione.slice(funzione.indexOf("if (pezzoIniziale === 0) {"), funzione.indexOf("// A pezzi:"));
    expect(stradaNormale).not.toContain("JSON.parse");
    expect(stradaNormale).not.toContain(".text()");
  });

  it("un giro ha un tetto di tempo e passa il testimone; chi riprende parte dal cursore del database", () => {
    expect(funzione).toContain("if (giroFinito(inizio, Date.now())) {");
    expect(funzione).toContain('body: JSON.stringify({ azione: "prosegui", prova_id: provaId })');
    expect(funzione).toContain("let numero = Number(riga.passo ?? 0);");
    expect(funzione).toContain("let pezzo = Number(riga.pezzo ?? 0);");
  });

  it("comunque vada si chiude: nessuna copia dei dati lasciata in giro", () => {
    expect(funzione).toMatch(/catch \(e\) \{[\s\S]{0,400}await chiudiProva\(db, provaId, percorso, "fallita", messaggio\)/);
    expect(funzione).toContain("if (provaInterrotta(riga.stato, riga.aggiornata_il, Date.now())) {");
  });

  it("resta chiusa a chi non è super admin né ha il segreto, anche per «stato» e «prosegui»", () => {
    const controllo = funzione.indexOf('if (!await autorizzato(req, db)) return json({ error: "Non autorizzato" }, 401);');
    expect(controllo).toBeGreaterThan(0);
    expect(controllo).toBeLessThan(funzione.indexOf('if (azione === "stato")'));
    expect(controllo).toBeLessThan(funzione.indexOf('if (azione === "prosegui")'));
  });

  it("il ripristino reale di un backup a blocchi non esiste, e lo si dice", () => {
    expect(funzione).toMatch(/if \(azione === "reale"\) \{\s*return json\(\{ ok: false, percorso, error: "Il ripristino reale di un backup a blocchi non è disponibile/);
    // Il file unico passa da admin_ripristina_backup, come prima.
    expect(funzione).toContain('db.rpc("admin_ripristina_backup", {');
  });
});

describe("la scheda Backup", () => {
  const scheda = leggi("src/components/admin/company/CompanyBackupCard.tsx");

  it("offre la prova anche per i backup a blocchi", () => {
    expect(scheda).not.toContain("{!f.a_blocchi && (");
    expect(scheda).not.toContain("la prova di ripristino non è ancora disponibile");
    expect(scheda).toContain("onClick={() => prova.mutate(f.percorso)}");
  });

  it("segue la prova chiedendo lo stato, e mostra l'esito dell'ultima anche dopo aver ricaricato", () => {
    expect(scheda).toContain('body: { azione: "stato", prova_id: provaId }');
    expect(scheda).toContain("const e = esiti[f.percorso] ?? f.ultima_prova?.esito;");
    expect(scheda).toContain('if (f.ultima_prova?.stato === "in_corso") void segui(f.percorso, f.ultima_prova.prova_id);');
  });

  it("smette di chiedere quando la scheda si chiude", () => {
    expect(scheda).toContain("while (aperta.current) {");
    expect(scheda).toContain("return () => { aperta.current = false; };");
  });
});
