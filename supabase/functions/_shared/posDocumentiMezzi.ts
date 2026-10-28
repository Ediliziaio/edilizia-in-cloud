/** Safe operational projections. File paths, prices, employee IDs and private notes are excluded. */
export interface DocumentoMezzoPos {
  id: string;
  mezzo_id: string;
  categoria: string;
  titolo: string;
  ente: string | null;
  data_inizio: string | null;
  data_scadenza: string | null;
  file_name: string;
  disponibile: boolean;
  impronta: string;
  revisione_dichiarata: string;
  confermata: boolean;
}
export interface ControlliMezzoPos {
  mezzo_id: string;
  manutenzioni: Array<{
    id: string;
    tipo: string;
    data: string;
    contatore: string | null;
    prossima_data: string | null;
    prossimo_contatore: string | null;
  }>;
  segnalazioni: Array<{
    id: string;
    tipo: string;
    stato: string;
    creata_il: string;
    chiusa_il: string | null;
  }>;
  impronta: string;
}
export interface DocumentazioneMezzoPos {
  modalita: "da_verificare" | "documenti" | "altra_gestione";
  motivazione: string;
  documenti: DocumentoMezzoPos[];
  controlli: ControlliMezzoPos | null;
  riesame_controlli: string;
  confermata: boolean;
}
export const CATEGORIE_DOCUMENTO_MEZZO_POS = [
  "revisione",
  "verifica_periodica",
  "libretto",
  "taratura",
  "manuale_ce",
  "pimus",
  "autorizzazione_ministeriale",
] as const;
const o = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const s = (v: unknown) => (typeof v === "string" ? v : "");
const n = (v: unknown) => (typeof v === "string" && v ? v : null);
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
export function normalizzaDocumentoMezzo(v: unknown): DocumentoMezzoPos {
  const a = o(v);
  return {
    id: s(a.id),
    mezzo_id: s(a.mezzo_id),
    categoria: s(a.categoria),
    titolo: s(a.titolo),
    ente: n(a.ente),
    data_inizio: n(a.data_inizio),
    data_scadenza: n(a.data_scadenza),
    file_name: s(a.file_name),
    disponibile: a.disponibile === true,
    impronta: s(a.impronta),
    revisione_dichiarata: s(a.revisione_dichiarata),
    confermata: a.confermata === true,
  };
}
export function normalizzaControlliMezzo(v: unknown): ControlliMezzoPos {
  const a = o(v);
  return {
    mezzo_id: s(a.mezzo_id),
    impronta: s(a.impronta),
    manutenzioni: arr(a.manutenzioni).map((x) => {
      const r = o(x);
      return {
        id: s(r.id),
        tipo: s(r.tipo),
        data: s(r.data),
        contatore: n(r.contatore),
        prossima_data: n(r.prossima_data),
        prossimo_contatore: n(r.prossimo_contatore),
      };
    }),
    segnalazioni: arr(a.segnalazioni).map((x) => {
      const r = o(x);
      return {
        id: s(r.id),
        tipo: s(r.tipo),
        stato: s(r.stato),
        creata_il: s(r.creata_il),
        chiusa_il: n(r.chiusa_il),
      };
    }),
  };
}
export function normalizzaDocumentazioneMezzo(
  v: unknown,
): DocumentazioneMezzoPos {
  const a = o(v);
  return {
    modalita:
      a.modalita === "documenti" || a.modalita === "altra_gestione"
        ? a.modalita
        : "da_verificare",
    motivazione: s(a.motivazione),
    documenti: arr(a.documenti).map(normalizzaDocumentoMezzo),
    controlli:
      a.controlli && typeof a.controlli === "object"
        ? normalizzaControlliMezzo(a.controlli)
        : null,
    riesame_controlli: s(a.riesame_controlli),
    confermata: a.confermata === true,
  };
}
const uuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const hash = (v: string) => /^[0-9a-f]{64}$/i.test(v);
export function erroriDocumentazioneMezzo(
  v: DocumentazioneMezzoPos | undefined,
  mezzoId: string | null,
  dal: string,
  al: string,
) {
  const e: string[] = [];
  if (!v || v.modalita === "da_verificare")
    return [
      "scegli e riesamina la documentazione della specifica attrezzatura",
    ];
  if (!v.confermata)
    e.push("conferma documenti e controlli tecnici selezionati");
  if (!v.riesame_controlli.trim())
    e.push(
      "descrivi il riesame dei controlli, le criticità e le azioni necessarie",
    );
  if (v.modalita === "documenti") {
    if (!mezzoId || !uuid(mezzoId))
      e.push("collega prima l’identità d’inventario dell’attrezzatura");
    if (!v.documenti.length || v.documenti.length > 20)
      e.push("collega da uno a venti documenti tecnici pertinenti");
    if (new Set(v.documenti.map((d) => d.id)).size !== v.documenti.length)
      e.push("rimuovi i documenti duplicati");
  } else {
    if (!v.motivazione.trim())
      e.push(
        "motiva l’altra gestione documentale e indica le fonti pertinenti",
      );
    if (v.documenti.length)
      e.push("rimuovi i documenti prima di dichiarare un’altra gestione");
  }
  if (mezzoId) {
    if (
      !v.controlli ||
      v.controlli.mezzo_id !== mezzoId ||
      !hash(v.controlli.impronta)
    )
      e.push("rileggi i controlli della specifica attrezzatura");
  } else if (v.controlli)
    e.push(
      "rimuovi i controlli di inventario quando l’attrezzatura non è censita",
    );
  for (const d of v.documenti) {
    if (
      !uuid(d.id) ||
      !hash(d.impronta) ||
      d.mezzo_id !== mezzoId ||
      !CATEGORIE_DOCUMENTO_MEZZO_POS.some((x) => x === d.categoria)
    )
      e.push("documento tecnico non pertinente alla specifica attrezzatura");
    if (!d.disponibile || !d.file_name.trim())
      e.push("originale del documento tecnico non disponibile");
    if (!d.revisione_dichiarata.trim() || !d.confermata)
      e.push(
        "indica la revisione letta nel documento e conferma la pertinenza",
      );
    if (
      (dal && d.data_inizio && d.data_inizio > dal) ||
      (al && d.data_scadenza && d.data_scadenza < al)
    )
      e.push("documento non valido per tutto il periodo d’uso dichiarato");
  }
  return [...new Set(e)];
}
/** Warnings describe stored facts, never a verdict of fitness or permission to operate. */
export function avvisiControlliMezzo(
  v: ControlliMezzoPos,
  allaData: string,
  contatore: string | null,
) {
  const e: string[] = [];
  if (v.segnalazioni.some((s) => s.stato !== "chiusa"))
    e.push("Sono presenti segnalazioni da riesaminare nell’inventario");
  for (const m of v.manutenzioni) {
    if (m.prossima_data && allaData && m.prossima_data < allaData)
      e.push(
        "Una scadenza di manutenzione registrata precede il periodo d’uso",
      );
    if (
      m.prossimo_contatore !== null &&
      contatore !== null &&
      Number.isFinite(Number(m.prossimo_contatore)) &&
      Number.isFinite(Number(contatore)) &&
      Number(contatore) >= Number(m.prossimo_contatore)
    )
      e.push(
        "Il contatore corrente raggiunge una soglia di manutenzione registrata",
      );
  }
  return [...new Set(e)];
}
export const supportaDocumentiMezziPos = (b: Record<string, unknown>) =>
  b.versione_client === 2 &&
  b.versione_tecnica_client === 1 &&
  b.versione_mezzi_client === 1 &&
  b.versione_documenti_mezzi_client === 1;
