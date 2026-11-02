/** Etichette e descrizioni degli eventi storici di order_events. */
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";

interface OrderEvent { event_type: string; payload: Record<string, unknown> }

const ETICHETTE: Record<string, string> = {
  ordine_creato: "Commessa creata",
  ordine_aggiornato: "Commessa aggiornata",
  stato_cambiato: "Stato cambiato",
  articolo_aggiunto: "Articolo aggiunto",
  articolo_aggiornato: "Articolo aggiornato",
  articolo_stato_cambiato: "Articolo aggiornato",
  articolo_eliminato: "Articolo eliminato",
  acconto_ricevuto: "Acconto ricevuto",
  acconto_2_ricevuto: "2° Acconto ricevuto",
  saldo_ricevuto: "Saldo ricevuto",
  pagamento_fornitore: "Pag. fornitore",
  fattura_creata: "Fattura creata",
  fattura_inviata_sdi: "Fattura inviata SDI",
  fattura_pagata: "Fattura pagata",
  nota_credito_creata: "Nota credito",
  allegato_caricato: "Allegato caricato",
  foto_rilievo_caricata: "Foto rilievo",
  reportino_cantiere: "Report giornale",
  appuntamento_creato: "Appuntamento creato",
  appuntamento_confermato: "Appuntamento conf.",
  appuntamento_completato: "Appuntamento compl.",
  ordine_fornitore_creato: "OdF creato",
  ordine_fornitore_collegato: "OdA collegato",
  merce_arrivata: "Merce arrivata",
  contratto_firmato: "Contratto firmato",
  preventivo_accettato: "Preventivo accettato",
  giornale_lavori_inserito: "Report giornale",
  nota_interna: "Nota interna",
};

export const etichettaEvento = (tipo: string) => ETICHETTE[tipo] ?? tipo.replace(/_/g, " ");

export function descrizioneEvento(event: OrderEvent): string {
  const p = event.payload;
  switch (event.event_type) {
    case "stato_cambiato":
      return `${p.from_status ?? "?"} → ${p.to_status ?? "?"}`;
    case "articolo_stato_cambiato":
      return `${p.item_name}: ${p.from_status} → ${p.to_status}`;
    case "acconto_ricevuto":
    case "acconto_2_ricevuto":
    case "saldo_ricevuto":
      return `${p.label ?? ""} — €${Number(p.amount ?? 0).toLocaleString("it-IT", { minimumFractionDigits: 2, useGrouping: true })}`;
    case "fattura_creata":
    case "fattura_pagata":
      return `${p.numero ?? "Fattura"} — €${Number(p.total ?? p.totale ?? 0).toLocaleString("it-IT", { minimumFractionDigits: 2, useGrouping: true })}`;
    case "giornale_lavori_inserito": {
      const parts: string[] = [];
      if (p.data_lavori) parts.push(format(parseISO(p.data_lavori as string), "dd MMM yyyy", { locale: it }));
      if (p.lavorazioni) parts.push(String(p.lavorazioni).slice(0, 60) + (String(p.lavorazioni).length > 60 ? "…" : ""));
      if (p.personale) parts.push(`${p.personale} operai`);
      if (p.avanzamento != null) parts.push(`${p.avanzamento}% avanzamento`);
      return parts.join(" · ") || "Report giornaliero";
    }
    case "reportino_cantiere": {
      const parts: string[] = [];
      if (p.data_lavoro) parts.push(format(parseISO(p.data_lavoro as string), "dd MMM yyyy", { locale: it }));
      if (p.descrizione_lavori) parts.push(String(p.descrizione_lavori).slice(0, 80) + (String(p.descrizione_lavori).length > 80 ? "…" : ""));
      if (!p.lavoro_completato && p.ore_lavorate != null) parts.push(`${p.ore_lavorate}h dichiarate all’invio`);
      if (!p.lavoro_completato && p.percentuale_avanzamento != null) parts.push(`${p.percentuale_avanzamento}% proposto all’invio`);
      if (p.foto_count != null) parts.push(`${p.foto_count} foto`);
      if (p.lavoro_completato) parts.push("rapporto cliente");
      return parts.join(" · ") || "Rapportino campo";
    }
    case "allegato_caricato":
    case "foto_rilievo_caricata":
      return [
        p.file_name as string,
        p.file_type as string,
        p.file_size ? `${p.file_size}` : null,
      ].filter(Boolean).join(" · ") || "File caricato";
    case "appuntamento_creato":
    case "appuntamento_confermato":
    case "appuntamento_completato":
      return `${p.title ?? "Appuntamento"} — ${p.date ? format(parseISO(p.date as string), "dd MMM yyyy HH:mm", { locale: it }) : ""}`;
    case "contratto_firmato":
      return [
        p.action === "richiesta_firma_creata" ? "Richiesta firma inviata" : "Contratto firmato",
        p.document_type as string,
        (p.signer_name as string) || (p.signer_email as string),
        p.signed_at ? `firmato il ${format(parseISO(p.signed_at as string), "dd MMM yyyy HH:mm", { locale: it })}` : null,
      ].filter(Boolean).join(" · ");
    case "ordine_creato":
      return `${p.order_code ?? ""} ${p.description ?? ""}`.trim();
    default:
      return "";
  }
}
