export type QuoteStatus = "bozza" | "inviata" | "accettata" | "rifiutata" | "scaduta";

export const QUOTE_STATUS_CONFIG: Record<
  QuoteStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  bozza:     { label: "Bozza",     variant: "secondary"    },
  inviata:   { label: "Inviata",   variant: "default"      },
  accettata: { label: "Accettata", variant: "default"      },
  rifiutata: { label: "Rifiutata", variant: "destructive"  },
  scaduta:   { label: "Scaduta",   variant: "outline"      },
};
