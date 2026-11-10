/** I numeri della scheda committente come li dà `scheda_committente_numeri`, e cosa chiedono di fare. */
import type { AzioneSuggerita } from "@/lib/clienti/cosaFareAdesso";

export interface NumeriCommittente {
  rendicontato: number;
  da_rendicontare: number;
  da_fatturare: number;
  ritenute: number;
  /** null = chi guarda non può leggere le fatture. */
  da_incassare: number | null;
  scaduto: number | null;
  scaduto_giorni: number | null;
  rendiconti_in_attesa: number;
  rendiconto_fermo_numero: number | null;
  rendiconto_fermo_giorni: number | null;
}

/** Dopo quanti giorni un rendiconto mandato senza risposta va richiamato. */
export const GIORNI_RENDICONTO = 7;
/** Quanto prima avvisare che un contratto sta per scadere. */
export const GIORNI_CONTRATTO = 30;

export function azioniCommittente(
  numeri: NumeriCommittente | null | undefined,
  contratto: { nome: string; valido_al: string | null; attivo?: boolean } | null,
  oggi: string,
  contrattiCaricati: boolean,
): AzioneSuggerita[] {
  const azioni: AzioneSuggerita[] = [];
  if (numeri) {
    if ((numeri.scaduto ?? 0) > 0) {
      azioni.push({ tipo: "sollecito", importo: Number(numeri.scaduto), giorni: Number(numeri.scaduto_giorni ?? 0), commesse: [] });
    }
    if (Number(numeri.da_rendicontare) > 0) azioni.push({ tipo: "da_rendicontare", importo: Number(numeri.da_rendicontare) });
    if (numeri.rendiconto_fermo_numero != null && Number(numeri.rendiconto_fermo_giorni ?? 0) >= GIORNI_RENDICONTO) {
      azioni.push({ tipo: "rendiconto_fermo", numero: numeri.rendiconto_fermo_numero, giorni: Number(numeri.rendiconto_fermo_giorni) });
    }
  }
  if (contrattiCaricati) {
    if (!contratto) {
      azioni.push({ tipo: "contratto", testo: "Nessun contratto: senza, una commessa in appalto non sa a quanto fatturare" });
    } else if (contratto.attivo === false) {
      // Spento apposta: non si ripete «scaduto da N giorni» per sempre.
      azioni.push({ tipo: "contratto", testo: "Nessun contratto in corso: quelli che ci sono sono spenti" });
    } else if (contratto.valido_al) {
      const giorni = Math.round((Date.parse(contratto.valido_al) - Date.parse(oggi)) / 86_400_000);
      if (giorni < 0) azioni.push({ tipo: "contratto", testo: `Il contratto «${contratto.nome}» è scaduto da ${-giorni === 1 ? "1 giorno" : `${-giorni} giorni`}` });
      else if (giorni <= GIORNI_CONTRATTO) azioni.push({ tipo: "contratto", testo: `Il contratto «${contratto.nome}» scade ${giorni === 0 ? "oggi" : giorni === 1 ? "domani" : `fra ${giorni} giorni`}` });
    }
  }
  return azioni;
}
