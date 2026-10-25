import { unitaCompatibili } from "@/lib/prezzario/confronto";
import type { QuoteItemPro } from "@/types/quoteItem";

// Case requirements, NOT another price catalogue. Prices/descriptions come only
// from the existing published source. Never translate an edition's codes.
export const APARTMENT_EDITION_PREFIX = "LOM252.";
export const APARTMENT_REQUIREMENTS = [
  ["floorRemoval", "Rimozione pavimento e allettamento", "m²", "OC.EEA.Mc01.C1206.Za000.0250.-"],
  ["floor", "Pavimento monocottura 30×30 su letto in malta", "m²", "OC.EEA.Pa02.C1206.L0001.0020.-"],
  ["screed", "Sottofondo: soluzione da verificare", "m²", "OC.EEA.Pa04.C0915.J0016.0000.b"],
  ["paint", "Due mani su superfici già preparate", "m²", "OC.EEA.Pa06.C1234.Ca012.0000.-"],
  ["tileRemoval", "Rimozione rivestimento bagno", "m²", "OC.EEA.Mc04.C1220.L0002.0250.-"],
  ["tiles", "Rivestimento monocottura 20×20", "m²", "OC.EEA.Pa02.C1220.L0001.0005.-"],
  ["partitionRemoval", "Demolizione tramezzi ≤7 cm", "m²", "OC.EEA.Mc01.C0100.Za001.0010.a"],
  ["partition", "Divisorio cartongesso, una lastra per faccia", "m²", "OC.EEA.Pa02.C0100.H0002.0005.-"],
  ["wc", "WC a pavimento", "cad", "OC.EEA.Pa01.N8220.L0008.0000.-"],
  ["basin", "Lavabo a parete 60 cm", "cad", "OC.EEA.Pa01.N8225.L0012.0000.-"],
  ["bidet", "Bidet a pavimento", "cad", "OC.EEA.Pa01.N8230.L0012.0000.-"],
  ["shower", "Piatto doccia ceramica 80×80", "cad", "OC.EEA.Pa01.N8240.L0013.0005.-"],
] as const;
export type ApartmentKey = typeof APARTMENT_REQUIREMENTS[number][0];
export type ApartmentMeasurements = Partial<Record<ApartmentKey, number | null>>;
export type ApartmentSource = { id: string; regione: string; anno: number; versione: string | null; nome: string; stato: string };
export type ApartmentCatalogRow = { id: string; fonte_id: string; codice: string | null; descrizione: string; unita_misura: string | null; prezzo: number | string | null };
export type ApartmentOverride = { title?: string; description?: string; unit?: string; quantity?: number | null; price?: number | null; approved?: boolean };
export type ApartmentLine = {
  key: ApartmentKey; title: string; unit: string; code: string; quantity: number | null;
  price: number | null; description: string; issue: string | null; included: boolean;
  manualPrice: boolean; referenceId: string | null; sourceId: string; referencePrice: number | null;
  referenceUnit: string | null; referenceDescription: string; manualUnit: boolean;
};
export const apartmentCodes = APARTMENT_REQUIREMENTS.map(r => APARTMENT_EDITION_PREFIX + r[3]);
const valid = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0 && n <= 1_000_000;
const priceOf = (n: ApartmentCatalogRow["prezzo"]) => n == null || n === "" ? null : valid(Number(n)) ? Number(n) : null;

export function buildApartmentLines(source: ApartmentSource, catalog: ApartmentCatalogRow[], measurements: ApartmentMeasurements,
  overrides: Partial<Record<ApartmentKey, ApartmentOverride>> = {}, editionAccepted = false): ApartmentLine[] {
  return APARTMENT_REQUIREMENTS.filter(([key]) => measurements[key] !== 0).map(([key, originalTitle, expectedUnit, suffix]) => {
    const code = APARTMENT_EDITION_PREFIX + suffix;
    const matches = catalog.filter(r => r.fonte_id === source.id && r.codice === code);
    const reference = matches.length === 1 ? matches[0] : undefined;
    const override = overrides[key];
    const title = override?.title ?? originalTitle;
    const unit = override?.unit ?? expectedUnit;
    const manualUnit = override?.unit != null && !unitaCompatibili(reference?.unita_misura, unit);
    const manualConversion = manualUnit && Object.hasOwn(override ?? {}, "quantity") && Object.hasOwn(override ?? {}, "price");
    const quantity = override && Object.hasOwn(override, "quantity") ? override.quantity ?? null : measurements[key] ?? null;
    const referencePrice = reference ? priceOf(reference.prezzo) : null;
    const manualPrice = !!override && Object.hasOwn(override, "price");
    const price = manualPrice ? override?.price ?? null : referencePrice;
    const issue = source.regione !== "Lombardia" || source.anno !== 2025 || source.stato !== "pubblicato"
      ? "Edizione non supportata da questo caso: nessuna sostituzione automatica dei codici."
      : !editionAccepted ? "Conferma l’edizione disponibile, diversa dall’anno corrente."
      : !reference ? matches.length > 1 ? "Codice duplicato: riferimento ambiguo." : "Voce non trovata nell’edizione selezionata."
      : !title.trim() || title.length > 200 ? "Inserisci un titolo (massimo 200 caratteri)."
      : !unit.trim() || unit.length > 24 ? "Inserisci un’unità di misura valida."
      : !unitaCompatibili(reference.unita_misura, unit) && !manualConversion ? "Unità di misura mancante o incompatibile. Reimposta esplicitamente quantità e prezzo per una voce manuale."
      : !valid(quantity) ? "Misura da confermare."
      : !valid(price) ? "Prezzo da verificare (non è una voce gratuita)." : null;
    return { key, title, unit, code, quantity, price, description: override?.description ?? reference?.descrizione ?? "", issue,
      included: !issue && override?.approved === true, manualPrice, referenceId: reference?.id ?? null,
      sourceId: source.id, referencePrice, referenceUnit: reference?.unita_misura ?? null, referenceDescription: reference?.descrizione ?? "", manualUnit };
  });
}

export function apartmentQuoteItems(lines: ApartmentLine[]): QuoteItemPro[] {
  return lines.filter(r => r.included).map((r, index) => ({
    client_temp_id: `${r.sourceId}:${r.key}`, item_type: "service", item_category: "posa",
    name: r.title, description: `${r.code} · ${r.manualUnit ? "Voce manuale: unità modificata, prezzo non confrontabile direttamente con il riferimento regionale" : r.manualPrice ? "Prezzo modificato manualmente; riferimento regionale conservato" : "Prezzo dal prezzario selezionato"}. ${r.description}`,
    quantity: r.quantity!, unit_price: r.price!, unit_of_measure: r.unit, discount_percent: 0,
    // Net-only simulation. Zero is an engine placeholder, NOT a fiscal decision.
    vat_rate: 0, sort_order: index, prezzo_acquisto: null, mostra_nel_pdf: true, is_optional: false,
  } as QuoteItemPro));
}

export type ApartmentStep = "request" | "floor" | "paint" | "tiles" | "layout" | "fixtures" | "review";
export type ApartmentConversation = { step: ApartmentStep; measurements: ApartmentMeasurements };
export const apartmentQuestions: Record<ApartmentStep, string> = {
  request: "Descrivi il caso. Questa prova guidata copre un trilocale di 80 m² con un bagno; non è ancora una chat LLM libera.",
  floor: "Gli 80 m² sono netti di pavimento? Vuoi rimuovere e rifare il pavimento oppure mantenerlo? Nessuna misura viene ricavata automaticamente dalla superficie commerciale.",
  paint: "Quanti m² di pareti e soffitti vanno tinteggiati? Indica la superficie misurata, oppure «non so». Preparazione e isolamento sono ancora da valutare.",
  tiles: "Quanti m² di rivestimento bagno vuoi rimuovere e rifare? Non sono i m² del pavimento. Scrivi una misura oppure «non so».",
  layout: "La distribuzione resta invariata? Altrimenti indica separatamente m² di tramezzi da demolire e m² di nuovi divisori. Le specifiche tecniche andranno confermate.",
  fixtures: "Indica le quantità: WC, lavabo, bidet e piatto doccia. Per esempio «1 WC, 1 lavabo, 0 bidet, 1 doccia». Misure e modelli vanno verificati sulle voci; impianti e rubinetti sono separati.",
  review: "Ho preparato le voci candidate. Apri le specifiche e conferma quelle adatte: solo le voci confermate entrano nel parziale a destra. Impianti, smaltimenti e altri completamenti non sono inclusi: non è il prezzo di una ristrutturazione completa.",
};
const unknown = (text: string) => /^(non so|da definire|non conosco)[.!]?$/i.test(text.trim());
function area(text: string) {
  // Deliberately narrow in the guided prototype: ranges, negations, room
  // counts, dimensions and thousands separators must not become measurements.
  const match = text.trim().match(/^(\d+(?:[.,]\d{1,2})?)\s*(?:mq|m²|m2)$/i);
  if (!match) return null;
  const n = Number(match[1].replace(",", "."));
  return valid(n) ? n : null;
}
export function advanceApartment(state: ApartmentConversation, input: string): { next: ApartmentConversation; reply: string } {
  const text = input.trim().toLowerCase();
  const unchanged = (reply: string) => ({ next: state, reply });
  if (!text || text.length > 3000) return unchanged("Scrivi una risposta breve (massimo 3.000 caratteri).");
  if (/amianto|eternit|materiali pericolosi/.test(text)) return unchanged("Possibile materiale pericoloso: prima serve una verifica tecnica dedicata. Non applico prezzi o maggiorazioni automatiche.");
  if (state.step === "review") return unchanged("Per modificare usa le misure e i prezzi delle singole voci. Non sovrascrivo le tue modifiche con un’altra risposta generica.");
  const measures = { ...state.measurements };
  let nextStep: ApartmentStep;
  if (state.step === "request") {
    if (!/80\s*(?:mq|m²|m2)/.test(text) || !/ristruttur/.test(text)) return unchanged("Per questa prova usa il caso ristrutturazione di 80 mq. Gli altri lavori restano nelle simulazioni sintetiche.");
    nextStep = "floor";
  } else if (state.step === "floor") {
    if (unknown(text)) { nextStep = "paint"; }
    else {
      const floorAnswer = text.match(/^80\s*(?:mq|m²|m2)\s+netti[,;]?\s+(rimuovo e rifaccio|mantengo il pavimento)[.!]?$/);
      const qty = floorAnswer ? 80 : null;
      const remove = floorAnswer?.[1] === "rimuovo e rifaccio"; const keep = floorAnswer?.[1] === "mantengo il pavimento";
      if (qty !== 80 || !/nett/.test(text) || remove === keep) return unchanged("Conferma «80 mq netti, rimuovo e rifaccio» oppure «80 mq netti, mantengo il pavimento». Se non sai la superficie netta, rispondi «non so».");
      measures.floorRemoval = remove ? qty : 0; measures.floor = remove ? qty : 0; measures.screed = remove ? qty : 0;
      nextStep = "paint";
    }
  } else if (state.step === "paint" || state.step === "tiles") {
    const qty = area(text);
    if (!unknown(text) && qty == null) return unchanged("Indica una sola superficie in mq, oppure «non so». Non userò una stima nascosta.");
    if (state.step === "paint") { measures.paint = qty; nextStep = "tiles"; }
    else { measures.tiles = qty; measures.tileRemoval = qty; nextStep = "layout"; }
  } else if (state.step === "layout") {
    if (/^invariata[.!]?$/.test(text)) { measures.partition = 0; measures.partitionRemoval = 0; }
    else if (!unknown(text)) {
      const parts = text.split(";").map(t => t.trim());
      const demo = parts.length === 2 ? parts[0].match(/^(\d+(?:[.,]\d{1,2})?)\s*(?:mq|m²|m2)\s*(?:di\s*)?demolizione$/) : null;
      const partition = parts.length === 2 ? parts[1].match(/^(\d+(?:[.,]\d{1,2})?)\s*(?:mq|m²|m2)\s*(?:di\s*)?cartongesso$/) : null;
      if (!demo || !partition || !valid(Number(demo[1].replace(",", "."))) || !valid(Number(partition[1].replace(",", ".")))) return unchanged("Scrivi «invariata», «non so» oppure «12 mq demolizione; 12 mq cartongesso», con le tue misure effettive.");
      measures.partitionRemoval = Number(demo[1].replace(",", ".")); measures.partition = Number(partition[1].replace(",", "."));
    }
    nextStep = "fixtures";
  } else {
    if (!unknown(text)) {
      if (!/^\d+\s+wc,\s*\d+\s+lavabo,\s*\d+\s+bidet,\s*\d+\s+doccia$/.test(text)) return unchanged("Usa il formato «1 WC, 1 lavabo, 0 bidet, 1 doccia», oppure «non so». Non deduco quantità da un testo ambiguo.");
      const fields = [["wc", "wc"], ["basin", "lavabo"], ["bidet", "bidet"], ["shower", "doccia"]] as const;
      for (const [key, label] of fields) {
        const matches = [...text.matchAll(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s+${label}\\b`, "g"))];
        const n = matches.length === 1 ? Number(matches[0][1].replace(",", ".")) : NaN;
        if (!Number.isInteger(n) || n < 0 || n > 10) return unchanged("Indica una quantità intera per ciascuno: WC, lavabo, bidet, doccia (0 se non previsto), oppure «non so».");
        measures[key] = n;
      }
    }
    nextStep = "review";
  }
  return { next: { step: nextStep, measurements: measures }, reply: apartmentQuestions[nextStep] };
}

export const APARTMENT_GAPS = [
  "Letto di posa, sottofondi e assistenze: verificare soluzione e doppie contabilizzazioni",
  "Impianto elettrico: punti, quadro, tracce e dichiarazioni",
  "Impianto idrico/scarichi, rubinetti, cassetta WC e box doccia",
  "Impermeabilizzazioni e ripristino supporti del bagno",
  "Preparazione, rasatura e isolamento prima della pittura",
  "Oneri di smaltimento, protezioni e logistica: controllare cosa è già incluso nelle singole voci",
  "Riscaldamento, climatizzazione, serramenti e porte: definire perimetro",
  "Pratiche, tecnici e sicurezza specifica del cantiere",
  "Costi aziendali e ore squadra: non ricavabili dal prezzo regionale; margine non calcolato",
  "Cronoprogramma: disponibilità, dipendenze, produttività e tempi di asciugatura da definire",
  "IVA da verificare: il parziale è solo netto, non un’aliquota zero",
] as const;

export const apartmentSimulations = [
  { name: "Base · 80 m², un bagno", answers: ["Ristrutturazione completa 80 mq trilocale con un bagno in Lombardia", "80 mq netti, rimuovo e rifaccio", "240 mq", "22 mq", "invariata", "1 WC, 1 lavabo, 1 bidet, 1 doccia"] },
  { name: "Misure ancora sconosciute", answers: ["Ristrutturazione completa 80 mq", "non so", "non so", "non so", "non so", "non so"] },
  { name: "Mantengo il pavimento", answers: ["Ristrutturazione completa 80 mq", "80 mq netti, mantengo il pavimento", "240 mq", "22 mq", "invariata", "1 WC, 1 lavabo, 0 bidet, 1 doccia"] },
  { name: "Cambio la distribuzione", answers: ["Ristrutturazione completa 80 mq", "80 mq netti, rimuovo e rifaccio", "260 mq", "24 mq", "12 mq demolizione; 12 mq cartongesso", "1 WC, 1 lavabo, 1 bidet, 1 doccia"] },
] as const;
