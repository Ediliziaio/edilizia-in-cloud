/** La regione del prezzario dalla sigla della provincia. Valle d'Aosta e Lazio non hanno prezzario: vale l'intera Italia. */
const PROVINCE: Record<string, string> = {
  Piemonte: "AL AT BI CN NO TO VB VC", Lombardia: "BG BS CO CR LC LO MB MI MN PV SO VA", Veneto: "BL PD RO TV VE VI VR",
  "Trento (Prov. Aut.)": "TN", "Bolzano (Prov. Aut.)": "BZ", "Friuli-Venezia Giulia": "GO PN TS UD", Liguria: "GE IM SP SV",
  "Emilia-Romagna": "BO FC FE MO PC PR RA RE RN", Toscana: "AR FI GR LI LU MS PI PO PT SI", Umbria: "PG TR", Marche: "AN AP FM MC PU",
  Abruzzo: "AQ CH PE TE", Molise: "CB IS", Campania: "AV BN CE NA SA", Puglia: "BA BR BT FG LE TA", Basilicata: "MT PZ",
  Calabria: "CS CZ KR RC VV", Sicilia: "AG CL CT EN ME PA RG SR TP", Sardegna: "CA NU OR SS SU",
};
const PER_SIGLA = new Map(Object.entries(PROVINCE).flatMap(([r, sigle]) => sigle.split(" ").map((s) => [s, r] as const)));

export function regioneDaProvincia(provincia: string | null | undefined): string | null {
  return PER_SIGLA.get((provincia ?? "").trim().toUpperCase()) ?? null;
}
