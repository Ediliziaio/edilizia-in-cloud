/**
 * Confronto fra l'azienda mostrata dalla schermata e quella usata dal server.
 *
 * La schermata tiene l'azienda nel suo stato (per scheda), il server la legge da
 * una riga per utente (`get_effective_company_id()`): un'altra finestra, o il
 * limite delle 2 ore dell'accesso, la cambiano senza che questa scheda lo sappia.
 * Esito misurato in docs/azienda-schermata-server.md.
 */

/** Nessun controllo più ravvicinato di così, qualunque sia il motivo. */
export const INTERVALLO_MINIMO_MS = 15_000;
/** Controllo periodico, solo a scheda visibile. */
export const INTERVALLO_PERIODICO_MS = 60_000;
/** Una differenza si crede solo se la seconda lettura la conferma. */
export const ATTESA_CONFERMA_MS = 2_000;

export type EsitoConfronto =
  | { stato: "allineata" }
  | { stato: "altra_azienda"; aziendaServer: string }
  | { stato: "nessuna_azienda" };

export function confrontaAziende(
  mostrata: string,
  server: string | null | undefined,
): EsitoConfronto {
  if (!server) return { stato: "nessuna_azienda" };
  return server === mostrata
    ? { stato: "allineata" }
    : { stato: "altra_azienda", aziendaServer: server };
}

/**
 * Solo chi può davvero divergere: chi è entrato in un'azienda e chi ne ha più
 * d'una. Il commercialista resta fuori: la sua azienda sta nell'indirizzo e nelle
 * deleghe, non nella riga letta dal server, e l'avviso sarebbe sempre acceso.
 */
export function controlloNecessario(p: {
  aziendaMostrata: string | null | undefined;
  staImpersonando: boolean;
  numeroAccessiMultiAzienda: number;
  commercialista: boolean;
}): boolean {
  if (!p.aziendaMostrata || p.commercialista) return false;
  // > 1: fra gli accessi c'è sempre anche l'azienda del profilo.
  return p.staImpersonando || p.numeroAccessiMultiAzienda > 1;
}

export function controlloDovuto(ultimoControlloMs: number | null, oraMs: number): boolean {
  return ultimoControlloMs === null || oraMs - ultimoControlloMs >= INTERVALLO_MINIMO_MS;
}

/** Testo dell'avviso. `nomeServer` manca finché il nome non è stato letto. */
export function testoAvviso(
  esito: Exclude<EsitoConfronto, { stato: "allineata" }>,
  nomeMostrata: string,
  nomeServer: string | null,
): { titolo: string; dettaglio: string } {
  if (esito.stato === "nessuna_azienda") {
    return {
      titolo: `L'accesso a ${nomeMostrata} non è più attivo`,
      dettaglio:
        "È scaduto o è stato chiuso da un'altra finestra: elenchi vuoti e salvataggi rifiutati finché non lo riattivi.",
    };
  }
  const altra = nomeServer ?? "un'altra azienda";
  return {
    titolo: `Stai guardando ${nomeMostrata}, ma il server sta lavorando su ${altra}`,
    dettaglio:
      "L'ha cambiata un'altra finestra. Elenchi vuoti o salvataggi sull'azienda sbagliata: riallinea prima di continuare.",
  };
}

// ── Avviso fra le schede dello stesso browser ───────────────────────────────
// Un solo canale per scheda: chi spedisce su un canale non riceve i propri
// messaggi, quindi la scheda che cambia azienda non controlla se stessa.
const NOME_CANALE = "eic-azienda-server";
let canale: BroadcastChannel | null | undefined;

function apriCanale(): BroadcastChannel | null {
  if (canale === undefined) {
    canale = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(NOME_CANALE);
  }
  return canale;
}

export function avvisaAltreSchede(): void {
  try {
    apriCanale()?.postMessage("cambiata");
  } catch {
    // Solo un'accelerazione: il controllo al ritorno sulla scheda resta.
  }
}

export function ascoltaAltreSchede(quandoCambia: () => void): () => void {
  const c = apriCanale();
  if (!c) return () => undefined;
  c.addEventListener("message", quandoCambia);
  return () => c.removeEventListener("message", quandoCambia);
}
