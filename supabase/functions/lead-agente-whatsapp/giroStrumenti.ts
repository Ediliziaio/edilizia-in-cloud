/**
 * Il giro «chiedi al modello → esegui gli strumenti → richiedi» dell'agente
 * WhatsApp dei lead, separato dal resto per poterlo provare (10/11/2026).
 *
 * Perché esiste: il modello scrive quasi sempre la risposta al cliente
 * INSIEME alla chiamata dello strumento, in un turno solo — «Capito, quindi
 * dopo il 20 novembre. Un'ultima domanda: …» più salva_risposte. Fino al
 * 10/11/2026 quel testo si buttava via e la risposta si richiedeva al giro
 * dopo: ma il modello l'aveva già scritta, quindi rispondeva vuoto (2 token
 * di completamento, misurati in ai_model_usage_log) e al lead non arrivava
 * niente. Su Il Bagno Group è successo a 18 contatti su 56 dal 28/09/2026,
 * e quasi sempre sul messaggio che doveva portare all'appuntamento: il lead
 * restava lì, e al team arrivava solo «Assistente WhatsApp: risposta vuota».
 *
 * La regola: il testo scritto insieme agli strumenti si tiene da parte e si
 * usa solo se dopo non arriva niente di meglio, e solo se tutti gli strumenti
 * di quel turno sono andati bene. Se una prenotazione fallisce, quel testo
 * diceva «ti ho fissato giovedì alle 10»: mandarlo vorrebbe dire confermare
 * al cliente un appuntamento che non esiste.
 */

export interface ToolCallLlm {
  id: string;
  function: { name: string; arguments: string };
}

export interface MsgLlm {
  content: string | null;
  tool_calls?: ToolCallLlm[];
}

export interface GiroStrumenti {
  maxGiri: number;
  /** Chiede al modello. `none` vieta gli strumenti: serve solo per l'ultimo tentativo. */
  chiedi(toolChoice: "auto" | "none", maxTokens: number): Promise<MsgLlm>;
  /** Mette la richiesta del modello nella conversazione. */
  annotaRichiesta(msg: MsgLlm): void;
  /** Esegue uno strumento, lo registra e mette l'esito nella conversazione. */
  esegui(tc: ToolCallLlm): Promise<{ ok: boolean }>;
}

/** Il testo da mandare al lead, o null se non c'è proprio niente da dire. */
export async function rispostaDelModello(d: GiroStrumenti): Promise<string | null> {
  let testo: string | null = null;
  let scorta: string | null = null;

  for (let giro = 0; giro < d.maxGiri; giro++) {
    const msg = await d.chiedi("auto", 600);
    if (!msg.tool_calls?.length) {
      testo = msg.content ?? null;
      break;
    }
    const testoDelTurno = (msg.content ?? "").trim();
    d.annotaRichiesta(msg);
    // In ordine, non in parallelo: una prenotazione e lo spostamento di fase
    // non devono pestarsi.
    let tuttiOk = true;
    for (const tc of msg.tool_calls) {
      const esito = await d.esegui(tc);
      if (!esito.ok) tuttiOk = false;
    }
    if (testoDelTurno && tuttiOk) scorta = testoDelTurno;
  }

  // Finiti i giri con gli strumenti senza un testo: un ultimo giro senza
  // strumenti, così il lead riceve comunque una risposta.
  if (!testo?.trim()) testo = (await d.chiedi("none", 400)).content ?? null;
  // E se nemmeno quello dice niente, vale quello che il modello aveva già
  // scritto insieme allo strumento: meglio la sua frase che il silenzio.
  if (!testo?.trim()) testo = scorta;
  return testo;
}
