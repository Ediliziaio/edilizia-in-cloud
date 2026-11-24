/**
 * Il riepilogo che apre «Render e dettagli» (24/11/2026): numeri del progetto, unità e piani
 * come in una tavola, e il costo previsto con il link allo studio. Il resto della scheda
 * (prima e dopo, render, verifiche) viene dopo.
 */
import { useMemo } from "react";
import { Building2, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import { useFontiPrezzi } from "@/lib/planimetrie/fontiPrezzi";
import { conPrezziProposti, tipiDaCercare } from "@/lib/planimetrie/prezziProposti";
import { previsioneLavori } from "@/lib/planimetrie/previsioneLavori";
import { riepilogoProgetto } from "@/lib/planimetrie/riepilogoProgetto";
import { studioVariante } from "@/lib/planimetrie/studioImmobiliare";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";

const mq = (n: number) => `${n.toLocaleString("it-IT", { maximumFractionDigits: 1 })} m²`;
const euro = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function RiepilogoProgetto({ documento, ambito, companyId, onStudio }: {
  documento: Planimetria; ambito: string; companyId: string; onStudio: () => void;
}) {
  const t = useT();
  const permessi = usePermissions();
  const r = useMemo(() => riepilogoProgetto(documento, ambito), [documento, ambito]);
  const variante = ambito.startsWith("progetto:") ? ambito.slice("progetto:".length) : null;
  const grezze = useMemo(() => variante ? studioVariante(documento, variante).righe : [], [documento, variante]);
  const tipi = useMemo(() => tipiDaCercare(grezze), [grezze]);
  const { fonti } = useFontiPrezzi(companyId, tipi, permessi.canViewPreventivi && !!variante);
  const previsione = useMemo(() => variante && permessi.canViewPreventivi && grezze.length ? previsioneLavori(conPrezziProposti(grezze, fonti)) : null,
    [variante, permessi.canViewPreventivi, grezze, fonti]);
  const conLegenda = r.unita.some((u) => u.dichiarata);
  const tipo = documento.costruzione ? t("Costruzione e sopraelevazione") : variante ? t("Ristrutturazione") : t("Stato di fatto");

  return <section aria-label={t("Riepilogo del progetto")} className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 font-semibold"><Building2 className="h-4 w-4 text-primary" />{t("Riepilogo del progetto")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{tipo} · {r.piani.length === 1 ? t("1 piano") : t("{n} piani", { n: r.piani.length })}{r.unita.length ? ` · ${r.unita.length === 1 ? t("1 unità") : t("{n} unità", { n: r.unita.length })}` : ""}</p>
      </div>
      {variante && <Button size="sm" variant="outline" className="gap-1.5" onClick={onStudio}><Calculator className="h-4 w-4" />{t("Studio e computo")}</Button>}
    </div>
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div className="rounded-xl bg-muted/50 p-3"><dt className="text-xs text-muted-foreground">{t("Superficie lorda")}</dt><dd className="text-lg font-semibold tabular-nums">{mq(r.lordaMq)}</dd></div>
      <div className="rounded-xl bg-muted/50 p-3"><dt className="text-xs text-muted-foreground">{t("Superficie netta")}</dt><dd className="text-lg font-semibold tabular-nums">{mq(r.nettaMq)}</dd></div>
      {previsione ? <>
        <div className="rounded-xl bg-muted/50 p-3"><dt className="text-xs text-muted-foreground">{t("Costo previsto")}</dt><dd className="text-lg font-semibold tabular-nums">{euro(previsione.totale)}</dd>
          <dd className="text-xs text-muted-foreground">{t("lavori {lavori} + oneri", { lavori: euro(previsione.lavori) })}</dd></div>
        <div className="rounded-xl bg-muted/50 p-3"><dt className="text-xs text-muted-foreground">{t("Durata prevista")}</dt><dd className="text-lg font-semibold tabular-nums">{t("{n} giorni", { n: previsione.giorniCalendario })}</dd>
          {r.lordaMq > 0 && <dd className="text-xs text-muted-foreground">{t("{euro} al m² lordo", { euro: euro(previsione.totale / r.lordaMq) })}</dd>}</div>
      </> : <>
        <div className="rounded-xl bg-muted/50 p-3"><dt className="text-xs text-muted-foreground">{t("Stanze")}</dt><dd className="text-lg font-semibold tabular-nums">{r.piani.reduce((s, p) => s + p.stanze, 0)}</dd></div>
        <div className="rounded-xl bg-muted/50 p-3"><dt className="text-xs text-muted-foreground">{t("Unità")}</dt><dd className="text-lg font-semibold tabular-nums">{r.unita.length || "—"}</dd></div>
      </>}
    </dl>
    <div className="grid gap-4 lg:grid-cols-2">
      {r.unita.length > 0 && <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Unità")}</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 font-medium">{t("Alloggio")}</th><th className="font-medium">{t("Tipo")}</th><th className="font-medium">{t("Piano")}</th><th className="text-right font-medium">{t("m² netti")}</th>
            {conLegenda && <th className="text-right font-medium">{t("Legenda S.U.")}</th>}</tr></thead>
          <tbody className="divide-y">{r.unita.map((u) => <tr key={u.nome}>
            <td className="py-1.5 font-medium">{u.nome}</td>
            <td className={u.tipo === "Da completare" ? "text-amber-800 dark:text-amber-200" : undefined}>{t(u.tipo)}<span className="block text-xs text-muted-foreground">{u.bagni === 1 ? t("1 bagno") : t("{n} bagni", { n: u.bagni })} · {t("{n} stanze", { n: u.stanze })}
              {u.dichiarata?.tipo && u.dichiarata.tipo.toLowerCase() !== u.tipo.toLowerCase() && <> · {t("legenda: {tipo}", { tipo: u.dichiarata.tipo })}</>}</span></td>
            <td className="text-xs">{u.piani.join(", ") || "—"}</td>
            <td className="text-right tabular-nums">{mq(u.nettaMq)}</td>
            {conLegenda && <td className="text-right tabular-nums">{u.dichiarata?.suMq !== undefined ? <>
              {mq(u.dichiarata.suMq)}
              {u.scartoMq !== undefined && <span className={`block text-xs ${u.torna ? "text-emerald-700 dark:text-emerald-300" : "text-amber-800 dark:text-amber-200"}`}>
                {u.torna ? t("torna") : u.scartoMq < 0 ? t("mancano {mq}", { mq: mq(-u.scartoMq) }) : t("{mq} in più", { mq: mq(u.scartoMq) })}</span>}
            </> : "—"}</td>}
          </tr>)}</tbody>
        </table>
        {conLegenda && r.unita.some((u) => u.torna === false) && <p className="mt-1 text-xs text-muted-foreground">{t("Dove mancano m², la pianta non ha chiuso qualche stanza o l'ha data a un'altra unità: controlla nell'editor (dettagli della stanza → unità).")}</p>}
        {r.senzaUnitaMq > 0 && <p className="mt-1 text-xs text-muted-foreground">{t("{mq} di stanze senza unità: assegnale nell'editor (dettagli della stanza).", { mq: mq(r.senzaUnitaMq) })}</p>}
      </div>}
      <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Piani")}</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 font-medium">{t("Piano")}</th><th className="text-right font-medium">{t("Stanze")}</th><th className="text-right font-medium">{t("Netta")}</th><th className="text-right font-medium">{t("Lorda")}</th></tr></thead>
          <tbody className="divide-y">{r.piani.map((p) => <tr key={p.id}>
            <td className="py-1.5 font-medium">{p.nome}</td><td className="text-right tabular-nums">{p.stanze}</td>
            <td className="text-right tabular-nums">{mq(p.nettaMq)}</td><td className="text-right tabular-nums">{p.lordaMq ? mq(p.lordaMq) : "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>
  </section>;
}
