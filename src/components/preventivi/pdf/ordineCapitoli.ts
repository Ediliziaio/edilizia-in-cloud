/**
 * L'ordine dei capitoli del «Piano dei lavori», scelto dall'azienda.
 *
 * I Serramenti e il Fotovoltaico permettevano già di riordinare le pagine; il
 * documento degli otto moduli edili no: i capitoli uscivano sempre nello stesso
 * ordine, e non si poteva aggiungere una pagina propria (le certificazioni, lo
 * showroom, un progetto di cui si va fieri). Qui c'è la regola che li mette in
 * fila: la usano sia il PDF sia l'editor, così l'anteprima non mente.
 *
 * Nel modello si salva un elenco `{ chiave, visibile }`. Quello che manca
 * nell'elenco salvato (un capitolo nato dopo, una pagina libera appena creata)
 * prende il suo posto di serie; quello che non esiste più si scarta.
 */

export type ChiaveCapitolo =
  | "apertura" | "chiSiamo" | "progetto" | "percorso" | "lavori" | "foto"
  | "piano" | "investimento" | "garanzie" | "tempi"
  // I blocchi della libreria (_shared/blocchiPreventivo.ts): testi e foto di serie per settore.
  | "comeFunziona" | "compreso" | "protezione" | "controlli" | "documenti" | "diario";

export interface VoceOrdine {
  /** Una ChiaveCapitolo, oppure `libera:<id>` per una pagina scritta dall'azienda. */
  chiave: string;
  visibile: boolean;
}

export interface PaginaLibera {
  id: string;
  occhiello: string | null;
  /** Una parola fra asterischi esce in corsivo, come negli altri titoli. */
  titolo: string;
  testoHtml: string | null;
  fotoUrl: string | null;
  didascalia: string | null;
}

export interface CapitoloDescritto {
  chiave: ChiaveCapitolo;
  etichetta: string;
  descrizione: string;
  /** L'apertura sta sempre subito dopo la copertina. */
  spostabile: boolean;
  /** Il prezzo non si nasconde: un preventivo senza investimento non è un preventivo. */
  nascondibile: boolean;
  /**
   * Acceso quando l'azienda non ha ancora scelto. Dal 22/09/2026 anche i blocchi
   * che promettono qualcosa al cliente (proteggiamo la casa, controlliamo,
   * consegniamo un fascicolo) nascono accesi: l'azienda li rilegge, li cambia o
   * li spegne dall'editor.
   */
  diSerie: boolean;
  /** È un impegno verso il cliente: l'editor chiede di rileggerlo. */
  promessa?: boolean;
}

/** I capitoli nell'ordine di serie: prima il valore, poi il prezzo. */
export const CAPITOLI_EDILI: CapitoloDescritto[] = [
  { chiave: "apertura", etichetta: "Apertura", descrizione: "Lettera, l'intervento in breve, il piano in numeri, l'indice", spostabile: false, nascondibile: true, diSerie: true },
  { chiave: "chiSiamo", etichetta: "Chi siamo", descrizione: "Presentazione, perché sceglierci, recensioni · esce se compilato", spostabile: true, nascondibile: true, diSerie: true },
  { chiave: "progetto", etichetta: "Il progetto", descrizione: "Da dove partiamo e la nostra risposta · esce se compilato", spostabile: true, nascondibile: true, diSerie: true },
  // «Come lavoriamo» subito dopo il progetto (dal 22/09/2026, prima era dopo «Come
  // funziona»): due capitoli corti stanno sulla stessa pagina. Fra due pagine di
  // foto tecniche restava da solo, su un foglio per tre quarti bianco.
  { chiave: "percorso", etichetta: "Come lavoriamo", descrizione: "Le fasi, dal primo incontro alla consegna · esce se compilato", spostabile: true, nascondibile: true, diSerie: true },
  { chiave: "comeFunziona", etichetta: "Come funziona", descrizione: "Le lavorazioni che non si vedono, spiegate con foto tecniche", spostabile: true, nascondibile: true, diSerie: true },
  { chiave: "protezione", etichetta: "Protezione della casa", descrizione: "Come proteggete la casa durante i lavori", spostabile: true, nascondibile: true, diSerie: true, promessa: true },
  { chiave: "controlli", etichetta: "Controlli di qualità", descrizione: "Cosa verificate prima della consegna", spostabile: true, nascondibile: true, diSerie: true, promessa: true },
  { chiave: "lavori", etichetta: "I nostri lavori", descrizione: "Galleria dei lavori consegnati · esce se ci sono foto", spostabile: true, nascondibile: true, diSerie: true },
  { chiave: "foto", etichetta: "Foto e render", descrizione: "Le foto e i render caricati nel preventivo · esce se ci sono", spostabile: true, nascondibile: true, diSerie: true },
  { chiave: "piano", etichetta: "Il piano dei lavori", descrizione: "Il computo, voce per voce", spostabile: true, nascondibile: true, diSerie: true },
  { chiave: "compreso", etichetta: "Cosa è compreso", descrizione: "Cosa comprende il prezzo, e cosa resta fuori", spostabile: true, nascondibile: true, diSerie: true, promessa: true },
  { chiave: "investimento", etichetta: "Il tuo investimento", descrizione: "Il prezzo, lo sconto, l'IVA, la detrazione", spostabile: true, nascondibile: false, diSerie: true },
  { chiave: "garanzie", etichetta: "Garanzie e domande", descrizione: "Le garanzie e le domande frequenti · esce se compilato", spostabile: true, nascondibile: true, diSerie: true },
  { chiave: "documenti", etichetta: "Documenti consegnati", descrizione: "Il fascicolo che il cliente riceve a fine lavori", spostabile: true, nascondibile: true, diSerie: true, promessa: true },
  { chiave: "diario", etichetta: "Diario fotografico", descrizione: "Le foto delle fasi, anche di quelle che poi restano nascoste", spostabile: true, nascondibile: true, diSerie: true, promessa: true },
  { chiave: "tempi", etichetta: "I tempi", descrizione: "Il cronoprogramma del cantiere · esce se compilato", spostabile: true, nascondibile: true, diSerie: true },
];

const CHIAVI = new Set<string>(CAPITOLI_EDILI.map((c) => c.chiave));
export const chiaveLibera = (id: string) => `libera:${id}`;
export const idLibera = (chiave: string): string | null => (chiave.startsWith("libera:") ? chiave.slice(7) : null);

/** Dal valore salvato (jsonb) a un elenco pulito. */
export function leggiOrdine(grezzo: unknown): VoceOrdine[] {
  if (!Array.isArray(grezzo)) return [];
  return grezzo
    .filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === "object")
    .map((v) => ({ chiave: String(v.chiave ?? ""), visibile: v.visibile !== false }))
    .filter((v) => v.chiave.length > 0);
}

/**
 * Dal valore salvato (jsonb) alle pagine libere. Per il PDF si scartano quelle
 * vuote; l'editor le vuole tutte, anche quella appena aggiunta e non ancora scritta.
 */
export function leggiPagineLibere(grezzo: unknown, { ancheVuote = false }: { ancheVuote?: boolean } = {}): PaginaLibera[] {
  if (!Array.isArray(grezzo)) return [];
  const testo = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return grezzo
    .filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === "object")
    .map((v) => ({
      id: String(v.id ?? ""),
      occhiello: testo(v.occhiello),
      titolo: testo(v.titolo) ?? "",
      testoHtml: testo(v.testoHtml ?? v.testo_html),
      fotoUrl: testo(v.fotoUrl ?? v.foto_url),
      didascalia: testo(v.didascalia),
    }))
    .filter((p) => p.id && (ancheVuote || p.titolo || p.testoHtml || p.fotoUrl));
}

/**
 * L'ordine vero: quello salvato, completato con ciò che manca e ripulito da ciò
 * che non esiste più. L'apertura resta sempre prima; l'investimento sempre visibile.
 */
export function ordineEffettivo(salvato: VoceOrdine[], pagineLibere: PaginaLibera[]): VoceOrdine[] {
  const libere = new Set(pagineLibere.map((p) => chiaveLibera(p.id)));
  const esiste = (k: string) => CHIAVI.has(k) || libere.has(k);

  const visti = new Set<string>();
  const out: VoceOrdine[] = [];
  for (const v of salvato) {
    if (!esiste(v.chiave) || visti.has(v.chiave)) continue;
    visti.add(v.chiave);
    out.push({ chiave: v.chiave, visibile: v.chiave === "investimento" ? true : v.visibile });
  }

  // Un capitolo che nell'elenco salvato non c'è si mette dopo quello che lo precede
  // nell'ordine di serie (o in testa, se lo precede nessuno di quelli presenti).
  CAPITOLI_EDILI.forEach((c, i) => {
    if (visti.has(c.chiave)) return;
    visti.add(c.chiave);
    const prima = CAPITOLI_EDILI.slice(0, i).map((x) => x.chiave).reverse().find((k) => out.some((v) => v.chiave === k));
    const dove = prima ? out.findIndex((v) => v.chiave === prima) + 1 : 0;
    // Un capitolo nuovo per chi aveva già scelto l'ordine esce solo se è acceso di serie.
    out.splice(dove, 0, { chiave: c.chiave, visibile: c.diSerie });
  });

  // Le pagine libere nuove vanno prima dell'investimento: si leggono mentre si
  // conosce l'impresa, non dopo il prezzo.
  for (const p of pagineLibere) {
    const k = chiaveLibera(p.id);
    if (visti.has(k)) continue;
    visti.add(k);
    const inv = out.findIndex((v) => v.chiave === "investimento");
    const piano = out.findIndex((v) => v.chiave === "piano");
    const dove = Math.min(...[inv, piano].filter((x) => x >= 0), out.length);
    out.splice(dove, 0, { chiave: k, visibile: true });
  }

  // L'apertura non si sposta: sempre subito dopo la copertina.
  const a = out.findIndex((v) => v.chiave === "apertura");
  if (a > 0) out.unshift(...out.splice(a, 1));
  return out;
}

/** Sposta una voce di un posto in su o in giù, saltando l'apertura che resta prima. */
export function sposta(ordine: VoceOrdine[], chiave: string, verso: -1 | 1): VoceOrdine[] {
  const i = ordine.findIndex((v) => v.chiave === chiave);
  const j = i + verso;
  if (i < 0 || j < 0 || j >= ordine.length) return ordine;
  if (ordine[i].chiave === "apertura" || ordine[j].chiave === "apertura") return ordine;
  const out = [...ordine];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
