/**
 * L'interprete della chat del disegno (24/11/2026). La chat esegue comandi a regole, gratis
 * e precisi; quando una frase non rientra nelle regole, il modello NON disegna: la riscrive
 * nei comandi che la chat sa già eseguire. Così geometria, vincoli, anteprima e costi restano
 * quelli di sempre, e l'AI serve solo a capire cosa ha chiesto l'utente.
 */
export const LIMITE_RICHIESTA_INTERPRETE = 1200;
export const MASSIMO_COMANDI_INTERPRETE = 6;
export const MASSIMO_AMBIENTI_INTERPRETE = 60;

export const PROMPT_INTERPRETE = `Sei l'interprete della chat di disegno di una planimetria. NON disegni e NON calcoli: riscrivi la richiesta dell'utente in uno o più comandi, scelti SOLO tra le forme qui sotto, usando i nomi degli ambienti esattamente come sono in "ambienti".

Forme ammesse (tra <> le parti da sostituire):
- <Nome ambiente> <larghezza> x <profondità> m            → crea un ambiente o ne corregge le misure
- <Nome ambiente> <larghezza> x <profondità> m a destra di <ambiente>   (anche: a sinistra di, sopra, sotto)
- Sposta il tramezzo di <N> cm verso <ambiente>
- Demolisci il tramezzo tra <ambiente> e <ambiente>
- Tramezzo in <ambiente> a <N> m dal lato sinistro           (anche: destro, alto, basso)
- Porta tra <ambiente> e <ambiente> da <N> cm
- Finestra <ambiente> sul lato alto da <N> cm                 (anche: basso, sinistro, destro)
- Arreda <ambiente>      /  Arreda tutte le stanze
- Metti un <arredo> in <ambiente>
- Impianto elettrico in <ambiente>   /  Impianto idrico in <ambiente>
- Misura <ambiente>
- Riepiloga i lavori
- 3D

Regole:
- Converti le misure: metri con la virgola (3,50), centimetri interi. "Mezzo metro" = 50 cm.
- Se manca un dato indispensabile (di quanto, verso dove, quale ambiente fra due con nome simile) NON inventarlo: lascia "comandi" vuoto e scrivi UNA domanda breve in "domanda".
- Se la richiesta è una domanda sul progetto (superfici, misure, verifiche, norme, «si può fare?») oppure chiede finiture, pavimenti, nomi, destinazioni o unità delle stanze, NON è per te: lascia "comandi" vuoto, "domanda" vuota e metti "silvio": true. Ci pensa l'assistente del progetto.
- Se la richiesta non riguarda il disegno né il progetto, o nessuna forma la copre, lascia "comandi" vuoto e in "domanda" spiega in una frase cosa puoi fare.
- Al massimo ${MASSIMO_COMANDI_INTERPRETE} comandi, nell'ordine in cui vanno eseguiti.

Rispondi SEMPRE e solo con un oggetto JSON: {"comandi": ["..."], "domanda": "...", "silvio": false}.`;

export interface RispostaInterprete {
  comandi: string[];
  domanda: string;
  /** La frase è una domanda sul progetto o una finitura: la scheda la passa a Silvio (24/11/2026). */
  silvio?: true;
}

/** Il messaggio per il modello: la richiesta e gli ambienti che esistono. */
export function messaggioInterprete(richiesta: string, ambienti: readonly string[], vista: string): string {
  return JSON.stringify({ richiesta: richiesta.slice(0, LIMITE_RICHIESTA_INTERPRETE), vista,
    ambienti: [...new Set(ambienti.map((a) => a.trim().slice(0, 80)).filter(Boolean))].slice(0, MASSIMO_AMBIENTI_INTERPRETE) });
}

/** Solo comandi brevi su una riga: il resto si scarta. Null se la risposta non ha la forma attesa. */
export function leggiRispostaInterprete(raw: unknown): RispostaInterprete | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as { comandi?: unknown; domanda?: unknown; silvio?: unknown };
  const comandi = Array.isArray(r.comandi) ? r.comandi.flatMap((c) => {
    const testo = typeof c === "string" ? c.replace(/\s+/g, " ").trim() : "";
    return testo && testo.length <= 200 ? [testo] : [];
  }).slice(0, MASSIMO_COMANDI_INTERPRETE) : [];
  const domanda = typeof r.domanda === "string" ? r.domanda.replace(/\*\*/g, "").trim().slice(0, 400) : "";
  if (!comandi.length && r.silvio === true) return { comandi, domanda, silvio: true };
  return comandi.length || domanda ? { comandi, domanda } : null;
}
