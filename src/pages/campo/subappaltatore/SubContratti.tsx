/**
 * «Contratto e pagamenti» del subappaltatore (26/11/2026, piano campo completo, punto 3.3).
 *
 * In sola lettura, dalla RPC campo_sub_contratti: per ogni contratto attivo o completato della propria ditta
 * l'importo, quanto è maturato con i SAL, quanto è stato pagato, quanto aspetta e la ritenuta. Sotto, i SAL con
 * lo stato. L'azienda può spegnerla (impostazioni dell'area operai): allora la lista è vuota.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ChevronDown, Euro } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { CHIP, RIQUADRO, TITOLO_RIQUADRO } from "@/lib/campo/stileCampo";
import { dateFnsCampo, useLinguaCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

interface SalSub { numero: number; data: string | null; lordo: number; netto: number; stato: string; pagato_il: string | null }
interface ContrattoSub {
  id: string; numero: string | null; lavori: string | null; stato: string; cantiere: string;
  importo: number; ritenuta_pct: number | null; modalita_pagamento: string | null;
  maturato: number; pagato: number; da_pagare: number; ritenute: number; sal: SalSub[];
}

const STATO_SAL: Record<string, { label: string; cls: string }> = {
  pagato: { label: "Pagato", cls: "bg-emerald-100 text-emerald-800" },
  verificato: { label: "Da pagare", cls: "bg-amber-100 text-amber-900" },
  ricevuto: { label: "In verifica", cls: "bg-slate-100 text-slate-700" },
  contestato: { label: "Contestato", cls: "bg-red-100 text-red-800" },
};

export default function SubContratti() {
  const t = useT();
  const { formati } = useLinguaCampo();
  const { user } = useAuth();
  const [aperto, setAperto] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["campo-sub-contratti", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<ContrattoSub[]> => {
      const { data, error } = await (supabase as unknown as {
        rpc: (n: "campo_sub_contratti") => PromiseLike<{ data: unknown; error: { message: string } | null }>;
      }).rpc("campo_sub_contratti");
      if (error) throw error;
      return ((data ?? []) as ContrattoSub[]).map(c => ({
        ...c, importo: Number(c.importo), maturato: Number(c.maturato), pagato: Number(c.pagato),
        da_pagare: Number(c.da_pagare), ritenute: Number(c.ritenute),
        sal: (c.sal ?? []).map(s => ({ ...s, lordo: Number(s.lordo), netto: Number(s.netto) })),
      }));
    },
  });
  const euro = (n: number) => formati.euro(n);
  const contratti = q.data ?? [];
  const totale = contratti.reduce((s, c) => ({ pagato: s.pagato + c.pagato, da_pagare: s.da_pagare + c.da_pagare }), { pagato: 0, da_pagare: 0 });

  return (
    <div className="mx-auto max-w-2xl space-y-3 pb-24">
      <h1 className="flex items-center gap-2 text-lg font-semibold"><Euro className="size-5 text-primary" aria-hidden="true" />{t("Contratto e pagamenti")}</h1>
      {q.isError ? (
        <p role="alert" className="text-sm text-destructive">{t("Non riesco a leggere i contratti. Riprova tra poco.")}</p>
      ) : q.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("Carico…")}</p>
      ) : contratti.length === 0 ? (
        <p className={cn(RIQUADRO, "text-sm text-muted-foreground")}>{t("Non ci sono contratti da mostrare. Per i pagamenti chiedi all'ufficio.")}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border bg-emerald-50 p-3">
              <p className="text-xs text-emerald-900">{t("Pagato")}</p>
              <p className="text-xl font-bold tabular-nums text-emerald-700">{euro(totale.pagato)}</p>
            </div>
            <div className="rounded-2xl border bg-amber-50 p-3">
              <p className="text-xs text-amber-900">{t("Da pagare")}</p>
              <p className="text-xl font-bold tabular-nums text-amber-700">{euro(totale.da_pagare)}</p>
            </div>
          </div>
          {contratti.map(c => {
            const espanso = aperto === c.id;
            const residuo = Math.max(0, c.importo - c.maturato);
            return (
              <section key={c.id} className={RIQUADRO}>
                <button type="button" aria-expanded={espanso} onClick={() => setAperto(espanso ? null : c.id)} className="flex w-full items-start gap-2 text-start">
                  <span className="min-w-0 flex-1">
                    <span dir="auto" className={cn(TITOLO_RIQUADRO, "block")}>{c.cantiere || t("Cantiere")}</span>
                    <span dir="auto" className="block truncate text-xs text-muted-foreground">{[c.numero, c.lavori].filter(Boolean).join(" · ")}</span>
                  </span>
                  {c.stato === "completato" && <span className={cn(CHIP, "bg-slate-100 text-slate-700")}>{t("Completato")}</span>}
                  <ChevronDown aria-hidden="true" className={cn("mt-1 size-4 shrink-0 text-muted-foreground", espanso && "rotate-180")} />
                </button>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">{t("Importo del contratto")}</dt><dd className="text-end font-semibold tabular-nums">{euro(c.importo)}</dd>
                  <dt className="text-muted-foreground">{t("Maturato con i SAL")}</dt><dd className="text-end tabular-nums">{euro(c.maturato)}</dd>
                  <dt className="text-muted-foreground">{t("Pagato")}</dt><dd className="text-end tabular-nums text-emerald-700">{euro(c.pagato)}</dd>
                  {c.da_pagare > 0 && <><dt className="text-muted-foreground">{t("Da pagare")}</dt><dd className="text-end tabular-nums text-amber-700">{euro(c.da_pagare)}</dd></>}
                  {c.ritenute > 0 && <><dt className="text-muted-foreground">{t("Ritenuta di garanzia")}</dt><dd className="text-end tabular-nums">{euro(c.ritenute)}</dd></>}
                  {c.stato === "attivo" && <><dt className="text-muted-foreground">{t("Ancora da eseguire")}</dt><dd className="text-end tabular-nums">{euro(residuo)}</dd></>}
                </dl>
                {espanso && (
                  <div className="mt-3 space-y-1 border-t pt-2">
                    {c.modalita_pagamento && <p dir="auto" className="text-xs text-muted-foreground">{t("Pagamento")}: {c.modalita_pagamento}</p>}
                    {c.sal.length === 0 ? <p className="text-sm text-muted-foreground">{t("Ancora nessun SAL.")}</p> : (
                      <ul className="divide-y">
                        {c.sal.map(s => {
                          const st = STATO_SAL[s.stato] ?? { label: s.stato, cls: "bg-slate-100 text-slate-700" };
                          return (
                            <li key={s.numero} className="flex items-center gap-2 py-1.5 text-sm">
                              <span className="w-14 shrink-0 font-semibold">SAL {s.numero}</span>
                              <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                                {s.data ? format(parseISO(s.data), "d MMM yyyy", { locale: dateFnsCampo() }) : ""}
                                {s.stato === "pagato" && s.pagato_il ? ` · ${t("pagato il {data}", { data: format(parseISO(s.pagato_il), "d MMM", { locale: dateFnsCampo() }) })}` : ""}
                              </span>
                              <span className="tabular-nums">{euro(s.netto)}</span>
                              <span className={cn(CHIP, st.cls)}>{t(st.label)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
