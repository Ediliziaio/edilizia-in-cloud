type EsitoEstrazione = "credito" | "vision_error" | "troncato" | "parse_failed";

export function calcolaTentativoEstrazione(
  precedente: { tentativi: number | null; ultimo_esito: string | null } | null,
  esito: EsitoEstrazione,
  ora = Date.now(),
) {
  const erroriPrecedenti = precedente?.ultimo_esito === "credito" ? 0 : precedente?.tentativi ?? 0;
  const tentativi = esito === "credito" ? 0 : erroriPrecedenti + 1;
  const minuti = esito === "credito" ? 60 : Math.min(24 * 60, 30 * 2 ** tentativi);
  return {
    tentativi,
    ultimo_esito: esito,
    prossimo_tentativo: new Date(ora + minuti * 60_000).toISOString(),
    updated_at: new Date(ora).toISOString(),
  };
}
