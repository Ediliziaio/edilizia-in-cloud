/**
 * Importare molte fatture: cosa c'è già, più fatture insieme, nuovo tentativo sugli errori passeggeri.
 * Ricaricando lo stesso file dopo un'interruzione si riparte da dove era: quelle già dentro si saltano.
 */
export interface IdentitaFattura { cedente: string; numero: string; data: string }

const tag = (nome: string) => `(?:[A-Za-z_][\\w.-]*:)?${nome}`;
function campo(xml: string, contenitore: string, nome: string): string {
  const m = xml.match(new RegExp(`<${tag(contenitore)}[\\s>][\\s\\S]*?<${tag(nome)}>\\s*([^<]+?)\\s*</`));
  return m ? m[1] : "";
}

/** Solo l'intestazione, col testo: su file con allegati da megabyte non si costruisce tutto il documento. */
export function identitaFattura(xml: string): IdentitaFattura | null {
  const prima = xml.search(/<(?:[A-Za-z_][\w.-]*:)?Allegati[\s>]/);
  const testa = prima > 0 ? xml.slice(0, prima) : xml;
  const ced = testa.match(new RegExp(`<${tag("CedentePrestatore")}[\\s>][\\s\\S]*?</${tag("CedentePrestatore")}>`))?.[0] ?? "";
  const iva = ced.match(new RegExp(`<${tag("IdCodice")}>\\s*([^<]+?)\\s*</`))?.[1];
  const cf = ced.match(new RegExp(`<${tag("CodiceFiscale")}>\\s*([^<]+?)\\s*</`))?.[1];
  const numero = campo(testa, "DatiGeneraliDocumento", "Numero");
  const data = campo(testa, "DatiGeneraliDocumento", "Data");
  const cedente = iva || cf || "";
  return cedente && numero && data ? { cedente, numero, data } : null;
}

export const chiaveRicevuta = (cedente: string | null | undefined, numero: string | null | undefined, data: string | null | undefined) =>
  `${(cedente ?? "").trim().toUpperCase()}|${(numero ?? "").trim()}|${(data ?? "").slice(0, 10)}`;

/** Le emesse si riconoscono da numero e data: il cedente è sempre l'azienda. */
export const chiaveEmessa = (numero: string | null | undefined, data: string | null | undefined) =>
  `${(numero ?? "").trim()}|${(data ?? "").slice(0, 10)}`;

/** Errore di rete o del server: riprovare è innocuo, perché un doppione non si scrive due volte. */
export function errorePassaggero(messaggio: string, stato?: number): boolean {
  if (stato !== undefined) return stato === 408 || stato === 429 || stato >= 500;
  return /failed to (fetch|send)|networkerror|network request|load failed|timeout|non-2xx.*5\d\d/i.test(messaggio);
}

/** Lavora la lista con al massimo `quanti` in parallelo. L'ordine dei risultati è quello della lista. */
export async function inParallelo<T, R>(lista: readonly T[], quanti: number, lavora: (x: T, i: number) => Promise<R>, fatto?: (completati: number) => void): Promise<R[]> {
  const risultati = new Array<R>(lista.length);
  let prossimo = 0;
  let completati = 0;
  const operaio = async () => {
    while (prossimo < lista.length) {
      const i = prossimo++;
      risultati[i] = await lavora(lista[i], i);
      completati += 1;
      fatto?.(completati);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(quanti, lista.length)) }, operaio));
  return risultati;
}

/** «circa 12 min»: quanto manca, dal ritmo tenuto finora. Prima di poche fatture non dice niente. */
export function tempoRimanente(fatte: number, totale: number, millisecondi: number): string | null {
  if (fatte < 5 || fatte >= totale || millisecondi <= 0) return null;
  const secondi = Math.round(((totale - fatte) * millisecondi) / fatte / 1000);
  return secondi < 60 ? "meno di un minuto" : `circa ${Math.round(secondi / 60)} min`;
}
