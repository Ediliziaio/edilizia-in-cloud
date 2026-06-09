/**
 * Etichetta leggibile in italiano per `companies.status` — usata nei portali
 * white-label (produttore/admin) al posto del valore DB grezzo (es. "active").
 */
export function companyStatusLabelIt(status: string | null | undefined): string {
  switch (status) {
    case "active": return "Attivo";
    case "trial":
    case "trialing": return "In prova";
    case "suspended": return "Sospeso";
    case "past_due": return "Pagamento in ritardo";
    case "canceled":
    case "cancelled": return "Annullato";
    case "inactive": return "Non attivo";
    case "pending": return "In attesa";
    default: return status || "—";
  }
}
