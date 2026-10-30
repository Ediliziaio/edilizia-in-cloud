/**
 * Gli avvisi delle commesse generali fuori dalla pagina (campanella ed email, 05/11/2026).
 *
 * Si prova il calcolo a partire dalla risposta di generali_avvisi_contesto, la stessa che legge la
 * edge function generali-avvisi: garanzie, fine lavori e penali, documenti, fideiussione 122/2005,
 * commesse oltre il valore o in perdita. Le chiavi devono essere stabili (un evento avvisa una volta
 * sola) e cambiare quando cambia la soglia o la scadenza. In fondo, la guardia sugli import: la
 * edge function gira in Deno, che non conosce «@/».
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GIORNI_PRIMA_DEI_MANCANTI,
  adessoARoma,
  avvisiDaMandare,
  contestoDaRisposta,
  destinatariDaRisposta,
  emailAvvisi,
  emailDaMandareOggi,
  type AvvisoDaMandare,
} from "@/lib/orders/generali/avvisi";

const OGGI = "2028-11-10";
const G = "g-1";

type Riga = Record<string, unknown>;

function risposta(p: {
  modello?: string;
  creata?: string;
  valore?: number | null;
  figlie?: Riga[];
  permessi?: Partial<{ importi: boolean; costi: boolean; margini: boolean }>;
  contratto?: Riga | null;
  garanzie?: Riga[];
  atti?: Riga[];
  sal?: Riga[];
  allegati?: Riga[];
  segni?: Riga[];
  voci?: Riga[];
} = {}) {
  return {
    generale_id: G,
    company_id: "c-1",
    destinatari: [{ user_id: "u-1", email: "a@b.it", nome: "Anna", amministratore: true, importi: true, margini: true, in_app: true, email_attiva: true }],
    riepilogo: {
      generale: { id: G, codice: "APP-01", nome: "Appalto scuole", modello: p.modello ?? "appalto", creata_il: p.creata ?? "2028-11-01T09:00:00Z", valore: p.valore === undefined ? 100000 : p.valore },
      figlie: p.figlie ?? [],
      permessi: { importi: true, costi: true, margini: true, ...p.permessi },
    },
    contratto: p.contratto === null ? null : {
      permessi: { importi: true, modifica: true },
      contratto: p.contratto ?? null,
      atti: p.atti ?? [],
      garanzie: p.garanzie ?? [],
      sal: p.sal ?? [],
    },
    voci: p.voci ?? [],
    allegati: p.allegati ?? [],
    segni: p.segni ?? [],
  };
}

const calcola = (r: ReturnType<typeof risposta>, oggi = OGGI) => avvisiDaMandare(contestoDaRisposta(r, oggi)!);
const chiavi = (a: AvvisoDaMandare[]) => a.map((x) => x.chiave);
// Intl separa cifra e «€» con uno spazio che non va a capo: nei confronti vale uno spazio normale.
const spazi = (s: string) => s.replace(/\u00a0/g, " ");
const garanzia = (scadenza: string | null, extra: Riga = {}) => ({ id: "gar-1", tipo: "cauzione_definitiva", numero: "123", garante: "Assicura Spa", scadenza, ...extra });
// Toglie le voci dei documenti per guardare solo il resto.
const senzaDocumenti = (modello = "appalto") => {
  const tutte: Record<string, string[]> = {
    appalto: ["contratto_firmato", "atti_aggiuntivi", "cauzione_definitiva", "garanzia_anticipazione", "polizza_car", "psc", "notifica_preliminare", "nomina_cse", "durc"],
  };
  return (tutte[modello] ?? []).map((chiave, i) => ({ id: `v${i}`, modello, chiave, nome: null as string | null, ambito: null as string | null, obbligatoria: null as boolean | null, con_scadenza: null as boolean | null, tolta: true, posizione: i }));
};

describe("garanzie del contratto", () => {
  it("30 giorni prima, 7 giorni prima, scaduta: tre soglie, tre chiavi, solo le ultime due urgenti", () => {
    const tra20 = calcola(risposta({ garanzie: [garanzia("2028-11-30")], voci: senzaDocumenti() }));
    expect(tra20).toHaveLength(1);
    expect(tra20[0]).toMatchObject({
      chiave: "garanzia:gar-1:2028-11-30:30", tipo: "garanzia_scadenza", urgente: false, richiede: "importi",
      titolo: "Cauzione definitiva in scadenza · APP-01", link: `/azienda/ordini/${G}?scheda=contratto`,
    });
    expect(tra20[0].testo).toBe("Cauzione definitiva n. 123 di Assicura Spa scade il 30/11/2028 (tra 20 giorni): chiedi per tempo il rinnovo, o lo svincolo se non serve più.");

    const tra5 = calcola(risposta({ garanzie: [garanzia("2028-11-15")], voci: senzaDocumenti() }));
    expect(tra5[0]).toMatchObject({ chiave: "garanzia:gar-1:2028-11-15:7", urgente: true });

    const oggi = calcola(risposta({ garanzie: [garanzia(OGGI)], voci: senzaDocumenti() }));
    expect(oggi[0].testo).toContain("(oggi)");

    const scaduta = calcola(risposta({ garanzie: [garanzia("2028-11-09")], voci: senzaDocumenti() }));
    expect(scaduta[0]).toMatchObject({ chiave: "garanzia:gar-1:2028-11-09:scaduta", urgente: true, titolo: "Cauzione definitiva scaduta · APP-01" });
  });

  it("più in là di 30 giorni, senza scadenza o già svincolata: niente", () => {
    expect(calcola(risposta({ garanzie: [garanzia("2028-12-31")], voci: senzaDocumenti() }))).toEqual([]);
    expect(calcola(risposta({ garanzie: [garanzia(null)], voci: senzaDocumenti() }))).toEqual([]);
    expect(calcola(risposta({ garanzie: [garanzia("2028-11-15", { svincolata_il: "2028-11-01" })], voci: senzaDocumenti() }))).toEqual([]);
  });

  it("rinnovata con una scadenza nuova è un evento nuovo: la chiave cambia", () => {
    const prima = chiavi(calcola(risposta({ garanzie: [garanzia("2028-11-15")], voci: senzaDocumenti() })));
    const dopo = chiavi(calcola(risposta({ garanzie: [garanzia("2028-11-16")], voci: senzaDocumenti() })));
    expect(prima).not.toEqual(dopo);
  });

  it("da svincolare: la cauzione a lavori ultimati, la garanzia dell'anticipazione ad anticipazione recuperata", () => {
    const ultimati = calcola(risposta({
      contratto: { data_fine_prevista: "2028-10-01", data_ultimazione: "2028-09-28" },
      garanzie: [garanzia("2029-06-30")],
      voci: senzaDocumenti(),
    }));
    expect(ultimati).toHaveLength(1);
    expect(ultimati[0]).toMatchObject({ chiave: "svincolo:gar-1", tipo: "garanzia_svincolo", urgente: false });
    expect(ultimati[0].testo).toBe("I lavori risultano ultimati il 28/09/2028: verifica quando puoi chiedere lo svincolo della cauzione definitiva.");

    const anticipo = (recupero: number) => calcola(risposta({
      contratto: { anticipazione_importo: 20000 },
      garanzie: [{ id: "gar-2", tipo: "garanzia_anticipazione", scadenza: "2029-12-31" }],
      sal: [{ id: "s1", numero: 1, stato: "emesso", di_contratto: true, recupero }],
      voci: senzaDocumenti(),
    }));
    expect(chiavi(anticipo(20000))).toEqual(["svincolo:gar-2"]);
    expect(anticipo(20000)[0].testo).toContain("svincolo della garanzia dell'anticipazione");
    expect(anticipo(12000)).toEqual([]);
  });

  it("chi non vede gli importi non riceve niente del contratto (generale_contratto_leggi non lo restituisce)", () => {
    const r = risposta({ garanzie: [garanzia("2028-11-15")], voci: senzaDocumenti() });
    (r.contratto as Riga).permessi = { importi: false, modifica: false };
    expect(calcola(r)).toEqual([]);
  });
});

describe("fine dei lavori e penali", () => {
  it("tra 20 giorni avvisa, tra 5 è urgente, e le proroghe spostano la data", () => {
    const tra20 = calcola(risposta({ contratto: { data_fine_prevista: "2028-11-30", penale_giornaliera: 500 }, voci: senzaDocumenti() }));
    expect(tra20).toEqual([expect.objectContaining({ chiave: "fine:2028-11-30:30", urgente: false })]);
    expect(spazi(tra20[0].testo)).toBe("Il contratto prevede la fine dei lavori il 30/11/2028 (tra 20 giorni): dal giorno dopo matura una penale di 500,00 € al giorno.");

    const prorogata = calcola(risposta({
      contratto: { data_fine_prevista: "2028-11-05" },
      atti: [{ id: "a1", tipo: "proroga", descrizione: "Maltempo", data: "2028-10-01", giorni_proroga: 10 }],
      voci: senzaDocumenti(),
    }));
    expect(prorogata).toEqual([expect.objectContaining({ chiave: "fine:2028-11-15:7", urgente: true })]);
  });

  it("superata: urgente, con la penale maturata; al tetto un avviso in più", () => {
    const oltre = calcola(risposta({
      contratto: { importo_base: 100000, data_fine_prevista: "2028-11-01", penale_giornaliera: 1000, penale_massima_pct: 10 },
      voci: senzaDocumenti(),
    }));
    expect(chiavi(oltre)).toEqual(["fine:2028-11-01:superata"]);
    expect(oltre[0].testo).toContain("9 giorni di ritardo");
    // In italiano Intl non raggruppa le migliaia sotto 10.000.
    expect(spazi(oltre[0].testo)).toContain("1000,00 € al giorno, fino a 10.000,00 €; finora 9000,00 €.");

    const alTetto = calcola(risposta({
      contratto: { importo_base: 100000, data_fine_prevista: "2028-10-01", penale_giornaliera: 1000, penale_massima_pct: 10 },
      voci: senzaDocumenti(),
    }));
    expect(chiavi(alTetto)).toEqual(["fine:2028-10-01:superata", "penale:2028-10-01:tetto"]);
    expect(spazi(alTetto[1].testo)).toContain("10.000,00 €");
  });

  it("lavori ultimati: niente avviso di fine lavori", () => {
    expect(calcola(risposta({ contratto: { data_fine_prevista: "2028-11-01", data_ultimazione: "2028-11-03" }, voci: senzaDocumenti() }))).toEqual([]);
  });
});

describe("documenti richiesti", () => {
  const durc = (scadenza: string) => ({
    allegati: [{ id: "f1", order_id: G, file_name: "DURC ottobre.pdf", file_url: "x", file_type: null as string | null, created_at: "2028-10-01T10:00:00Z" }],
    segni: [{ id: "s1", order_id: G, voce: "durc", tipo: "documento", attachment_id: "f1", scadenza }],
  });

  it("in scadenza entro 30 giorni e scaduto, con la scheda Documenti", () => {
    const inScadenza = calcola(risposta({ contratto: null, ...durc("2028-11-25") })).filter((a) => a.tipo === "documento_scadenza");
    expect(inScadenza).toEqual([expect.objectContaining({
      chiave: `documento:${G}:durc:2028-11-25:in_scadenza`, urgente: false, richiede: null,
      titolo: "Documento in scadenza · APP-01", link: `/azienda/ordini/${G}?scheda=documenti`,
    })]);
    expect(inScadenza[0].testo).toBe("«DURC» di APP-01 scade il 25/11/2028 (tra 15 giorni): procurati il rinnovo.");

    const scaduto = calcola(risposta({ contratto: null, ...durc("2028-11-01") })).filter((a) => a.tipo === "documento_scadenza");
    expect(scaduto).toEqual([expect.objectContaining({ chiave: `documento:${G}:durc:2028-11-01:scaduto`, urgente: true })]);
  });

  it(`i mancanti obbligatori della generale, in un avviso solo, dopo ${GIORNI_PRIMA_DEI_MANCANTI} giorni dalla nascita`, () => {
    const giovane = calcola(risposta({ contratto: null, creata: "2028-10-20T08:00:00Z" }));
    expect(giovane.filter((a) => a.tipo === "documento_mancante")).toEqual([]);

    const vecchia = calcola(risposta({ contratto: null, creata: "2028-09-01T08:00:00Z" })).filter((a) => a.tipo === "documento_mancante");
    expect(vecchia).toHaveLength(1);
    expect(vecchia[0]).toMatchObject({ chiave: "documenti_mancanti", urgente: false, titolo: "Documenti obbligatori mancanti · APP-01" });
    // Le obbligatorie dell'appalto sulla generale: contratto, cauzione, CAR, PSC, CSE, DURC.
    expect(vecchia[0].testo).toBe("APP-01 è aperta da 70 giorni e mancano ancora 6 documenti obbligatori: «Contratto firmato», «Cauzione definitiva», «Polizza CAR», «PSC — piano di sicurezza e coordinamento», «Nomina del CSE», «DURC».");
  });
});

describe("unità con acconti e fideiussione 122/2005", () => {
  const unita = (id: string, acconti: number, extra: Riga = {}) => ({ id, codice: `U-${id}`, nome: `Unità ${id}`, importo: 300000, incassato: 0, acconti, margine: 1000, ...extra });

  it("acconti incassati senza fideiussione: urgente, sulla scheda Documenti; senza acconti niente", () => {
    const avvisi = calcola(risposta({ modello: "sviluppo", contratto: null, figlie: [unita("a", 30000), unita("b", 0)] }))
      .filter((a) => a.tipo === "fideiussione_122");
    expect(avvisi).toEqual([expect.objectContaining({
      chiave: "fideiussione:a:manca", urgente: true, richiede: "importi", titolo: "Acconti senza fideiussione · U-a",
      link: `/azienda/ordini/${G}?scheda=documenti`,
    })]);
    expect(avvisi[0].testo).toContain("ha incassato 30.000");
    expect(avvisi[0].testo).toContain("non c'è la fideiussione D.Lgs. 122/2005");
  });

  it("con la fideiussione caricata tace; scaduta torna ad avvisare", () => {
    const con = (scadenza: string) => calcola(risposta({
      modello: "sviluppo", contratto: null, figlie: [unita("a", 30000)],
      allegati: [{ id: "f9", order_id: "a", file_name: "fideiussione 122 Rossi.pdf", file_url: "x", file_type: null as string | null, created_at: "2028-10-01T10:00:00Z" }],
      segni: [{ id: "s9", order_id: "a", voce: "fideiussione_122", tipo: "documento", attachment_id: "f9", scadenza }],
    })).filter((a) => a.tipo === "fideiussione_122");
    expect(con("2030-01-01")).toEqual([]);
    expect(con("2028-11-01")).toEqual([expect.objectContaining({ chiave: "fideiussione:a:scaduta:2028-11-01" })]);
  });
});

describe("conti delle commesse dentro", () => {
  it("oltre il valore della generale e in perdita (non le unità divise), coi permessi giusti", () => {
    const avvisi = calcola(risposta({
      contratto: null, voci: senzaDocumenti(), valore: 100000,
      figlie: [
        { id: "o1", codice: "OL-1", nome: "Scuola A", importo: 80000, margine: -2500 },
        { id: "o2", codice: "OL-2", nome: "Scuola B", importo: 30000, margine: 4000 },
        { id: "o3", codice: "OL-3", nome: "Divisa", importo: 0, margine: -100, divisa: true },
      ],
    }));
    expect(chiavi(avvisi)).toEqual(["oltre_valore", "perdita:o1"]);
    expect(avvisi[0]).toMatchObject({ richiede: "importi", link: `/azienda/ordini/${G}` });
    expect(avvisi[0].testo).toContain("superano valore del contratto di 10.000");
    expect(avvisi[1]).toMatchObject({ richiede: "margini", titolo: "In perdita · OL-1" });
  });

  it("le chiavi sono stabili da un giorno all'altro e non si ripetono", () => {
    const r = risposta({ garanzie: [garanzia("2028-11-30")], figlie: [{ id: "o1", importo: 1, margine: -5 }] });
    const oggi = chiavi(calcola(r));
    expect(chiavi(calcola(r, "2028-11-11"))).toEqual(oggi);
    expect(new Set(oggi).size).toBe(oggi.length);
  });
});

describe("lettura della risposta", () => {
  it("senza riepilogo (nessun amministratore che veda tutto) non si calcola", () => {
    expect(contestoDaRisposta({ generale_id: G, riepilogo: null, destinatari: [] }, OGGI)).toBeNull();
  });
  it("i destinatari senza user_id si scartano", () => {
    expect(destinatariDaRisposta({ destinatari: [{ user_id: "u-1" }, { email: "x" }, null] })).toHaveLength(1);
  });
});

describe("il giorno a Roma e l'email", () => {
  it("il server è in UTC: alle 23:30 di domenica a Londra a Roma è già lunedì", () => {
    expect(adessoARoma(new Date("2028-11-05T23:30:00Z"))).toEqual({ oggi: "2028-11-06", giornoSettimana: 1, ora: 0 });
    expect(adessoARoma(new Date("2028-07-04T05:10:00Z"))).toMatchObject({ oggi: "2028-07-04", ora: 7 });
  });

  it("il riepilogo parte il lunedì; gli altri giorni solo se c'è qualcosa di urgente", () => {
    expect(emailDaMandareOggi([{ urgente: false }], 1)).toBe(true);
    expect(emailDaMandareOggi([{ urgente: false }], 3)).toBe(false);
    expect(emailDaMandareOggi([{ urgente: false }, { urgente: true }], 3)).toBe(true);
    expect(emailDaMandareOggi([], 1)).toBe(false);
  });

  it("raggruppa per generale, mette gli urgenti prima, scappa l'HTML e porta i link", () => {
    const email = emailAvvisi({
      nome: "Anna",
      appUrl: "https://app.esempio.it/",
      avvisi: [
        { id: "1", generale_id: G, generale: "APP-01", urgente: false, titolo: "Documento in scadenza · APP-01", testo: "«DURC» scade", link: `/azienda/ordini/${G}?scheda=documenti` },
        { id: "2", generale_id: G, generale: "APP-01", urgente: true, titolo: "Cauzione definitiva scaduta · APP-01", testo: "Scaduta <b>ieri</b>", link: `/azienda/ordini/${G}?scheda=contratto` },
        { id: "3", generale_id: "g-2", generale: "Residenza Roma", urgente: false, titolo: "In perdita · U-1", testo: "In perdita", link: "/azienda/ordini/g-2" },
      ],
    });
    expect(email.oggetto).toBe("Commesse generali: una cosa urgente da guardare");
    expect(email.html).toContain("Scaduta &lt;b&gt;ieri&lt;/b&gt;");
    expect(email.html).toContain(`href="https://app.esempio.it/azienda/ordini/${G}?scheda=contratto"`);
    expect(email.html.indexOf("Cauzione definitiva scaduta")).toBeLessThan(email.html.indexOf("Documento in scadenza"));
    expect(email.html.indexOf("APP-01")).toBeLessThan(email.html.indexOf("Residenza Roma"));
    expect(email.testo).toContain("[Urgente] Scaduta <b>ieri</b>");

    const settimana = emailAvvisi({ nome: null, appUrl: "", avvisi: [{ id: "1", generale_id: G, generale: "APP-01", urgente: false, titolo: "x", testo: "y", link: "/azienda/ordini/g" }] });
    expect(settimana.oggetto).toBe("Commesse generali: una cosa da guardare questa settimana");
    expect(settimana.html).not.toContain("href=");
  });
});

describe("la edge function gira in Deno", () => {
  // generali-avvisi importa avvisi.ts e, da lì, questi file: niente «@/», import relativi con estensione.
  const FILE = [
    "src/lib/orders/generali/avvisi.ts",
    "src/lib/orders/generali/documenti.ts",
    "src/lib/orders/generali/contratto.ts",
    "src/lib/orders/commesseGenerali.ts",
  ];
  it.each(FILE)("%s non usa alias e scrive l'estensione negli import", (file) => {
    const sorgente = readFileSync(resolve(process.cwd(), file), "utf8");
    const specificatori = [...sorgente.matchAll(/^\s*(?:import|export)[^"']*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
    for (const s of specificatori) {
      expect(s, `${file}: ${s}`).not.toMatch(/^@\//);
      if (s.startsWith(".")) expect(s, `${file}: ${s}`).toMatch(/\.ts$/);
    }
  });

  it("la funzione importa il calcolo da quel file", () => {
    const funzione = readFileSync(resolve(process.cwd(), "supabase/functions/generali-avvisi/index.ts"), "utf8");
    expect(funzione).toContain('from "../../../src/lib/orders/generali/avvisi.ts"');
    expect(funzione).toContain("serveConMetricheRapida(\"generali-avvisi\"");
  });
});
