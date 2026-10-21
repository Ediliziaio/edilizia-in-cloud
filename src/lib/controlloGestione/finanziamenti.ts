/** Campi di un mutuo/finanziamento come li compila il titolare. */
export interface FinanziamentoForm {
  banca: string;
  capitale_iniziale: number;
  capitale_residuo: number;
  rata_mensile: number;
  durata_mesi: number;
  rate_pagate: number;
  data_inizio: string;
  data_fine: string;
}

/** Controlli prima del salvataggio: il database rifiuterebbe con un messaggio tecnico. */
export function erroreFinanziamento(f: FinanziamentoForm): string | null {
  if (!f.banca.trim()) return "Scrivi il nome della banca o del finanziatore.";
  if (!(f.capitale_iniziale > 0)) return "Il capitale iniziale deve essere maggiore di zero.";
  if (!(f.capitale_residuo >= 0) || f.capitale_residuo > f.capitale_iniziale)
    return "Il capitale residuo deve stare tra zero e il capitale iniziale.";
  if (!(f.rata_mensile >= 0)) return "La rata mensile non può essere negativa.";
  if (!(f.durata_mesi > 0)) return "Indica la durata in mesi.";
  if (!(f.rate_pagate >= 0) || f.rate_pagate > f.durata_mesi) return "Le rate pagate non possono superare la durata.";
  if (!f.data_inizio || !f.data_fine || f.data_fine < f.data_inizio)
    return "La data di fine deve venire dopo quella di inizio.";
  return null;
}
