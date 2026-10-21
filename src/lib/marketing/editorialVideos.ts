/** Publication times confirmed in the original editorial schedule, Europe/Rome. */
export const editorialVideos = {
  selection: {
    id: "PdwfISQVXPw",
    title: "7 domande prima di scegliere un gestionale",
    description: "Prima di confrontare le funzioni, parti dalle attività della tua impresa. Il video raccoglie sette domande per preparare una demo e valutare le alternative con criteri concreti.",
    poster: "/images/marketing/video-scelta-gestionale.webp",
    publishAt: "2026-10-22T20:00:00+02:00",
  },
  migration: {
    id: "Yk0hJ01HKco",
    title: "Da Excel e WhatsApp a un’impresa organizzata",
    description: "Fogli, messaggi e documenti possono raccontare pezzi diversi dello stesso lavoro. Da dove partire per riunirli e preparare il passaggio a un gestionale?",
    poster: "/images/marketing/video-migrazione-excel.webp",
    publishAt: "2026-10-30T20:00:00+01:00",
  },
  cash: {
    id: "SdOsQ9YyMvI",
    title: "Impresa in utile, conto in rosso: dove sono i soldi?",
    description: "Utile e liquidità rispondono a domande diverse. Un approfondimento per leggere insieme incassi attesi, pagamenti e disponibilità sul conto dell’impresa.",
    poster: "/images/marketing/video-utile-liquidita.webp",
    publishAt: "2026-10-26T20:00:00+01:00",
  },
} as const;
export type EditorialVideoKey = keyof typeof editorialVideos;

export function editorialVideoIsDue(publishAt: string, now = Date.now()): boolean {
  return now >= Date.parse(publishAt);
}

export function editorialVideoPublicationLabel(publishAt: string): string {
  const date = new Date(publishAt);
  const day = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "long" }).format(date);
  const time = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }).format(date);
  return `${day}, ore ${time} (ora italiana)`;
}
