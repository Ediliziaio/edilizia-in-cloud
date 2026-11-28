/**
 * Assegni ed effetti (Ri.Ba./RID) nello Scadenzario (28/11/2026): la parte dati della VISUALIZZAZIONE.
 * Un effetto con data futura non chiude la scadenza, ma ne «copre» l'importo: quella quota uscirà
 * (o entrerà) alla data dell'effetto, e fino ad allora non è scaduta. Qui: lettura da
 * `effetti_elenco` (la lettura sta in `hooks/useEffetti.ts`), aggancio alle righe (`riga_scadenzario_id` = id della riga di `scadenzario_fonti`),
 * quota coperta, stato della riga, testo del badge, righe del CSV.
 */
import type { EffettoRow } from "./forecastLedger";
import { oggiIso, statoScadenza, type TonoStato } from "./collegamentiFinanza";

export type Effetto = EffettoRow;
export type StatoEffetto = "in_attesa" | "pagato" | "insoluto" | "annullato";
export const STATI_EFFETTO: StatoEffetto[] = ["in_attesa", "pagato", "insoluto", "annullato"];
export const ETICHETTA_STATO_EFFETTO: Record<StatoEffetto, string> = {
  in_attesa: "In attesa", pagato: "Pagato", insoluto: "Insoluto", annullato: "Annullato",
};

const arrotonda = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Nome del tipo, per il badge e per l'elenco. */
export function nomeTipoEffetto(tipo: string | null | undefined): string {
  return tipo === "riba" ? "Ri.Ba." : tipo === "rid" ? "RID" : "Assegno";
}

/** gg/mm da yyyy-MM-dd, senza passare da Date (niente scarti di fuso). */
const ggMm = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
const ggMmAaaa = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const eur0 = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: true }).format(n);

/** Un effetto in attesa la cui data è già passata: l'incasso/pagamento va confermato a mano. */
export const eDaConfermare = (e: Effetto, oggi = oggiIso()) =>
  e.stato === "in_attesa" && (!!e.da_confermare || (!!e.data_scadenza && e.data_scadenza < oggi));

/** Copre la scadenza solo un effetto in attesa e non ancora scaduto. */
export const copreAdesso = (e: Effetto, oggi = oggiIso()) =>
  e.stato === "in_attesa" && !eDaConfermare(e, oggi) && arrotonda(Number(e.importo)) > 0;

/** Gli effetti in attesa, per id della riga dello Scadenzario. */
export function effettiPerRiga(effetti: readonly Effetto[] | undefined): Map<string, Effetto[]> {
  const m = new Map<string, Effetto[]>();
  for (const e of effetti ?? []) {
    if (e.stato !== "in_attesa") continue;
    const k = e.riga_scadenzario_id ?? e.scadenza_id;
    if (!k) continue;
    const l = m.get(k) ?? [];
    l.push(e);
    m.set(k, l);
  }
  return m;
}

/** Quanto della riga è coperto da effetti non ancora scaduti, mai più del residuo. */
export function copertoRiga(effetti: readonly Effetto[] | undefined, residuo: number, oggi = oggiIso()): number {
  if (!effetti?.length || residuo <= 0) return 0;
  const somma = effetti.filter((e) => copreAdesso(e, oggi)).reduce((n, e) => n + Number(e.importo || 0), 0);
  return arrotonda(Math.min(somma, residuo));
}

/** Il residuo è tutto coperto da effetti non ancora scaduti. */
export const eCoperta = (effetti: readonly Effetto[] | undefined, residuo: number, oggi = oggiIso()) =>
  residuo > 0 && copertoRiga(effetti, residuo, oggi) >= arrotonda(residuo) - 0.005;

/** «Assegno al 15/12», oppure «2 effetti · 4.500 €». Null se non c'è niente da dire. */
export function testoBadgeEffetti(effetti: readonly Effetto[] | undefined): string | null {
  const l = (effetti ?? []).filter((e) => e.stato === "in_attesa");
  if (!l.length) return null;
  if (l.length === 1) {
    const e = l[0];
    return `${nomeTipoEffetto(e.tipo)} al ${ggMm(e.data_scadenza) || "—"}`;
  }
  return `${l.length} effetti · ${eur0(l.reduce((n, e) => n + Number(e.importo || 0), 0))}`;
}

/** Il badge dice di più al passaggio del mouse: ogni effetto con data e importo. */
export function titoloBadgeEffetti(effetti: readonly Effetto[] | undefined): string {
  return (effetti ?? []).filter((e) => e.stato === "in_attesa")
    .map((e) => `${nomeTipoEffetto(e.tipo)}${e.numero ? ` n. ${e.numero}` : ""} · ${ggMmAaaa(e.data_scadenza) || "senza data"} · ${eur0(Number(e.importo || 0))}`).join("\n");
}

type RigaPerStato = Parameters<typeof statoScadenza>[0];

/**
 * Lo stato della riga: come `statoScadenza`, ma se il residuo è tutto coperto da effetti non ancora
 * scaduti dice «Coperta da assegno» (tono «attesa») invece di «Scaduta» o «Da pagare».
 */
export function statoConEffetti(s: RigaPerStato, effetti: readonly Effetto[] | undefined, oggi = oggiIso()): { label: string; tono: TonoStato; giorniRitardo: number; coperta: boolean } {
  const base = statoScadenza(s, oggi);
  if (base.tono === "ok" || base.tono === "spenta") return { ...base, coperta: false };
  const residuo = arrotonda(Number(s.amount) - Number(s.paid_amount || 0));
  if (!eCoperta(effetti, residuo, oggi)) return { ...base, coperta: false };
  const soloEffetti = (effetti ?? []).filter((e) => copreAdesso(e, oggi)).every((e) => e.tipo === "riba" || e.tipo === "rid");
  return { label: soloEffetti ? "Coperta da effetto" : "Coperta da assegno", tono: "attesa", giorniRitardo: 0, coperta: true };
}

/** Coperto da effetti per direzione, per i riquadri del periodo: entrata = effetti ricevuti. */
export function copertoPerDirezione(
  righe: ReadonlyArray<{ id?: string; direction: string | null; amount: number | string | null; paid_amount: number | string | null; status: string | null }>,
  effetti: readonly Effetto[] | undefined,
  oggi = oggiIso(),
): { entrate: { n: number; importo: number }; uscite: { n: number; importo: number }; perRiga: Map<string, number> } {
  const perRiga = new Map<string, number>();
  const out = { entrate: { n: 0, importo: 0 }, uscite: { n: 0, importo: 0 }, perRiga };
  const mappa = effettiPerRiga(effetti);
  for (const r of righe) {
    if (!r.id || r.status === "annullata" || r.status === "pagata") continue;
    const residuo = arrotonda(Number(r.amount || 0) - Number(r.paid_amount || 0));
    const c = copertoRiga(mappa.get(r.id), residuo, oggi);
    if (c <= 0) continue;
    perRiga.set(r.id, c);
    const d = r.direction === "entrata" ? out.entrate : out.uscite;
    d.n += 1;
    d.importo = arrotonda(d.importo + c);
  }
  return out;
}

/** Gli id delle righe coperte per intero da effetti non ancora scaduti (ordinati, per la chiave delle query). */
export function idCoperti(
  righe: ReadonlyArray<{ id: string; amount: number | string | null; paid_amount: number | string | null }>,
  effetti: readonly Effetto[] | undefined,
  oggi = oggiIso(),
): string[] {
  const mappa = effettiPerRiga(effetti);
  return righe.filter((r) => eCoperta(mappa.get(r.id), arrotonda(Number(r.amount || 0) - Number(r.paid_amount || 0)), oggi)).map((r) => r.id).sort();
}

/** Firma corta degli effetti, per la chiave della query del riepilogo (cambia quando cambiano). */
export const firmaEffetti = (effetti: readonly Effetto[] | undefined) =>
  (effetti ?? []).filter((e) => e.stato === "in_attesa").map((e) => `${e.id}:${e.importo}:${e.data_scadenza}`).sort().join("|");

/** Testo per la colonna «Effetti» dell'esportazione: «Assegno n. 12 · 15/12/2026 · 1.200,00 €». */
export function testoEffettiExport(effetti: readonly Effetto[] | undefined): string {
  return (effetti ?? []).filter((e) => e.stato === "in_attesa")
    .map((e) => {
      const [i, d] = Math.abs(arrotonda(Number(e.importo))).toFixed(2).split(".");
      return `${nomeTipoEffetto(e.tipo)}${e.numero ? ` n. ${e.numero}` : ""} ${ggMmAaaa(e.data_scadenza) || "senza data"} ${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${d} €`;
    }).join(" | ");
}
