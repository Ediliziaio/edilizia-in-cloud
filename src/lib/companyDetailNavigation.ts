/** Gli URL ?tab= esistenti restano validi: cambia solo l'organizzazione visiva. */
export const COMPANY_AREAS = [
  {
    id: "riepilogo",
    label: "Riepilogo",
    description: "Stato dell’azienda e segnali di utilizzo",
    sections: [
      { id: "panoramica", label: "Situazione azienda" },
      { id: "ai", label: "Analisi e automazioni AI" },
    ],
  },
  {
    id: "azienda",
    label: "Azienda e team",
    description: "Anagrafica, sedi e persone",
    sections: [
      { id: "dettagli", label: "Dati aziendali" },
      { id: "team", label: "Persone e accessi" },
    ],
  },
  {
    id: "piano",
    label: "Piano e funzionalità",
    description: "Abbonamento, accessi e personalizzazione",
    sections: [
      { id: "abbonamento", label: "Abbonamento" },
      { id: "saas", label: "Funzionalità e limiti" },
      { id: "whitelabel", label: "Marchio e dominio" },
    ],
  },
  {
    id: "consumi",
    label: "Consumi e addebiti",
    description: "Wallet, tariffe e utilizzo dei servizi",
    sections: [
      { id: "billing", label: "Crediti e tariffe" },
      { id: "email", label: "Quote email" },
    ],
  },
  {
    id: "relazione",
    label: "Relazione cliente",
    description: "Assistenza, comunicazioni e avvio del cliente",
    sections: [
      { id: "supporto", label: "Assistenza" },
      { id: "comunicazioni", label: "Comunicazioni" },
      { id: "note", label: "Note CRM" },
      { id: "onboarding", label: "Percorso di avvio" },
    ],
  },
  {
    id: "registro",
    label: "Registro operazioni",
    description: "Eventi, modifiche e copie di sicurezza",
    sections: [
      { id: "attivita", label: "Tutti gli eventi" },
      { id: "lifecycle", label: "Abbonamento e backup" },
      { id: "audit", label: "Modifiche configurazione" },
    ],
  },
] as const;
export function companyAreaFor(section: string) {
  return (
    COMPANY_AREAS.find((area) =>
      area.sections.some((item) => item.id === section),
    ) ?? COMPANY_AREAS[0]
  );
}
export const COMPANY_SECTIONS = new Set<string>(
  COMPANY_AREAS.flatMap((area) => area.sections.map((section) => section.id)),
);
