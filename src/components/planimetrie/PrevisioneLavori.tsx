/**
 * «Previsione dei lavori» di una variante (23/11/2026): costo per fase con manodopera e
 * materiali, costi extra da accendere o spegnere, durata e intervallo di spesa.
 * Il calcolo e le sue regole sono in `lib/planimetrie/previsioneLavori.ts`.
 */
import { useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { useCorrezioneRese, useSalvaPrevisioneCommessa, useUltimaPrevisioneCommessa } from "@/hooks/usePrevisioneLavoriCommessa";
import { CAMPIONI_MINIMI, type CorrezioneRese } from "@/lib/planimetrie/correzioneRese";
import { COSTI_EXTRA, extraPredefiniti, previsioneLavori, type Previsione } from "@/lib/planimetrie/previsioneLavori";
import { istantaneaPrevisione, type FonteIstantanea } from "@/lib/planimetrie/previstoReale";
import type { RigaStudio } from "@/lib/planimetrie/studioImmobiliare";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const euro = () => new Intl.NumberFormat(intlCampo(), { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const giorni = (n: number) => `${n.toLocaleString(intlCampo())} ${n === 1 ? "giorno" : "giorni"}`;

/**
 * Con una commessa collegata, la previsione si salva con la commessa (una copia ferma): a lavori
 * finiti la commessa la mette accanto a costo e durata veri («Previsto e reale»).
 */
function SalvaConCommessa({ fonte, previsione, accesi }: { fonte: FonteIstantanea; previsione: Previsione; accesi: readonly string[] }) {
  const t = useT();
  const ultima = useUltimaPrevisioneCommessa(fonte.orderId, true);
  const salva = useSalvaPrevisioneCommessa();
  const u = ultima.data;
  const stessa = u && u.variante_id === fonte.varianteId && u.versione === fonte.versione && Number(u.totale) === previsione.totale && Number(u.giorni_calendario) === previsione.giorniCalendario;
  const quando = u ? new Date(u.created_at).toLocaleDateString(intlCampo()) : null;
  const registra = () => salva.mutate(istantaneaPrevisione(previsione, accesi, fonte), {
    onSuccess: () => toast.success(t("Previsione salvata con la commessa")),
    onError: (e) => toast.error(e instanceof Error ? e.message : t("Previsione non salvata")),
  });
  return <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
    <p className="min-w-0 text-muted-foreground">
      {ultima.isLoading ? "…" : stessa ? t("Salvata con la commessa il {quando}: a lavori finiti la commessa la confronta con costi e giorni veri.", { quando: String(quando ?? "") })
        : u ? t("Con la commessa c'è la previsione del {quando}{variante}, diversa da questa.", { quando: String(quando ?? ""), variante: u.variante_nome ? ` (${u.variante_nome})` : "" })
        : t("Salvala con la commessa: a lavori finiti la commessa la confronta con costi e giorni veri.")}
    </p>
    {!stessa && !ultima.isLoading && <Button size="sm" variant="outline" disabled={salva.isPending} onClick={registra}>
      {salva.isPending ? t("Salvataggio…") : u ? t("Sostituisci con questa") : t("Salva con la commessa")}
    </Button>}
  </div>;
}

/** Da dove vengono le rese: tipiche, oppure corrette con le commesse chiuse dell'azienda. */
function ReseUsate({ c }: { c: CorrezioneRese | undefined }) {
  const t = useT();
  if (!c) return null;
  const corrette = c.perFase.filter((f) => f.fattore !== null);
  const pct = (k: number) => `${k > 1 ? "+" : ""}${Math.round((k - 1) * 100)}%`;
  if (corrette.length) return <p className="text-xs text-muted-foreground">
    {t("Durate corrette con le tue commesse chiuse: {elenco}.", { elenco: corrette.map((f) => t("{fase} {scostamento} ({campioni} commesse)", { fase: f.fase.toLowerCase(), scostamento: f.fattore === 1 ? t("come previsto") : pct(f.fattore!), campioni: f.campioni })).join(", ") })}
    {corrette.length < c.perFase.length && ` ${t("Le altre fasi usano le rese tipiche.")}`}
  </p>;
  const piu = Math.max(0, ...c.perFase.map((f) => f.campioni));
  const dettaglio = piu ? t(" (la fase più seguita ne ha {piu})", { piu })
    : c.commesse ? t(c.commesse === 1 ? " (ce n'è {commesse}, senza fasi abbinate)" : " (ce ne sono {commesse}, senza fasi abbinate)", { commesse: c.commesse })
    : t(" (per ora nessuna)");
  return <p className="text-xs text-muted-foreground">
    {t("Rese tipiche: per correggerle con le tue commesse ne servono {minimi} chiuse con la previsione salvata e i rapportini sulle fasi{dettaglio}.", { minimi: CAMPIONI_MINIMI, dettaglio })}
  </p>;
}

export function PrevisioneLavori({ righe, fonte }: { righe: readonly RigaStudio[]; fonte?: FonteIstantanea | null }) {
  const t = useT();
  const { canViewCosts, solaLettura } = usePermissions();
  const { effectiveCompany } = useAuth();
  const rese = useCorrezioneRese(effectiveCompany?.id, true);
  const iniziali = useMemo(() => extraPredefiniti(righe), [righe]);
  const [scelti, setScelti] = useState<string[] | null>(null);
  const accesi = scelti ?? iniziali;
  const p = previsioneLavori(righe, accesi, rese.data?.fattori);
  if (!p.lavori) return null;
  const fuori = p.fuori.senzaPrezzo + p.fuori.senzaQuantita;
  return (
    <section aria-label={t("Previsione dei lavori")} className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-primary" />{t("Previsione dei lavori")}</h3>
        <p className="text-xs text-muted-foreground">{t("Costo, extra e durata stimati dalle lavorazioni della pianta, con rese tipiche di una squadra di due persone. È un ordine di grandezza per decidere, non un consuntivo.")}</p>
        <ReseUsate c={rese.data} />
      </div>
      <dl className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border bg-muted/30 p-3">
          <dt className="text-xs text-muted-foreground">{t("Spesa probabile")}</dt>
          <dd className="text-lg font-semibold tabular-nums">{euro().format(p.intervallo.probabile)}</dd>
          <dd className="text-xs text-muted-foreground">{t("da {minimo} a {massimo}", { minimo: String(euro().format(p.intervallo.minimo) ?? ""), massimo: String(euro().format(p.intervallo.massimo) ?? "") })}</dd>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <dt className="text-xs text-muted-foreground">{t("Durata")}</dt>
          <dd className="text-lg font-semibold tabular-nums">{giorni(p.giorniCalendario)}</dd>
          <dd className="text-xs text-muted-foreground">{t("{giorni} di squadra", { giorni: giorni(p.giorniLavoro) })}{p.giorniAttesa ? ` · ${t("{giorni} di attesa", { giorni: p.giorniAttesa })}` : ""}</dd>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <dt className="text-xs text-muted-foreground">{t("Manodopera e materiali")}</dt>
          <dd className="text-lg font-semibold tabular-nums">{euro().format(p.manodopera)} · {euro().format(p.materiali)}</dd>
          <dd className="text-xs text-muted-foreground">{t("quote tipiche per lavorazione")}</dd>
        </div>
      </dl>
      {(p.indicativi > 0 || fuori > 0) && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
        {p.indicativi > 0 && <>{t(p.indicativi === 1 ? "{n} voce ha un prezzo indicativo: l’intervallo è largo (±{pct}% sui lavori). Mettile nel listino per stringerlo." : "{n} voci hanno un prezzo indicativo: l’intervallo è largo (±{pct}% sui lavori). Mettile nel listino per stringerlo.", { n: p.indicativi, pct: p.intervallo.incertezzaPct })} </>}
        {fuori > 0 && <>{t(fuori === 1 ? "{n} voce è fuori dal conto perché senza prezzo o senza quantità." : "{n} voci sono fuori dal conto perché senza prezzo o senza quantità.", { n: fuori })}</>}
      </p>}
      {/* Sul telefono cinque colonne non ci stanno: una riga per fase, con l'attesa a tutta larghezza. */}
      <ul className="divide-y text-xs sm:hidden" aria-label={t("Costo e durata per fase")}>
        {p.fasi.map((f) => <li key={f.fase} className="space-y-0.5 py-2">
          <p className="flex justify-between gap-3 font-medium"><span>{f.fase}</span><span className="tabular-nums">{euro().format(f.importo)}</span></p>
          <p className="flex justify-between gap-3 text-muted-foreground"><span>{t("Manodopera {manodopera} · materiali {materiali}", { manodopera: String(euro().format(f.manodopera) ?? ""), materiali: String(euro().format(f.materiali) ?? "") })}</span><span className="shrink-0 tabular-nums">{giorni(f.giorni)}{f.correzione ? ` (${t("tipiche {giorni}", { giorni: giorni(f.giorniBase) })})` : ""}</span></p>
          {f.attesa > 0 && <p className="text-muted-foreground">{t("Dopo {attesa} giorni: {perche}", { attesa: String(f.attesa ?? ""), perche: String(f.perche ?? "") })}</p>}
        </li>)}
        {p.fuori.nonStimate > 0 && <li className="flex justify-between gap-3 py-2 text-muted-foreground"><span>{t("Altre voci quotate, senza stima dei tempi")}</span>
          <span className="shrink-0 font-medium tabular-nums text-foreground">{euro().format(p.lavori - p.fasi.reduce((s, f) => s + f.importo, 0))}</span></li>}
        <li className="flex justify-between gap-3 py-2 font-semibold"><span>{t("Lavori")}</span><span className="tabular-nums">{euro().format(p.lavori)}</span></li>
      </ul>
      <table className="hidden w-full text-xs sm:table" aria-label={t("Costo e durata per fase")}>
        <thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">{t("Fase")}</th><th className="px-2 text-right font-medium">{t("Manodopera")}</th><th className="px-2 text-right font-medium">{t("Materiali")}</th><th className="px-2 text-right font-medium">{t("Importo")}</th><th className="text-right font-medium">{t("Durata")}</th></tr></thead>
        <tbody className="divide-y">
          {p.fasi.map((f) => <tr key={f.fase} className="align-top">
            <th scope="row" className="py-1.5 text-left font-medium">{f.fase}{f.attesa > 0 && <span className="block font-normal text-muted-foreground">{t("dopo {attesa} giorni: {perche}", { attesa: String(f.attesa ?? ""), perche: String(f.perche ?? "") })}</span>}</th>
            <td className="px-2 py-1.5 text-right tabular-nums">{euro().format(f.manodopera)}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{euro().format(f.materiali)}</td>
            <td className="px-2 py-1.5 text-right font-medium tabular-nums">{euro().format(f.importo)}</td>
            <td className="py-1.5 text-right tabular-nums">{giorni(f.giorni)}{f.correzione ? <span className="block text-muted-foreground">{t("tipiche {giorni}", { giorni: giorni(f.giorniBase) })}</span> : null}</td>
          </tr>)}
          {p.fuori.nonStimate > 0 && <tr><th scope="row" className="py-1.5 text-left font-normal text-muted-foreground" colSpan={3}>{t("Altre voci quotate (impianti e opere a corpo), senza stima dei tempi")}</th>
            <td className="px-2 py-1.5 text-right font-medium tabular-nums">{euro().format(p.lavori - p.fasi.reduce((s, f) => s + f.importo, 0))}</td><td className="py-1.5 text-right">—</td></tr>}
          <tr><th scope="row" className="py-1.5 text-left font-semibold" colSpan={3}>{t("Lavori")}</th><td className="px-2 py-1.5 text-right font-semibold tabular-nums">{euro().format(p.lavori)}</td><td /></tr>
        </tbody>
      </table>
      <div className="space-y-1.5">
        <p className="text-xs font-semibold">{t("Costi in più")} <span className="font-normal text-muted-foreground">{t("accendi quelli che valgono per questo lavoro")}</span></p>
        <ul className="divide-y rounded-lg border text-xs">
          {COSTI_EXTRA.map((e) => {
            const acceso = accesi.includes(e.id);
            const importo = p.extra.find((x) => x.id === e.id);
            return <li key={e.id}>
              <label className="flex cursor-pointer items-start gap-2 px-3 py-2">
                <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={acceso}
                  onChange={() => setScelti(acceso ? accesi.filter((x) => x !== e.id) : [...accesi, e.id])} />
                <span className="min-w-0 flex-1"><span className="block font-medium">{e.nome}</span><span className="block text-muted-foreground">{e.perche}</span></span>
                <span className="shrink-0 text-right tabular-nums">{importo ? euro().format(importo.importo) : "—"}<span className="block text-muted-foreground">{e.regola.tipo === "a_corpo" ? t("a corpo") : t("{percento}% dei lavori", { percento: String(e.regola.percento ?? "") })}</span></span>
              </label>
            </li>;
          })}
        </ul>
        <p className="flex justify-between text-sm font-semibold"><span>{t("Totale previsto")}</span><span className="tabular-nums">{euro().format(p.totale)}</span></p>
        <p className="text-xs text-muted-foreground">{t("Spese generali e utile sono già nei prezzi delle voci. Gli importi a corpo sono valori tipici: correggili nel computo.")}</p>
        {fonte && canViewCosts && !solaLettura && <SalvaConCommessa fonte={fonte} previsione={p} accesi={accesi} />}
      </div>
    </section>
  );
}
