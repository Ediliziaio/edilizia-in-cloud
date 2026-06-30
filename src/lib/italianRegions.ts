// Elenco canonico delle 20 regioni italiane (forma breve), unica fonte di verità
// per i menu a tendina (filtri contatti, condizioni automazioni). Deve combaciare
// ESATTAMENTE con i valori salvati in marketing_contacts.region — che derivano da
// it_province.regione e it_comuni.regione (normalizzati a queste stesse stringhe:
// Trentino-Alto Adige e Valle d'Aosta in forma breve). Non modificare senza
// allineare il dataset DB, altrimenti i filtri "Regione = ..." smettono di matchare.
export const ITALIAN_REGIONS = [
  "Abruzzo",
  "Basilicata",
  "Calabria",
  "Campania",
  "Emilia-Romagna",
  "Friuli-Venezia Giulia",
  "Lazio",
  "Liguria",
  "Lombardia",
  "Marche",
  "Molise",
  "Piemonte",
  "Puglia",
  "Sardegna",
  "Sicilia",
  "Toscana",
  "Trentino-Alto Adige",
  "Umbria",
  "Valle d'Aosta",
  "Veneto",
] as const;

export const REGION_OPTIONS: { value: string; label: string }[] = ITALIAN_REGIONS.map(
  (r) => ({ value: r, label: r }),
);
