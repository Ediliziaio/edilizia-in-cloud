/**
 * Stati di una richiesta d'offerta e delle singole risposte fornitore.
 * Unica fonte per etichette e colori, come per gli ordini d'acquisto: il CHECK
 * sul database ammette esattamente questi valori.
 */

export const RDO_STATUS_LABELS: Record<string, string> = {
  bozza: "Bozza",
  inviata: "Inviata",
  in_valutazione: "In valutazione",
  aggiudicata: "Aggiudicata",
  chiusa: "Chiusa",
  annullata: "Annullata",
};

export const RDO_STATUS_COLORS: Record<string, string> = {
  bozza: "bg-muted text-muted-foreground",
  inviata: "bg-blue-100 text-blue-800",
  in_valutazione: "bg-amber-100 text-amber-800",
  aggiudicata: "bg-emerald-100 text-emerald-800",
  chiusa: "bg-slate-100 text-slate-600",
  annullata: "bg-destructive/10 text-destructive",
};

/** Stato della singola riga fornitore dentro la richiesta. */
export const RDO_FORNITORE_LABELS: Record<string, string> = {
  da_inviare: "Da inviare",
  inviata: "In attesa",
  risposta: "Ha risposto",
  rifiutata: "Ha declinato",
  scaduta: "Scaduta",
};

export const RDO_FORNITORE_COLORS: Record<string, string> = {
  da_inviare: "bg-muted text-muted-foreground",
  inviata: "bg-blue-100 text-blue-800",
  risposta: "bg-emerald-100 text-emerald-800",
  rifiutata: "bg-slate-200 text-slate-600",
  scaduta: "bg-amber-100 text-amber-800",
};
