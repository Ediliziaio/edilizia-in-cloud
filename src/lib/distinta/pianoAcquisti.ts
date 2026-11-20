import { normalizzaTesto, normalizzaUnita } from "./generaDistinta";
import { contenutoConfezione, convertiInConfezioni, type MaterialeCollegato, type VoceMagazzino } from "./collegaArticoli";
import { ODA_STATI_EMESSI } from "@/lib/odaStatus";
import type { ProcurementCoverage } from "@/lib/orders/materialProcurement";
import type { OrigineRiga } from "./generaDistinta";
import { riscontriTavolaObsoleti, type ConteggioTavola } from "./confrontaTavole";

export interface MaterialeEsistente { id: string; updated_at?: string; chiave_materiale: string | null; stock_item_id: string | null; auto_deducted?: boolean | null; data_fabbisogno?: string | null; quantity_reserved?: number | null; quantity?: number | null; supplier_id?: string | null; phase_id?: string | null; riferimento?: string | null; name?: string; article_template_id?: string | null; product_code?: string | null; unita_misura?: string | null; specifiche?: string | null; quantita_calcolata?: number | null; origini?: OrigineRiga[] | null; description?: string | null }
export interface ContestoAcquisti {
  conteggiTavole?: ConteggioTavola[];
  coperturaIncompleta?: boolean;
  /** null significa lettura non disponibile, non magazzino vuoto. */
  magazzino: VoceMagazzino[] | null;
  esistenti: MaterialeEsistente[];
  coperture: ProcurementCoverage[];
  fasi: Array<{ id: string; start_date?: string | null }>;
  fornitori: Array<{ id: string; lead_time_days?: number | null }>;
  codiciArticoli?: Record<string, string | null | undefined>;
}
export interface AcquistoPianificato {
  chiave: string; materiale: MaterialeCollegato;
  necessario: number; ordinato: number; inBozza: number; daMagazzino: number;
  /** null: dati incompleti, nessuna quantità da comprare presentata come certa. */
  daComprare: number | null; nuovoOrdine: number | null;
  acquisto: { quantita: number; unita: string } | null;
  dataServe: string | null; ordinaEntro: string | null;
  anticipo: number; fonteAnticipo: "fornitore" | "stima";
  giacenze: Array<{ id: string; quantita: number }>;
  avvisi: string[];
}
const q = (n: number) => Math.round(n * 1e6) / 1e6;
const unita = (u: string | null | undefined) => {
  const n = normalizzaUnita(u);
  return ["cad", "cadauno", "n", "nr", "pz"].includes(n) ? "pz" : n;
};
const validaData = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** Stesse famiglie dell'anticipo tipico del gestionale. Sono stime, superate dal fornitore. */
export function anticipoMateriale(nome: string): number {
  const n = normalizzaTesto(nome).replace(/^n\s*\d+\s*/, "");
  if (/^(cav[oi]|comand|sond|tub|raccord|staff|support|valvol|kit |guarnizion|canalin|scarico|termostat|tassell|vit[ei] |nastro|collar|morsett|interruttor|cablaggio|grigli|bocchett|plenum|filtr|guaina|telecomando)/.test(n)) return 7;
  if (/serrament|finestr|portafinestr|infiss|vetrat|avvolgibil|tapparell|persian|oscurant|cassonett|zanzarier|portoncin|\bport[ae]\b/.test(n)) return 70;
  if (/pompa di calore|pompe di calore|caldai|chiller|bollitor|vmc|recuperator|unita di ventilazion|ventilconvett|fancoil|fan coil|deumidificator/.test(n)) return 50;
  if (/inverter|batteri|accumulo|modul[io] fotovolt|pannell[io] fotovolt/.test(n)) return 45;
  if (/radiant|collettor/.test(n)) return 35;
  if (/travertin|marmo|granito|pietra|soglia|soglie|davanzal/.test(n)) return 25;
  if (/ascensor|montacaric|piattaforma elevatric/.test(n)) return 90;
  return 7;
}

function fattoreUnita(u: string | null | undefined, m: MaterialeCollegato, nome?: string): number | null {
  // Un'unità mancante non autorizza a trasformare pezzi in kg o m².
  if (!u?.trim()) return null;
  if (unita(u) === unita(m.unita_misura)) return 1;
  const confezione = nome ? contenutoConfezione(nome) : null;
  if (/^(sacc|sacch|conf|secch|tanic|barr|pz|cad)/.test(normalizzaTesto(u)) && confezione && unita(confezione.unita) === unita(m.unita_misura)) return confezione.quantita;
  if (m.conversione && unita(u) === unita(m.conversione.unita)) return m.conversione.contenuto;
  return null;
}

/**
 * Fabbisogno al netto degli impegni e delle giacenze disponibili. Solo identità esatte:
 * codice articolo o nome completo con specifiche; un materiale «simile» non copre un ordine.
 * La stessa giacenza si usa una sola volta, dando precedenza alla fase che parte prima.
 * È una proposta: non riserva merce e non modifica il fabbisogno lordo della commessa.
 */
export function pianoAcquisti(materiali: MaterialeCollegato[], c: ContestoAcquisti): AcquistoPianificato[] {
  const usato = new Map<string, number>();
  const visti = new Set<string>();
  const dataDi = (m: MaterialeCollegato) => c.esistenti.find(e => e.chiave_materiale === m.chiave)?.data_fabbisogno ?? c.fasi.find(f => f.id === m.phase_id)?.start_date ?? null;
  const ordinati = [...materiali].sort((a, b) => (dataDi(a) ?? "9999").localeCompare(dataDi(b) ?? "9999") || a.chiave.localeCompare(b.chiave));
  const risultati = new Map<string, AcquistoPianificato>();
  for (const m of ordinati) {
    const avvisi: string[] = [];
    let incompleto = c.magazzino === null || c.coperturaIncompleta === true;
    if (m.proposta_ai && m.verifica_acquisto?.stato !== "confermata") { incompleto = true; avvisi.push("Proposta AI non validata: conferma quantità e rese prima di pianificare nuovi acquisti"); }
    if (m.verifica_acquisto?.stato === "da_verificare") { incompleto = true; avvisi.push(...m.verifica_acquisto.motivi); }
    if (c.magazzino === null) avvisi.push("Disponibilità di magazzino non verificata");
    if (c.coperturaIncompleta) avvisi.push("Ordini della commessa con righe non collegate: verifica la copertura prima di nuovi acquisti");
    if (riscontriTavolaObsoleti(m.origini, c.conteggiTavole ?? [])) { incompleto = true; avvisi.push("Il conteggio della tavola è cambiato: confrontalo e conferma di nuovo la quantità prima di acquistare."); }
    const necessario = Number(m.quantita_calcolata);
    if (!Number.isFinite(necessario) || necessario < 0) { incompleto = true; avvisi.push("Quantità prevista non valida"); }
    const esistente = c.esistenti.find(e => e.chiave_materiale === m.chiave);
    const fattoreEsistente = esistente?.unita_misura ? fattoreUnita(esistente.unita_misura, m, m.collegamento?.nome) : 1;
    if (fattoreEsistente === null) { incompleto = true; avvisi.push("Unità dell'articolo modificata rispetto al documento: verifica la conversione"); }
    const riservaArticolo = esistente?.stock_item_id && esistente.auto_deducted === true ? esistente.quantity : esistente?.quantity_reserved;
    const riservato = typeof riservaArticolo === "number" && fattoreEsistente !== null ? riservaArticolo * fattoreEsistente : null;
    const riservaNota = typeof riservato === "number" && Number.isFinite(riservato) && riservato > 0;
    if (esistente?.stock_item_id && !riservaNota) { incompleto = true; avvisi.push("Materiale già assegnato dal magazzino: verifica la quantità riservata nella commessa"); }
    const attesoArticolo = m.conversione && esistente?.unita_misura && unita(esistente.unita_misura) === unita(m.conversione.unita)
      ? m.conversione.quantita : fattoreEsistente ? necessario / fattoreEsistente : null;
    if (esistente?.quantity != null && attesoArticolo != null && Math.abs(Number(esistente.quantity) - attesoArticolo) > 0.0001) { incompleto = true; avvisi.push("Quantità dell'articolo modificata rispetto al documento: riconcilia il fabbisogno"); }
    let ordinato = 0, inBozza = 0;
    for (const r of c.coperture.filter(r => r.order_item_id === esistente?.id)) {
      const stato = r.purchase_orders.status;
      if (stato === "annullato") continue;
      const fattore = fattoreUnita(r.unit_of_measure, m, m.collegamento?.nome);
      if (fattore === null || !Number.isFinite(Number(r.quantity)) || Number(r.quantity) < 0) { incompleto = true; avvisi.push("Unità o quantità dell'ordine da verificare"); continue; }
      if (stato === "bozza") inBozza += Number(r.quantity) * fattore;
      else if ((ODA_STATI_EMESSI as readonly string[]).includes(stato)) ordinato += Number(r.quantity) * fattore;
      if (Number(r.quantity_received) < Number(r.quantity) && validaData(r.purchase_orders.expected_delivery_date) && validaData(dataDi(m)) && r.purchase_orders.expected_delivery_date > dataDi(m)!) avvisi.push(`Consegna ${r.purchase_orders.oda_number} dopo l'inizio della fase`);
    }
    ordinato = q(ordinato); inBozza = q(inBozza);
    let residuo = Math.max(0, necessario - ordinato), daMagazzino = riservaNota ? Math.min(residuo, riservato) : 0;
    residuo -= daMagazzino;
    const giacenze: AcquistoPianificato["giacenze"] = [];
    const codice = m.collegamento?.tipo === "articolo" ? c.codiciArticoli?.[m.collegamento.id]?.trim().toUpperCase() : null;
    const nome = normalizzaTesto([m.descrizione, m.specifiche].filter(Boolean).join(" "));
    if (!incompleto) for (const stock of c.magazzino ?? []) {
      const stessoCodice = !!codice && stock.internal_code?.trim().toUpperCase() === codice;
      const stessoNome = normalizzaTesto(stock.name) === nome || (!m.specifiche && normalizzaTesto(stock.name) === normalizzaTesto(m.descrizione));
      // quantity_available è già al netto di tutte le riserve: il libero residuo dello
      // stesso lotto è utilizzabile senza contare di nuovo la quota assegnata.
      if (!stessoCodice && !stessoNome) continue;
      const fattore = fattoreUnita(stock.unita_misura, m, stock.name);
      if (fattore === null) { incompleto = true; avvisi.push("Giacenza con unità diversa: verifica la conversione"); continue; }
      const disponibile = Number(stock.quantity_available);
      if (!Number.isFinite(disponibile) || disponibile < 0) { incompleto = true; avvisi.push("Disponibilità di magazzino non valida"); break; }
      const quota = q(Math.min(residuo, Math.max(0, disponibile - (usato.get(stock.id) ?? 0)) * fattore));
      if (quota <= 0 || visti.has(`${m.chiave}|${stock.id}`)) continue;
      visti.add(`${m.chiave}|${stock.id}`);
      usato.set(stock.id, (usato.get(stock.id) ?? 0) + quota / fattore);
      daMagazzino = q(daMagazzino + quota); residuo = q(residuo - quota);
      giacenze.push({ id: stock.id, quantita: quota });
    }
    const daComprare = incompleto ? null : q(residuo);
    const nuovoOrdine = daComprare === null ? null : q(Math.max(0, daComprare - inBozza));
    const confezione = nuovoOrdine == null ? null : convertiInConfezioni(nuovoOrdine, m.unita_misura, m.collegamento, m.descrizione);
    const consegna = c.fornitori.find(f => f.id === m.supplier_id || f.id === m.collegamento?.supplier_id)?.lead_time_days;
    const daFornitore = consegna != null && Number.isFinite(consegna) && consegna > 0;
    const anticipo = daFornitore ? Math.ceil(consegna) : anticipoMateriale(m.descrizione);
    const dataServe = validaData(dataDi(m)) ? dataDi(m) : null;
    const dataOrdine = dataServe ? new Date(`${dataServe}T00:00:00Z`) : null;
    dataOrdine?.setUTCDate(dataOrdine.getUTCDate() - anticipo);
    risultati.set(m.chiave, { chiave: m.chiave, materiale: m, necessario, ordinato, inBozza, daMagazzino,
      daComprare, nuovoOrdine, acquisto: nuovoOrdine == null ? null : { quantita: confezione?.quantita ?? nuovoOrdine, unita: confezione?.unita ?? m.unita_misura },
      dataServe, ordinaEntro: nuovoOrdine != null && nuovoOrdine > 0 ? dataOrdine?.toISOString().slice(0, 10) ?? null : null,
      anticipo, fonteAnticipo: daFornitore ? "fornitore" : "stima", giacenze, avvisi: [...new Set(avvisi)] });
  }
  return materiali.map(m => risultati.get(m.chiave)!);
}
