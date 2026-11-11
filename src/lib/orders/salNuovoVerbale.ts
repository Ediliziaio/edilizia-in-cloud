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
import { certificatoProposto, nettoCertificato, type SalCertificato } from "./salCertificato";
import { rateSalDaEmettere, type SalPerRata } from "./salRate";
import type { PercentualiPrecedenti, VoceSalDraft } from "./salDaFasi";

/** La rata proposta: la prima che il piano aspetta da un SAL e che nessun verbale certifica ancora. */
export function rataProposta(rate: ReadonlyArray<Installment>, salList: ReadonlyArray<SalPerRata>): string {
  return rateSalDaEmettere(rate, salList)[0]?.id ?? "";
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
  nota?: string | null;
  arrotonda?: Arrotondamento;
}): SalCertificato {
  const base = certificatoProposto(p.cumulativo, p.precedente, p.giaMaturato);
  const ritenutaPct = p.ritenutaPct != null && Number.isFinite(p.ritenutaPct) ? p.ritenutaPct : base.ritenuta_pct;
  const altre = p.altreDetrazioni != null && Number.isFinite(p.altreDetrazioni) ? p.altreDetrazioni : base.altre_detrazioni;
  const c: SalCertificato = {
    ...base,
    ritenuta_pct: ritenutaPct,
    ritenuta: tondo((p.cumulativo * ritenutaPct) / 100),
    altre_detrazioni: tondo(altre),
    altre_detrazioni_nota: p.nota?.trim() || base.altre_detrazioni_nota || null,
  };
  const netto = nettoCertificato(c);
  const passo = p.arrotonda ?? 0;
  const rinviato = passo > 0 && netto > 0 ? tondo(netto - Math.floor(netto / passo) * passo) : 0;
  const finale = { ...c, rinviato };
  return { ...finale, netto: nettoCertificato(finale) };
}
