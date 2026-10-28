import { type EvidenzaFascicolo, evidenzaPertinente } from "./fascicolo";
import { type DocumentoSicurezza, statoScadenza } from "./documentiSicurezza";
export const STATI_QUADRO = {
  da_ricevere: "Da ricevere",
  da_verificare: "Da verificare",
  integrazione: "Da integrare",
  scaduto: "Scaduto",
  in_scadenza: "In scadenza",
  verificato: "Verifica registrata",
  non_applicabile: "Esclusione motivata",
  archivio: "Da riconciliare",
} as const;
export type StatoQuadro = keyof typeof STATI_QUADRO;
export interface RigaQuadroDocumentale {
  chiave: string;
  id: string;
  titolo: string;
  tipo: string;
  stato: StatoQuadro;
  origine: "fascicolo" | "archivio";
  subId: string | null;
  personaId: string | null;
  faseId: string | null;
  dal: string | null;
  al: string | null;
  scadenza: string | null;
  termine: string | null;
  referente: string | null;
  origineDaChiarire: boolean;
  haFile: boolean;
  ordineFonte: string | null;
}
export interface ContestoQuadro {
  companyId: string;
  orderId: string;
  oggi: string;
  faseId?: string;
  operaiIds: string[];
  impreseIds: string[];
}
function statoRegistrato(e: EvidenzaFascicolo, oggi: string): StatoQuadro {
  if (e.stato === "non_applicabile") {
    return e.note?.trim() ? "non_applicabile" : "integrazione";
  }
  if (e.stato === "integrazione") return "integrazione";
  if (e.data_scadenza && statoScadenza(e.data_scadenza, oggi) === "scaduto") {
    return "scaduto";
  }
  if (!e.file_path?.trim()) {
    return e.stato === "verificato" || e.stato === "ricevuto"
      ? "integrazione"
      : "da_ricevere";
  }
  if (
    e.stato !== "verificato" || !e.verificato_da || !e.verificato_il ||
    e.origine_requisito === "da_verificare"
  ) return "da_verificare";
  return statoScadenza(e.data_scadenza, oggi) === "in_scadenza"
    ? "in_scadenza"
    : "verificato";
}
/** Operational index of existing records, not a legal-requirements generator. No cross-case substitution. */
export function quadroDocumentale(
  c: ContestoQuadro,
  evidenze: readonly EvidenzaFascicolo[],
  documenti: readonly DocumentoSicurezza[],
): RigaQuadroDocumentale[] {
  const righe: RigaQuadroDocumentale[] = [];
  const visti = new Set<string>();
  const soloCantiere = new Set([
    "psc",
    "pos",
    "pos_impresa",
    "pimus",
    "notifica_preliminare",
    "fascicolo_opera",
    "verbale_coordinamento",
    "piano_emergenza",
  ]);
  for (const e of evidenze) {
    if (
      !e.order_id && soloCantiere.has(e.tipo) || e.company_id !== c.companyId ||
      e.stato === "superato" ||
      e.subappaltatore_id && !c.impreseIds.includes(e.subappaltatore_id) ||
      !evidenzaPertinente(e, c.orderId, c.operaiIds, {
        data: c.oggi,
        faseId: c.faseId,
      })
    ) continue;
    const k = `fascicolo:${e.id}`;
    if (visti.has(k)) continue;
    visti.add(k);
    righe.push({
      chiave: k,
      id: e.id,
      titolo: e.titolo,
      tipo: e.tipo,
      stato: statoRegistrato(e, c.oggi),
      origine: "fascicolo",
      subId: e.subappaltatore_id,
      personaId: e.operaio_id,
      faseId: e.fase_id || null,
      dal: e.applicabile_dal || null,
      al: e.applicabile_al || null,
      scadenza: e.data_scadenza,
      termine: e.termine,
      referente: e.referente,
      origineDaChiarire: e.origine_requisito === "da_verificare",
      haFile: !!e.file_path?.trim(),
      ordineFonte: e.order_id,
    });
  }
  // Sources without a native review remain separate until explicitly reconciled.
  for (const d of documenti) {
    if (
      d.fonte === "fascicolo_cantiere" ||
      d.order_id && d.order_id !== c.orderId ||
      !d.order_id && soloCantiere.has(d.tipo) ||
      d.subappaltatore_id && !c.impreseIds.includes(d.subappaltatore_id)
    ) continue;
    const k = `archivio:${d.fonte || "sicurezza"}:${d.id}`;
    if (visti.has(k)) continue;
    visti.add(k);
    righe.push({
      chiave: k,
      id: d.id,
      titolo: d.titolo,
      tipo: d.tipo,
      stato:
        d.data_scadenza && statoScadenza(d.data_scadenza, c.oggi) === "scaduto"
          ? "scaduto"
          : "archivio",
      origine: "archivio",
      subId: d.subappaltatore_id,
      personaId: null,
      faseId: null,
      dal: null,
      al: null,
      scadenza: d.data_scadenza,
      termine: null,
      referente: null,
      origineDaChiarire: true,
      haFile: !!d.file_path?.trim(),
      ordineFonte: d.order_id,
    });
  }
  const priorita: Record<StatoQuadro, number> = {
    scaduto: 0,
    integrazione: 1,
    da_ricevere: 2,
    da_verificare: 3,
    in_scadenza: 4,
    archivio: 5,
    verificato: 6,
    non_applicabile: 7,
  };
  return righe.sort((a, b) =>
    priorita[a.stato] - priorita[b.stato] ||
    (a.termine || "9999").localeCompare(b.termine || "9999") ||
    a.titolo.localeCompare(b.titolo, "it") || a.chiave.localeCompare(b.chiave)
  );
}
export function riepilogoQuadro(righe: readonly RigaQuadroDocumentale[]) {
  return {
    registrati: righe.filter((r) => r.origine === "fascicolo").length,
    daRicevere: righe.filter((r) => r.stato === "da_ricevere").length,
    daVerificare:
      righe.filter((r) =>
        r.stato === "da_verificare" || r.stato === "integrazione"
      ).length,
    scadenze:
      righe.filter((r) => r.stato === "scaduto" || r.stato === "in_scadenza")
        .length,
    archivio: righe.filter((r) => r.origine === "archivio").length,
  };
}
