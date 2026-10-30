export type MarketingVisualTheme = "operations" | "finance" | "people" | "sales" | "automation" | "documents";
export const marketingVisuals: Record<MarketingVisualTheme, { base: string; alt: string }> = {
  operations: { base: "/images/about/ufficio-cantiere", alt: "Illustrazione di ufficio e cantiere collegati nello stesso progetto" },
  finance: { base: "/images/marketing/finance", alt: "Illustrazione di un progetto edile con materiali e strumenti per il controllo dei costi" },
  people: { base: "/images/marketing/people", alt: "Illustrazione di strumenti per organizzare squadre e calendario dei lavori" },
  sales: { base: "/images/marketing/sales", alt: "Illustrazione del percorso da una proposta a un progetto edilizio" },
  automation: { base: "/images/marketing/automation", alt: "Illustrazione di attività e strumenti digitali collegati attorno a un progetto" },
  documents: { base: "/images/marketing/documents", alt: "Illustrazione di documenti e materiali organizzati attorno a un progetto edile" },
};
const themes: Record<MarketingVisualTheme, string[]> = {
  finance: ["cassa-cantiere", "contabilita-fiscale", "margini-cantiere", "finanziamenti-cantieri", "prima-nota", "registro-iva", "report-fatturazione", "ritenute-garanzia", "scadenzario", "tesoreria"],
  people: ["calendario-lavori", "cedolini-paga", "ferie-permessi", "hr-personale", "timbrature-gps", "chat-interna", "ticket-assistenza"],
  sales: ["crm-edilizia", "email-marketing", "lead-form-facebook", "pipeline-vendite", "portale-clienti", "preventivi-edilizia", "sms-marketing", "whatsapp-marketing"],
  automation: ["agenti-ai", "automazioni", "quote-builder-ai"],
  documents: ["cassetto-sdi", "conserva-digitale", "contabilita-lavori", "ddt-digitali", "fatturazione-elettronica", "firma-elettronica", "giornale-lavori", "rapportini-cantiere", "sicurezza-cantiere", "direzione-lavori", "foto-cantiere"],
  operations: ["app-cantiere-mobile", "computo-metrico", "fotovoltaico", "gestione-cantieri", "gestione-commesse", "gestione-subappalti", "magazzino-cantiere", "manutenzione-impianti", "mezzi-attrezzature", "ordini-acquisto"],
};
export function visualThemeForFeature(slug: string): MarketingVisualTheme {
  return (Object.keys(themes) as MarketingVisualTheme[]).find(theme => themes[theme].includes(slug)) ?? "operations";
}

/** Concise first-screen copy; the full module description stays expandable. */
export const marketingVisualIntro: Record<MarketingVisualTheme, string> = {
  operations: "Organizza attività e materiali attorno al lavoro da eseguire. Ufficio e cantiere condividono un riferimento per seguire la commessa.",
  finance: "Il controllo economico parte da dati ordinati. Tieni distinti importi previsti, valori registrati e pagamenti per comprendere il risultato dei lavori.",
  people: "Persone, date e attività hanno bisogno di un contesto chiaro. Organizza le informazioni utili a chi coordina il lavoro e a chi lo esegue.",
  sales: "Dai continuità alle richieste dei clienti. Organizza informazioni e prossime attività per accompagnare il percorso commerciale dell’impresa.",
  automation: "Collega le attività ripetitive e lavora sui dati del tuo contesto. Mantieni chiari il risultato proposto, i controlli e il prossimo passo.",
  documents: "Raccogli i documenti nel contesto del lavoro. Identifica le informazioni importanti e ritrovale quando servono all’ufficio o al cantiere.",
};

/** Immagini delle pagine di confronto (public/images/confronto, ottobre 2026). */
export const confrontoVisuals = {
  hub: { base: "/images/confronto/hub", alt: "Due cantieri a confronto: uno collegato all'ufficio, l'altro tra fogli sparsi, con i marchi dei gestionali confrontati" },
  teamsystem: { base: "/images/confronto/teamsystem", alt: "Edilizia in Cloud e TeamSystem: moduli separati collegati da passerelle accanto a un'unica sede dove un percorso arancione va dal cliente al cantiere e all'incasso" },
  primus: { base: "/images/confronto/primus", alt: "Edilizia in Cloud e PriMus: il computo metrico sul tavolo del tecnico che scorre fino al cantiere in costruzione" },
  excel: { base: "/images/confronto/excel", alt: "Edilizia in Cloud ed Excel: una scrivania sommersa di fogli e scontrini accanto a una scrivania ordinata collegata al cantiere" },
  edilnet: { base: "/images/confronto/edilnet", alt: "Edilizia in Cloud ed Edilnet: dalla richiesta del privato al sopralluogo, al preventivo, alla firma e al cantiere" },
  buildertrend: { base: "/images/confronto/buildertrend", alt: "Edilizia in Cloud e Buildertrend: un cantiere di ristrutturazione italiano in primo piano, una casa in legno americana sullo sfondo" },
} as const;
