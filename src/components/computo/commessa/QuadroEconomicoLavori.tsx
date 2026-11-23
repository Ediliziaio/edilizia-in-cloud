import { UniformSelect } from "@/components/ui/uniform-select";
/**
 * Quadro economico del lavoro pubblico: A) lavori (a misura + a corpo, di cui
 * sicurezza, ribasso solo su A − sicurezza) e B) somme a disposizione
 * dell'amministrazione. Sotto, la classificazione per capitolo e per voce:
 * proposta automatica per parole chiave, modificabile.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { formatEuro } from "@/lib/computo/computoStrutturato";
import { numeroVoce, type VoceComputo } from "@/lib/computo/alberoComputo";
import {
  ETICHETTA_SEZIONE, proponiSezioneQuadro, sezioneVoce, type QuadroEconomicoCompleto, type SezioneQuadro,
} from "@/lib/computo/quadroEconomico";
import { useClassificaVoci } from "@/hooks/useComputoCommessa";
import { cn } from "@/lib/utils";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

const euro = (n: number) => `${formatEuro(n)} €`;

export function ProspettoQuadro({ q }: { q: QuadroEconomicoCompleto }) {
  const t = useT();
  const riga = (etichetta: React.ReactNode, valore: string, forte = false, rientro = false) => (
    <div className={cn("flex justify-between gap-3 px-3 py-1.5", forte && "bg-slate-50 font-semibold", rientro && "pl-6 text-slate-600")}>
      <dt>{etichetta}</dt><dd className="shrink-0 tabular-nums">{valore}</dd>
    </div>
  );
  const quadratura = Math.abs(q.totale_intervento - q.totale_computo) < 0.01;
  return (
    <dl className="divide-y rounded-lg border text-sm">
      <div className="bg-slate-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">{t("A) Lavori")}</div>
      {riga(t("Lavori a misura"), euro(q.lavori_a_misura), false, true)}
      {riga(t("Lavori a corpo"), euro(q.lavori_a_corpo), false, true)}
      {riga(t("Totale lavori a base d'asta"), euro(q.quadro.importo_lavori), true)}
      {riga(<>{t("di cui oneri della sicurezza")} <span className="text-slate-500">{t("(non soggetti a ribasso)")}</span></>, euro(q.quadro.oneri_sicurezza), false, true)}
      {riga(t("Importo soggetto a ribasso"), euro(q.quadro.soggetto_a_ribasso))}
      {riga(t("Ribasso d'asta {pct}%", { pct: q.quadro.ribasso_percentuale.toLocaleString(intlCampo(), { maximumFractionDigits: 4 }) }), `− ${euro(q.quadro.ribasso_euro)}`)}
      {riga(t("Importo contrattuale"), euro(q.quadro.importo_contrattuale), true)}
      <div className="bg-slate-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">{t("B) Somme a disposizione dell'amministrazione")}</div>
      {q.somme.length === 0 && <p className="px-3 py-1.5 text-slate-500">{t("Nessuna voce del computo è fra le somme a disposizione.")}</p>}
      {q.somme.map(s => riga(`${s.capitolo} (${t(s.voci === 1 ? "{n} voce" : "{n} voci", { n: s.voci })})`, euro(s.importo), false, true))}
      {riga(t("Totale somme a disposizione"), euro(q.totale_somme), true)}
      {riga(t("Totale dell'intervento (A + B)"), euro(q.totale_intervento), true)}
      {!quadratura && <p className="px-3 py-1.5 text-amber-800">{t("Il totale non torna con quello delle voci ({totale_computo}).", { totale_computo: euro(q.totale_computo) })}</p>}
    </dl>
  );
}

const capitoloDi = (v: VoceComputo) => [v.super_categoria, v.categoria, v.sotto_categoria].map(s => s?.trim()).filter(Boolean).join(" › ") || "Senza capitolo";
type Scelta = SezioneQuadro | "auto";

function SceltaSezione({ valore, misto, onScegli, disabilitato, etichetta }: {
  valore: Scelta; misto?: boolean; onScegli: (s: Scelta) => void; disabilitato: boolean; etichetta: string;
}) {
  const t = useT();
  return (
    <UniformSelect aria-label={etichetta} disabled={disabilitato} value={misto ? "" : valore}
      onChange={e => e.target.value && onScegli(e.target.value as Scelta)}
      className="h-8 rounded-md border bg-background px-2 text-xs disabled:opacity-60">
      {misto && <option value="">{t("Misto")}</option>}
      <option value="auto">{t("Automatico")}</option>
      <option value="lavori">{t("Lavori")}</option>
      <option value="somme_a_disposizione">{t("Somme a disposizione")}</option>
    </UniformSelect>
  );
}

/** Classificazione per capitolo (tutte le voci in una volta) e, aprendo il capitolo, per voce. */
export function ClassificazioneQuadro({ voci, uploadId, bloccato }: { voci: VoceComputo[]; uploadId: string; bloccato: boolean }) {
  const t = useT();
  const classifica = useClassificaVoci(uploadId);
  const [aperti, setAperti] = useState<Set<string>>(new Set());
  const capitoli = new Map<string, VoceComputo[]>();
  for (const v of [...voci].sort((a, b) => a.ordine - b.ordine)) capitoli.set(capitoloDi(v), [...(capitoli.get(capitoloDi(v)) ?? []), v]);
  const scegli = (ids: string[], s: Scelta) => classifica.mutate({ ids, sezione: s === "auto" ? null : s }, {
    onError: e => toast.error(e instanceof Error ? e.message : t("Non riuscito.")),
  });
  return (
    <ul className="divide-y rounded-lg border text-sm">
      {[...capitoli.entries()].map(([nome, vv]) => {
        const scelte = new Set(vv.map(v => v.quadro_voce ?? "auto"));
        const effettive = new Set(vv.map(v => sezioneVoce(v)));
        const importo = vv.reduce((s, v) => s + (Number(v.importo_computo) || 0), 0);
        const aperto = aperti.has(nome);
        return (
          <li key={nome}>
            <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
              <button type="button" className="flex min-w-0 flex-1 items-center gap-1 text-left" aria-expanded={aperto}
                onClick={() => setAperti(a => { const n = new Set(a); if (n.has(nome)) n.delete(nome); else n.add(nome); return n; })}>
                {aperto ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                <span className="truncate font-medium">{nome}</span>
                <span className="shrink-0 text-xs text-slate-500">{t("· {n} voci · {importo}", { n: vv.length, importo: euro(importo) })}</span>
              </button>
              {effettive.size === 1
                ? <Badge variant="outline" className={effettive.has("somme_a_disposizione") ? "border-violet-300 text-violet-800" : ""}>{ETICHETTA_SEZIONE[[...effettive][0]]}</Badge>
                : <Badge variant="outline" className="border-amber-300 text-amber-800">{t("In parte somme")}</Badge>}
              <SceltaSezione etichetta={t("Sezione del capitolo {nome}", { nome })} valore={[...scelte][0] as Scelta} misto={scelte.size > 1}
                disabilitato={bloccato || classifica.isPending} onScegli={s => scegli(vv.map(v => v.id), s)} />
            </div>
            {aperto && (
              <ul className="border-t bg-slate-50/60">
                {vv.map(v => {
                  const proposta = proponiSezioneQuadro(v);
                  return (
                    <li key={v.id} className="flex flex-wrap items-center gap-2 px-3 py-1 pl-8 text-xs">
                      <span className="w-10 font-semibold tabular-nums">{numeroVoce(v)}</span>
                      <span className="min-w-0 flex-1 truncate" title={v.descrizione_breve}>{v.descrizione_breve}</span>
                      <span className="tabular-nums text-slate-600">{euro(Number(v.importo_computo) || 0)}</span>
                      {!v.quadro_voce && proposta.motivo && <span className="text-violet-700">{t("proposta: {motivo}", { motivo: proposta.motivo })}</span>}
                      <SceltaSezione etichetta={t("Sezione della voce {v}", { v: numeroVoce(v) })} valore={v.quadro_voce ?? "auto"}
                        disabilitato={bloccato || classifica.isPending} onScegli={s => scegli([v.id], s)} />
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
