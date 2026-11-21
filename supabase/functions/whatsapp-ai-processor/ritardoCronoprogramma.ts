import { proponiRitardoCronoprogramma, type DatiCronoprogramma, type RitardoDichiarato } from "../../../shared/piano-cantiere/ritardo.ts";
import { oggiInItalia } from "../../../shared/silvio-commessa/date.ts";
import type { ConfermaAttesa } from "../_shared/botOperativoConferme.ts";
import { aPezzi, confirmationHash, elencoCantieri, MAX_CANTIERI_IN_ELENCO } from "./frozenConfirmation.ts";
import { buildInteractivePayload, type InteractivePayload } from "./interactive.ts";
import { sceltaCantiere } from "./tools/shared/sceltaCantiere.ts";
import { errResult, okResult, type ToolCtx } from "./tools/shared/types.ts";

export const AZIONE_RITARDO = "aggiorna_cronoprogramma";
type Richiesta = RitardoDichiarato & { cantiere: string | null };
const NUMERI = ["zero", "uno", "due", "tre", "quattro", "cinque", "sei", "sette", "otto", "nove", "dieci",
  "undici", "dodici", "tredici", "quattordici", "quindici", "sedici", "diciassette", "diciotto", "diciannove", "venti"];
const DURATA = "([+-]?\\d+(?:[.,]\\d+)?|[\\p{L}]+)\\s+giorn[oi](?:\\s+(lavorativ[oi]|solar[ei]|di calendario))?";
const FINE = new RegExp(`^(?:finiamo|finiremo)(?:\\s+(.+?))?\\s+(in ritardo di|con)\\s+${DURATA}(\\s+di ritardo)?$`, "iu");
const FINE_TARDI = new RegExp(`^(?:finiamo|finiremo)(?:\\s+(.+?))?\\s+${DURATA} (?:in|di) ritardo$`, "iu");
const FASE = new RegExp(`^(?:la )?fase (.+?) (?:slitta|ritarda) di ${DURATA}$`, "iu");
const RITARDO = new RegExp(`^(?:ritardo di|(?:sposta|posticipa) (?:la )?fine (?:(?:dei )?lavori|della commessa) di) ${DURATA}(?: (?:per (?:la )?fase|sulla fase) (.+))?$`, "iu");

export function leggiRitardoCronoprogramma(testo: string): { richiesta: Richiesta } | { errore: string } | null {
  const t = testo.trim().replace(/^(?:(?:ciao|buongiorno|ok|per favore)[ ,.!]+)+/i, "").replace(/[.!]+$/, "").replace(/\s+/g, " ");
  if (!t || t.length > 300 || t.includes("?")) return null;
  const luogo = t.match(/^(.*?)[, ]+(?:al|sul|nel|in|per il|alla|sulla|nella|per la) (?:cantiere|commessa) (.+)$/i);
  const frase = luogo?.[1] ?? t;
  let m = FINE.exec(frase);
  let fase: string | undefined, quanti: string | undefined, unita: string | undefined;
  if (m && (m[2].toLowerCase() !== "con" || m[5])) [, fase, , quanti, unita] = m;
  else if ((m = FINE_TARDI.exec(frase))) [, fase, quanti, unita] = m;
  else if ((m = FASE.exec(frase))) [, fase, quanti, unita] = m;
  else if ((m = RITARDO.exec(frase))) [, quanti, unita, fase] = m;
  else if (/^(?:finiamo|finiremo) in ritardo$/i.test(frase)) return { errore: "Di quanti giorni? Scrivi «Finiamo in ritardo di 3 giorni al cantiere Rossi»." };
  else return null;
  const numero = quanti?.toLowerCase() ?? "";
  const giorni = /^\d+$/.test(numero) ? Number(numero) : ["un", "una"].includes(numero) ? 1 : NUMERI.indexOf(numero);
  if (!Number.isInteger(giorni) || giorni < 1 || giorni > 260) {
    return { errore: "Indica un numero intero da 1 a 260 giorni per ripianificare." };
  }
  const nomeFase = fase?.replace(/^(?:(?:la|le|il|lo|i|gli)\s+|l['’])/i, "").replace(/^fase\s+/i, "").trim();
  return { richiesta: {
    giorni, solari: /solar|calendario/i.test(unita ?? ""), cantiere: luogo?.[2]?.trim() ?? null,
    fase: nomeFase && !/^(?:lavor[oi]|commessa|cantiere|tutto)$/i.test(nomeFase) ? nomeFase : null,
  } };
}

function linkCronoprogramma(orderId: string) {
  return `https://app.ediliziaincloud.com/azienda/ordini/${orderId}?tab=cantiere&vista_cantiere=cronoprogramma`;
}

const dataIt = (data: string | null) => data ? data.split("-").reverse().join("/") : "da pianificare";
const paroleGiorni = (r: Richiesta) => `${r.giorni} ${r.giorni === 1 ? "giorno" : "giorni"} ${r.solari
  ? "di calendario" : r.giorni === 1 ? "lavorativo" : "lavorativi"}`;
const titolo = (testo: string) => testo.replace(/\s+/g, " ").trim().slice(0, 160);

export async function puoRipianificare(ctx: ToolCtx): Promise<boolean> {
  if (!ctx.user_id) return false;
  const { data, error } = await ctx.supabase.rpc("has_permission_for_company", {
    _user_id: ctx.user_id, _permission: "can_edit_orders", _company_id: ctx.company_id,
  });
  return !error && data === true;
}

type AnteprimaRitardo = { testo: string } | { pending: ConfermaAttesa; menu: InteractivePayload; dettagli?: string[] };

export async function preparaRitardo(ctx: ToolCtx, richiesta: Richiesta, scelta?: string): Promise<AnteprimaRitardo> {
  let orderId = scelta;
  const pending: ConfermaAttesa = {
    azione: AZIONE_RITARDO, proposta_id: null, chiesta_il: new Date().toISOString(), numero_id: ctx.waNumberId,
    id: crypto.randomUUID(), parametri: { richiesta }, source_message_id: ctx.requestId,
  };
  if (!orderId) {
    const suggerito = await sceltaCantiere(ctx, { hint: richiesta.cantiere });
    orderId = !richiesta.cantiere || suggerito.proposto?.motivo === "come mi hai scritto" ? suggerito.proposto?.id : undefined;
    if (!orderId) {
      const cantieri = suggerito.candidati.slice(0, MAX_CANTIERI_IN_ELENCO).map(({ id, titolo, dettaglio }) => ({ id, titolo, dettaglio }));
      if (!cantieri.length) return { testo: "Non trovo un cantiere aperto per questa richiesta. Scrivi il codice della commessa insieme al ritardo." };
      const attesa = { ...pending, cantieri, lista_mostrata: true,
        payload_hash: await confirmationHash(AZIONE_RITARDO, pending.parametri!, null, cantieri) };
      return { pending: attesa, menu: elencoCantieri(attesa, `Su quale cantiere sposto le date di ${paroleGiorni(richiesta)}?`) };
    }
  }
  const { data, error } = await ctx.supabase.rpc("cronoprogramma_ritardo_whatsapp", {
    p_azienda: ctx.company_id, p_utente: ctx.user_id, p_commessa: orderId,
  });
  if (error || !data) return { testo: "Il cronoprogramma di questa commessa non è disponibile per il tuo profilo. Verifica in Cantiere." };
  const dati = data as DatiCronoprogramma;
  const esito = proponiRitardoCronoprogramma(dati, richiesta);
  if ("errore" in esito) return { testo: esito.errore };

  const { piano, finePrima, cambi, daVerificare } = esito;
  const intestazione = [
    `*Cronoprogramma · ${titolo(dati.commessa.titolo)}*`,
    `Ritardo indicato: ${paroleGiorni(richiesta)}.`,
    `Fine lavori prevista: ${dataIt(finePrima)} → ${dataIt(piano.fine)}.`,
  ];
  const righe = cambi.map(f => f.inizio === f.prima.inizio
    ? `• ${titolo(f.nome)}. Fine ${dataIt(f.prima.fine)} → ${dataIt(f.fine)}.`
    : `• ${titolo(f.nome)}. Dal ${dataIt(f.prima.inizio)} al ${dataIt(f.prima.fine)} → dal ${dataIt(f.inizio)} al ${dataIt(f.fine)}.`);
  if (piano.sottofasi.length) righe.push(`Sottofasi ripianificate nelle fasi spostate: ${piano.sottofasi.length}.`);
  if (dati.commessa.consegna && piano.fine > dati.commessa.consegna) {
    righe.push(`La fine prevista supera la consegna in commessa del ${dataIt(dati.commessa.consegna)}.`);
  }
  if (piano.fine < oggiInItalia()) righe.push("La fine calcolata è già passata. Verifica i giorni indicati.");
  if (daVerificare.length) righe.push("Da verificare nelle Lavorazioni", ...daVerificare.map(f => "• " + titolo(f)));
  const domanda = "Aggiorno queste date?";
  const completa = [...intestazione, ...righe, "", domanda].join("\n");
  const dettagli = completa.length > 1024 ? aPezzi([...intestazione, ...righe], 3500) : undefined;
  const testo = dettagli ? [...intestazione, `${piano.fasi.length} fasi con nuove date, nel riepilogo qui sopra.`, domanda].join("\n") : completa;
  const parametri = { richiesta, order_id: orderId, piano };
  const attesa = { ...pending, parametri, payload_hash: await confirmationHash(AZIONE_RITARDO, parametri, null) };
  return {
    pending: attesa, dettagli,
    menu: buildInteractivePayload(testo, [
      { id: `approve:${attesa.id}`, title: "Aggiorna date" },
      { id: `reject:${attesa.id}`, title: "Annulla" },
    ]),
  };
}

export async function applicaRitardo(ctx: ToolCtx, parametri: Record<string, unknown>) {
  const orderId = String(parametri.order_id);
  const { data, error } = await ctx.supabase.rpc("cronoprogramma_ritardo_whatsapp", {
    p_azienda: ctx.company_id, p_utente: ctx.user_id, p_commessa: orderId, p_proposta: parametri.piano,
  });
  if (error?.code === "PT409" || error?.code === "40001") {
    return errResult("cronoprogramma_cambiato", "Le date sono cambiate nel gestionale. Ripeti il messaggio di ritardo per vedere il nuovo riepilogo.");
  }
  if (error?.code === "42501") return errResult("cronoprogramma_permesso", "La commessa non è più modificabile dal tuo profilo.");
  if (error || data?.ok !== true) return errResult("cronoprogramma_esito", "Aggiornamento da verificare nel cronoprogramma della commessa.");
  const fasi = Number(data.fasi);
  const daVedere = fasi ? ` ${fasi === 1 ? "Una fase aggiornata" : fasi + " fasi aggiornate"}.` : "";
  return okResult(data, `Cronoprogramma aggiornato. Fine lavori prevista ${dataIt(data.fine)}.${daVedere}\n${linkCronoprogramma(orderId)}`);
}
