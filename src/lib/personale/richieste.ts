// Richieste di ferie e permessi: nome di chi le ha fatte e sovrapposizioni (01/10/2026).

export interface RichiestaPerElenco {
  id: string;
  profilo_id?: string | null;
  user_id?: string | null;
  stato: string;
  data_inizio: string;
  data_fine: string;
  profilo?: { nome?: string | null; cognome?: string | null } | null;
}

/** «Mario Rossi», o una dicitura chiara: prima la riga restava con un cerchio vuoto e nessun nome. */
export function nomeRichiedente(r: Pick<RichiestaPerElenco, "profilo">): string {
  const nome = [r.profilo?.nome, r.profilo?.cognome].map((x) => String(x ?? "").trim()).filter(Boolean).join(" ");
  return nome || "Dipendente non collegato";
}

export function inizialiRichiedente(r: Pick<RichiestaPerElenco, "profilo">): string {
  const i = `${String(r.profilo?.nome ?? "").trim()[0] ?? ""}${String(r.profilo?.cognome ?? "").trim()[0] ?? ""}`.toUpperCase();
  return i || "?";
}

/**
 * Chi altro è già assente (richiesta approvata) nei giorni di questa richiesta: serve a chi
 * approva per non lasciare l'azienda senza gente. Esclude chi ha fatto la richiesta.
 */
export function colleghiGiaAssenti(richiesta: RichiestaPerElenco, tutte: RichiestaPerElenco[]): string[] {
  const nomi = new Set<string>();
  for (const altra of tutte) {
    if (altra.id === richiesta.id || altra.stato !== "approvata") continue;
    const stessaPersona = (richiesta.profilo_id && altra.profilo_id === richiesta.profilo_id)
      || (richiesta.user_id && altra.user_id === richiesta.user_id);
    if (stessaPersona) continue;
    if (altra.data_inizio <= richiesta.data_fine && altra.data_fine >= richiesta.data_inizio) nomi.add(nomeRichiedente(altra));
  }
  return Array.from(nomi).sort((a, b) => a.localeCompare(b, "it"));
}
