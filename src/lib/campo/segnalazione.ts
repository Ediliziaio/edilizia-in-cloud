/** Una segnalazione dal cantiere è una frase: il titolo sono le sue prime parole, il resto va nella descrizione. */
export const MASSIMO_FOTO_SEGNALAZIONE = 3;
const LUNGHEZZA_TITOLO = 60;

export function segnalazioneDaTesto(testo: string, urgente: boolean) {
  const pulito = testo.trim().replace(/\s+/g, " ");
  if (!pulito) return null;
  const titolo = pulito.length <= LUNGHEZZA_TITOLO
    ? pulito
    : `${pulito.slice(0, LUNGHEZZA_TITOLO).replace(/\s+\S*$/, "")}…`;
  return {
    titolo,
    descrizione: pulito.length <= LUNGHEZZA_TITOLO ? null : testo.trim(),
    // `tickets` ha due colonne: `priority` (enum, la legge l'ufficio) e `priorita` (testo, vecchia).
    priorita: urgente ? "alta" : "media",
    priority: urgente ? "alta" as const : "normale" as const,
  };
}

/** «Serve entro» (24/11/2026): tre scelte a un tocco, la data la calcola il telefono. */
export type ServeEntro = "oggi" | "domani" | "settimana";
export const SERVE_ENTRO: { value: ServeEntro; label: string }[] = [
  { value: "oggi", label: "Oggi" },
  { value: "domani", label: "Domani" },
  { value: "settimana", label: "Questa settimana" },
];

const isoLocale = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** La data da salvare: oggi, domani, oppure il venerdì di questa settimana (sabato e domenica: oggi stesso). */
export function dataServeEntro(entro: ServeEntro, oggi: Date): string {
  const d = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());
  if (entro === "domani") d.setDate(d.getDate() + 1);
  if (entro === "settimana") {
    const giorno = d.getDay(); // 0 domenica … 6 sabato
    if (giorno >= 1 && giorno <= 5) d.setDate(d.getDate() + (5 - giorno));
  }
  return isoLocale(d);
}

/** Lo stato che vede l'operaio, in parole sue. */
export function statoSegnalazione(s: { status: string | null; merce_stato: string | null }): { testo: string; fatto: boolean } {
  if (s.merce_stato === "arrivata") return { testo: "Materiale arrivato", fatto: true };
  if (s.merce_stato === "arrivata_parziale") return { testo: "Arrivato in parte", fatto: false };
  if (s.merce_stato === "ordinata") return { testo: "Materiale ordinato", fatto: false };
  if (s.status === "risolto" || s.status === "chiuso") return { testo: "Risolto", fatto: true };
  if (s.status === "annullato") return { testo: "Chiusa dall'ufficio", fatto: true };
  if (s.status === "aperto" || s.status === null) return { testo: "Inviata all'ufficio", fatto: false };
  if (s.status === "in_attesa_merce") return { testo: "In attesa del materiale", fatto: false };
  if (s.status === "programmato") return { testo: "Intervento programmato", fatto: false };
  return { testo: "L'ufficio ci sta lavorando", fatto: false };
}
