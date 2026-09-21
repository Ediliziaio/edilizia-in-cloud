import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  chiusoSuMeta,
  conta,
  conteggiDaSalvare,
  conteggioMeta,
  conteggioVisto,
  conteggiVuoti,
  CONTROLLO_ORARIO_MS,
  daRicontrollare,
  decidiModulo,
  FINESTRA_CALDA_MS,
  GIORNI_SENZA_WEBHOOK,
  motivoConteggio,
  oraDiControllo,
  rigaGiro,
  rigaPagina,
  secondiCreazione,
  somma,
  statoMeta,
} from "../../../supabase/functions/_shared/metaModuliDaInterrogare";

// 20/09/2026: il recupero dei lead Facebook interrogava ~317 moduli a ogni giro,
// 96 giri al giorno: 30.437 righe di log e altrettante chiamate a Facebook che
// non trovavano niente, giri fino a 118 secondi. Quasi tutti moduli di campagne
// vecchie. Qui si prova QUALI moduli si leggono: un lead perso è un cliente perso.

const NESSUN_LEAD = new Set<string>();
const MODULO = "3812031529083810";
// Un'ora che di sicuro non è il turno di controllo del modulo.
const fuoriTurno = (formId: string) => (oraDiControllo(formId) + 5) % 24;

const decidi = (p: Partial<Parameters<typeof decidiModulo>[0]>) =>
  decidiModulo({
    formId: MODULO,
    statusMeta: "ACTIVE",
    cfg: null,
    giroAutomatico: true,
    soloModulo: null,
    conLeadRecenti: NESSUN_LEAD,
    oraUtc: fuoriTurno(p.formId ?? MODULO),
    saltaArchiviati: true,
    ...p,
  });

describe("lo stato del modulo come lo scrive Meta", () => {
  it("riconosce i quattro stati, in qualunque grafia", () => {
    expect(statoMeta("ACTIVE")).toBe("ACTIVE");
    expect(statoMeta(" archived ")).toBe("ARCHIVED");
    expect(statoMeta("Deleted")).toBe("DELETED");
    expect(statoMeta("DRAFT")).toBe("DRAFT");
  });

  it("tutto il resto è sconosciuto, e uno sconosciuto non è mai «chiuso»", () => {
    for (const v of [undefined, null, "", 7, "PAUSED", {}]) {
      expect(statoMeta(v)).toBe("SCONOSCIUTO");
    }
    expect(chiusoSuMeta("SCONOSCIUTO")).toBe(false);
    expect(chiusoSuMeta("ACTIVE")).toBe(false);
    expect(chiusoSuMeta("DRAFT")).toBe(false);
    expect(chiusoSuMeta("ARCHIVED")).toBe(true);
    expect(chiusoSuMeta("DELETED")).toBe(true);
  });
});

describe("giro automatico: quali moduli si leggono", () => {
  it("un modulo attivo mai configurato si legge: la campagna nuova resta coperta", () => {
    expect(decidi({ statusMeta: "ACTIVE", cfg: null })).toMatchObject({
      esito: "letto", motivo: "normale", configurato: false,
    });
  });

  it("senza stato, o con uno stato mai visto, si legge come prima", () => {
    expect(decidi({ statusMeta: undefined }).esito).toBe("letto");
    expect(decidi({ statusMeta: "QUALCOSA_DI_NUOVO" }).esito).toBe("letto");
    expect(decidi({ statusMeta: "DRAFT" }).esito).toBe("letto");
  });

  it("archiviato o eliminato su Meta, senza lead recenti e fuori turno: si salta", () => {
    expect(decidi({ statusMeta: "ARCHIVED" }).esito).toBe("saltato_archiviato");
    expect(decidi({ statusMeta: "DELETED" }).esito).toBe("saltato_archiviato");
    // vale anche per un modulo configurato e acceso da noi
    expect(decidi({ statusMeta: "ARCHIVED", cfg: { status: "active" } }).esito).toBe("saltato_archiviato");
  });

  it("archiviato ma con un lead negli ultimi 30 giorni: si continua a leggere a ogni giro", () => {
    const d = decidi({ statusMeta: "ARCHIVED", conLeadRecenti: new Set([MODULO]) });
    expect(d).toMatchObject({ esito: "letto", motivo: "lead_recenti" });
  });

  it("se non si è riusciti a sapere chi ha lead recenti non si salta niente", () => {
    const d = decidi({ statusMeta: "ARCHIVED", conLeadRecenti: null });
    expect(d).toMatchObject({ esito: "letto", motivo: "controllo_non_riuscito" });
  });

  it("nella sua ora di controllo un archiviato si rilegge", () => {
    const d = decidi({ statusMeta: "ARCHIVED", oraUtc: oraDiControllo(MODULO) });
    expect(d).toMatchObject({ esito: "letto", motivo: "turno_di_controllo" });
  });

  it("un modulo spento da noi non si legge, qualunque cosa dica Meta", () => {
    for (const statusMeta of ["ACTIVE", "ARCHIVED", undefined]) {
      expect(decidi({ statusMeta, cfg: { status: "inactive" } }).esito).toBe("saltato_disattivato");
    }
    // nemmeno nel suo turno, nemmeno con lead recenti
    expect(decidi({
      statusMeta: "ARCHIVED", cfg: { status: "inactive" },
      conLeadRecenti: new Set([MODULO]), oraUtc: oraDiControllo(MODULO),
    }).esito).toBe("saltato_disattivato");
  });
});

describe("salto spento: si osserva soltanto", () => {
  it("un archiviato saltabile si legge lo stesso, ma resta contato", () => {
    const d = decidi({ statusMeta: "ARCHIVED", saltaArchiviati: false });
    expect(d).toMatchObject({ esito: "letto", motivo: "in_osservazione" });
    const c = conteggiVuoti();
    conta(c, d);
    conta(c, decidi({ statusMeta: "ACTIVE", saltaArchiviati: false }));
    expect(c).toMatchObject({ letti: 2, saltatiArchiviati: 0, saltabili: 1 });
    expect(rigaPagina({ companyId: "a", pageId: "p", ms: 1, c })).toContain("saltati_archiviati=0 (salto spento: saltabili=1)");
  });

  it("col salto acceso la riga non parla di saltabili", () => {
    const c = conteggiVuoti();
    conta(c, decidi({ statusMeta: "ARCHIVED" }));
    expect(rigaPagina({ companyId: "a", pageId: "p", ms: 1, c })).not.toContain("saltabili");
  });
});

describe("recupero chiesto da qualcuno: lo stato su Meta non conta", () => {
  it("per giorni: anche gli archiviati si leggono (archiviato ieri, lead della settimana scorsa)", () => {
    const d = decidi({ statusMeta: "ARCHIVED", giroAutomatico: false });
    expect(d).toMatchObject({ esito: "letto", motivo: "recupero_chiesto" });
  });

  it("di un modulo solo: quello si legge anche se archiviato, gli altri non si toccano", () => {
    expect(decidi({ statusMeta: "ARCHIVED", giroAutomatico: false, soloModulo: MODULO }).esito).toBe("letto");
    expect(decidi({ formId: "111", statusMeta: "ACTIVE", giroAutomatico: false, soloModulo: MODULO }).esito)
      .toBe("saltato_altro_modulo");
  });

  it("resta spento ciò che abbiamo spento noi", () => {
    expect(decidi({ giroAutomatico: false, cfg: { status: "inactive" } }).esito).toBe("saltato_disattivato");
  });
});

describe("il turno di controllo degli archiviati", () => {
  const moduli = Array.from({ length: 317 }, (_, i) => String(1_480_000_000_000_000 + i * 7_919_003));

  it("è un'ora del giorno, sempre la stessa per lo stesso modulo", () => {
    for (const m of moduli) {
      const ora = oraDiControllo(m);
      expect(Number.isInteger(ora) && ora >= 0 && ora <= 23).toBe(true);
      expect(oraDiControllo(m)).toBe(ora);
    }
  });

  it("i controlli si spargono sulle 24 ore invece di cadere tutti nello stesso giro", () => {
    const perOra = new Array(24).fill(0);
    for (const m of moduli) perOra[oraDiControllo(m)]++;
    expect(Math.min(...perOra)).toBeGreaterThan(0);
    // la media è 13 per ora: nessuna ora si prende più del triplo
    expect(Math.max(...perOra)).toBeLessThan(40);
  });

  it("una giornata vera: 96 giri, 290 archiviati su 317 — nessuno resta senza controllo", () => {
    const archiviati = new Set(moduli.slice(0, 290));
    const letture = new Map<string, number>();
    let chiamate = 0;
    for (let giro = 0; giro < 96; giro++) {
      const oraUtc = Math.floor((13 + giro * 15) / 60) % 24; // il cron parte al minuto 13
      for (const formId of moduli) {
        const d = decidiModulo({
          formId,
          statusMeta: archiviati.has(formId) ? "ARCHIVED" : "ACTIVE",
          cfg: null,
          giroAutomatico: true,
          conLeadRecenti: NESSUN_LEAD,
          oraUtc,
          saltaArchiviati: true,
        });
        if (d.esito === "letto") {
          chiamate++;
          letture.set(formId, (letture.get(formId) ?? 0) + 1);
        }
      }
    }
    // gli attivi a ogni giro, come prima
    for (const m of moduli.slice(290)) expect(letture.get(m)).toBe(96);
    // gli archiviati quattro volte: i quattro giri della loro ora
    for (const m of archiviati) expect(letture.get(m)).toBe(4);
    // prima: 317 × 96 = 30.432 chiamate al giorno
    expect(chiamate).toBe(27 * 96 + 290 * 4);
    expect(chiamate).toBeLessThan(30_432 / 8);
  });

  it("regge anche se il cron cambia cadenza: basta un giro all'ora", () => {
    for (const m of moduli.slice(0, 50)) {
      let letto = 0;
      for (let oraUtc = 0; oraUtc < 24; oraUtc++) {
        if (decidi({ formId: m, statusMeta: "ARCHIVED", oraUtc }).esito === "letto") letto++;
      }
      expect(letto).toBe(1);
    }
  });
});

describe("una riga di log per pagina, non una per modulo", () => {
  const c = conteggiVuoti();
  conta(c, decidi({ statusMeta: "ACTIVE" }));
  conta(c, decidi({ statusMeta: "ACTIVE", cfg: { status: "active" } }));
  conta(c, decidi({ statusMeta: "ARCHIVED" }));
  conta(c, decidi({ statusMeta: "ARCHIVED" }));
  conta(c, decidi({ statusMeta: "ARCHIVED", conLeadRecenti: new Set([MODULO]) }));
  conta(c, decidi({ statusMeta: "ARCHIVED", oraUtc: oraDiControllo(MODULO) }));
  conta(c, decidi({ statusMeta: "ACTIVE", cfg: { status: "inactive" } }));
  conta(c, decidi({ formId: "999", soloModulo: MODULO })); // non fa numero
  c.leadNuovi = 3;

  it("conta cosa si è letto e cosa si è saltato, e perché", () => {
    expect(c).toMatchObject({
      moduli: 7,
      letti: 4,
      saltatiArchiviati: 2,
      saltatiDisattivati: 1,
      archiviatiConLeadRecenti: 1,
      archiviatiLettiPerControllo: 1,
      nonConfigurati: 5,
    });
    expect(c.perStato).toMatchObject({ ACTIVE: 3, ARCHIVED: 4 });
    // la domanda del 20/09: dei moduli mai configurati, quanti sono davvero attivi?
    expect(c.nonConfiguratiPerStato).toMatchObject({ ACTIVE: 1, ARCHIVED: 4 });
  });

  it("la riga della pagina porta tutti i numeri", () => {
    const riga = rigaPagina({ companyId: "az-1", pageId: "pag-1", ms: 842, c });
    expect(riga.split("\n")).toHaveLength(1);
    expect(riga).toContain("pagina pag-1 azienda az-1");
    expect(riga).toContain("moduli=7 (ACTIVE=3 ARCHIVED=4)");
    expect(riga).toContain("non_configurati=5 (ACTIVE=1 ARCHIVED=4)");
    expect(riga).toContain("letti=4 saltati_archiviati=2 saltati_disattivati=1");
    expect(riga).toContain("archiviati_con_lead_recenti=1");
    expect(riga).toContain("lead_nuovi=3");
    expect(riga).toContain("ms=842");
  });

  it("la riga del giro somma le pagine", () => {
    const totale = conteggiVuoti();
    somma(totale, c);
    somma(totale, c);
    const riga = rigaGiro({ pagine: 2, ms: 5_000, c: totale, automatico: true });
    expect(riga).toContain("giro automatico — pagine=2 moduli=14 (ACTIVE=6 ARCHIVED=8)");
    expect(riga).toContain("saltati_archiviati=4");
    expect(riga).toContain("lead_nuovi=6");
    expect(rigaGiro({ pagine: 1, ms: 1, c, automatico: false })).toContain("giro di recupero");
  });
});

describe("la funzione usa le regole, e non torna indietro", () => {
  const fonte = readFileSync(join(__dirname, "../../../supabase/functions/meta-leads-backfill/index.ts"), "utf8");

  it("chiede a Meta stato e conteggio, e se un campo viene rifiutato ripiega fino ai soli id", () => {
    expect(fonte).toContain('const CAMPI_ELENCO = ["id,status,leads_count", "id,status", "id"];');
    expect(fonte).toContain("for (const campi of CAMPI_ELENCO)");
    expect(fonte).toContain("leadgen_forms?fields=${campi}");
    expect(fonte).toContain("leadsCount: f.leads_count");
  });

  it("decide con decidiModulo, e il cron resta l'unico giro «automatico»", () => {
    expect(fonte).toContain("decidiModulo({");
    expect(fonte).toContain("giroAutomatico: giorniChiesti === null && daEsplicita === null && !soloModulo");
  });

  it("niente più una riga di log per modulo", () => {
    expect(fonte).not.toContain("non configurato in meta_lead_forms, importato come rete di sicurezza");
    expect(fonte).not.toMatch(/console\.log\(`meta-leads-backfill: modulo \$\{formId\} saltato/);
    expect(fonte).toContain("console.log(rigaPagina(");
    expect(fonte).toContain("console.log(rigaGiro(");
  });

  // Provato contro PostgREST di produzione il 20/09/2026: `payload->>form_id`
  // senza alias torna nella chiave `payload`, non `form_id`. Letta la chiave
  // sbagliata, «moduli con lead recenti» sarebbe SEMPRE vuoto e ogni modulo
  // archiviato verrebbe saltato: il guasto peggiore, e silenzioso.
  it("il modulo si chiede con un alias, e le righe mute valgono come «non si sa»", () => {
    expect(fonte).toContain("modulo:payload->>form_id");
    expect(fonte).not.toMatch(/select\("received_at, payload->>form_id"\)/);
    expect(fonte).toContain("righe.every((r) => !r.modulo)");
  });

  // 20/09/2026, misurato in produzione: 334 letture una dopo l'altra = giri da
  // 91-115 secondi, contro il tetto di tempo della funzione. È questa la leva
  // sulla durata, e non salta nemmeno un modulo.
  it("le letture dei moduli vanno a lotti, non una dopo l'altra", () => {
    expect(fonte).toContain("const LETTURE_INSIEME = 5");
    expect(fonte).toContain("daLeggere.slice(i, i + LETTURE_INSIEME)");
    expect(fonte).toContain("await Promise.all(lotto.map(");
    // prima si decide su tutti, poi si legge: i conteggi del log restano completi
    expect(fonte.indexOf("conta(c, d);")).toBeLessThan(fonte.indexOf("await Promise.all(lotto.map("));
  });

  it("una lettura che scoppia non porta giù le altre del lotto", () => {
    expect(fonte).toContain("return { formId, d, cfg, inizioLettura, nuovi: 0, errore: senzaToken(e), chiamate: 0, nonContati: 0 };");
  });

  it("il conteggio: interruttore, mappa salvata per pagina, e si ricorda solo ciò che si è letto bene", () => {
    expect(fonte).toMatch(/const SALTA_CONTEGGIO_FERMO = (true|false);/);
    expect(fonte).toContain("saltaFermi: SALTA_CONTEGGIO_FERMO");
    expect(fonte).toContain('.from("meta_moduli_conteggi")');
    expect(fonte).toContain('{ onConflict: "page_asset_id" }');
    expect(fonte).toContain("else lettiBene.add(formId);");
    expect(fonte).toContain("moduliSuMeta: erroreElenco ? null : new Set(moduli.map((m) => m.id))");
  });

  it("chiede al database dove i lead arrivano solo dal recupero, e nel dubbio non salta", () => {
    expect(fonte).toContain('.is("payload->raw", null)');
    expect(fonte).toContain('.select("modulo:payload->>form_id")');
    expect(fonte).toContain("if (righe.length >= TETTO_RIGHE || (righe.length > 0 && righe.every((r) => !r.modulo))) return null;");
    expect(fonte).toContain("senzaWebhook,");
  });

  it("un lead nuovo in un modulo col conteggio fermo si scrive nel log, ogni volta", () => {
    expect(fonte).toContain('if (d.conteggio === "fermo") {');
    expect(fonte).toContain("c.leadNuoviDaFermi += nuovi;");
    expect(fonte).toContain("ATTENZIONE modulo ${formId} (pagina ${pageId}): ${nuovi} lead nuovi con il");
  });

  it("il segnalibro avanza solo se la lettura è riuscita, e segna l'inizio della lettura", () => {
    expect(fonte).toContain("if (cfg && !errore) {");
    expect(fonte).toContain("update({ last_pull_at: inizioLettura })");
  });

  it("il token della pagina non finisce nei log", () => {
    expect(fonte).toContain('"access_token=***"');
    expect(fonte).not.toMatch(/console\.(warn|error|log)\([^)]*,\s*e\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 21/09/2026 — il conteggio dei lead di Meta (leads_count). Se il numero di un
// modulo è lo stesso dell'ultimo giro, non è entrato niente: non serve chiedere
// i suoi lead. Da ~33.000 chiamate al giorno a qualche migliaio. Qui si prova
// che la regola non lascia indietro un lead in nessuno dei modi in cui Meta
// può comportarsi.
// ═══════════════════════════════════════════════════════════════════════════

const ORA = Date.parse("2026-09-21T09:13:00Z");
const PRIMA = (minuti: number) => new Date(ORA - minuti * 60_000).toISOString();

describe("il conteggio come lo dà Meta", () => {
  it("un intero, anche scritto come testo", () => {
    expect(conteggioMeta(0)).toBe(0);
    expect(conteggioMeta(463)).toBe(463);
    expect(conteggioMeta("463")).toBe(463);
    expect(conteggioMeta(" 12 ")).toBe(12);
  });

  it("tutto il resto non è un conteggio: niente si indovina", () => {
    for (const v of [undefined, null, "", "12a", "1e3", -1, 1.5, NaN, Infinity, {}, [], true] as unknown[]) {
      expect(conteggioMeta(v)).toBeNull();
    }
  });

  it("una voce salvata rotta vale come mai vista", () => {
    expect(conteggioVisto({ n: 5, cambiato: PRIMA(90) })).toEqual({ n: 5, cambiato: PRIMA(90) });
    expect(conteggioVisto({ n: "5", cambiato: PRIMA(90) })).toEqual({ n: 5, cambiato: PRIMA(90) });
    const rotte: unknown[] = [null, undefined, 5, "x", [], { n: 5 }, { cambiato: PRIMA(90) }, { n: -1, cambiato: PRIMA(90) },
      { n: 5, cambiato: "ieri" }];
    for (const v of rotte) {
      expect(conteggioVisto(v)).toBeNull();
    }
  });
});

describe("cosa dice il conteggio rispetto all'ultimo visto", () => {
  const visto = { n: 10, cambiato: PRIMA(90) };

  it("senza conteggio non si decide niente: si legge", () => {
    expect(motivoConteggio({ attuale: undefined, visto, adessoMs: ORA })).toBe("conteggio_assente");
    expect(motivoConteggio({ attuale: "tanti", visto, adessoMs: ORA })).toBe("conteggio_assente");
  });

  it("modulo mai visto, o voce salvata rotta: si legge", () => {
    expect(motivoConteggio({ attuale: 10, visto: undefined, adessoMs: ORA })).toBe("mai_visto");
    expect(motivoConteggio({ attuale: 10, visto: { n: 10 }, adessoMs: ORA })).toBe("mai_visto");
  });

  it("qualunque differenza, anche in meno, è un cambio", () => {
    expect(motivoConteggio({ attuale: 11, visto, adessoMs: ORA })).toBe("conteggio_cambiato");
    expect(motivoConteggio({ attuale: 9, visto, adessoMs: ORA })).toBe("conteggio_cambiato");
  });

  it("uguale ma cambiato da meno di un'ora: si legge ancora", () => {
    expect(motivoConteggio({ attuale: 10, visto: { n: 10, cambiato: PRIMA(59) }, adessoMs: ORA })).toBe("appena_cambiato");
    expect(motivoConteggio({ attuale: 10, visto: { n: 10, cambiato: PRIMA(1) }, adessoMs: ORA })).toBe("appena_cambiato");
  });

  it("un cambio «nel futuro» (orologi diversi) vale come appena avvenuto", () => {
    expect(motivoConteggio({ attuale: 10, visto: { n: 10, cambiato: PRIMA(-30) }, adessoMs: ORA })).toBe("appena_cambiato");
  });

  it("uguale da più di un'ora: fermo", () => {
    expect(FINESTRA_CALDA_MS).toBe(60 * 60_000);
    expect(motivoConteggio({ attuale: 10, visto: { n: 10, cambiato: PRIMA(60) }, adessoMs: ORA })).toBe("fermo");
    expect(motivoConteggio({ attuale: "10", visto, adessoMs: ORA })).toBe("fermo");
  });
});

describe("decidere col conteggio", () => {
  const MOD = "1268174375402285"; // Green Energy: i suoi lead arrivano SOLO dal recupero
  const fermo = { n: 40, cambiato: PRIMA(120), letto: PRIMA(15) };
  const fuoriOra = (oraDiControllo(MOD) + 7) % 24;
  const conConteggio = (
    over: Partial<Parameters<typeof decidiModulo>[0]> = {},
    c: { attuale?: unknown; visto?: unknown; saltaFermi?: boolean } = {},
  ) =>
    decidiModulo({
      formId: MOD,
      statusMeta: "ACTIVE",
      cfg: { status: "active" },
      giroAutomatico: true,
      conLeadRecenti: new Set<string>(),
      oraUtc: fuoriOra,
      saltaArchiviati: false,
      conteggio: { attuale: 40, visto: fermo, adessoMs: ORA, saltaFermi: true, ...c },
      ...over,
    });

  it("conteggio fermo e salto acceso: non si chiedono i lead", () => {
    expect(conConteggio()).toMatchObject({ esito: "saltato_conteggio_fermo", conteggio: "fermo" });
  });

  it("ma nel suo turno di controllo si legge lo stesso", () => {
    expect(conConteggio({ oraUtc: oraDiControllo(MOD) }))
      .toMatchObject({ esito: "letto", motivo: "turno_di_controllo", conteggio: "fermo" });
  });

  it("salto spento: si legge come prima, e il modulo resta segnato come fermo", () => {
    expect(conConteggio({}, { saltaFermi: false }))
      .toMatchObject({ esito: "letto", motivo: "normale", conteggio: "fermo" });
  });

  it("appena entra un lead il conteggio cambia e si legge", () => {
    expect(conConteggio({}, { attuale: 41 })).toMatchObject({ esito: "letto", motivo: "conteggio_cambiato" });
  });

  it("per un'ora dopo il cambio si continua a leggere a ogni giro", () => {
    expect(conConteggio({}, { attuale: 41, visto: { n: 41, cambiato: PRIMA(20) } }))
      .toMatchObject({ esito: "letto", motivo: "appena_cambiato" });
  });

  it("un modulo mai visto si legge", () => {
    expect(conConteggio({}, { visto: undefined })).toMatchObject({ esito: "letto", motivo: "mai_visto" });
  });

  it("un conteggio che cambia vince anche sul salto degli archiviati: è un fatto, non una supposizione", () => {
    const d = conConteggio({ statusMeta: "ARCHIVED", saltaArchiviati: true }, { attuale: 41 });
    expect(d).toMatchObject({ esito: "letto", motivo: "conteggio_cambiato" });
  });

  it("senza conteggio si decide come prima, archiviati compresi", () => {
    expect(conConteggio({}, { attuale: undefined })).toMatchObject({ esito: "letto", motivo: "normale", conteggio: "conteggio_assente" });
    expect(conConteggio({ statusMeta: "ARCHIVED", saltaArchiviati: true }, { attuale: undefined }).esito).toBe("saltato_archiviato");
  });

  it("recupero chiesto, modulo spento da noi, altro modulo: il conteggio non conta", () => {
    expect(conConteggio({ giroAutomatico: false })).toMatchObject({ esito: "letto", motivo: "recupero_chiesto" });
    expect(conConteggio({ cfg: { status: "inactive" } }).esito).toBe("saltato_disattivato");
    expect(conConteggio({ soloModulo: "altro" }).esito).toBe("saltato_altro_modulo");
  });
});

describe("un modulo che ha dei lead si rilegge ogni ora anche col conteggio fermo", () => {
  // 21/09/2026, 06:43: il modulo BeMade 2166044647486325 è sceso da 59 a 58 lead
  // — Meta ne ha tolto uno. Un lead tolto e uno nuovo nello stesso quarto d'ora
  // lascerebbero il numero uguale.
  const MOD = "2166044647486325";
  const fuoriOra = (oraDiControllo(MOD) + 5) % 24;
  const decidi = (visto: unknown, adessoMs = ORA) =>
    decidiModulo({
      formId: MOD, statusMeta: "ACTIVE", cfg: null, giroAutomatico: true, conLeadRecenti: new Set<string>(),
      oraUtc: fuoriOra, saltaArchiviati: false,
      conteggio: { attuale: 58, visto, adessoMs, saltaFermi: true },
    });

  it("letto meno di un'ora fa: fermo, si salta", () => {
    expect(decidi({ n: 58, cambiato: PRIMA(180), letto: PRIMA(15) }).esito).toBe("saltato_conteggio_fermo");
    expect(decidi({ n: 58, cambiato: PRIMA(180), letto: PRIMA(45) }).esito).toBe("saltato_conteggio_fermo");
  });

  it("letto da un'ora: si rilegge, e resta contato come fermo", () => {
    expect(CONTROLLO_ORARIO_MS).toBe(55 * 60_000);
    expect(decidi({ n: 58, cambiato: PRIMA(180), letto: PRIMA(60) }))
      .toMatchObject({ esito: "letto", motivo: "controllo_orario", conteggio: "fermo" });
  });

  it("col cron ogni 15 minuti la rilettura cade proprio al quarto giro", () => {
    // letto al giro delle 08:13:05, i giri dopo partono alle :28, :43, :58, 09:13
    const letto = "2026-09-21T08:13:05Z";
    const giro = (hhmm: string) => Date.parse(`2026-09-21T${hhmm}:02Z`);
    expect(daRicontrollare({ n: 3, cambiato: PRIMA(600), letto }, giro("08:58"))).toBe(false);
    expect(daRicontrollare({ n: 3, cambiato: PRIMA(600), letto }, giro("09:13"))).toBe(true);
  });

  it("una voce salvata prima del 21/09, senza l'ora di lettura, vale come da rileggere", () => {
    expect(decidi({ n: 58, cambiato: PRIMA(180) })).toMatchObject({ esito: "letto", motivo: "controllo_orario" });
  });

  it("un modulo a zero lead non ha niente da nascondere: basta il turno giornaliero", () => {
    expect(daRicontrollare({ n: 0, cambiato: PRIMA(9000), letto: PRIMA(9000) }, ORA)).toBe(false);
  });

  it("i controlli (giornaliero e orario) contano come letture di moduli fermi, non come saltabili", () => {
    const c = conteggiVuoti();
    conta(c, decidi({ n: 58, cambiato: PRIMA(180), letto: PRIMA(60) }));
    expect(c).toMatchObject({ letti: 1, fermiLettiPerControllo: 1, saltabiliConteggio: 0 });
  });
});

describe("dove i lead arrivano solo dal recupero, il conteggio non fa saltare niente", () => {
  // Il modulo principale di Green Energy: 106 lead in 14 giorni, tutti dal
  // recupero, nessuno dal webhook. Lì il recupero è l'unica strada.
  const CANARINO = "1268174375402285";
  const fermo = { n: 106, cambiato: PRIMA(180), letto: PRIMA(15) };
  const decidi = (senzaWebhook: ReadonlySet<string> | null | undefined, visto: unknown = fermo, oraUtc?: number) =>
    decidiModulo({
      formId: CANARINO, statusMeta: "ACTIVE", cfg: { status: "active" }, giroAutomatico: true,
      conLeadRecenti: new Set<string>(), oraUtc: oraUtc ?? (oraDiControllo(CANARINO) + 9) % 24, saltaArchiviati: false,
      conteggio: { attuale: (visto as { n: number }).n, visto, adessoMs: ORA, saltaFermi: true, senzaWebhook },
    });

  it("un modulo con lead arrivati solo dal recupero si legge a ogni giro, anche col conteggio fermo", () => {
    expect(GIORNI_SENZA_WEBHOOK).toBe(3);
    expect(decidi(new Set([CANARINO]))).toMatchObject({ esito: "letto", motivo: "senza_webhook", conteggio: "fermo" });
  });

  it("dove il webhook arriva, il conteggio fermo fa saltare", () => {
    expect(decidi(new Set(["un-altro-modulo"])).esito).toBe("saltato_conteggio_fermo");
    expect(decidi(new Set()).esito).toBe("saltato_conteggio_fermo");
  });

  it("se non si è riusciti a saperlo, si leggono tutti i moduli che hanno dei lead", () => {
    expect(decidi(null)).toMatchObject({ esito: "letto", motivo: "senza_webhook" });
  });

  it("…ma un modulo a zero lead resta saltabile: non c'è niente che possa sfuggire", () => {
    expect(decidi(null, { n: 0, cambiato: PRIMA(900), letto: PRIMA(900) }).esito).toBe("saltato_conteggio_fermo");
  });

  it("senza l'informazione (regola non applicata) si decide come prima", () => {
    expect(decidi(undefined).esito).toBe("saltato_conteggio_fermo");
  });

  it("il turno di controllo resta il primo motivo, e il conteggio dei letti li tiene distinti", () => {
    expect(decidi(new Set([CANARINO]), fermo, oraDiControllo(CANARINO)).motivo).toBe("turno_di_controllo");
    const c = conteggiVuoti();
    conta(c, decidi(new Set([CANARINO])));
    conta(c, decidi(new Set([CANARINO]), fermo, oraDiControllo(CANARINO)));
    expect(c).toMatchObject({ letti: 2, fermiLettiSenzaWebhook: 1, fermiLettiPerControllo: 1, saltabiliConteggio: 0 });
    expect(rigaPagina({ companyId: "a", pageId: "p", ms: 1, c })).toContain("fermi_letti_per_controllo=1 fermi_letti_senza_webhook=1");
  });

  it("un lead del canarino che Meta non conta (o conta in ritardo) arriva comunque al giro dopo", () => {
    let mappa: Record<string, unknown> = { [CANARINO]: { n: 106, cambiato: PRIMA(600), letto: PRIMA(600) } };
    let trovatoAlGiro: number | null = null;
    for (let g = 0; g < 8; g++) {
      const adessoMs = ORA + g * 15 * 60_000;
      const nuovoLeggibile = g >= 2; // il lead c'è dal giro 2, ma il conteggio resta 106
      const d = decidiModulo({
        formId: CANARINO, statusMeta: "ACTIVE", cfg: { status: "active" }, giroAutomatico: true,
        conLeadRecenti: new Set<string>(), oraUtc: (oraDiControllo(CANARINO) + 9) % 24, saltaArchiviati: false,
        conteggio: { attuale: 106, visto: mappa[CANARINO], adessoMs, saltaFermi: true, senzaWebhook: new Set([CANARINO]) },
      });
      const letto = d.esito === "letto";
      if (letto && nuovoLeggibile && trovatoAlGiro === null) trovatoAlGiro = g;
      mappa = conteggiDaSalvare({
        precedenti: mappa, visti: new Map([[CANARINO, 106]]), lettiBene: new Set(letto ? [CANARINO] : []),
        moduliSuMeta: new Set([CANARINO]), adessoIso: new Date(adessoMs).toISOString(),
      });
    }
    expect(trovatoAlGiro).toBe(2);
  });
});

describe("i numeri del conteggio nella riga di log", () => {
  const MOD = "922697992804539";
  const d = (motivoAtteso: Partial<Parameters<typeof decidiModulo>[0]>, c: Record<string, unknown>) =>
    decidiModulo({
      formId: MOD, statusMeta: "ACTIVE", cfg: null, giroAutomatico: true, conLeadRecenti: new Set<string>(),
      oraUtc: (oraDiControllo(MOD) + 3) % 24, saltaArchiviati: false,
      conteggio: { attuale: 7, visto: { n: 7, cambiato: PRIMA(300), letto: PRIMA(15) }, adessoMs: ORA, saltaFermi: false, ...c },
      ...motivoAtteso,
    });

  it("col salto spento conta quanti si salterebbero, senza saltarne nessuno", () => {
    const c = conteggiVuoti();
    conta(c, d({}, {}));                                           // fermo → saltabile
    conta(c, d({}, { attuale: 8 }));                               // cambiato
    conta(c, d({}, { visto: undefined }));                         // mai visto
    conta(c, d({ oraUtc: oraDiControllo(MOD) }, {}));              // fermo, ma turno
    conta(c, d({}, { saltaFermi: true }));                         // fermo, salto acceso
    expect(c).toMatchObject({
      moduli: 5, letti: 4, saltatiConteggio: 1, saltabiliConteggio: 1, fermiLettiPerControllo: 1,
      archiviatiLettiPerControllo: 0,
    });
    expect(c.perConteggio).toMatchObject({ fermo: 3, conteggio_cambiato: 1, mai_visto: 1 });
    c.chiamate = 14;
    c.leadNuoviDaFermi = 0;
    c.leadNonContati = 0;
    const riga = rigaPagina({ companyId: "a", pageId: "p", ms: 1, c });
    expect(riga).toContain("conteggio(conteggio_cambiato=1 fermo=3 mai_visto=1)");
    expect(riga).toContain("saltati_per_conteggio=1 (salto spento: saltabili=1)");
    expect(riga).toContain("fermi_letti_per_controllo=1");
    expect(riga).toContain("lead_nuovi_da_fermi=0 lead_non_contati=0");
    expect(riga).toContain("chiamate=14");
  });

  it("la riga del giro somma anche i numeri del conteggio", () => {
    const a = conteggiVuoti();
    conta(a, d({}, { saltaFermi: true }));
    a.chiamate = 3;
    a.leadNonContati = 2;
    const t = conteggiVuoti();
    somma(t, a);
    somma(t, a);
    const riga = rigaGiro({ pagine: 2, ms: 1, c: t, automatico: true });
    expect(riga).toContain("saltati_per_conteggio=2");
    expect(riga).toContain("lead_non_contati=4");
    expect(riga).toContain("chiamate=6");
  });
});

describe("cosa si ricorda dopo il giro", () => {
  const adesso = new Date(ORA).toISOString();
  const precedenti = {
    "1": { n: 10, cambiato: PRIMA(300) },
    "2": { n: 5, cambiato: PRIMA(300) },
    "3": { n: 7, cambiato: PRIMA(300) },
    "vecchio": { n: 1, cambiato: PRIMA(9000) },
    "rotto": { n: "tanti" },
  };
  const salva = (over: Partial<Parameters<typeof conteggiDaSalvare>[0]> = {}) =>
    conteggiDaSalvare({
      precedenti,
      visti: new Map<string, unknown>([["1", 11], ["2", 5], ["3", 8], ["4", 2], ["5", undefined]]),
      lettiBene: new Set(["1", "2", "4", "5"]),
      moduliSuMeta: new Set(["1", "2", "3", "4", "5"]),
      adessoIso: adesso,
      ...over,
    });

  it("letto fino in fondo e conteggio cambiato: si ricorda il numero nuovo, da quando, e la lettura", () => {
    expect(salva()["1"]).toEqual({ n: 11, cambiato: adesso, letto: adesso });
  });

  it("letto e conteggio uguale: resta l'ora del cambio di prima (l'ora «calda» non riparte), la lettura si aggiorna", () => {
    expect(salva()["2"]).toEqual({ n: 5, cambiato: PRIMA(300), letto: adesso });
  });

  it("lettura FALLITA: resta il numero vecchio, così al giro dopo risulta ancora cambiato e si rilegge", () => {
    // il modulo 3 è passato da 7 a 8 ma la lettura non è riuscita
    expect(salva()["3"]).toEqual({ n: 7, cambiato: PRIMA(300) });
    expect(motivoConteggio({ attuale: 8, visto: salva()["3"], adessoMs: ORA + 15 * 60_000 })).toBe("conteggio_cambiato");
  });

  it("lettura fallita di un modulo mai visto: resta non visto, e al giro dopo si legge", () => {
    const m = salva({ lettiBene: new Set(["1"]) });
    expect(m["4"]).toBeUndefined();
  });

  it("senza conteggio da Meta non si ricorda niente", () => {
    expect(salva()["5"]).toBeUndefined();
  });

  it("un modulo sparito da Meta si toglie, ma solo se l'elenco è completo", () => {
    expect(salva()["vecchio"]).toBeUndefined();
    expect(salva({ moduliSuMeta: null })["vecchio"]).toEqual({ n: 1, cambiato: PRIMA(9000) });
  });

  it("le voci rotte si buttano, e una mappa illeggibile vale come vuota", () => {
    expect(salva()["rotto"]).toBeUndefined();
    for (const p of [null, undefined, "x", 5, [1, 2]] as unknown[]) {
      expect(salva({ precedenti: p })).toEqual({
        "1": { n: 11, cambiato: adesso, letto: adesso },
        "2": { n: 5, cambiato: adesso, letto: adesso },
        "4": { n: 2, cambiato: adesso, letto: adesso },
      });
    }
  });
});

describe("l'ora di creazione di un lead", () => {
  it("come la dà Graph, col fuso senza i due punti", () => {
    expect(secondiCreazione("2026-09-20T12:02:43+0000")).toBe(Date.parse("2026-09-20T12:02:43Z") / 1000);
    expect(secondiCreazione("2026-09-20T14:02:43+0200")).toBe(Date.parse("2026-09-20T12:02:43Z") / 1000);
  });

  it("in secondi, come la dà il webhook", () => {
    expect(secondiCreazione("1789890062")).toBe(1789890062);
    expect(secondiCreazione(1789890062)).toBe(1789890062);
  });

  it("niente di leggibile: null", () => {
    for (const v of [undefined, null, "", "ieri", {}, NaN] as unknown[]) expect(secondiCreazione(v)).toBeNull();
  });
});

// ── Una giornata simulata, col Meta più scomodo che si possa immaginare ──────
describe("una giornata intera col salto acceso: nessun lead resta indietro", () => {
  const GIRI = 96;
  const INIZIO = Date.parse("2026-09-21T00:13:00Z"); // il cron gira ai minuti 13/28/43/58
  const moduli = Array.from({ length: 336 }, (_, i) => String(1_190_000_000_000_000 + i * 104_729));
  // Dieci moduli vivi ricevono lead lungo il giorno; gli altri 326 mai.
  const vivi = moduli.slice(0, 10);
  const lead: Array<{ modulo: string; creatoMs: number }> = [];
  for (let k = 0; k < 120; k++) {
    lead.push({ modulo: vivi[k % vivi.length], creatoMs: INIZIO + ((k * 11) % (GIRI - 4)) * 15 * 60_000 + 3 * 60_000 });
  }

  // Meta «scomodo»: il conteggio arriva SUBITO, ma il lead diventa leggibile
  // solo dopo `ritardoLetturaMin` minuti. È il caso che una lettura sola perderebbe.
  const simula = (ritardoLetturaMin: number, saltaFermi: boolean) => {
    let mappa: Record<string, unknown> = {};
    const trovatoAlGiro = new Map<number, number>(); // indice lead → giro
    let letture = 0;
    for (let g = 0; g < GIRI; g++) {
      const adessoMs = INIZIO + g * 15 * 60_000;
      const oraUtc = new Date(adessoMs).getUTCHours();
      const visti = new Map<string, unknown>();
      for (const m of moduli) visti.set(m, lead.filter((l) => l.modulo === m && l.creatoMs <= adessoMs).length);
      const lettiBene = new Set<string>();
      for (const m of moduli) {
        const d = decidiModulo({
          formId: m, statusMeta: "ACTIVE", cfg: null, giroAutomatico: true, conLeadRecenti: new Set<string>(),
          oraUtc, saltaArchiviati: false,
          conteggio: { attuale: visti.get(m), visto: mappa[m], adessoMs, saltaFermi },
        });
        if (d.esito !== "letto") continue;
        letture++;
        lettiBene.add(m);
        lead.forEach((l, i) => {
          const leggibile = l.creatoMs + ritardoLetturaMin * 60_000 <= adessoMs;
          if (l.modulo === m && leggibile && !trovatoAlGiro.has(i)) trovatoAlGiro.set(i, g);
        });
      }
      mappa = conteggiDaSalvare({
        precedenti: mappa, visti, lettiBene, moduliSuMeta: new Set(moduli), adessoIso: new Date(adessoMs).toISOString(),
      });
    }
    return { letture, trovatoAlGiro };
  };

  for (const ritardo of [0, 10, 40]) {
    it(`lead leggibile ${ritardo} minuti dopo essere stato contato: trovato, e al massimo un'ora dopo`, () => {
      const { trovatoAlGiro } = simula(ritardo, true);
      lead.forEach((l, i) => {
        const g = trovatoAlGiro.get(i);
        expect(g, `lead ${i} del modulo ${l.modulo} mai trovato`).toBeDefined();
        const leggibileDal = l.creatoMs + ritardo * 60_000;
        expect((INIZIO + (g as number) * 15 * 60_000) - leggibileDal).toBeLessThanOrEqual(60 * 60_000);
      });
    });
  }

  it("un lead tolto e uno nuovo nello stesso quarto d'ora: il numero non si muove, ma il lead arriva entro un'ora", () => {
    const MOD = vivi[3];
    let mappa: Record<string, unknown> = {};
    let trovatoAlGiro: number | null = null;
    for (let g = 0; g < 16; g++) {
      const adessoMs = INIZIO + g * 15 * 60_000;
      // Al giro 6 il modulo è fermo da un pezzo: in quel quarto d'ora Meta toglie
      // un lead e ne arriva uno nuovo. Il numero resta 20 per tutto il tempo.
      const nuovoLeggibile = g >= 6;
      const d = decidiModulo({
        formId: MOD, statusMeta: "ACTIVE", cfg: null, giroAutomatico: true, conLeadRecenti: new Set<string>(),
        oraUtc: (oraDiControllo(MOD) + 12) % 24, saltaArchiviati: false,
        conteggio: { attuale: 20, visto: mappa[MOD], adessoMs, saltaFermi: true },
      });
      const letto = d.esito === "letto";
      if (letto && nuovoLeggibile && trovatoAlGiro === null) trovatoAlGiro = g;
      mappa = conteggiDaSalvare({
        precedenti: mappa, visti: new Map([[MOD, 20]]), lettiBene: new Set(letto ? [MOD] : []),
        moduliSuMeta: new Set([MOD]), adessoIso: new Date(adessoMs).toISOString(),
      });
    }
    expect(trovatoAlGiro).not.toBeNull();
    expect((trovatoAlGiro as number) - 6).toBeLessThanOrEqual(4); // entro 4 giri: un'ora
  });

  it("e le chiamate scendono di un ordine di grandezza", () => {
    const acceso = simula(10, true).letture;
    const spento = simula(10, false).letture;
    expect(spento).toBe(336 * GIRI);             // oggi: 32.256 letture
    expect(acceso).toBeLessThan(spento / 10);    // col conteggio
    // i 326 moduli fermi si leggono solo: al primo giro (mai visti), l'ora
    // «calda» che segue, e le 4 letture del loro turno di controllo
    expect(acceso).toBeLessThan(326 * (1 + 4 + 4) + 10 * GIRI);
  });
});
