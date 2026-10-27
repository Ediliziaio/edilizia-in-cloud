import { z } from "zod";

export const SCENARI_ESISTENTI = {
  alluminio_freddo: { nome: "Alluminio senza taglio termico", immagine: "/pdf-stock/serramenti/esistente-alluminio-v1.png",
    titolo: "Dal metallo continuo a un sistema progettato per isolare.",
    descrizione: "Il telaio metallico privo di interruzione termica conduce il calore tra interno ed esterno. Vetro, giunti e stato delle guarnizioni completano il quadro da verificare sul posto." },
  legno: { nome: "Legno esistente", immagine: "/pdf-stock/serramenti/esistente-legno-v1.png",
    titolo: "Conservare il carattere della casa, ripensare la finestra.",
    descrizione: "Il legno e' gia un materiale isolante: l'eta non basta a giudicare il serramento. Vetro, tenute, ferramenta e manutenzione permettono di valutare cosa conservare e cosa migliorare." },
  pvc: { nome: "PVC esistente", immagine: "/pdf-stock/serramenti/esistente-pvc-v1.png",
    titolo: "Non basta cambiare PVC: serve una configurazione migliore.",
    descrizione: "Due finestre in PVC possono avere prestazioni diverse. Il confronto riguarda vetro, profilo, guarnizioni, ferramenta e posa: un prodotto piu recente non e' automaticamente migliore." },
  altro: { nome: "Altro / da rilevare", immagine: null as string | null,
    titolo: "Il punto di partenza si verifica, non si presume.", descrizione: "Materiale, vetro e condizioni dell'infisso devono essere identificati prima di attribuire prestazioni o vantaggi numerici alla sostituzione." },
} as const;
export const PROBLEMI_INFISSI = { freddo: "Freddo vicino alla finestra", spifferi: "Spifferi rilevati", rumore: "Rumore percepito", manutenzione: "Manutenzione frequente", apertura: "Difficolta di apertura" } as const;
export const OBIETTIVI_INFISSI = {
  freddo: "Vivere meglio anche vicino alla finestra: valutare la trasmittanza del sistema completo, non del solo vetro.",
  spifferi: "Ripensare tenute e raccordi per limitare i passaggi d'aria indesiderati, con controlli previsti alla consegna.",
  rumore: "Scegliere vetro e tenute in funzione del contesto acustico. Le prestazioni vanno documentate per la configurazione proposta.",
  manutenzione: "Una cura piu consapevole: conoscere finiture, regolazioni e manutenzioni richieste prima della scelta.",
  apertura: "Ritrovare gesti semplici: aperture, ferramenta e ingombri da verificare vano per vano.",
} as const;
export const LAVORAZIONI_POSA = { rimozione: "Rimozione dei vecchi infissi", controtelaio: "Intervento sul controtelaio", sigillature: "Fissaggi e sigillature", smaltimento: "Trasporto e smaltimento", ripristini: "Ripristini di intonaci e finiture", cassonetti: "Intervento sui cassonetti" } as const;
export const POSA_STANDARD: AnalisiIntervento["posa"] = Object.freeze({ rimozione: "inclusa", controtelaio: "inclusa", sigillature: "inclusa", smaltimento: "inclusa", ripristini: "inclusa", cassonetti: "da_definire" });
const positivo = z.number().finite().min(0).max(20).nullable();
const statoPosa = z.enum(["inclusa", "esclusa", "da_definire"]);
export const schemaAnalisiIntervento = z.object({
  versione: z.literal(1), attiva: z.boolean(), mostraConfronto: z.boolean(), esistente: z.enum(["alluminio_freddo", "legno", "pvc", "altro"]),
  vetro: z.enum(["singolo", "doppio", "triplo", "da_rilevare"]),
  problemi: z.array(z.enum(["freddo", "spifferi", "rumore", "manutenzione", "apertura"])).max(5),
  uwPrima: positivo, fontePrima: z.string().max(300), uwDopo: positivo, fonteDopo: z.string().max(300),
  motivo: z.string().max(1200), noteRilievo: z.string().max(1200),
  posa: z.object({ rimozione: statoPosa, controtelaio: statoPosa, sigillature: statoPosa, smaltimento: statoPosa, ripristini: statoPosa, cassonetti: statoPosa }),
  risparmio: z.object({ uwAttuale: positivo, uwNuovo: positivo, bolletta: z.number().finite().min(0).max(1000000), m2Casa: z.number().finite().positive().max(100000),
    zona: z.enum(["A", "B", "C", "D", "E", "F"]), superficie: z.number().finite().min(0).max(100000), fonteBolletta: z.enum(["stimata", "cliente"]) }).nullable(),
});
export type AnalisiIntervento = z.infer<typeof schemaAnalisiIntervento>;
export function leggiAnalisiIntervento(value: unknown): AnalisiIntervento | null {
  const r = schemaAnalisiIntervento.safeParse(value); return r.success ? r.data : null;
}
export function nuovaAnalisiIntervento(): AnalisiIntervento {
  return { versione: 1, attiva: true, mostraConfronto: true, esistente: "altro", vetro: "da_rilevare", problemi: [], uwPrima: null, fontePrima: "", uwDopo: null, fonteDopo: "", motivo: "", noteRilievo: "",
    posa: { ...POSA_STANDARD }, risparmio: null };
}
export function confrontoUw(a: AnalisiIntervento) {
  if (!(a.uwPrima && a.uwDopo && a.fontePrima.trim() && a.fonteDopo.trim())) return null;
  return { prima: a.uwPrima, dopo: a.uwDopo, riduzione: Math.round((1 - a.uwDopo / a.uwPrima) * 100) };
}
export function completaUwDaScheda(a: AnalisiIntervento, linee: readonly { nome: string; dati: Array<{ etichetta: string; valore: string }> }[]): AnalisiIntervento {
  if (a.uwDopo != null || linee.length !== 1) return a;
  const dato = linee[0].dati.find(d => /^uw$/i.test(d.etichetta.trim()));
  const valore = dato?.valore.match(/^\s*(\d+(?:[.,]\d+)?)\s*(?:W|$)/i)?.[1];
  const uw = valore ? Number(valore.replace(",", ".")) : NaN;
  return Number.isFinite(uw) && uw > 0 && uw <= 20 ? { ...a, uwDopo: uw, fonteDopo: `Scheda linea selezionata: ${linee[0].nome}`.slice(0, 300) } : a;
}
export function beneficioMateriale(materiale: string | null | undefined) {
  const m = (materiale ?? "").toLowerCase();
  if (m.includes("pvc")) return "PVC, vetro e tenute lavorano insieme. Il valore della proposta sta nella configurazione documentata, nelle finiture scelte e nella cura dei raccordi di posa, non nel solo nome del materiale.";
  if (m.includes("alluminio")) return "La proposta identifica il sistema di alluminio e la configurazione del vetro. Presenza del taglio termico, prestazioni e finiture devono risultare dalla documentazione del modello scelto.";
  if (m.includes("legno")) return "Il sistema in legno unisce carattere materico e configurazione tecnica: vetro, protezioni superficiali, ferramenta e manutenzione vanno confrontati sulla scheda della fornitura.";
  return "La soluzione e' quella identificata nell'abaco: modello, vetro, aperture, finiture e lavorazioni devono essere letti insieme. Le prestazioni sono quelle documentate per la configurazione scelta.";
}
export const FONTE_STANDARD_INFISSI = "https://www.energy.gov/energysaver/window-types-and-technologies";
export function avvisoIpotesi(a: AnalisiIntervento | null, superficie?: number): string | null {
  const r = a?.risparmio; if (!r) return null;
  if (superficie != null && Math.abs(superficie - r.superficie) >= 0.01)
    return "La composizione e' cambiata rispetto alla stima salvata: ricalcolare il risparmio prima della conferma.";
  if ((a.uwPrima && a.uwPrima !== r.uwAttuale) || (a.uwDopo && a.uwDopo !== r.uwNuovo))
    return "Gli Uw del confronto differiscono dalle ipotesi economiche: verificare con il consulente il perimetro della stima.";
  return null;
}
