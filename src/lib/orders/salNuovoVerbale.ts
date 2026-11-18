/**
 * Il nuovo verbale SAL in un passaggio (10/11/2026, docs/piano-verbale-sal-sottofasi.md, lotto C).
 *
 * Chi fa il SAL n. 3 trova tutto già compilato: la rata da certificare, le sole voci che avanzano
 * rispetto al SAL n. 2, e in fondo il certificato di pagamento (ritenuta, acconti, netto) che prima
 * era un passaggio a parte. I conti del certificato sono quelli di salCertificato.ts.
 *
 * Modulo puro: niente React, niente Supabase.
 */
import type { Installment } from "@/lib/orderUtils";
import { certificatoProposto, nettoCertificato, type OpzioniCertificato, type SalCertificato } from "./salCertificato";
import { rateSalDaEmettere, type SalPerRata } from "./salRate";
import type { PercentualiPrecedenti, VoceSalDraft } from "./salDaFasi";

/** La rata proposta: la prima che il piano aspetta da un SAL e che nessun verbale certifica ancora. */
export function rataProposta(rate: ReadonlyArray<Installment>, salList: ReadonlyArray<SalPerRata>): string {
  return rateSalDaEmettere(rate, salList)[0]?.id ?? "";
}

/**
 * Il SAL finale certifica il saldo (15/11/2026): quando i lavori del verbale arrivano al valore del contratto
 * e nessuna rata «al SAL» resta da certificare, la rata di saldo non incassata, non fatturata e senza verbale.
 * Senza questo legame il saldo restava una rata a parte, e «Crea fattura» lo riproponeva dopo il SAL finale.
 */
export function rataSaldoPerSalFinale(
  rate: ReadonlyArray<Installment>,
  salList: ReadonlyArray<SalPerRata>,
  cumulativo: number,
  contratto: number | undefined,
): string {
  if (!(Number(contratto) > 0) || cumulativo < Number(contratto) - 0.01) return "";
  if (rateSalDaEmettere(rate, salList).length > 0) return "";
  const saldo = rate
    .filter((r) => r.type === "balance" && !!r.id && !r.is_paid && !r.documento_fiscale_id)
    .filter((r) => !salList.some((s) => s.installment_id === r.id))
    .sort((a, b) => b.position - a.position)[0];
  return saldo?.id ?? "";
}

const pct = (s: string) => Number(String(s ?? "").replace(",", "."));

/**
 * Le voci da mostrare per default: quelle che cambiano rispetto al SAL precedente (o nuove, o con una
 * sottofase che cambia). Senza un SAL precedente, tutte. Le altre si salvano lo stesso.
 */
export function vociCheCambiano(voci: ReadonlyArray<VoceSalDraft>, prec: PercentualiPrecedenti): boolean[] {
  if (prec.numero === null) return voci.map(() => true);
  return voci.map((v) => {
    const prima = v.fase_id ? prec.perFase.get(v.fase_id) : prec.perNome.get(v.descrizione.trim().toLowerCase());
    if (prima === undefined) return true;
    if (pct(v.percentuale_avanzamento) !== prima) return true;
    // Importo da scrivere (fase senza venduto) o cambiato da una variante: la voce si deve vedere.
    const importo = Number(String(v.importo_contrattuale ?? "").trim().replace(",", "."));
    if (!String(v.importo_contrattuale ?? "").trim() || !Number.isFinite(importo)) return true;
    const importoPrima = v.fase_id ? prec.importoPerFase?.get(v.fase_id) : undefined;
    if (importoPrima !== undefined && Math.round(importoPrima * 100) !== Math.round(importo * 100)) return true;
    return (v.sottofasi ?? []).some((d) => {
      const p = d.sottofase_id ? prec.perSottofase.get(d.sottofase_id) : undefined;
      return p === undefined || pct(d.percentuale_avanzamento) !== p;
    });
  });
}

const tondo = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Passa dal certificato cumulativo alle detrazioni del solo periodo, senza ricalcolare il netto. */
export function detrazioniDelPeriodo(nuoviLavori: number, corrente: SalCertificato, precedente: SalCertificato | null, haSalPrecedente: boolean) {
  const righe: { label: string; amount: number }[] = [];
  if (precedente || !haSalPrecedente) {
    righe.push(
      { label: `Ritenuta ${corrente.ritenuta_pct}% del periodo`, amount: tondo((precedente?.ritenuta ?? 0) - corrente.ritenuta) },
      { label: "Recupero anticipo del periodo", amount: tondo((precedente?.recupero_anticipazione ?? 0) - corrente.recupero_anticipazione) },
      { label: "Altre detrazioni del periodo", amount: tondo((precedente?.altre_detrazioni ?? 0) - corrente.altre_detrazioni) },
    );
  }
  if (precedente?.rinviato) righe.push({ label: "Rinviato dal SAL precedente", amount: precedente.rinviato });
  if (corrente.rinviato) righe.push({ label: "Rinviato al prossimo SAL", amount: -corrente.rinviato });
  const differenza = tondo(corrente.netto - nuoviLavori - righe.reduce((somma, voce) => somma + voce.amount, 0));
  if (differenza) righe.push({ label: "Conguaglio rispetto ai SAL precedenti", amount: differenza });
  return righe.filter(voce => voce.amount !== 0);
}

export type Arrotondamento = 0 | 10 | 100;

/** L'arrotondamento che usava il certificato prima: chi arrotonda a 100 € lo fa ogni volta. */
export function arrotondamentoAbituale(precedente: SalCertificato | null): Arrotondamento {
  if (!precedente || !(Number(precedente.rinviato) > 0)) return 0;
  const cent = Math.round(Number(precedente.netto) * 100);
  return cent % 10000 === 0 ? 100 : cent % 1000 === 0 ? 10 : 0;
}

/**
 * Il certificato del verbale nuovo: la proposta di sempre (ritenuta del certificato prima, acconti =
 * quanto certificato davvero, rinviato del certificato prima compreso), con la ritenuta % e le altre
 * detrazioni che chi compila può cambiare, e il netto arrotondato per difetto a 10 o 100 €.
 * Quello che l'arrotondamento toglie va nel «rinviato» (sal_certificati.rinviato, 10/11/2026), non
 * nelle altre detrazioni: il certificato dopo lo restituisce.
 */
export function certificatoNelModulo(p: {
  cumulativo: number;
  precedente: SalCertificato | null;
  giaMaturato: number;
  ritenutaPct?: number | null;
  altreDetrazioni?: number | null;
  /** Recupero dell'anticipazione a tutto oggi scritto a mano; senza, quello proposto. */
  recupero?: number | null;
  nota?: string | null;
  arrotonda?: Arrotondamento;
} & OpzioniCertificato): SalCertificato {
  const base = certificatoProposto(p.cumulativo, p.precedente, p.giaMaturato, {
    anticipazione: p.anticipazione, contratto: p.contratto, ritenutaContratto: p.ritenutaContratto,
  });
  const ritenutaPct = p.ritenutaPct != null && Number.isFinite(p.ritenutaPct) ? p.ritenutaPct : base.ritenuta_pct;
  const altre = p.altreDetrazioni != null && Number.isFinite(p.altreDetrazioni) ? p.altreDetrazioni : base.altre_detrazioni;
  const c: SalCertificato = {
    ...base,
    ritenuta_pct: ritenutaPct,
    ritenuta: tondo((p.cumulativo * ritenutaPct) / 100),
    altre_detrazioni: tondo(altre),
    recupero_anticipazione: p.recupero != null && Number.isFinite(p.recupero) ? tondo(p.recupero) : base.recupero_anticipazione,
    altre_detrazioni_nota: p.nota?.trim() || base.altre_detrazioni_nota || null,
  };
  const netto = nettoCertificato(c);
  const passo = p.arrotonda ?? 0;
  const rinviato = passo > 0 && netto > 0 ? tondo(netto - Math.floor(netto / passo) * passo) : 0;
  const finale = { ...c, rinviato };
  return { ...finale, netto: nettoCertificato(finale) };
}
