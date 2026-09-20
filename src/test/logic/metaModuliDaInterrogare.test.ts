import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  chiusoSuMeta,
  conta,
  conteggiVuoti,
  decidiModulo,
  oraDiControllo,
  rigaGiro,
  rigaPagina,
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

  it("chiede a Meta anche lo stato, e se il campo viene rifiutato ripiega sui soli id", () => {
    expect(fonte).toContain('for (const campi of ["id,status", "id"])');
    expect(fonte).toContain("leadgen_forms?fields=${campi}");
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
    expect(fonte).toContain("return { formId, d, cfg, inizioLettura, nuovi: 0, errore: senzaToken(e) };");
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
