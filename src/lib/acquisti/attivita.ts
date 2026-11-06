export interface AttivitaAcquisto {
  id: string;
  titolo: string;
  dettaglio: string;
  priorita: "attenzione" | "azione";
}
export const oggiLocale = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export function attivitaOda(d: {
  status: string;
  prezziPendenti: number;
  righe: number;
  email?: string | null;
  consegna?: string | null;
  conferma: boolean;
  oggi?: string;
}): AttivitaAcquisto[] {
  if (d.status === "annullato") return [];
  const a: AttivitaAcquisto[] = [];
  const aperto = d.status !== "ricevuto";
  if (!d.righe)
    a.push({
      id: "righe",
      titolo: "Inserisci gli articoli",
      dettaglio: "L’ordine non contiene ancora voci.",
      priorita: "azione",
    });
  if (d.prezziPendenti)
    a.push({
      id: "prezzi",
      titolo: "Completa i prezzi",
      dettaglio: `${d.prezziPendenti} voci con prezzo da confermare: i totali sono parziali.`,
      priorita: "attenzione",
    });
  if (aperto && !d.email)
    a.push({
      id: "email",
      titolo: "Completa il recapito",
      dettaglio: "Manca l’email del fornitore per l’invio dell’ordine.",
      priorita: "azione",
    });
  if (d.status === "bozza")
    a.push({
      id: "invio",
      titolo: "Invia o registra l’ordine",
      dettaglio: "È ancora in bozza.",
      priorita: "azione",
    });
  if (aperto && d.consegna && d.consegna < (d.oggi ?? oggiLocale()))
    a.push({
      id: "consegna",
      titolo: "Verifica la consegna scaduta",
      dettaglio: `La data prevista era ${d.consegna.split("-").reverse().join("/")}.`,
      priorita: "attenzione",
    });
  if (["inviato", "confermato", "parziale"].includes(d.status) && !d.conferma)
    a.push({
      id: "conferma",
      titolo: "Allega la conferma del fornitore",
      dettaglio:
        "Conserva il documento originale con prezzi e condizioni concordate.",
      priorita: "azione",
    });
  return a;
}
export function attivitaRdo(d: {
  status: string;
  righe: number;
  scadenza?: string | null;
  oggi?: string;
  fornitori: {
    status: string;
    nome: string;
    email?: string | null;
    scadenza?: string | null;
    copertura: number;
    aggancio?: boolean;
    trasportoDefinito?: boolean;
    coerente?: boolean;
  }[];
}): AttivitaAcquisto[] {
  if (["annullata", "aggiudicata"].includes(d.status)) return [];
  const a: AttivitaAcquisto[] = [];
  const oggi = d.oggi ?? oggiLocale();
  if (!d.righe)
    a.push({
      id: "righe",
      titolo: "Inserisci il fabbisogno",
      dettaglio: "Aggiungi almeno una voce da richiedere.",
      priorita: "azione",
    });
  if (!d.fornitori.length)
    a.push({
      id: "fornitori",
      titolo: "Scegli i fornitori",
      dettaglio: "Aggiungi chi deve preparare l’offerta.",
      priorita: "azione",
    });
  if (d.scadenza && d.scadenza < oggi)
    a.push({
      id: "scadenza",
      titolo: "Scadenza offerte superata",
      dettaglio:
        "Valuta le risposte o aggiorna la scadenza prima di sollecitare.",
      priorita: "attenzione",
    });
  for (const f of d.fornitori) {
    if (f.status === "da_inviare")
      a.push({
        id: `invio-${f.nome}`,
        titolo: `Richiedi l’offerta a ${f.nome}`,
        dettaglio: f.email
          ? "Prepara l’email oppure registra la richiesta fatta fuori dall’app."
          : "Completa l’email oppure registra la richiesta fatta fuori dall’app.",
        priorita: "azione",
      });
    if (f.status === "inviata")
      a.push({
        id: `attesa-${f.nome}`,
        titolo: `In attesa di ${f.nome}`,
        dettaglio: "L’offerta non risulta ancora registrata.",
        priorita: "azione",
      });
    if (f.status === "risposta" && f.copertura < d.righe)
      a.push({
        id: `voci-${f.nome}`,
        titolo: `Offerta incompleta: ${f.nome}`,
        dettaglio: `${f.copertura} voci valorizzate su ${d.righe}. Verifica disponibilità e prezzi.`,
        priorita: "attenzione",
      });
    if (f.status === "risposta" && f.scadenza && f.scadenza < oggi)
      a.push({
        id: `validita-${f.nome}`,
        titolo: `Offerta scaduta: ${f.nome}`,
        dettaglio: "Chiedi conferma della validità prima di scegliere.",
        priorita: "attenzione",
      });
    if (f.status === "risposta" && f.trasportoDefinito === false)
      a.push({
        id: `trasporto-${f.nome}`,
        titolo: `Definisci il trasporto: ${f.nome}`,
        dettaglio:
          "Indica se è incluso, extra oppure con ritiro prima del confronto finale.",
        priorita: "attenzione",
      });
    if (f.status === "risposta" && f.coerente === false)
      a.push({
        id: `totale-${f.nome}`,
        titolo: `Verifica il totale di ${f.nome}`,
        dettaglio:
          "Il totale documento non coincide con le voci e il trasporto.",
        priorita: "attenzione",
      });
    if (f.aggancio)
      a.push({
        id: `aggancio-${f.nome}`,
        titolo: `Controlla la risposta di ${f.nome}`,
        dettaglio: "L’abbinamento alla richiesta deve essere verificato.",
        priorita: "attenzione",
      });
  }
  return a;
}
