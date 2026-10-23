import { describe, expect, it } from "vitest";
import {
  contaStati, descrizioneVisibile, faseCompleta, quantitaLeggibile, riassuntoStati, statoMateriale, type RigaOrdineCollegata,
} from "@/lib/distinta/statoMateriale";
import { azionePrincipaleFase, pillolaValidazione, type PermessiMateriali } from "@/lib/distinta/statiFase";

const riga = { id: "r", quantity: 10, status: "da_ordinare", supplier_rfq_item_id: null, unita_misura: "m" };
const oda = (status: string, quantity = 10, quantity_received = 0, unit_of_measure: string | null = "m", numero = "ODA-1"): RigaOrdineCollegata => ({
  order_item_id: "r", quantity, quantity_received, unit_of_measure,
  purchase_orders: { oda_number: numero, status, issue_date: "2026-10-12", expected_delivery_date: "2026-10-20" },
});

describe("scala unica dello stato di un materiale", () => {
  it("nessun ordine: da ordinare", () => {
    expect(statoMateriale(riga, []).stato).toBe("da_ordinare");
  });

  it("in una richiesta d'offerta: in offerta", () => {
    expect(statoMateriale({ ...riga, supplier_rfq_item_id: "rfq" }, []).stato).toBe("in_offerta");
  });

  it("ordine in bozza: in bozza d'ordine, anche se la riga dice ancora «da ordinare»", () => {
    const s = statoMateriale(riga, [oda("bozza")]);
    expect(s.stato).toBe("in_bozza_oda");
    expect(s.ordini).toEqual([expect.objectContaining({ numero: "ODA-1", stato: "bozza", data: "2026-10-12", arrivo: "2026-10-20" })]);
  });

  it("ordine inviato: ordinato; se copre meno della riga lo dice", () => {
    expect(statoMateriale(riga, [oda("inviato")])).toMatchObject({ stato: "ordinato", dettaglio: null });
    expect(statoMateriale(riga, [oda("inviato", 6)])).toMatchObject({ stato: "ordinato", dettaglio: "Ordinati 6 di 10" });
  });

  it("arrivo parziale: ordinato con quanto è arrivato", () => {
    expect(statoMateriale(riga, [oda("parziale", 10, 4)])).toMatchObject({ stato: "ordinato", dettaglio: "Arrivati 4 di 10" });
  });

  it("tutto ricevuto: consegnato; gli ordini annullati non contano", () => {
    expect(statoMateriale(riga, [oda("ricevuto", 10, 10)]).stato).toBe("consegnato");
    expect(statoMateriale(riga, [oda("annullato", 10, 10)]).stato).toBe("da_ordinare");
  });

  it("installato vince su tutto; in magazzino è consegnato", () => {
    expect(statoMateriale({ ...riga, status: "installato" }, [oda("ricevuto", 10, 10)]).stato).toBe("installato");
    expect(statoMateriale({ ...riga, status: "installato" }, []).stato).toBe("installato");
    expect(statoMateriale({ ...riga, status: "in_magazzino" }, []).stato).toBe("consegnato");
    expect(statoMateriale({ ...riga, status: "in_arrivo" }, []).stato).toBe("ordinato");
  });

  it("unità diverse: niente confronto di quantità, conta l'arrivo di ogni riga d'ordine", () => {
    const s = statoMateriale(riga, [oda("inviato", 3, 0, "rotoli")]);
    expect(s.stato).toBe("ordinato");
    expect(s.dettaglio).toBeNull();
    expect(s.unitaDaVerificare).toEqual({ unitaRiga: "m", unitaOrdine: ["rotoli"] });
    expect(s.allineaA).toBeNull();
    expect(statoMateriale(riga, [oda("parziale", 3, 1, "rotoli")])).toMatchObject({ stato: "ordinato", dettaglio: "Arrivo parziale" });
    expect(statoMateriale(riga, [oda("ricevuto", 3, 3, "rotoli")]).stato).toBe("consegnato");
  });

  it("unità coincidenti (o ordine senza unità): niente da verificare", () => {
    expect(statoMateriale(riga, [oda("inviato", 10, 0, "M")]).unitaDaVerificare).toBeNull();
    expect(statoMateriale(riga, [oda("inviato", 10, 0, null)]).unitaDaVerificare).toBeNull();
  });

  it("riga da 1 pezzo e ordine 1 «a corpo»: si allinea scrivendo l'unità dell'ordine", () => {
    const voce = { id: "r", quantity: 1, status: "da_ordinare", unita_misura: null };
    expect(statoMateriale(voce, [oda("ricevuto", 1, 1, "corpo")])).toMatchObject({ stato: "consegnato", allineaA: "corpo" });
    // Due a corpo su una riga da 1: non si indovina.
    expect(statoMateriale(voce, [oda("ricevuto", 2, 2, "corpo")]).allineaA).toBeNull();
  });

  it("contatori: stessa scala per testata e fasi, fase completa quando tutto è arrivato", () => {
    const c = contaStati(["da_ordinare", "in_bozza_oda", "in_bozza_oda", "installato"]);
    expect(c).toMatchObject({ totale: 4, da_ordinare: 1, in_bozza_oda: 2, ordinato: 0, installato: 1 });
    expect(riassuntoStati(c)).toBe("1 da ordinare · 2 in bozza d'ordine · 1 installato");
    expect(faseCompleta(c)).toBe(false);
    expect(faseCompleta(contaStati(["consegnato", "installato"]))).toBe(true);
    expect(faseCompleta(contaStati([]))).toBe(false);
  });
});

describe("testo delle righe", () => {
  it("descrizione senza etichette tecniche e solo se dice qualcosa in più del nome", () => {
    expect(descrizioneVisibile("Piastrelle 60x60", "[DEMO HISTORY 2026 v1]")).toBeNull();
    expect(descrizioneVisibile("Piastrelle 60x60", "Piastrelle 60x60")).toBeNull();
    expect(descrizioneVisibile("Piastrelle 60x60", "[DEMO] Gres porcellanato rettificato")).toBe("Gres porcellanato rettificato");
  });

  it("le voci a corpo si leggono «a corpo», non «1 pz»", () => {
    expect(quantitaLeggibile(1, "corpo")).toEqual({ numero: "", unita: "a corpo" });
    expect(quantitaLeggibile(1, null, ["corpo"])).toEqual({ numero: "", unita: "a corpo" });
    expect(quantitaLeggibile(37, null)).toEqual({ numero: "37", unita: "pz" });
    expect(quantitaLeggibile(2.5, "mq")).toEqual({ numero: "2,5", unita: "mq" });
  });
});

describe("pulsante principale della fase", () => {
  const prepara: PermessiMateriali = { canEditOrders: true, canValidateBom: false, canManagePurchasing: false };
  const acquisti: PermessiMateriali = { canEditOrders: false, canValidateBom: false, canManagePurchasing: true };
  const tecnico: PermessiMateriali = { canEditOrders: false, canValidateBom: true, canManagePurchasing: false };
  const m = (x: Partial<{ daOrdinare: number; senzaQuantita: number; inAcquisto: number; haFase: boolean }> = {}) =>
    ({ haFase: true, daOrdinare: 2, senzaQuantita: 0, inAcquisto: 0, ...x });

  it("bozza con materiali da ordinare: «Invia al tecnico»; tutto ordinato: niente", () => {
    expect(azionePrincipaleFase("bozza", prepara, m()).principale).toBe("invia_validazione");
    expect(azionePrincipaleFase("bozza", prepara, m({ daOrdinare: 0, inAcquisto: 2 })).principale).toBeNull();
  });

  it("dal tecnico: valida e rimanda per chi valida, niente per gli altri", () => {
    expect(azionePrincipaleFase("da_validare", tecnico, m())).toEqual({ principale: "valida", secondarie: ["rimanda"] });
    expect(azionePrincipaleFase("da_validare", tecnico, m({ senzaQuantita: 1 })).principale).toBe("rimanda");
    expect(azionePrincipaleFase("da_validare", prepara, m()).principale).toBeNull();
  });

  it("validata: «Ordina» per chi compra finché c'è da ordinare", () => {
    expect(azionePrincipaleFase("validata", acquisti, m()).principale).toBe("ordina");
    expect(azionePrincipaleFase("validata", acquisti, m({ daOrdinare: 0 })).principale).toBeNull();
    expect(azionePrincipaleFase("validata", tecnico, m()).principale).toBeNull();
  });

  it("fase senza validazione già ordinata: nessun «Invia al tecnico»", () => {
    expect(azionePrincipaleFase(null, prepara, m({ daOrdinare: 0, inAcquisto: 6 }))).toEqual({ principale: null, secondarie: [] });
    expect(azionePrincipaleFase(null, prepara, m())).toEqual({ principale: "ordina", secondarie: ["invia_validazione"] });
    expect(azionePrincipaleFase(null, tecnico, m()).principale).toBe("invia_validazione");
  });

  it("pillola: bozza, da validare, validata, rimandata (bozza con nota)", () => {
    expect(pillolaValidazione(null)).toBeNull();
    expect(pillolaValidazione({ stato: "bozza", note_validazione: null })).toBe("bozza");
    expect(pillolaValidazione({ stato: "bozza", note_validazione: "Mancano le cassette" })).toBe("rimandata");
    expect(pillolaValidazione({ stato: "validata" })).toBe("validata");
  });
});
