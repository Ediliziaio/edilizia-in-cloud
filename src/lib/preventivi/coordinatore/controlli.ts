/**
 * Il controllo finale: ciò che una persona attenta guarderebbe prima di mandare il preventivo.
 *
 * Due sole categorie. Una «domanda» è un dato che manca e che solo l'utente conosce (una quantità, un
 * prezzo senza alcuna fonte): si raccolgono tutte in una schermata. Un «avviso» è un'incoerenza da
 * guardare: non blocca niente e non cambia niente da solo.
 *
 * Non è un certificato di completezza: non sa se manca una lavorazione che nessuno ha scritto. Quello
 * resta a Silvio, che legge la richiesta, e a chi firma il preventivo.
 */
import { normalizzaTesto } from "@/lib/distinta/generaDistinta";
import { unitaConfrontabile } from "./abbinamento";
import type { Controllo, EsitoVoce, ProfiloAzienda, VoceRichiesta } from "./tipi";

/** Oltre questo scarto dal prezzo già concordato in passato, lo si fa notare. */
export const SCARTO_STORICO_PCT = 20;

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const nome = (v: VoceRichiesta) => `«${(v.descrizione.trim().split("\n")[0] || "voce senza descrizione").slice(0, 90)}»`;
const perc = (n: number) => `${String(Math.round(n * 10) / 10).replace(".", ",")}%`;

function mediana(valori: number[]): number | null {
  if (!valori.length) return null;
  const o = [...valori].sort((a, b) => a - b); const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

export function controlliFinali(voci: readonly VoceRichiesta[], esiti: readonly EsitoVoce[], profilo: ProfiloAzienda, permessi: { costi: boolean }): Controllo[] {
  const controlli: Controllo[] = [];
  const perVoce = new Map(esiti.map(e => [e.voceId, e]));
  const aggiungi = (gravita: Controllo["gravita"], codice: string, voceId: string | null, testo: string) => controlli.push({ gravita, codice, voceId, testo: testo.slice(0, 600) });

  for (const v of voci) {
    const e = perVoce.get(v.id);
    if (v.quantita === null && !v.daQuantificare) aggiungi("domanda", "quantita_mancante", v.id, `Che quantità ha ${nome(v)}${v.unita ? ` (${v.unita})` : ""}? Non la sostituisco con 1.`);
    if (!v.unita.trim() && !v.daQuantificare) aggiungi("domanda", "unita_mancante", v.id, `Con che unità di misura si conta ${nome(v)}?`);
    if (!e) continue;
    if (e.stato === "senza_fonte" && v.prezzo === null && !v.daQuantificare) {
      aggiungi("domanda", "prezzo_senza_fonte", v.id, profilo.listinoPresente
        ? `Che prezzo ha ${nome(v)}? Non la trovo nel listino né nei preventivi accettati${permessi.costi ? ", e non ha un costo da cui calcolarlo" : ""}.`
        : `Che prezzo ha ${nome(v)}? L'azienda non ha un listino da cui prenderlo: scrivilo tu.`);
    }
    if (e.stato === "senza_fonte" && v.prezzo !== null) aggiungi("avviso", "prezzo_non_ritrovato", v.id, `${nome(v)}: il prezzo di ${euro.format(v.prezzo)} non ha una fonte scritta e non lo ritrovo in listini o storico.`);
    for (const c of e.conflitti) aggiungi("avviso", "conflitto_fonti", v.id, `${nome(v)}: ${c}`);
    for (const a of e.avvisi) aggiungi("avviso", a.startsWith("Stessa voce") ? "unita_diversa" : "prezzo_scaduto", v.id, `${nome(v)}: ${a}`);

    const prezzo = e.proposta?.prezzo !== undefined && !e.proposta.suManuale ? e.proposta.prezzo : v.prezzo;
    const concordati = e.candidati.filter(c => c.tipo === "storico" && c.selezionabile).map(c => c.valore);
    const riferimento = mediana(concordati);
    if (prezzo !== null && riferimento !== null && e.vendita?.tipo !== "storico") {
      const scarto = (prezzo - riferimento) / riferimento * 100;
      if (Math.abs(scarto) > SCARTO_STORICO_PCT) {
        aggiungi("avviso", "scostamento_storico", v.id, `${nome(v)}: ${euro.format(prezzo)} è il ${perc(Math.abs(scarto))} ${scarto > 0 ? "sopra" : "sotto"} i ${concordati.length === 1 ? "prezzo già accettato" : `${concordati.length} prezzi già accettati`} (${euro.format(riferimento)}).`);
      }
    }
    if (permessi.costi && prezzo !== null) {
      const costo = v.costo ?? e.costo?.valore ?? null;
      if (costo !== null && costo > prezzo) aggiungi("avviso", "sotto_costo", v.id, `${nome(v)}: il prezzo (${euro.format(prezzo)}) è sotto il costo (${euro.format(costo)}).`);
      else if (e.marginePct !== null && profilo.margineMinimoPct !== null && e.marginePct < profilo.margineMinimoPct) {
        aggiungi("avviso", "margine_sotto_minimo", v.id, `${nome(v)}: margine ${perc(e.marginePct)}, sotto il minimo dell'azienda (${perc(profilo.margineMinimoPct)}).`);
      }
    }
  }

  // Doppioni: stessa lavorazione, stessa unità, nello stesso capitolo. Capitoli diversi (cucina, bagno) sono legittimi.
  const gruppi = new Map<string, VoceRichiesta[]>();
  for (const v of voci) {
    const testo = normalizzaTesto(v.descrizione);
    if (!testo || v.opzionale) continue;
    const chiave = [normalizzaTesto(v.capitolo), testo, unitaConfrontabile(v.unita)].join("|");
    gruppi.set(chiave, [...(gruppi.get(chiave) ?? []), v]);
  }
  for (const gruppo of gruppi.values()) {
    if (gruppo.length > 1) aggiungi("avviso", "doppione", gruppo[0].id, `${nome(gruppo[0])} compare ${gruppo.length} volte nello stesso capitolo${gruppo[0].capitolo.trim() ? ` («${gruppo[0].capitolo.trim().slice(0, 60)}»)` : ""}: controlla che non sia contata due volte.`);
  }
  return controlli;
}
