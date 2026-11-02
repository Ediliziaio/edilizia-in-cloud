/**
 * «Quanto lavora Silvio» (1/11/2026, fase 5, lotto 5.4): la scheda delle Commesse con i numeri di
 * Silvio negli ultimi 90 giorni: commesse create e completate, il loro punteggio di completezza,
 * le correzioni, il tempo risparmiato stimato, il costo AI e il piano di volo; sotto, le commesse
 * a pagine. Numeri veri dalla RPC `silvio_quanto_lavora`, o zero con «ancora nessun dato».
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Loader2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  durataInParole, MINUTI_PER_VOCE, minutiRisparmiati, quantoLavoraDaRisposta, quotaTenuta, senzaDati, type QuantoLavora,
} from "../../../shared/silvio-commessa/quantoLavora.ts";
import { NOMI_AREE } from "./presentazione";
import type { Area } from "../../../shared/silvio-commessa/piano.ts";

type Lettura = (companyId: string, pagina: number) => Promise<QuantoLavora>;

const leggiVero: Lettura = async (companyId, pagina) => {
  // La RPC è nuova: non è ancora nei tipi generati.
  const { data, error } = await (supabase.rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(
    "silvio_quanto_lavora", { p_company_id: companyId, p_pagina: pagina, p_per_pagina: 20 });
  if (error) throw new Error(error.message);
  return quantoLavoraDaRisposta(data);
};

const euro = (v: number) => v.toLocaleString("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
const data = (s: string) => (s ? new Date(s).toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit" }) : "");
const dataLunga = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : s);

function Numero({ titolo, valore, nota }: { titolo: string; valore: string; nota?: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-white px-3 py-2">
      <p className="truncate text-xs text-slate-500">{titolo}</p>
      <p className="text-lg font-semibold tabular-nums text-slate-900">{valore}</p>
      {nota && <p className="text-[11px] leading-tight text-slate-500">{nota}</p>}
    </div>
  );
}

export default function QuantoLavoraSilvio({ companyId, leggi = leggiVero }: { companyId: string; leggi?: Lettura }) {
  const [pagina, setPagina] = useState(1);
  const q = useQuery({ queryKey: ["silvio-commessa", "quanto-lavora", companyId, pagina], queryFn: () => leggi(companyId, pagina), retry: false });

  if (q.isLoading) return <div className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Conto il lavoro di Silvio…</div>;
  if (q.error || !q.data) return <p role="alert" className="p-6 text-sm text-red-700">Non riesco a leggere i numeri di Silvio: {q.error instanceof Error ? q.error.message : "riprova tra poco"}.</p>;

  const d = q.data;
  const nessuno = senzaDati(d);
  const quota = quotaTenuta(d.correzioni);
  const minuti = minutiRisparmiati(d.totali.voci_scritte);
  const volo = d.piano_volo;
  const voloTot = Object.values(volo).reduce((t, x) => t + (Number(x) || 0), 0);
  const pagine = Math.max(1, Math.ceil(d.totale_righe / d.per_pagina));
  const peggiori = Object.entries(d.correzioni.per_area).sort((a, b) => b[1] - a[1]).slice(0, 3);

  return (
    <div className="space-y-3 p-3 sm:p-4" aria-label="Quanto lavora Silvio">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          Dal {dataLunga(d.dal)} al {dataLunga(d.al)}{nessuno ? " · ancora nessun dato: i numeri arrivano quando si crea o si completa una commessa con Silvio." : ""}
        </p>
        <Link to="/azienda/impostazioni/silvio-commesse" className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900">
          <Settings className="h-3.5 w-3.5" aria-hidden />Cosa fa Silvio da solo
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Numero titolo="Commesse create" valore={String(d.totali.commesse_create)} nota={`${d.totali.commesse_completate} completate`} />
        <Numero titolo="Completezza media" valore={d.totali.punteggio_medio == null ? "—" : `${d.totali.punteggio_medio} %`}
          nota={d.totali.punteggio_medio == null ? "ancora nessun dato" : "di oggi, sulle commesse di Silvio"} />
        <Numero titolo="Proposte tenute così" valore={quota == null ? "—" : `${quota} %`}
          nota={d.correzioni.totale ? `${d.correzioni.cambiate} corrette su ${d.correzioni.totale}` : "ancora nessun dato"} />
        <Numero titolo="Tempo risparmiato" valore={durataInParole(minuti)}
          nota={`stima: ${d.totali.voci_scritte} voci × ${MINUTI_PER_VOCE} min`} />
        <Numero titolo="Costo AI" valore={euro(d.costo_ai_eur)} nota="letture e chat del popup" />
        <Numero titolo="Controlli prima della partenza" valore={String(voloTot)}
          nota={voloTot ? `${volo.confermata ?? 0} confermate · ${volo.aperta ?? 0} aperte · ${(volo.scartata ?? 0) + (volo.scaduta ?? 0)} chiuse` : "ancora nessun dato"} />
      </div>
      {peggiori.length > 0 && (
        <p className="text-xs text-slate-600">
          Dove lo correggi di più: {peggiori.map(([a, x]) => `${NOMI_AREE[a as Area] ?? a} (${x})`).join(", ")}.
        </p>
      )}
      {d.commesse.length > 0 && (
        <div className="overflow-hidden rounded-lg border bg-white">
          <ul className="divide-y text-sm">
            {d.commesse.map((c) => (
              <li key={`${c.order_id}-${c.eseguita_il}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2">
                <Link to={`/azienda/ordini/${c.order_id}`} className="min-w-0 flex-1 truncate font-medium text-slate-900 hover:underline">
                  {c.codice ?? "Commessa"}{c.titolo ? ` · ${c.titolo}` : ""}
                </Link>
                <span className="text-xs text-slate-500">{c.modo === "crea" ? "creata" : "completata"} il {data(c.eseguita_il)}</span>
                <span className="text-xs tabular-nums text-slate-700">{c.voci} voci</span>
                <span className="text-xs tabular-nums text-slate-700">{c.punteggio == null ? "—" : `${c.punteggio}/100`}</span>
                <span className="text-xs tabular-nums text-slate-500">{c.correzioni} {c.correzioni === 1 ? "correzione" : "correzioni"}</span>
              </li>
            ))}
          </ul>
          {pagine > 1 && (
            <div className="flex items-center justify-end gap-2 border-t px-3 py-1.5 text-xs text-slate-600">
              Pagina {d.pagina} di {pagine}
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Pagina prima" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Pagina dopo" disabled={pagina >= pagine} onClick={() => setPagina(pagina + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
