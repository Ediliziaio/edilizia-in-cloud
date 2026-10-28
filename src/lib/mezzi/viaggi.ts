export type FonteKm = "stimati" | "dichiarati";
export type DestinazioneTratta = "commessa" | "generale" | "da_attribuire";
export type StatoViaggio = "bozza" | "inviato" | "verificato" | "annullato";
export interface TrattaViaggio {
  id: string;
  da: string;
  a: string;
  order_id: string | null;
  destinazione: DestinazioneTratta;
  km: number | null;
  minuti: number | null;
  fonte: FonteKm;
}
export interface ViaggioPayload {
  partenza: string;
  arrivo: string;
  contatore_inizio: number | null;
  contatore_fine: number | null;
  note: string;
  tratte: TrattaViaggio[];
  tariffa_km?: number | null;
  conducente_hr_id?: string | null;
}
export interface Viaggio extends ViaggioPayload {
  id: string;
  company_id: string;
  mezzo_id: string;
  mezzo_nome: string;
  stato: StatoViaggio;
  versione: number;
  conducente: string | null;
  ambito_commessa?: boolean;
  updated_at: string;
}
export interface CantiereViaggio {
  id: string;
  label: string;
  indirizzo: string | null;
  lat: number | null;
  lng: number | null;
}
export interface ContestoViaggi {
  mezzo: {
    id: string;
    nome: string;
    contatore: number | null;
    contatore_unita: string;
    conducente: string | null;
    conducente_hr_id: string | null;
  };
  conducenti: { id: string; label: string }[];
  cantieri: CantiereViaggio[];
  altri_cantieri: boolean;
  sede: { label: string; lat: number | null; lng: number | null };
  puo_verificare: boolean;
  vede_costi: boolean;
  puo_scrivere: boolean;
}

export function numeroViaggio(value: string): number | null {
  if (!value.trim()) return null;
  // Decimal comma accepted; grouping is deliberately not guessed.
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim())) return NaN;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) && n <= 100000000 ? n : NaN;
}
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function riepilogoViaggio(
  v: Pick<ViaggioPayload, "tratte" | "contatore_inizio" | "contatore_fine"> &
    Partial<Pick<ViaggioPayload, "partenza" | "arrivo">>,
) {
  const note = v.tratte.filter((t) => t.km != null && Number.isFinite(t.km));
  const somma = (items: TrattaViaggio[]) =>
    items.length ? round(items.reduce((s, t) => s + t.km!, 0)) : null;
  const km = somma(note);
  const kmDichiarati = somma(note.filter((t) => t.fonte === "dichiarati"));
  const kmStimati = somma(note.filter((t) => t.fonte === "stimati"));
  const daAttribuire = v.tratte.filter(
    (t) =>
      t.destinazione === "da_attribuire" ||
      (t.destinazione === "commessa" && !t.order_id),
  );
  const mancanti = v.tratte.length - note.length;
  const delta =
    v.contatore_inizio != null && v.contatore_fine != null
      ? round(v.contatore_fine - v.contatore_inizio)
      : null;
  const scarto =
    delta != null && km != null && !mancanti ? round(delta - km) : null;
  const tappeDiscontinue = v.tratte.some(
    (t, i) =>
      i > 0 &&
      t.da.trim().toLocaleLowerCase("it-IT") !==
        v.tratte[i - 1].a.trim().toLocaleLowerCase("it-IT"),
  );
  const durata =
    v.partenza && v.arrivo
      ? (Date.parse(v.arrivo) - Date.parse(v.partenza)) / 60000
      : NaN;
  const tempiIncoerenti =
    Number.isFinite(durata) &&
    v.tratte.reduce((s, t) => s + (t.minuti ?? 0), 0) > durata + 1;
  return {
    km,
    kmDichiarati,
    kmStimati,
    mancanti,
    daAttribuire: daAttribuire.length,
    delta,
    scarto,
    tappeDiscontinue,
    tempiIncoerenti,
    daVerificare:
      !v.tratte.length ||
      mancanti > 0 ||
      daAttribuire.length > 0 ||
      kmStimati != null ||
      tappeDiscontinue ||
      tempiIncoerenti ||
      (scarto != null && Math.abs(scarto) > 0.1),
  };
}

export function erroriViaggio(v: ViaggioPayload): string[] {
  const errors: string[] = [];
  const start = Date.parse(v.partenza),
    end = Date.parse(v.arrivo);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    end - start > 48 * 3600000
  )
    errors.push("Indica partenza e arrivo in ordine, entro 48 ore.");
  if (start > Date.now() + 300000 || end > Date.now() + 300000)
    errors.push(
      "Registra un viaggio già effettuato, non una previsione futura.",
    );
  if (!v.tratte.length || v.tratte.length > 30)
    errors.push("Inserisci da 1 a 30 tratte.");
  for (const n of [
    v.contatore_inizio,
    v.contatore_fine,
    v.tariffa_km ?? null,
  ]) {
    if (n != null && (!Number.isFinite(n) || n < 0 || n > 100000000))
      errors.push(
        "Contatori e tariffa devono essere numeri validi, senza separatore delle migliaia.",
      );
  }
  if ((v.contatore_inizio == null) !== (v.contatore_fine == null))
    errors.push("Indica entrambi i contatori oppure lasciali entrambi vuoti.");
  if (
    v.contatore_inizio != null &&
    v.contatore_fine != null &&
    v.contatore_fine < v.contatore_inizio
  )
    errors.push(
      "Il contatore finale non può essere inferiore a quello iniziale.",
    );
  const ids = new Set<string>();
  for (const t of v.tratte) {
    if (!t.da.trim() || !t.a.trim() || t.da.length > 250 || t.a.length > 250)
      errors.push(
        "Indica partenza e destinazione di ogni tratta (massimo 250 caratteri).",
      );
    if (ids.has(t.id)) errors.push("Una tratta è duplicata.");
    ids.add(t.id);
    if (t.km != null && (!Number.isFinite(t.km) || t.km < 0 || t.km > 10000))
      errors.push("Km della tratta non validi (da 0 a 10.000).");
    if (
      t.minuti != null &&
      (!Number.isFinite(t.minuti) || t.minuti < 0 || t.minuti > 2880)
    )
      errors.push("Durata della tratta non valida.");
    if (t.destinazione === "commessa" && !t.order_id)
      errors.push("Scegli la commessa oppure «Da attribuire in ufficio».");
    if (t.destinazione !== "commessa" && t.order_id)
      errors.push(
        "La tratta senza commessa non può avere un collegamento nascosto.",
      );
  }
  if (v.note.length > 2000)
    errors.push("Le note possono contenere al massimo 2.000 caratteri.");
  return [...new Set(errors)];
}

export function totaliCommessa(viaggi: Viaggio[], orderId: string) {
  let verificati = 0,
    dichiarati = 0,
    stimati = 0,
    mancanti = 0;
  let costoStimato = 0,
    kmSenzaTariffa = 0,
    tratteConTariffa = 0;
  for (const v of viaggi.filter(
    (v) => v.stato !== "annullato" && v.stato !== "bozza",
  )) {
    for (const t of v.tratte.filter(
      (t) => t.order_id === orderId && t.destinazione === "commessa",
    )) {
      if (t.km == null) {
        mancanti++;
        continue;
      }
      if (v.stato === "verificato") verificati += t.km;
      else if (t.fonte === "stimati") stimati += t.km;
      else dichiarati += t.km;
      if (v.tariffa_km != null) {
        costoStimato += t.km * v.tariffa_km;
        tratteConTariffa++;
      } else kmSenzaTariffa += t.km;
    }
  }
  return {
    verificati: round(verificati),
    dichiarati: round(dichiarati),
    stimati: round(stimati),
    mancanti,
    costoStimato: tratteConTariffa ? round(costoStimato) : null,
    kmSenzaTariffa: round(kmSenzaTariffa),
  };
}
export function draftViaggioKey(company: string, user: string, mezzo: string) {
  return `mezzi-viaggio-bozza:v1:${company}:${user}:${mezzo}`;
}
