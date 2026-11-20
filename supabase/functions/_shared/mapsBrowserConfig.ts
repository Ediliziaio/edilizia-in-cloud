type LeggiChiaveMaps = (nome: string, ambiente: string) => Promise<string>;

/** La chiave per il browser deve essere distinta dalla credenziale dei servizi server. */
export async function configurazioneMapsBrowser(leggi: LeggiChiaveMaps) {
  const key = await leggi("google_maps_browser_key", "GOOGLE_MAPS_BROWSER_KEY");
  if (!key) {
    return {
      configured: false as const,
      message:
        "La mappa interattiva Google non è ancora collegata. Puoi continuare con le misure rilevate.",
    };
  }
  const server = await leggi("google_maps_api_key", "GOOGLE_MAPS_API_KEY");
  if (key === server || !/^AIza[\w-]{35}$/.test(key)) {
    return {
      configured: false as const,
      message:
        "Serve una chiave Google dedicata alla mappa interattiva, limitata ai domini di Edilizia in Cloud.",
    };
  }
  return { configured: true as const, key };
}
