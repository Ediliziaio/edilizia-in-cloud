import { unitaCompatibili } from "@/lib/prezzario/confronto";
import { numeroCosto, type AnalisiCosti, type VoceAnalisi } from "./analisiCosti";

export type ComandoCostoSilvio = { nome: string; codice?: string; prezzo: number; precedente?: number; unita?: string };
export type RichiestaCostoSilvio = { id: number; comandi: ComandoCostoSilvio[] };
export type RiscontroCostoSilvio = { errore?: string };
export type ControlliCostiSilvio = {
  richiesta: RichiestaCostoSilvio | null;
  onRiscontro: (id: number, riscontro: RiscontroCostoSilvio) => void;
};

// Il modello riceve l'intento. Identità, importi e calcoli restano nel pannello interno.
export const MESSAGGIO_AI_COSTO_SILVIO = "Solo spiegazione: interpreta la richiesta «Imposta il nuovo costo unitario di acquisto della risorsa selezionata». Il gestionale mostra un confronto locale del margine prima del salvataggio. Rispondi all’utente in una sola frase, indicando cosa controllare prima di confermare. Evita di inventare importi o proporre modifiche alle voci di vendita.";
export const MESSAGGIO_AI_COSTI_SILVIO = "Solo spiegazione: l’utente ha chiesto una modifica congiunta dei costi unitari del materiale e della posa di una lavorazione. Il gestionale ha preparato il confronto locale del margine della voce prima della conferma. Rispondi all’utente in una frase e indica cosa controllare prima di confermare insieme i costi. Evita importi inventati e proposte sulle voci di vendita.";

const inizioCosto = /^(?:(?:puoi|vorrei|voglio|per favore)[ ,]+)?(?:porta|cambia|modifica|aggiorna|imposta|aumenta|riduci|abbassa|alza|cambiare|modificare|aggiornare|impostare)\s+(?:(?:il )?costo)(?: di acquisto)?(?: unitario)?\b/i;
const nomeNormalizzato = (nome: string) => nome.trim().replace(/^[«“"]|[»”"]$/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("it");

/** Una richiesta non identificabile apre i costi, senza interpretare valori ambigui. */
export function leggiComandoCostoSilvio(testo: string): ComandoCostoSilvio | false | undefined {
  const intestazione = inizioCosto.exec(testo);
  if (!intestazione) return undefined;
  const parte = testo.slice(intestazione[0].length).trim().replace(/^(?:del materiale |della risorsa |del |della |di |dell['’])/i, "");
  const risultato = /^(.+?)(?:\s+da\s+([\d.,]+)(?:\s*(?:€|euro))?(?:\s*\/\s*[\p{L}²³.]+)?)?\s+(?:a|=)\s+([\d.,]+)(?:\s*(?:€|euro))?(?:\s*\/\s*([\p{L}²³.]+))?[!?]?\.?$/iu.exec(parte);
  if (!risultato) return false;
  const [, soggetto, valoreAttuale, nuovoValore, unita] = risultato;
  const importo = numeroCosto(nuovoValore);
  const precedente = valoreAttuale ? numeroCosto(valoreAttuale) : undefined;
  const perVoce = /^(.*?)\s+(?:(?:della |nella |per la )?voce)\s+([\w./-]+)$/i.exec(soggetto.trim());
  const nome = nomeNormalizzato(perVoce ? perVoce[1] : soggetto);
  if (!nome || importo === null || precedente === null) return false;
  return { nome, codice: perVoce?.[2], prezzo: importo, precedente, unita };
}

export function leggiComandiCostoSilvio(testo: string): ComandoCostoSilvio[] | false | undefined {
  if (!inizioCosto.test(testo)) return undefined;
  const richieste = testo.split(/\s*[;\n]\s*|\s+e\s+(?=(?:porta|cambia|modifica|aggiorna|imposta)(?: il)? costo\b|il costo\b)/i);
  const comandi: ComandoCostoSilvio[] = [];
  for (const richiesta of richieste) {
    const parte = richiesta.trim();
    if (!parte) continue;
    const comando = leggiComandoCostoSilvio(/^il costo\b/i.test(parte) ? `Porta ${parte}` : parte);
    if (!comando) return false;
    comandi.push(comando);
  }
  return comandi.length ? comandi : false;
}

export function risorsaDaComandoCosto(analisi: AnalisiCosti, voci: readonly VoceAnalisi[], comando: ComandoCostoSilvio) {
  const candidate = voci.flatMap(voce => {
    if (comando.codice && nomeNormalizzato(voce.codice ?? "") !== nomeNormalizzato(comando.codice)) return [];
    return (analisi.voci[voce.id] ?? [])
      .filter(risorsa => risorsa.base !== "percentuale" && nomeNormalizzato(risorsa.nome) === comando.nome)
      .map(risorsa => ({ voce, risorsa }));
  });
  if (!candidate.length) throw new Error("Risorsa non trovata. Usa il nome riportato in «Dettaglio costi».");
  if (candidate.length > 1) throw new Error("Ci sono più risorse con quel nome. Indica il codice della voce o scegli «Modifica costo» sulla risorsa.");
  const selezione = candidate[0];
  const { risorsa } = selezione;
  if (comando.unita && (!risorsa.unita.trim() || !unitaCompatibili(risorsa.unita, comando.unita))) {
    throw new Error(`Il costo è espresso in ${risorsa.unita || "euro per risorsa"}. Indica il nuovo importo nella stessa unità.`);
  }
  if (comando.precedente !== undefined && comando.precedente !== numeroCosto(risorsa.prezzo)) {
    throw new Error("Il costo attuale è diverso da quello indicato. Controllalo nel dettaglio della risorsa.");
  }
  return selezione;
}

export function conCostiRisorse(analisi: AnalisiCosti, voceId: string, cambi: readonly { id: string; prezzo: number }[]): AnalisiCosti {
  const risorse = analisi.voci[voceId];
  const prezzi = new Map(cambi.map(cambio => [cambio.id, cambio.prezzo]));
  if (!risorse || !cambi.length || prezzi.size !== cambi.length || cambi.some(({ id, prezzo }) =>
    !Number.isFinite(prezzo) || prezzo < 0 || prezzo > 999_999_999
    || risorse.filter(riga => riga.id === id && riga.base !== "percentuale").length !== 1
  )) {
    throw new Error("Risorsa o costo non valido.");
  }
  return { ...analisi, voci: { ...analisi.voci, [voceId]: risorse.map(riga => prezzi.has(riga.id) ? { ...riga, prezzo: String(prezzi.get(riga.id)) } : riga) } };
}
