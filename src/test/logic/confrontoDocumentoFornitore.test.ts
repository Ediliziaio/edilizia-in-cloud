import { describe, expect, it } from "vitest";
import {
  aperturaNormalizzata, categoriaRiga, coloreDaTesto, confrontaDocumento, ereditaDaOfferta, esitoConsegna, formatoDaTesto,
  type RigaChiesta, type RigaLetta,
} from "../../../supabase/functions/_shared/confrontoDocumentoFornitore";

const finestra = (over: Partial<RigaChiesta> = {}): RigaChiesta => ({
  chiave: "a", riferimento: "Cucina", descrizione: "Finestra PVC 2 ante", quantita: 1, unita: "pz",
  misure: { larghezza: 1200, altezza: 1400 }, colore: "Bianco", apertura: "Anta ribalta DX", ...over,
});
const letta = (over: Partial<RigaLetta> = {}): RigaLetta => ({
  riferimento: "CUCINA", descrizione: "Finestra PVC 2 ante", quantita: 1, larghezza_mm: 1200, altezza_mm: 1400,
  colore: "bianco", apertura: "anta-ribalta destra", materiale: "PVC", confidenza: 95, ...over,
});

const piastrella = (over: Partial<RigaChiesta> = {}): RigaChiesta => ({
  chiave: "p", descrizione: "Piastrelle gres Terra 60x60", sku: "TER60", quantita: 42, unita: "mq", misure: { mq: 42 }, ...over,
});
const lettaP = (over: Partial<RigaLetta> = {}): RigaLetta => ({
  descrizione: "Gres Terra", codice_articolo: "TER60", quantita: 42, unita: "mq", mq: 42, formato: "60x60", lotto: "L7", confidenza: 90, ...over,
});

const pergola = (over: Partial<RigaChiesta> = {}): RigaChiesta => ({
  chiave: "g", riferimento: "Terrazzo", descrizione: "Pergola bioclimatica", quantita: 1, misure: { larghezza: 4000, profondita: 3000, altezza: 2500 }, colore: "RAL 7016", ...over,
});
const lettaG = (over: Partial<RigaLetta> = {}): RigaLetta => ({
  riferimento: "Terrazzo", descrizione: "Pergola", quantita: 1, larghezza_mm: 4000, profondita_mm: 3000, altezza_mm: 2500, colore: "RAL 7016", confidenza: 92, ...over,
});

const esito = (r: RigaChiesta, l: RigaLetta) => confrontaDocumento([r], [l]).righe[0];

describe("serramenti: misure e apertura", () => {
  it("tutto uguale è verde", () => expect(esito(finestra(), letta()).esito).toBe("verde"));
  it("3 mm in più: giallo", () => expect(esito(finestra(), letta({ larghezza_mm: 1203 })).esito).toBe("giallo"));
  it("oltre la tolleranza: rosso", () => expect(esito(finestra(), letta({ altezza_mm: 1420 })).esito).toBe("rosso"));
  it("tolleranza impostata dall'azienda", () => {
    expect(confrontaDocumento([finestra()], [letta({ larghezza_mm: 1203 })], { tolleranzaMm: 2 }).righe[0].esito).toBe("rosso");
  });
  it("apertura sbagliata: rosso", () => expect(esito(finestra(), letta({ apertura: "anta ribalta SX" })).esito).toBe("rosso"));
  it("colore sbagliato: rosso", () => expect(esito(finestra(), letta({ colore: "antracite" })).esito).toBe("rosso"));
  it("materiale sbagliato: rosso", () => expect(esito(finestra(), letta({ materiale: "alluminio" })).esito).toBe("rosso"));
  it("quantità diversa: rosso", () => expect(esito(finestra(), letta({ quantita: 2 })).esito).toBe("rosso"));
  it("prezzo diverso: solo giallo", () => expect(esito(finestra({ prezzo: 100 }), letta({ prezzo_unitario: 120 })).esito).toBe("giallo"));
  it("apertura e colore non scritti sul documento: da controllare, mai verde", () => {
    expect(esito(finestra(), letta({ apertura: null })).esito).toBe("da_controllare");
  });
  it("lettura incerta: mai verde", () => {
    expect(esito(finestra(), letta({ confidenza: 40 })).esito).toBe("da_controllare");
    expect(esito(finestra(), letta({ incerti: ["larghezza_mm"] })).esito).toBe("da_controllare");
  });
  it("misura illeggibile: da controllare", () => expect(esito(finestra(), letta({ altezza_mm: null })).esito).toBe("da_controllare"));
  it("incertezza con errore vero sullo stesso documento: vince il rosso", () => {
    expect(esito(finestra(), letta({ apertura: "scorrevole", incerti: ["colore"] })).esito).toBe("rosso");
  });
});

describe("piastrelle: articolo, formato e mq", () => {
  it("tutto uguale è verde", () => expect(esito(piastrella(), lettaP()).esito).toBe("verde"));
  it("codice diverso: rosso", () => expect(esito(piastrella(), lettaP({ codice_articolo: "TER90" })).esito).toBe("rosso"));
  it("formato diverso: rosso", () => expect(esito(piastrella(), lettaP({ formato: "30x60" })).esito).toBe("rosso"));
  it("mq diversi oltre il 2%: rosso", () => expect(esito(piastrella(), lettaP({ quantita: 38, mq: 38 })).esito).toBe("rosso"));
  it("mq entro il 2%, l'arrotondamento della scatola: giallo", () => expect(esito(piastrella(), lettaP({ quantita: 42.5, mq: 42.5 })).esito).toBe("giallo"));
  it("lotto mancante: giallo", () => expect(esito(piastrella(), lettaP({ lotto: null })).esito).toBe("giallo"));
});

describe("pergole: misure e RAL", () => {
  it("tutto uguale è verde", () => expect(esito(pergola(), lettaG()).esito).toBe("verde"));
  it("RAL diverso: rosso", () => expect(esito(pergola(), lettaG({ colore: "RAL 9010" })).esito).toBe("rosso"));
  it("profondità fuori tolleranza: rosso", () => expect(esito(pergola(), lettaG({ profondita_mm: 2800 })).esito).toBe("rosso"));
  it("RAL non letto: da controllare", () => expect(esito(pergola(), lettaG({ colore: null })).esito).toBe("da_controllare"));
});

describe("abbinamento delle posizioni", () => {
  it("posizione mancante e riga in più: rosso", () => {
    const { righe, esito: totale } = confrontaDocumento([finestra()], [letta({ riferimento: "Bagno", larghezza_mm: 600, altezza_mm: 600 })]);
    expect(totale).toBe("rosso");
    expect(righe.map((r) => r.stato).sort()).toContain("abbinata");
  });
  it("una riga in più sul documento è rossa", () => {
    const { righe } = confrontaDocumento([finestra()], [letta(), letta({ riferimento: "Extra", larghezza_mm: 500, altezza_mm: 500 })]);
    expect(righe.find((r) => r.stato === "in_piu")?.esito).toBe("rosso");
  });
  it("abbina per Rif., non per ordine di riga", () => {
    const a = finestra({ chiave: "a", riferimento: "Cucina" });
    const b = finestra({ chiave: "b", riferimento: "Bagno", misure: { larghezza: 800, altezza: 1000 } });
    const { righe } = confrontaDocumento([a, b], [letta({ riferimento: "Bagno", larghezza_mm: 800, altezza_mm: 1000 }), letta()]);
    expect(righe.every((r) => r.esito === "verde")).toBe(true);
  });
  it("senza Rif. abbina le misure vicine", () => {
    const { righe } = confrontaDocumento([finestra({ riferimento: null })], [letta({ riferimento: null })]);
    expect(righe[0].stato).toBe("abbinata");
    expect(righe[0].esito).toBe("verde");
  });
  it("abbinata solo per ordine: mai verde", () => {
    const { righe } = confrontaDocumento(
      [finestra({ riferimento: "Cucina" })],
      [letta({ riferimento: "Posizione A", larghezza_mm: 2000, altezza_mm: 2200 })]);
    expect(righe[0].campi[0].campo).toBe("Abbinamento");
    expect(righe[0].esito).not.toBe("verde");
  });
  it("documento vuoto: da controllare o rosso, mai verde", () => {
    expect(confrontaDocumento([finestra()], []).esito).toBe("rosso");
    expect(confrontaDocumento([], []).esito).toBe("da_controllare");
  });
  it("articoli normali: nome e quantità", () => {
    const r: RigaChiesta = { chiave: "s", descrizione: "Silicone neutro bianco", quantita: 10, unita: "pz" };
    expect(esito(r, { descrizione: "Silicone neutro", quantita: 10, confidenza: 90 }).esito).toBe("verde");
    expect(esito(r, { descrizione: "Stucco acrilico", quantita: 10, confidenza: 90 }).esito).toBe("rosso");
    expect(categoriaRiga(r)).toBe("generico");
  });
});

describe("conferma uguale all'offerta già controllata", () => {
  const offerta = confrontaDocumento([finestra()], [letta({ apertura: null })]).righe;
  it("una lettura risolta a mano non si rifà", () => {
    const decisa = offerta.map((r) => ({ ...r, esito: "verde" as const, deciso_da_persona: true }));
    const conferma = confrontaDocumento([finestra()], [letta({ apertura: null })]).righe;
    const finale = ereditaDaOfferta(conferma, decisa);
    expect(finale[0].esito).toBe("verde");
    expect(finale[0].da_offerta).toBe(true);
  });
  it("se la conferma dice altro, il controllo vale", () => {
    const decisa = offerta.map((r) => ({ ...r, esito: "verde" as const, deciso_da_persona: true }));
    const conferma = confrontaDocumento([finestra()], [letta({ larghezza_mm: 1300, apertura: null })]).righe;
    expect(ereditaDaOfferta(conferma, decisa)[0].esito).toBe("rosso");
  });
  it("senza offerta non cambia niente", () => {
    const conferma = confrontaDocumento([finestra()], [letta()]).righe;
    expect(ereditaDaOfferta(conferma, null)).toEqual(conferma);
  });
});

describe("letture", () => {
  it("apertura: stesso significato, parole diverse", () => {
    expect(aperturaNormalizzata("Anta/Ribalta destra")).toBe(aperturaNormalizzata("anta ribalta DX"));
    expect(aperturaNormalizzata("anta ribalta sx")).not.toBe(aperturaNormalizzata("anta ribalta dx"));
  });
  it("colore: il RAL prima del nome", () => {
    expect(coloreDaTesto("Grigio RAL 7016")).toBe("ral 7016");
    expect(coloreDaTesto("PVC bianco")).toBe("bianco");
  });
  it("formato: l'ordine dei lati non conta", () => expect(formatoDaTesto("30x60")).toBe(formatoDaTesto("60 x 30 cm")));
  it("consegna in ritardo: solo giallo", () => {
    expect(esitoConsegna("2026-12-01", "2026-12-10")?.esito).toBe("giallo");
    expect(esitoConsegna("2026-12-01", "2026-11-28")?.esito).toBe("verde");
    expect(esitoConsegna(null, "2026-12-10")).toBeNull();
  });
});

describe("revisione del flusso su misura", () => {
  const riga = (descrizione: string): Pick<RigaChiesta, "descrizione" | "dettagli" | "unita" | "misure"> => ({ descrizione, dettagli: null, unita: "pz", misure: null });

  it("un colore scuro e un portasciugamani non sono serramenti; porte e scuri sì", () => {
    expect(categoriaRiga(riga("Tinta grigio scuro"))).toBe("generico");
    expect(categoriaRiga(riga("Porta asciugamani cromato"))).toBe("generico");
    expect(categoriaRiga(riga("Porta interna laccata"))).toBe("serramenti");
    expect(categoriaRiga(riga("Scuri in legno"))).toBe("serramenti");
  });

  it("le misure si controllano anche su una voce generica, se sono state chieste", () => {
    const r = finestra({ descrizione: "Mobile bagno", colore: null, apertura: null, misure: { larghezza: 800, altezza: 500 } });
    const { righe } = confrontaDocumento([r], [letta({ descrizione: "Mobile bagno", larghezza_mm: 900, altezza_mm: 500 })]);
    expect(righe[0].esito).toBe("rosso");
  });

  it("la decisione sull'offerta non vale se nel frattempo è cambiato ciò che si è chiesto", () => {
    const base = confrontaDocumento([finestra()], [letta({ larghezza_mm: 1300 })]).righe;
    const decisa = base.map((x) => ({ ...x, esito: "verde" as const, deciso_da_persona: true }));
    const conferma = base.map((x) => ({ ...x, chiesto: `${x.chiesto} (nuova misura)` }));
    expect(ereditaDaOfferta(conferma, decisa)[0].esito).toBe("rosso");
  });
});
