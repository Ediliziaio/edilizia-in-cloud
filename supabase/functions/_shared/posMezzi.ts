/** Operational identity only: no prices, HR profiles, private notes or storage paths. */
export interface MezzoFontePos {
  mezzo_id: string;
  fonte_tipo: "assegnazione" | "allocazione" | "corrente" | "su_mezzo_corrente";
  fonte_id: string;
  order_id: string;
  nome: string;
  codice: string | null;
  marca: string | null;
  modello: string | null;
  matricola: string | null;
  targa: string | null;
  tipo: string;
  stato: string;
  gestione: string;
  quantita: string;
  unita: string | null;
  dal: string | null;
  al: string | null;
  su_mezzo_id: string | null;
  contatore: string | null;
  contatore_unita: string;
  impronta: string;
}
export interface SceltaMezzoPos {
  modalita: "da_verificare" | "inventario" | "non_censita";
  motivazione: string;
  utilizzo_dal: string;
  utilizzo_al: string;
  quantita_usata: number | null;
  confermata: boolean;
  fonte: MezzoFontePos | null;
}
const o = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const s = (v: unknown) => (typeof v === "string" ? v : "");
const n = (v: unknown) => (typeof v === "string" && v ? v : null);
export function normalizzaMezzoFonte(v: unknown): MezzoFontePos {
  const a = o(v);
  return {
    mezzo_id: s(a.mezzo_id),
    fonte_tipo: [
      "assegnazione",
      "allocazione",
      "corrente",
      "su_mezzo_corrente",
    ].includes(s(a.fonte_tipo))
      ? (a.fonte_tipo as MezzoFontePos["fonte_tipo"])
      : "corrente",
    fonte_id: s(a.fonte_id),
    order_id: s(a.order_id),
    nome: s(a.nome),
    codice: n(a.codice),
    marca: n(a.marca),
    modello: n(a.modello),
    matricola: n(a.matricola),
    targa: n(a.targa),
    tipo: s(a.tipo),
    stato: s(a.stato),
    gestione: s(a.gestione),
    quantita: s(a.quantita),
    unita: n(a.unita),
    dal: n(a.dal),
    al: n(a.al),
    su_mezzo_id: n(a.su_mezzo_id),
    contatore: n(a.contatore),
    contatore_unita: s(a.contatore_unita),
    impronta: s(a.impronta),
  };
}
export function normalizzaSceltaMezzo(v: unknown): SceltaMezzoPos {
  const a = o(v);
  return {
    modalita:
      a.modalita === "inventario" || a.modalita === "non_censita"
        ? a.modalita
        : "da_verificare",
    motivazione: s(a.motivazione),
    utilizzo_dal: s(a.utilizzo_dal),
    utilizzo_al: s(a.utilizzo_al),
    quantita_usata:
      typeof a.quantita_usata === "number" && Number.isFinite(a.quantita_usata)
        ? a.quantita_usata
        : null,
    confermata: a.confermata === true,
    fonte:
      a.fonte && typeof a.fonte === "object"
        ? normalizzaMezzoFonte(a.fonte)
        : null,
  };
}
const uuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function data(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === v;
}
export function erroriSceltaMezzo(
  v: SceltaMezzoPos | undefined,
  inizio: string,
  fine: string,
  ordine?: string,
) {
  const e: string[] = [];
  if (!v || v.modalita === "da_verificare")
    return [
      "identifica l’attrezzatura effettiva nell’inventario o motiva perché non è censita",
    ];
  if (
    !data(v.utilizzo_dal) ||
    !data(v.utilizzo_al) ||
    v.utilizzo_al < v.utilizzo_dal
  )
    e.push("indica un intervallo d’uso valido");
  if (
    data(v.utilizzo_dal) &&
    data(v.utilizzo_al) &&
    (v.utilizzo_dal < inizio || (fine && v.utilizzo_al > fine))
  )
    e.push("uso dell’attrezzatura fuori dal periodo del POS");
  if (!v.confermata) e.push("conferma identità, assegnazione e periodo d’uso");
  if (
    v.quantita_usata === null ||
    !Number.isFinite(v.quantita_usata) ||
    v.quantita_usata <= 0
  )
    e.push("indica la quantità effettivamente impiegata");
  if (v.modalita === "non_censita") {
    if (!v.motivazione.trim())
      e.push(
        "motiva l’attrezzatura non censita e identifica il titolare nei dati della scheda",
      );
    if (v.fonte)
      e.push("rimuovi la fonte prima di dichiarare l’attrezzatura non censita");
    return e;
  }
  const f = v.fonte;
  if (!f) return [...e, "seleziona la fonte dell’inventario"];
  if (
    !uuid(f.mezzo_id) ||
    !uuid(f.fonte_id) ||
    !/^[0-9a-f]{64}$/i.test(f.impronta) ||
    !f.nome.trim()
  )
    e.push("fonte dell’attrezzatura non valida");
  if (ordine && f.order_id !== ordine)
    e.push("assegnazione di un’altra commessa");
  if (f.stato !== "in_servizio")
    e.push("attrezzatura non in servizio: aggiorna e verifica l’anagrafica");
  if ((f.dal && f.dal > v.utilizzo_dal) || (f.al && f.al < v.utilizzo_al))
    e.push("assegnazione o allocazione non copre il periodo dichiarato");
  if (
    !Number.isFinite(Number(f.quantita)) ||
    Number(f.quantita) <= 0 ||
    (v.quantita_usata !== null && v.quantita_usata > Number(f.quantita))
  )
    e.push("quantità d’uso superiore a quella registrata per la fonte");
  if (f.fonte_tipo !== "allocazione" && v.quantita_usata !== 1)
    e.push("per un’attrezzatura singola la quantità d’uso deve essere uno");
  return e;
}
/** Identity is the canonical asset and its assignment, never the display name. */
export const chiaveFonteMezzo = (f: MezzoFontePos) =>
  `${f.mezzo_id}:${f.fonte_tipo}:${f.fonte_id}`;
export const etichettaFonteMezzo = (f: MezzoFontePos) =>
  [
    f.nome,
    f.codice || f.matricola || f.targa || f.mezzo_id,
    {
      assegnazione: "assegnazione registrata",
      allocazione: "allocazione a quantità",
      corrente: "collocazione corrente senza storico del periodo",
      su_mezzo_corrente: "caricata su un mezzo attualmente in commessa",
    }[f.fonte_tipo],
    `dal ${f.dal || "inizio non registrato"} al ${f.al || "fine non registrata"}`,
    `${f.quantita} ${f.unita || "unità"}`,
  ].join(" · ");
export const supportaMezziPos = (b: Record<string, unknown>) =>
  b.versione_client === 2 &&
  b.versione_tecnica_client === 1 &&
  b.versione_mezzi_client === 1;
