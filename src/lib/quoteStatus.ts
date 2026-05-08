export type QuoteStatus = "bozza" | "inviata" | "accettata" | "rifiutata" | "scaduta" | "convertita";

export const QUOTE_STATUS_CONFIG: Record<
  QuoteStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    /** Tailwind classes per colore badge — sovrascrivono il variant per maggiore leggibilità */
    className: string;
  }
> = {
  bozza:      {
    label: "Bozza",
    variant: "secondary",
    className: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600",
  },
  inviata:    {
    label: "Inviata",
    variant: "default",
    className: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700",
  },
  accettata:  {
    label: "Accettata",
    variant: "default",
    className: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700",
  },
  rifiutata:  {
    label: "Rifiutata",
    variant: "destructive",
    className: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700",
  },
  scaduta:    {
    label: "Scaduta",
    variant: "outline",
    className: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700",
  },
  convertita: {
    label: "Convertita",
    variant: "secondary",
    className: "bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-700",
  },
};
