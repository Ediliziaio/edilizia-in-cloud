import { describe, expect, it } from "vitest";
import { DbFinto } from "../helpers/dbFinto";
import { voceVuota, type VoceEditor } from "@/lib/computo/editorNativo";
import { corrispondenza } from "@/lib/preventivi/coordinatore/abbinamento";
import { applicaVerifica, fontiDichiarate, voceRichiesta, FONTE_MANUALE } from "@/lib/preventivi/coordinatore/computo";
import { coordinaVerifica, memoriaVuota, scegli } from "@/lib/preventivi/coordinatore/coordinatore";
import { marginePct, prezzoDaMargine, prezzoDaRicarico } from "@/lib/preventivi/coordinatore/prezzoVendita";
import type { CandidatoPrezzo } from "@/lib/preventivi/coordinatore/tipi";

const AZIENDA = "a0000000-0000-4000-a000-000000000001";
const ALTRA = "b0000000-0000-4000-a000-000000000002";
const OGGI = "2026-11-23";

const nessuno: number | null = null;
const nessunaData: string | null = null;
const voce = (id: string, patch: Partial<VoceEditor>): VoceEditor => ({ ...voceVuota(), id, capitolo: "Opere edili", ...patch });

function seme() {
  return {
    preventivo_impostazioni: [
      { company_id: AZIENDA, margine_target_default: 30, margine_minimo_percentuale: 20 },
      { company_id: ALTRA, margine_target_default: 50, margine_minimo_percentuale: 40 },
    ],
    tariffe_aziendali: [
      { id: "t1", company_id: AZIENDA, attivo: true, codice: "DEM.010", nome: "Demolizione pavimento in ceramica", descrizione: "", unita: "mq", prezzo_vendita: 18, prezzo_costo: 11, costo_interno: nessuno, created_at: "2026-03-12T10:00:00Z" },
      { id: "t2", company_id: AZIENDA, attivo: true, codice: "PAV.020", nome: "Posa pavimento in gres 60x60", descrizione: "", unita: "mq", prezzo_vendita: 32, prezzo_costo: 20, costo_interno: nessuno, created_at: "2026-03-12T10:00:00Z" },
      { id: "t3", company_id: AZIENDA, attivo: true, codice: "MAS.030", nome: "Massetto autolivellante", descrizione: "", unita: "mq", prezzo_vendita: null, prezzo_costo: 100, costo_interno: nessuno, created_at: "2026-02-01T10:00:00Z" },
      { id: "t4", company_id: AZIENDA, attivo: false, codice: "TIN.040", nome: "Tinteggiatura pareti", descrizione: "", unita: "mq", prezzo_vendita: 9, prezzo_costo: 4, costo_interno: nessuno, created_at: "2025-01-01T10:00:00Z" },
      { id: "t5", company_id: AZIENDA, attivo: true, codice: "BAT.050", nome: "Battiscopa in gres", descrizione: "", unita: "m", prezzo_vendita: 12, prezzo_costo: 7, costo_interno: nessuno, created_at: "2026-03-12T10:00:00Z" },
      // Stesso codice in un'altra azienda, a un altro prezzo: non deve mai comparire.
      { id: "x1", company_id: ALTRA, attivo: true, codice: "DEM.010", nome: "Demolizione pavimento in ceramica", descrizione: "", unita: "mq", prezzo_vendita: 99, prezzo_costo: 1, costo_interno: nessuno, created_at: "2026-10-01T10:00:00Z" },
    ],
    listini_fornitore: [
      { id: "lf1", company_id: AZIENDA, nome: "Ceramiche 2025", valido_dal: "2025-01-01", valido_al: "2025-12-31", attivo: true, sconto_default_pct: 10 },
      { id: "lf2", company_id: AZIENDA, nome: "Ceramiche 2026", valido_dal: "2026-01-01", valido_al: "2026-12-31", attivo: true, sconto_default_pct: 0 },
    ],
    listino_fornitore_voci: [
      { id: "fv1", company_id: AZIENDA, listino_id: "lf1", codice: "BAT.050", descrizione: "Battiscopa in gres", unita: "m", prezzo: 5, sconto_pct: nessuno },
      { id: "fv2", company_id: AZIENDA, listino_id: "lf2", codice: "BAT.050", descrizione: "Battiscopa in gres", unita: "m", prezzo: 9, sconto_pct: nessuno },
    ],
    purchase_order_items: [] as Record<string, unknown>[],
    quotes: [
      { id: "q1", company_id: AZIENDA, quote_number: "PRV/2026/010", status: "accettata", signed_at: "2026-06-10T09:00:00Z", created_at: "2026-06-01T09:00:00Z" },
      { id: "q2", company_id: AZIENDA, quote_number: "PRV/2026/020", status: "rifiutata", signed_at: null, created_at: "2026-09-01T09:00:00Z" },
      { id: "q3", company_id: AZIENDA, quote_number: "PRV/2026/030", status: "bozza", signed_at: null, created_at: "2026-10-01T09:00:00Z" },
      { id: "qx", company_id: ALTRA, quote_number: "ALTRA/1", status: "accettata", signed_at: "2026-10-10T09:00:00Z", created_at: "2026-10-01T09:00:00Z" },
    ],
    quote_items: [
      { id: "i1", company_id: AZIENDA, quote_id: "q1", name: "Posa pavimento in gres 60x60", description: "", quantity: 40, unit_price: 40, discount_percent: 0, unit_of_measure: "mq", codice_prezzario: "PAV.020", is_optional: false, item_category: "prodotto" },
      { id: "i2", company_id: AZIENDA, quote_id: "q2", name: "Posa pavimento in gres 60x60", description: "", quantity: 35, unit_price: 46, discount_percent: 0, unit_of_measure: "mq", codice_prezzario: "PAV.020", is_optional: false, item_category: "prodotto" },
      { id: "i3", company_id: AZIENDA, quote_id: "q3", name: "Posa pavimento in gres 60x60", description: "", quantity: 35, unit_price: 5, discount_percent: 0, unit_of_measure: "mq", codice_prezzario: "PAV.020", is_optional: false, item_category: "prodotto" },
      { id: "ix", company_id: ALTRA, quote_id: "qx", name: "Posa pavimento in gres 60x60", description: "", quantity: 40, unit_price: 77, discount_percent: 0, unit_of_measure: "mq", codice_prezzario: "PAV.020", is_optional: false, item_category: "prodotto" },
    ],
    prezzario_fonte: [] as Record<string, unknown>[],
    prezzario_voce: [] as Record<string, unknown>[],
  };
}

async function verifica(voci: VoceEditor[], opzioni: { costi?: boolean; db?: DbFinto; memoria?: ReturnType<typeof memoriaVuota> } = {}) {
  const costi = opzioni.costi ?? true;
  const db = opzioni.db ?? new DbFinto(seme());
  const richieste = voci.map(v => voceRichiesta(v, costi));
  const esito = await coordinaVerifica({ companyId: AZIENDA, voci: richieste, fontiDichiarate: fontiDichiarate(voci), permessi: { costi }, oggi: OGGI }, db.client, opzioni.memoria);
  return { esito, richieste, db };
}

describe("dal costo al prezzo: margine e ricarico non sono la stessa cosa", () => {
  it("costo 100 €: margine 30% → 142,86 €, ricarico 30% → 130,00 €", () => {
    expect(prezzoDaMargine(100, 30)).toBe(142.86);
    expect(prezzoDaRicarico(100, 30)).toBe(130);
    expect(marginePct(100, 142.86)).toBe(30);
    expect(marginePct(100, 130)).toBe(23.1);
  });
  it("un margine impossibile non produce un prezzo", () => {
    expect(prezzoDaMargine(100, 100)).toBeNull();
    expect(prezzoDaMargine(100, -5)).toBeNull();
    expect(marginePct(10, 0)).toBeNull();
  });
});

describe("quando una riga è la stessa lavorazione", () => {
  const base = { codice: "", descrizione: "Posa pavimento in gres 60x60", unita: "mq" };
  it("il formato diverso non è la stessa voce, la sola posa non è fornitura e posa", () => {
    expect(corrispondenza(base, { ...base, descrizione: "Posa pavimento in gres 30x30" })).toBeNull();
    expect(corrispondenza(base, { ...base, descrizione: "Fornitura e posa pavimento in gres 60x60" })).toBeNull();
    expect(corrispondenza(base, { ...base, unita: "m" })).toBeNull();
    expect(corrispondenza(base, { ...base, unita: "m2" })?.modo).toBe("descrizione");
  });
  it("stesso codice a unità diversa: corrisponde, ma lo dice", () => {
    expect(corrispondenza({ ...base, codice: "PAV.020" }, { codice: "pav 020", descrizione: "altro", unita: "cad" })).toEqual({ modo: "codice", unitaDiversa: true });
  });
});

describe("scenario 1: dati e listini completi", () => {
  const voci = [
    voce("v1", { tariffa: "DEM.010", descrizione: "Demolizione pavimento in ceramica", unita: "mq", quantita: "40" }),
    voce("v2", { tariffa: "", descrizione: "Posa pavimento in gres 60x60", unita: "mq", quantita: "40" }),
  ];
  it("ogni voce prende prezzo e fonte dal listino dell'azienda, mai da un'altra", async () => {
    const { esito } = await verifica(voci);
    expect(esito.voci.map(v => v.proposta?.prezzo)).toEqual([18, 32]);
    expect(esito.voci[0].proposta?.fonte).toBe("Listino aziendale · DEM.010 · 12/03/2026");
    expect(esito.voci.every(v => v.stato === "da_confermare")).toBe(true);
    expect(esito.controlli.filter(c => c.gravita === "domanda")).toEqual([]);
    expect(esito.misure.percentualeConFonte).toBe(100);
    expect(esito.misure.chiamateAi).toBe(0);
    expect(JSON.stringify(esito)).not.toMatch(/99|ALTRA|77/);
  });
  it("applicate, le proposte scrivono prezzo, costo, fonte e verifica sulla voce", async () => {
    const { esito, richieste } = await verifica(voci);
    const dopo = applicaVerifica(voci, richieste, esito.voci, new Set(["v1", "v2"]), { vediCosti: true, oggi: OGGI });
    expect(dopo.applicate).toBe(2);
    expect(dopo.voci[0]).toMatchObject({ prezzo: "18", costo: "11", fonte: "Listino aziendale · DEM.010 · 12/03/2026", verifica: { stato: "verificata", tipo: "listino_aziendale", riferimento: "DEM.010", verificataIl: OGGI } });
    // Rilanciata sul risultato, la verifica non ha più niente da proporre.
    const secondo = await verifica(dopo.voci);
    expect(secondo.esito.voci.map(v => [v.stato, v.proposta])).toEqual([["verificata", null], ["verificata", null]]);
  });
  it("chi non vede i costi non li riceve: né letti, né nel risultato", async () => {
    const { esito, db } = await verifica(voci, { costi: false });
    expect(esito.voci.every(v => v.costo === null && v.marginePct === null && v.proposta?.costo === undefined)).toBe(true);
    expect(esito.voci.flatMap(v => v.candidati).some(c => c.natura === "costo")).toBe(false);
    expect(db.operazioni.map(o => o.tabella)).not.toContain("listino_fornitore_voci");
    expect(db.operazioni.map(o => o.tabella)).not.toContain("purchase_order_items");
  });
});

describe("scenario 2: informazioni mancanti e prezzi discordanti", () => {
  const voci = [
    voce("senza-quantita", { tariffa: "DEM.010", descrizione: "Demolizione pavimento in ceramica", unita: "mq", quantita: "" }),
    voce("discordante", { tariffa: "PAV.020", descrizione: "Posa pavimento in gres 60x60", unita: "mq", quantita: "40" }),
    voce("solo-costo", { tariffa: "MAS.030", descrizione: "Massetto autolivellante", unita: "mq", quantita: "40" }),
    voce("ignota", { descrizione: "Rasatura armata con rete in fibra", unita: "mq", quantita: "12" }),
    voce("spenta", { tariffa: "TIN.040", descrizione: "Tinteggiatura pareti", unita: "mq", quantita: "100" }),
    voce("fornitore", { tariffa: "BAT.050", descrizione: "Battiscopa in gres", unita: "m", quantita: "30", prezzo: "6", fonte: FONTE_MANUALE }),
    voce("doppia", { descrizione: "Rasatura armata con rete in fibra", unita: "mq", quantita: "12" }),
  ];
  it("le domande sono solo ciò che manca davvero, raccolte in un elenco", async () => {
    const { esito } = await verifica(voci);
    const domande = esito.controlli.filter(c => c.gravita === "domanda").map(c => [c.codice, c.voceId]);
    expect(domande).toEqual([["quantita_mancante", "senza-quantita"], ["prezzo_senza_fonte", "ignota"], ["prezzo_senza_fonte", "spenta"], ["prezzo_senza_fonte", "doppia"]]);
  });
  it("listino e storico in disaccordo: vince il listino per priorità, e il conflitto si vede", async () => {
    const { esito } = await verifica(voci);
    const v = esito.voci.find(x => x.voceId === "discordante")!;
    expect(v.proposta?.prezzo).toBe(32);
    expect(v.conflitti).toHaveLength(1);
    expect(v.conflitti[0]).toContain("Preventivo PRV/2026/010 accettato");
    // Il rifiutato si vede ma non si sceglie; la bozza non è mai stata un prezzo.
    expect(v.candidati.filter(c => c.tipo === "storico").map(c => [c.valore, c.selezionabile])).toEqual([[40, true], [46, false]]);
    expect(esito.controlli.some(c => c.codice === "scostamento_storico" && c.voceId === "discordante")).toBe(false);
  });
  it("la priorità si può cambiare: con lo storico davanti vince il prezzo accettato", async () => {
    const db = new DbFinto(seme());
    const esito = await coordinaVerifica({ companyId: AZIENDA, voci: voci.map(v => voceRichiesta(v, true)), fontiDichiarate: fontiDichiarate(voci), permessi: { costi: true }, oggi: OGGI, priorita: ["storico", "listino_aziendale"] }, db.client);
    expect(esito.voci.find(x => x.voceId === "discordante")!.proposta?.prezzo).toBe(40);
  });
  it("senza prezzo ma con il costo: prezzo dal margine obiettivo, dichiarato come stima", async () => {
    const { esito } = await verifica(voci);
    const v = esito.voci.find(x => x.voceId === "solo-costo")!;
    expect(v.stato).toBe("stima");
    expect(v.proposta).toMatchObject({ prezzo: 142.86, costo: 100, regola: expect.stringMatching(/^margine 30% sul costo 100,00\s€ · margine dell'azienda$/) });
    expect(v.marginePct).toBe(30);
  });
  it("niente si inventa: una voce spenta nel listino o mai vista resta senza prezzo", async () => {
    const { esito } = await verifica(voci);
    for (const id of ["ignota", "spenta"]) expect(esito.voci.find(x => x.voceId === id)).toMatchObject({ stato: "senza_fonte", proposta: null, candidati: [] });
  });
  it("costo dal listino fornitore valido, non da quello scaduto; il prezzo sotto costo si segnala", async () => {
    const { esito } = await verifica(voci);
    const v = esito.voci.find(x => x.voceId === "fornitore")!;
    expect(v.costo).toMatchObject({ tipo: "offerta_fornitore", valore: 9, scaduto: false });
    expect(v.candidati.find(c => c.id === "fornitore:fv1")).toMatchObject({ valore: 4.5, scaduto: true });
    expect(esito.controlli.filter(c => c.voceId === "fornitore").map(c => c.codice)).toEqual(expect.arrayContaining(["conflitto_fonti", "sotto_costo"]));
  });
  it("la stessa lavorazione due volte nello stesso capitolo si fa notare", async () => {
    const { esito } = await verifica(voci);
    expect(esito.controlli.filter(c => c.codice === "doppione")).toHaveLength(1);
  });
  it("un agente che non risponde non ferma gli altri, e al giro dopo si rilegge solo quello", async () => {
    const db = new DbFinto(seme()); const memoria = memoriaVuota();
    db.erroriProssimi["quotes:select"] = { message: "timeout" };
    const primo = await verifica(voci, { db, memoria });
    expect(primo.esito.mancanti).toEqual(["storico dei preventivi"]);
    expect(primo.esito.voci.find(x => x.voceId === "discordante")!.proposta?.prezzo).toBe(32);
    const secondo = await verifica(voci, { db, memoria });
    expect(secondo.esito.mancanti).toEqual([]);
    expect(secondo.esito.misure.agentiRiletti).toEqual(["storico dei preventivi"]);
  });
});

describe("scenario 3: revisione di un preventivo con modifiche manuali", () => {
  const voci = [
    voce("a-mano", { tariffa: "DEM.010", descrizione: "Demolizione pavimento in ceramica", unita: "mq", quantita: "40", prezzo: "25", fonte: FONTE_MANUALE }),
    voce("verificata", { tariffa: "PAV.020", descrizione: "Posa pavimento in gres 60x60", unita: "mq", quantita: "40", prezzo: "32", fonte: "Listino aziendale · PAV.020 · 12/03/2026",
      verifica: { stato: "verificata", tipo: "listino_aziendale", riferimento: "PAV.020", data: "2026-03-12", validoAl: null, verificataIl: "2026-11-01" } }),
  ];
  it("il prezzo scritto a mano resta: la differenza si propone, e si applica solo se accettata", async () => {
    const { esito, richieste } = await verifica(voci);
    expect(esito.voci[0]).toMatchObject({ stato: "manuale", proposta: { prezzo: 18, suManuale: true } });
    const rifiutata = applicaVerifica(voci, richieste, esito.voci, new Set(), { vediCosti: true, oggi: OGGI });
    expect(rifiutata.voci[0]).toMatchObject({ prezzo: "25", fonte: FONTE_MANUALE });
    const accettata = applicaVerifica(voci, richieste, esito.voci, new Set(["a-mano"]), { vediCosti: true, oggi: OGGI });
    expect(accettata.voci[0]).toMatchObject({ prezzo: "18", verifica: { stato: "verificata" } });
  });
  it("cambia solo una quantità: nessuna lettura, abbinamenti riusati, conti rifatti", async () => {
    const db = new DbFinto(seme()); const memoria = memoriaVuota();
    const primo = await verifica(voci, { db, memoria });
    expect(primo.esito.misure.abbinamentiRifatti).toBe(2);
    const letturePrima = db.operazioni.length;
    const modificate = voci.map(v => v.id === "verificata" ? { ...v, quantita: "55" } : v);
    const secondo = await verifica(modificate, { db, memoria });
    expect(db.operazioni.length).toBe(letturePrima);
    expect(secondo.esito.misure).toMatchObject({ letture: 0, abbinamentiRiusati: 2, abbinamentiRifatti: 0, agentiRiletti: [] });
    // Cambia la descrizione di una voce: si riabbina solo quella.
    const terzo = await verifica(modificate.map(v => v.id === "a-mano" ? { ...v, tariffa: "", descrizione: "Battiscopa in gres", unita: "m" } : v), { db, memoria });
    expect(terzo.esito.misure).toMatchObject({ letture: 0, abbinamentiRiusati: 1, abbinamentiRifatti: 1 });
  });
  it("una voce cambiata dopo l'analisi non riceve una proposta calcolata sul vecchio", async () => {
    const { esito, richieste } = await verifica(voci);
    const nelFrattempo = voci.map(v => v.id === "a-mano" ? { ...v, prezzo: "27" } : v);
    const dopo = applicaVerifica(nelFrattempo, richieste, esito.voci, new Set(["a-mano"]), { vediCosti: true, oggi: OGGI });
    expect(dopo).toMatchObject({ applicate: 0, cambiateNelFrattempo: 1 });
    expect(dopo.voci[0].prezzo).toBe("27");
  });
  it("la memoria dei costi non passa a chi non li vede", async () => {
    const db = new DbFinto(seme()); const memoria = memoriaVuota();
    await verifica(voci, { db, memoria, costi: true });
    const senza = await verifica(voci, { db, memoria, costi: false });
    expect(senza.esito.misure.agentiRiletti).toContain("listini");
    expect(JSON.stringify(senza.esito)).not.toContain('"natura":"costo"');
  });
});

describe("scelta della fonte", () => {
  const c = (patch: Partial<CandidatoPrezzo>): CandidatoPrezzo => ({ id: "x", tipo: "listino_aziendale", natura: "vendita", valore: 10, unita: "mq", etichetta: "", riferimento: "", data: "2026-01-01", validoAl: null, scaduto: false, condizioni: "", corrispondenza: "codice", selezionabile: true, ...patch });
  it("un prezzo valido batte sempre uno scaduto, anche di priorità più alta", () => {
    const scelto = scegli([c({ id: "contratto", tipo: "contratto", scaduto: true }), c({ id: "storico", tipo: "storico" })], "vendita", ["contratto", "storico"]);
    expect(scelto?.id).toBe("storico");
  });
  it("un costo non diventa mai un prezzo di vendita", () => {
    expect(scegli([c({ natura: "costo" })], "vendita", ["listino_aziendale"])).toBeNull();
  });
});

describe("preventivo da foto: solo i file dell'azienda verificata", () => {
  it("un percorso di un'altra azienda, una risalita o un file fuori da captures non passano", async () => {
    const { percorsoCatturaDellAzienda } = await import("../../../supabase/functions/_shared/percorsoCattura");
    expect(percorsoCatturaDellAzienda(`captures/${AZIENDA}/1-0-foto.jpg`, AZIENDA)).toBe(true);
    for (const p of [`captures/${ALTRA}/1-0-foto.jpg`, `captures/${AZIENDA}/../${ALTRA}/x.jpg`, `${AZIENDA}/contratto.pdf`, `captures/${AZIENDA}/`, `captures/${AZIENDA}//x`, "", null, 7]) {
      expect(percorsoCatturaDellAzienda(p, AZIENDA)).toBe(false);
    }
  });
  it("la funzione controlla percorsi e run prima di toccare lo storage", async () => {
    const { readFileSync } = await import("node:fs");
    const sorgente = readFileSync("supabase/functions/ai-quote-from-capture/index.ts", "utf8");
    const controllo = sorgente.indexOf("percorsoCatturaDellAzienda(p, companyId)");
    expect(controllo).toBeGreaterThan(sorgente.indexOf("requireCompanyAccess(supabase, user.id, companyId"));
    expect(controllo).toBeLessThan(sorgente.indexOf(".download(body.audio_path)"));
    expect(sorgente).toMatch(/from\("preventivo_da_foto_runs"\)\.select\("id"\)\.eq\("id", body\.run_id\)\.eq\("company_id", companyId\)/);
  });
});

describe("margine obiettivo: sempre un numero, e si sa da dove viene", () => {
  const voci = [
    voce("solo-costo", { tariffa: "MAS.030", descrizione: "Massetto autolivellante", unita: "mq", quantita: "40" }),
    voce("listino", { tariffa: "PAV.020", descrizione: "Posa pavimento in gres 60x60", unita: "mq", quantita: "10" }),
  ];
  const giro = async (margine: number | undefined, impostazioni = true) => {
    const dati = seme();
    if (!impostazioni) dati.preventivo_impostazioni = [];
    return coordinaVerifica({ companyId: AZIENDA, voci: voci.map(v => voceRichiesta(v, true)), fontiDichiarate: fontiDichiarate(voci), permessi: { costi: true }, oggi: OGGI, margineObiettivoPct: margine }, new DbFinto(dati).client);
  };
  it("l'azienda non ha scelto: parte lo standard del 30%, e lo dice", async () => {
    const esito = await giro(undefined, false);
    expect(esito.profilo).toMatchObject({ margineObiettivoPct: 30, margineOrigine: "standard", margineAziendaPct: null });
    expect(esito.voci[0].proposta).toMatchObject({ prezzo: 142.86, regola: expect.stringContaining("margine standard") });
  });
  it("chi fa il preventivo ne indica un altro: vince sul resto e i prezzi dal costo cambiano", async () => {
    const esito = await giro(25);
    expect(esito.profilo).toMatchObject({ margineObiettivoPct: 25, margineOrigine: "indicato", margineAziendaPct: 30 });
    expect(esito.voci[0].proposta?.prezzo).toBe(133.33);
    // Un prezzo di listino non si ricalcola: il margine vale solo dove il prezzo nasce dal costo.
    expect(esito.voci[1].proposta?.prezzo).toBe(32);
  });
  it("un margine senza senso si ignora", async () => {
    expect((await giro(0)).profilo.margineOrigine).toBe("azienda");
    expect((await giro(120)).profilo.margineOrigine).toBe("azienda");
  });
  it("riepilogo: ricavo, costo e margine del preventivo contro l'obiettivo", async () => {
    const esito = await giro(35);
    // 40 mq × 153,85 (da costo 100 al 35%) + 10 mq × 32 (listino, costo 20) = 6.474,00 su 4.200,00 di costo.
    expect(esito.economia).toEqual({ ricavo: 6474, costo: 4200, marginePct: 35.1, vociConCosto: 2, vociSenzaCosto: 0 });
    expect(esito.controlli.some(c => c.codice === "margine_sotto_obiettivo")).toBe(false);
    const alto = await giro(40);
    expect(alto.economia?.marginePct).toBeLessThan(40);
    expect(alto.controlli.filter(c => c.codice === "margine_sotto_obiettivo")).toHaveLength(1);
  });
  it("senza permesso sui costi non c'è alcun riepilogo economico", async () => {
    const esito = await coordinaVerifica({ companyId: AZIENDA, voci: voci.map(v => voceRichiesta(v, false)), permessi: { costi: false }, oggi: OGGI, margineObiettivoPct: 25 }, new DbFinto(seme()).client);
    expect(esito.economia).toBeNull();
    expect(esito.voci[0].proposta).toBeNull();
  });
});

describe("storico: forme vecchie degli stati, righe che non sono lavorazioni, date", () => {
  it("un preventivo «accettato» al maschile vale come accettato; note e sconti non sono prezzi", async () => {
    const dati = seme();
    dati.quotes = [{ id: "q9", company_id: AZIENDA, quote_number: "PRV/2026/090", status: "accettato", signed_at: nessunaData, created_at: "2026-05-01T09:00:00Z" }];
    dati.quote_items = [
      { id: "i9", company_id: AZIENDA, quote_id: "q9", name: "Rasatura armata con rete in fibra", description: "", quantity: 12, unit_price: 21, discount_percent: 10, unit_of_measure: "mq", codice_prezzario: "", is_optional: false, item_category: "posa" },
      { id: "i10", company_id: AZIENDA, quote_id: "q9", name: "Rasatura armata con rete in fibra", description: "", quantity: 12, unit_price: 500, discount_percent: 0, unit_of_measure: "mq", codice_prezzario: "", is_optional: false, item_category: "subtotale" },
    ];
    const voci = [voce("r", { descrizione: "Rasatura armata con rete in fibra", unita: "mq", quantita: "12" })];
    const { esito } = await verifica(voci, { db: new DbFinto(dati) });
    expect(esito.voci[0].candidati.map(c => [c.valore, c.selezionabile])).toEqual([[18.9, true]]);
    expect(esito.voci[0].proposta).toMatchObject({ prezzo: 18.9, fonte: "Preventivo PRV/2026/090 accettato · 01/05/2026" });
  });
  it("il 29 febbraio di un anno fa è il 28", async () => {
    const { anniPrima } = await import("@/lib/preventivi/coordinatore/agenti");
    expect(anniPrima("2028-02-29", 1)).toBe("2027-02-28");
    expect(anniPrima("2028-02-29", 4)).toBe("2024-02-29");
    expect(anniPrima("2026-11-23", 2)).toBe("2024-11-23");
  });
});
