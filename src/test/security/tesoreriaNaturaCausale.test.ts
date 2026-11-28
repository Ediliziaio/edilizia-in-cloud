// Natura dei movimenti senza documento (lotto B, 28/11/2026): private.tes_natura_causale e la
// categoria del costo delle spese bancarie, su PostgreSQL vero (PGlite), con le causali come le
// scrivono le banche. Le regole di prima non devono cambiare natura; le nuove riconoscono le
// causali che restavano «Da capire».
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

const pg = new PGlite();

/** Estrae da un file di migrazione il CREATE di una funzione, fino al suo `$…$;` di chiusura. */
async function funzione(file: string, nome: string) {
  const sql = await readFile(`supabase/migrations/${file}`, "utf8");
  const inizio = sql.indexOf(`CREATE OR REPLACE FUNCTION ${nome}(`);
  if (inizio < 0) throw new Error(`${nome} non è in ${file}`);
  const tag = /AS (\$[a-z]*\$)/.exec(sql.slice(inizio))![1];
  const corpo = sql.indexOf(tag, inizio) + tag.length;
  return sql.slice(inizio, sql.indexOf(`${tag};`, corpo) + tag.length + 1);
}

beforeAll(async () => {
  await pg.exec(`create role anon; create role authenticated; create schema private;`);
  await pg.exec(await funzione("20290404310000_tesoreria_esiti_riconciliazione.sql", "private.tes_norm"));
  await pg.exec(await readFile("supabase/migrations/20290701200000_tesoreria_natura_da_causale.sql", "utf8"));
  await pg.exec(await funzione("20290701200200_tesoreria_chiudi_spese_bancarie.sql", "private.tes_spesa_bancaria_categoria"));
  await pg.exec(await funzione("20290701200200_tesoreria_chiudi_spese_bancarie.sql", "private.tes_spesa_bancaria_certa"));
  await pg.exec(await funzione("20290701200300_tesoreria_esiti_chiusi_senza_documento.sql", "private.tes_esito_chiuso"));
});
afterAll(async () => pg.close());

interface Natura { natura: string; regola: string; versione: number; mancante: string | null }
async function natura(descrizione: string, o: { entrata?: boolean; nome?: string; iban?: string } = {}) {
  const r = await pg.query<{ v: Natura }>(
    `select private.tes_natura_causale(private.tes_norm(concat_ws(' ',$1::text,$2::text)),$3,$4,$2,$1) v`,
    [descrizione, o.nome ?? null, o.entrata ?? false, o.iban ?? null],
  );
  return r.rows[0].v;
}

describe("causali che prima restavano «Da capire»", () => {
  it.each([
    ["COMM. RICHIESTA INCASSO SEPA B2C", "spesa_bancaria", "N-SPESE-COMM"],
    ["COMM.BON.ISTANTANEO DISPOSIZIONE BONIFICO RIF B0011920260304VT00097963", "spesa_bancaria", "N-SPESE-COMM"],
    ["SDD CORE - RICHIESTA INCASSO SEPA 176979/PAYPAL PAYPAL EUROPE", "addebito_diretto", "N-SDD"],
    ["SDD CORE - RICHIESTA INCASSO SEPA NUMERO DI CONTRATTO 123 VFS SERVIZI FINANZIARI SPA", "finanziamento", "N-FINANZ-SDD"],
    ["ADDEBITO SDD FINANZIAMENTI STELLANTIS FINANCIAL SER N 1190388355", "finanziamento", "N-FINANZ-SDD"],
    ["PAGAMENTO UTENZE CBILL/PAGOPA DA I DEL 18.11.26 13:38", "bollettino", "N-BOLLETTINO"],
    ["ADDEBITO MAV DA INTERNET BANKING MAV 123/456", "bollettino", "N-BOLLETTINO"],
    ["PAGAMENTO M.AV.- RAV PAGAMENTO NR 1 MAV-RAV DEL 09/11/2026", "bollettino", "N-BOLLETTINO"],
    ["BOLLETTINO BANCARIO PAGAMENTO FRECCIA COD.IDENTIFICATIVO R1056", "bollettino", "N-BOLLETTINO"],
    ["DISPOSIZIONE PER EMOLUMENTI INTERN. INSTANT DEL 16/11/2026", "stipendi", "N-STIPENDI"],
    ["Bonifico stipendi dipendenti", "stipendi", "N-STIPENDI"],
    ["RICARICA CARTA PREPAGATA TASCA DA CARTA : 5226*****442", "giroconto", "N-RICARICA"],
    ["RITENUTA BONIFICI FINANZIARIA 2010 ORD. MARIO ROSSI", "ritenuta_bonifico", "N-RITENUTA"],
    ["RIT. D'ACCONTO SU BONIFICI (ART.25 D.L.N.78/2010) A FAVORE", "ritenuta_bonifico", "N-RITENUTA"],
    ["PAGAMENTO SU CIRCUITO INTERNAZIONALE GRUPPOVIS SPA CASTELLANZA ITA", "spesa_carta", "N-CARTA-CIRCUITO"],
    ["CARTA DEL CREDITO COOPERATIVO ****************** CARTA CREDITO COOPERATIVO", "spesa_carta", "N-CARTA-CIRCUITO"],
  ])("«%s» → %s (%s)", async (descrizione, attesa, regola) => {
    const r = await natura(descrizione);
    expect(r.natura).toBe(attesa);
    expect(r.regola).toBe(regola);
    expect(r.versione).toBe(1);
    expect(r.mancante).toBeTruthy();
  });

  it.each([
    ["ACCREDITI EFFETTI/DOC. S.B.F. 03/11/26 DISTINTA 109844"],
    ["ACCREDITO RIBA AL SBF ACCREDITO RIBA AL SBF LOTTO 12"],
  ])("entrata «%s» → anticipo salvo buon fine", async (descrizione) => {
    const r = await natura(descrizione, { entrata: true });
    expect(r).toMatchObject({ natura: "anticipo_fatture", regola: "N-SBF" });
  });
});

describe("le regole di prima non cambiano", () => {
  it.each([
    ["COMMISSIONI Commissione PagoPA 349192500503747665 Ente benef", false, "spesa_bancaria", "N-SPESE"],
    ["COMMISSIONI D'INCASSO SBF PRESENTAZIONE", false, "spesa_bancaria", "N-SPESE"],
    ["fx_card", false, "spesa_bancaria", "N-SPESE"],
    ["IMPOSTA DI BOLLO BOLLI DA MAGGIO A GIUGNO", false, "spesa_bancaria", "N-SPESE"],
    ["Leasing furgone attrezzato #2", false, "finanziamento", "N-FINANZ"],
    ["ANTICIPO SU DOCUMENTI ANT FT", false, "anticipo_fatture", "N-ANTICIPO"],
    ["RIENTRO ANTICIPO/FINANZIAMENTO CHIUSURA FT ANTICIPATE", true, "anticipo_fatture", "N-ANTICIPO"],
    ["Eseguito da Qonto", false, "sconosciuta", "N-NESSUNA"],
  ])("«%s» → %s", async (descrizione, entrata, attesa, regola) => {
    expect(await natura(descrizione, { entrata })).toMatchObject({ natura: attesa, regola });
  });

  it("una spesa con carta resta tale se la banca dà il negozio e non l'IBAN", async () => {
    expect(await natura("", { nome: "Distributore Rossi" })).toMatchObject({ natura: "spesa_carta", regola: "N-CARTA" });
    expect(await natura("", { nome: "Distributore Rossi", iban: "IT60X0542811101000000123456" })).toMatchObject({ natura: "sconosciuta" });
  });

  it("le commissioni sugli addebiti restano spese, non diventano SDD o bollettini", async () => {
    expect((await natura("COMMISSIONI SDD CORE RICHIESTA INCASSO")).natura).toBe("spesa_bancaria");
    expect((await natura("COMMISSIONE PAGOPA CBILL")).natura).toBe("spesa_bancaria");
  });

  it("le entrate non diventano stipendi, SDD o ritenute", async () => {
    expect((await natura("EMOLUMENTI *CASSA EDILE DI MUTUALITA E ASSISTENZA", { entrata: true })).natura).toBe("sconosciuta");
    expect((await natura("SDD CORE RIMBORSO", { entrata: true })).natura).not.toBe("addebito_diretto");
    expect((await natura("RITENUTA BONIFICI FINANZIARIA", { entrata: true })).natura).not.toBe("ritenuta_bonifico");
  });

  it("«comm» vale solo in testa alla causale", async () => {
    expect((await natura("BONIFICO A FAVORE DI ROSSI COMM 12")).natura).toBe("sconosciuta");
  });
});

describe("categoria del costo delle spese bancarie", () => {
  it.each([
    ["interessi e competenze liq comp", "interessi"],
    ["imposta di bollo bolli da maggio a giugno", "tasse"],
    ["comm richiesta incasso sepa b2c", "spese bancarie"],
  ])("«%s» → %s", async (ncaus, attesa) => {
    const r = await pg.query<{ v: string }>(`select private.tes_spesa_bancaria_categoria($1) v`, [ncaus]);
    expect(r.rows[0].v).toBe(attesa);
  });
});

describe("chiusura in blocco: solo le spese che sono davvero della banca", () => {
  async function certa(descrizione: string, o: { controparte?: string; iban?: string; banca?: string } = {}) {
    const r = await pg.query<{ v: boolean }>(
      `select private.tes_spesa_bancaria_certa(private.tes_norm($1), private.tes_norm($2), $3, private.tes_norm($4)) v`,
      [descrizione, o.controparte ?? null, o.iban ?? null, o.banca ?? null],
    );
    return r.rows[0].v;
  }
  it.each([
    ["COMM. RICHIESTA INCASSO SEPA B2C"],
    ["Commissioni su bonifico tramite in"],
    ["IMPOSTA DI BOLLO BOLLI DI OTTOBRE"],
    ["Canone mensile tenuta conto: Commissioni bancarie"],
    ["INTERESSI E COMPETENZE LIQ.COMP."],
    ["Commissioni incasso Ri.Ba. Presentazione n. 109844"],
  ])("«%s» si chiude", async (d) => expect(await certa(d)).toBe(true));

  it.each([
    ["SDD CORE CANONE TELEFONIA MOBILE", "un SDD di un fornitore, anche se dice «canone»"],
    ["CANONE NOLEGGIO STAMPANTE", "un canone che non è del conto"],
    ["SPESE CONDOMINIALI", "«spese» non basta"],
    ["IMPOSTA SOSTITUTIVA F24", "un F24"],
    ["COMMISSIONI Commissione PagoPA 349192500503747665", "pagoPA: va visto"],
    ["DEMO spese operative DEMO-2026-N003", "nessuna parola della banca"],
  ])("«%s» resta fuori (%s)", async (d) => expect(await certa(d)).toBe(false));

  it("una controparte diversa dalla banca del conto, o un IBAN, la lascia fuori", async () => {
    expect(await certa("Commissioni", { controparte: "Telecom Italia" })).toBe(false);
    expect(await certa("Commissioni", { iban: "IT60X0542811101000000123456" })).toBe(false);
    expect(await certa("Commissioni", { controparte: "Qonto", banca: "Qonto" })).toBe(true);
    // «fx_card» è il cambio sulla carta di Qonto: la controparte è il negozio
    expect(await certa("fx_card", { controparte: "Distributore Rossi", banca: "Qonto" })).toBe(true);
    // Qonto scrive «fx_card» sia nella causale sia nel riferimento
    expect(await certa("fx_card fx_card", { controparte: "Distributore Rossi", banca: "Qonto" })).toBe(true);
  });
});

describe("movimento chiuso senza documento", () => {
  it.each([["spesa"], ["nessun_costo"]])("«%s» ha l'esito chiuso, come un movimento interamente collegato", async (tipo) => {
    const r = await pg.query<{ v: Record<string, unknown> }>(`select private.tes_esito_chiuso($1) v`, [tipo]);
    expect(r.rows[0].v).toMatchObject({ esito: "automatico", natura: "gia_riconciliato", regola: "R-CHIUSO", candidati: [], mancanti: [], chiuso_senza_documento: tipo });
  });
});
