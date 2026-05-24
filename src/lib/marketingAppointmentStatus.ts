export type MarketingAppointmentStatus =
  | "confermato"
  | "presentato"
  | "no_show"
  | "da_preventivare"
  | "preventivo_inviato"
  | "venduto"
  | "perso"
  | "non_qualificato"
  | "riprogrammato"
  | "completato"
  | "annullato";

export type MarketingAppointmentStatusVariant = "default" | "secondary" | "destructive" | "outline";

export interface MarketingAppointmentStatusMeta {
  label: string;
  variant: MarketingAppointmentStatusVariant;
  description: string;
}

export const MARKETING_APPOINTMENT_STATUS_OPTIONS: Array<{
  value: MarketingAppointmentStatus;
} & MarketingAppointmentStatusMeta> = [
  {
    value: "confermato",
    label: "Confermato",
    variant: "default",
    description: "Appuntamento fissato e valido.",
  },
  {
    value: "presentato",
    label: "Presentato",
    variant: "secondary",
    description: "Il contatto si e presentato, serve esito commerciale.",
  },
  {
    value: "da_preventivare",
    label: "Da preventivare",
    variant: "secondary",
    description: "Serve preparare o completare il preventivo.",
  },
  {
    value: "preventivo_inviato",
    label: "Preventivo inviato",
    variant: "outline",
    description: "Preventivo inviato, serve follow-up.",
  },
  {
    value: "venduto",
    label: "Venduto",
    variant: "default",
    description: "Appuntamento trasformato in vendita.",
  },
  {
    value: "perso",
    label: "Perso",
    variant: "destructive",
    description: "Opportunita persa o non chiusa.",
  },
  {
    value: "non_qualificato",
    label: "Non qualificato",
    variant: "outline",
    description: "Contatto non in target o non lavorabile.",
  },
  {
    value: "no_show",
    label: "No-show",
    variant: "destructive",
    description: "Il contatto non si e presentato.",
  },
  {
    value: "riprogrammato",
    label: "Riprogrammato",
    variant: "secondary",
    description: "Appuntamento da ripianificare o gia spostato.",
  },
  {
    value: "completato",
    label: "Completato",
    variant: "outline",
    description: "Appuntamento chiuso senza azioni aperte.",
  },
  {
    value: "annullato",
    label: "Annullato",
    variant: "destructive",
    description: "Appuntamento cancellato.",
  },
];

export const MARKETING_APPOINTMENT_STATUS_MAP = MARKETING_APPOINTMENT_STATUS_OPTIONS.reduce(
  (acc, item) => {
    acc[item.value] = {
      label: item.label,
      variant: item.variant,
      description: item.description,
    };
    return acc;
  },
  {} as Record<MarketingAppointmentStatus, MarketingAppointmentStatusMeta>,
);

export const MARKETING_APPOINTMENT_FOLLOW_UP_STATUSES: MarketingAppointmentStatus[] = [
  "presentato",
  "no_show",
  "da_preventivare",
  "preventivo_inviato",
  "riprogrammato",
];

export function getMarketingAppointmentStatusMeta(status?: string | null): MarketingAppointmentStatusMeta {
  return (
    MARKETING_APPOINTMENT_STATUS_MAP[status as MarketingAppointmentStatus] || {
      label: status || "Sconosciuto",
      variant: "secondary",
      description: "Stato personalizzato.",
    }
  );
}

export function getMarketingFollowUpSuggestion(status?: string | null): {
  title: string;
  dueInDays: number;
  priority: "bassa" | "normale" | "alta";
} | null {
  switch (status) {
    case "presentato":
      return { title: "Aggiornare esito appuntamento", dueInDays: 1, priority: "normale" };
    case "no_show":
      return { title: "Richiamare cliente no-show", dueInDays: 1, priority: "alta" };
    case "da_preventivare":
      return { title: "Preparare preventivo", dueInDays: 1, priority: "alta" };
    case "preventivo_inviato":
      return { title: "Follow-up preventivo inviato", dueInDays: 3, priority: "normale" };
    case "riprogrammato":
      return { title: "Riprogrammare appuntamento", dueInDays: 1, priority: "alta" };
    default:
      return null;
  }
}
