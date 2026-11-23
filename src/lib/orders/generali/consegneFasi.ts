import { normalizzaUnita } from "@/lib/distinta/generaDistinta";
import { ODA_STATI_EMESSI } from "@/lib/odaStatus";
import { aggiungiGiorni } from "@/lib/orders/cronoprogramma";
import { unitaMateriale, type ProcurementCoverage } from "@/lib/orders/materialProcurement";
import { planningDay } from "@/lib/orders/planning";
import { faseCompletata } from "@/lib/orders/schedaCommessa";

export interface RigaFabbisognoFase {
  id: string;
  order_id: string;
  phase_id: string | null;
  name: string;
  quantity: number;
  quantity_received: number | null;
  unita_misura: string | null;
  data_fabbisogno: string | null;
  status: string | null;
  stock_item_id: string | null;
  quantity_reserved: number | null;
  warehouse_supply_quantity?: number | null;
  auto_deducted: boolean | null;
}

type FaseFabbisogno = {
  id: string; order_id: string; name: string; start_date: string | null;
  status: string | null; percentuale: number | null; esecuzione?: string | null;
};
type Motivo = "scaduto" | "oggi" | "ritardo" | "da_ordinare" | "verifica" | "data" | "attesa" | "consegna_da_confermare";
export const MOTIVI_FABBISOGNO: Record<Motivo, string> = {
  scaduto: "Fabbisogno scaduto", oggi: "Serve oggi", ritardo: "Consegna in ritardo",
  da_ordinare: "Da ordinare", verifica: "Da verificare", data: "Data da pianificare", attesa: "In attesa",
  consegna_da_confermare: "Consegna da confermare",
};

export interface ConsegnaFase {
  id: string;
  idFase: string;
  orderId: string;
  fase: string;
  articolo: string;
  unita: string;
  previsti: number;
  arrivati: number;
  assegnati: number;
  mancanti: number;
  daOrdinare: number;
  serveEntro: string | null;
  motivo: Motivo;
  aRischio: boolean;
  unitaDaVerificare: boolean;
  oda: ProcurementCoverage["purchase_orders"] | null;
}

const formato = new Intl.NumberFormat("it", { maximumFractionDigits: 4 });
export const formattaFabbisogno = (q: number, unita: string) => `${formato.format(q)} ${unita}`;
const q = (valore: unknown) => {
  const n = Number(valore);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1_000_000) / 1_000_000 : 0;
};
const stessaUnita = (ordine: ProcurementCoverage, riga: RigaFabbisognoFase) =>
  !ordine.unit_of_measure?.trim() || normalizzaUnita(ordine.unit_of_measure) === normalizzaUnita(unitaMateriale(riga));

export function consegneFasi(materiali: RigaFabbisognoFase[], coperture: ProcurementCoverage[], fasi: FaseFabbisogno[], oggi: string) {
  const fasiAperte = new Map(fasi.filter(f => !faseCompletata(f) && f.esecuzione !== "subappalto_fornitura_posa").map(f => [f.id, f]));
  const coperturaPerArticolo = new Map<string, ProcurementCoverage[]>();
  for (const r of coperture) {
    if (!r.order_item_id || !ODA_STATI_EMESSI.some(stato => stato === r.purchase_orders.status)) continue;
    const righe = coperturaPerArticolo.get(r.order_item_id);
    if (righe) righe.push(r);
    else coperturaPerArticolo.set(r.order_item_id, [r]);
  }
  const orizzonte = aggiungiGiorni(oggi, 14);
  const fabbisogni: ConsegnaFase[] = [];
  for (const riga of materiali) {
    const fase = riga.phase_id && fasiAperte.get(riga.phase_id);
    const previsti = q(riga.quantity);
    if (!fase || fase.order_id !== riga.order_id || !previsti
      || ["installato", "disponibile", "in_magazzino"].includes(riga.status ?? "")) continue;
    const emessi = coperturaPerArticolo.get(riga.id) ?? [];
    const coerenti = emessi.filter(ordine => stessaUnita(ordine, riga));
    const unitaDaVerificare = coerenti.length !== emessi.length;
    // Il DDT può aggiornare sia la riga materiale sia la sua riga OdA.
    const arrivati = Math.max(q(riga.quantity_received), q(coerenti.reduce((tot, ordine) => tot + q(ordine.quantity_received), 0)));
    const quotaDaScorta = riga.stock_item_id ? q(riga.warehouse_supply_quantity) : 0;
    const assegnati = quotaDaScorta || (riga.stock_item_id ? q(riga.auto_deducted ? previsti : riga.quantity_reserved) : 0);
    // Un arrivo in magazzino può essere la stessa merce già assegnata all’articolo.
    const mancanti = q(previsti - (quotaDaScorta > 0 ? arrivati + assegnati : Math.max(arrivati, assegnati)));
    if (!mancanti) continue;

    const serveEntro = planningDay(riga.data_fabbisogno) || planningDay(fase.start_date) || null;
    const aperti = coerenti.filter(o => o.purchase_orders.status !== "ricevuto" && q(o.quantity - o.quantity_received) > 0);
    const inOrdine = q(aperti.reduce((tot, o) => tot + q(o.quantity - o.quantity_received), 0));
    const daOrdinare = q(mancanti - inOrdine);
    const inTempo = serveEntro ? q(aperti.reduce((tot, o) => {
      const arrivo = planningDay(o.purchase_orders.expected_delivery_date);
      return arrivo >= oggi && arrivo <= serveEntro ? tot + q(o.quantity - o.quantity_received) : tot;
    }, 0)) : 0;
    const oltreData = !!serveEntro && aperti.some(o => {
      const data = planningDay(o.purchase_orders.expected_delivery_date);
      return !!data && (data < oggi || data > serveEntro);
    });
    const aRischio = !!serveEntro && (serveEntro <= oggi || (inTempo < mancanti && (serveEntro <= orizzonte || oltreData)));
    let motivo: Motivo = "attesa";
    if (unitaDaVerificare) motivo = "verifica";
    else if (!serveEntro) motivo = "data";
    else if (serveEntro < oggi) motivo = "scaduto";
    else if (serveEntro === oggi) motivo = "oggi";
    else if (oltreData && inTempo < mancanti) motivo = "ritardo";
    else if (daOrdinare > 0) motivo = "da_ordinare";
    else if (inTempo < mancanti) motivo = "consegna_da_confermare";
    const collegato = aperti[0] ?? coerenti[0] ?? emessi[0];
    fabbisogni.push({
      id: riga.id, idFase: fase.id, orderId: fase.order_id, fase: fase.name, articolo: riga.name,
      unita: unitaMateriale(riga), previsti, arrivati, assegnati, mancanti, daOrdinare, serveEntro, motivo, aRischio,
      unitaDaVerificare, oda: collegato?.purchase_orders ?? null,
    });
  }
  return fabbisogni.sort((a, b) => Number(b.aRischio) - Number(a.aRischio)
    || (a.serveEntro ?? "9999").localeCompare(b.serveEntro ?? "9999") || a.articolo.localeCompare(b.articolo, "it"));
}
