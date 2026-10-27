/**
 * L'avviso quando il canale WhatsApp di un'azienda si ferma (27/10/2026).
 *
 * Quali errori lo fermano e cosa fare stanno in `whatsappCanaleFermo.ts` (puro, testato); qui si avvisa:
 * campanella agli amministratori dell'azienda, email a loro (anche col credito a zero: è un guasto) ed email a noi.
 * Il caso che l'ha fatto nascere: Il Bagno Group, 26 giorni di messaggi respinti senza che nessuno lo sapesse.
 */
// deno-lint-ignore-file no-explicit-any
import { avvisaSuperAdmin } from "./avvisaSuperAdmin.ts";
import { CODICI_CANALE_FERMO, cosaFarePerRipartire } from "./whatsappCanaleFermo.ts";
import { sendEmailUnified } from "./sendEmailUnified.ts";

/**
 * Avvisa l'azienda (campanella ai suoi amministratori ed email) e noi (email al titolare della piattaforma).
 * Una volta ogni 24 ore per azienda: a canale fermo i messaggi respinti sono decine.
 * Non lancia mai: l'esito del messaggio è già stato salvato da chi chiama.
 */
export async function segnalaCanaleWhatsAppFermo(admin: any, p: {
  companyId: string;
  codice: number;
  /** Il numero mittente, per far capire di quale si parla. */
  numero?: string | null;
}): Promise<void> {
  const motivo = CODICI_CANALE_FERMO[p.codice];
  if (!motivo) return;
  const cosaFare = cosaFarePerRipartire(p.codice);
  try {
    const { data, error } = await admin.rpc("avvisa_whatsapp_account_bloccato", {
      p_company_id: p.companyId,
      p_motivo: motivo,
      p_cosa_fare: cosaFare,
      p_codice: p.codice,
    });
    // Già avvisati nelle ultime 24 ore: non si ripete né la campanella né le email.
    if (error || !data?.avvisato) return;

    const azienda = typeof data.azienda === "string" ? data.azienda : "la tua azienda";
    const destinatari: string[] = Array.isArray(data.email) ? data.email : [];
    if (destinatari.length) {
      await sendEmailUnified({
        companyId: p.companyId,
        stream: "transactional",
        to: destinatari,
        subject: "URGENTE — I messaggi WhatsApp non partono più",
        html: `<p>Ciao,</p><p>da WhatsApp non parte più nessun messaggio ai vostri clienti: <strong>${motivo}</strong>.</p>`
          + `<p>Finché non si sistema, chi vi scrive non riceve risposta e l'assistente non può fissare appuntamenti.</p>`
          + `<p><strong>Cosa fare:</strong> ${cosaFare}</p>`
          + (p.numero ? `<p style="color:#666">Numero interessato: ${p.numero}</p>` : "")
          + `<p style="color:#666">Errore tecnico di Meta: ${p.codice}.</p>`,
        text: `Da WhatsApp non parte più nessun messaggio: ${motivo}.\n\nCosa fare: ${cosaFare}\n\nErrore Meta ${p.codice}.`,
        templateName: "whatsapp_canale_fermo",
        // L'avviso deve partire anche se il credito email dell'azienda è a zero: è un guasto, non una campagna.
        skipCredits: true,
        adminClient: admin,
        metadata: { tipo: "whatsapp_canale_fermo", codice: p.codice },
      });
    }

    await avvisaSuperAdmin(admin, {
      tipo: "whatsapp_account_bloccato",
      titolo: `WhatsApp fermo: ${azienda}`,
      testo: `${motivo}. I messaggi ai clienti non partono più.`,
      email: {
        testo: `Il canale WhatsApp di ${azienda} è fermo: ${motivo}. Nessun messaggio arriva ai clienti e l'assistente non può fissare appuntamenti.`,
        righe: [
          ["Azienda", azienda],
          ["Numero", p.numero || "—"],
          ["Errore Meta", String(p.codice)],
          ["Cosa deve fare il cliente", cosaFare],
        ],
      },
      url: "/admin/aziende",
      tag: `whatsapp-fermo-${p.companyId}`,
    });
  } catch (e) {
    console.error("[allarmeWhatsApp] avviso non riuscito:", (e as Error)?.message);
  }
}
