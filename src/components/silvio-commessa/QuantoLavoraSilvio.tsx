/**
 * «Quanto lavora Silvio» (1/11/2026, fase 5, lotto 5.4; dal 3/11 sta nelle impostazioni di Silvio,
 * non più tra le schede delle Commesse): i numeri di Silvio negli ultimi 90 giorni: commesse create e completate, il loro punteggio di completezza,
 * le correzioni, il tempo risparmiato stimato, il costo AI e il piano di volo; sotto, le commesse
 * a pagine. Numeri veri dalla RPC `silvio_quanto_lavora`; finché Silvio non ha lavorato su nessuna
 * commessa, una frase al posto dei riquadri a zero.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  durataInParole, MINUTI_PER_VOCE, minutiRisparmiati, quantoLavoraDaRisposta, quotaTenuta, type QuantoLavora,
} from "../../../shared/silvio-commessa/quantoLavora.ts";
import { NOMI_AREE } from "./presentazione";
import type { Area } from "../../../shared/silvio-commessa/piano.ts";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

type Lettura = (companyId: string, pagina: number) => Promise<QuantoLavora>;

const leggiVero: Lettura = async (companyId, pagina) => {
  // La RPC è nuova: non è ancora nei tipi generati.
  const { data, error } = await (supabase.rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(
    "silvio_quanto_lavora", { p_company_id: companyId, p_pagina: pagina, p_per_pagina: 20 });
  if (error) throw new Error(error.message);
  return quantoLavoraDaRisposta(data);
};

const euro = (v: number) => v.toLocaleString(intlCampo(), { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
const data = (s: string) => (s ? new Date(s).toLocaleDateString(intlCampo(), { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit" }) : "");
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
  const tr = useT();
  const [pagina, setPagina] = useState(1);
  const q = useQuery({ queryKey: ["silvio-commessa", "quanto-lavora", companyId, pagina], queryFn: () => leggi(companyId, pagina), retry: false });

  if (q.isLoading) return <div className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{tr("Conto il lavoro di Silvio…")}</div>;
  if (q.error || !q.data) return <p role="alert" className="p-6 text-sm text-red-700">{tr("Non riesco a leggere i numeri di Silvio:")} {q.error instanceof Error ? q.error.message : tr("riprova tra poco")}.</p>;

  const d = q.data;
  if (d.totali.commesse_create + d.totali.commesse_completate === 0 && d.correzioni.totale === 0) {
    return (
      <p className="p-4 text-sm text-slate-600">
        {tr("Ancora nessuna commessa creata o completata con Silvio dal {data}: i numeri arrivano con la prima.", { data: dataLunga(d.dal) })}
        {d.costo_ai_eur > 0 ? ` ${tr("Costo AI finora: {costo}.", { costo: euro(d.costo_ai_eur) })}` : ""}
      </p>
    );
  }
  const quota = quotaTenuta(d.correzioni);
  const minuti = minutiRisparmiati(d.totali.voci_scritte);
  const volo = d.piano_volo;
  const voloTot = Object.values(volo).reduce((t, x) => t + (Number(x) || 0), 0);
  const pagine = Math.max(1, Math.ceil(d.totale_righe / d.per_pagina));
  const peggiori = Object.entries(d.correzioni.per_area).sort((a, b) => b[1] - a[1]).slice(0, 3);

  return (
    <div className="space-y-3 p-3 sm:p-4" aria-label={tr("Quanto lavora Silvio")}>
      <p className="text-sm text-slate-600">{tr("Dal {inizio} al {fine}", { inizio: String(dataLunga(d.dal) ?? ""), fine: String(dataLunga(d.al) ?? "") })}</p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Numero titolo={tr("Commesse create")} valore={String(d.totali.commesse_create)} nota={tr("{n} completate", { n: String(d.totali.commesse_completate ?? "") })} />
        <Numero titolo={tr("Completezza media")} valore={d.totali.punteggio_medio == null ? "—" : `${d.totali.punteggio_medio} %`}
          nota={d.totali.punteggio_medio == null ? tr("ancora nessun dato") : tr("di oggi, sulle commesse di Silvio")} />
        <Numero titolo={tr("Proposte tenute così")} valore={quota == null ? "—" : `${quota} %`}
          nota={d.correzioni.totale ? tr("{cambiate} corrette su {totale}", { cambiate: String(d.correzioni.cambiate ?? ""), totale: String(d.correzioni.totale ?? "") }) : tr("ancora nessun dato")} />
        <Numero titolo={tr("Tempo risparmiato")} valore={durataInParole(minuti)}
          nota={tr("stima: {voci} voci × {minuti} min", { voci: d.totali.voci_scritte, minuti: MINUTI_PER_VOCE })} />
        <Numero titolo={tr("Costo AI")} valore={euro(d.costo_ai_eur)} nota={tr("letture e chat del popup")} />
        <Numero titolo={tr("Controlli prima della partenza")} valore={String(voloTot)}
          nota={voloTot ? tr("{confermate} confermate · {aperte} aperte · {chiuse} chiuse", { confermate: volo.confermata ?? 0, aperte: volo.aperta ?? 0, chiuse: (volo.scartata ?? 0) + (volo.scaduta ?? 0) }) : tr("ancora nessun dato")} />
      </div>
      {peggiori.length > 0 && (
        <p className="text-xs text-slate-600">
          {tr("Dove lo correggi di più:")} {peggiori.map(([a, x]) => `${NOMI_AREE[a as Area] ? tr(NOMI_AREE[a as Area]) : a} (${x})`).join(", ")}.
        </p>
      )}
      {d.commesse.length > 0 && (
        <div className="overflow-hidden rounded-lg border bg-white">
          <ul className="divide-y text-sm">
            {d.commesse.map((c) => (
              <li key={`${c.order_id}-${c.eseguita_il}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2">
                <Link to={`/azienda/ordini/${c.order_id}`} className="min-w-0 flex-1 truncate font-medium text-slate-900 hover:underline">
                  {c.codice ?? tr("Commessa")}{c.titolo ? ` · ${c.titolo}` : ""}
                </Link>
                <span className="text-xs text-slate-500">{c.modo === "crea" ? tr("creata il {data}", { data: data(c.eseguita_il) }) : tr("completata il {data}", { data: data(c.eseguita_il) })}</span>
                <span className="text-xs tabular-nums text-slate-700">{tr("{n} voci", { n: String(c.voci ?? "") })}</span>
                <span className="text-xs tabular-nums text-slate-700">{c.punteggio == null ? "—" : `${c.punteggio}/100`}</span>
                <span className="text-xs tabular-nums text-slate-500">{tr(c.correzioni === 1 ? "{n} correzione" : "{n} correzioni", { n: c.correzioni })}</span>
              </li>
            ))}
          </ul>
          {pagine > 1 && (
            <div className="flex items-center justify-end gap-2 border-t px-3 py-1.5 text-xs text-slate-600">
              {tr("Pagina {n} di {totale}", { n: d.pagina, totale: pagine })}
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={tr("Pagina prima")} disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={tr("Pagina dopo")} disabled={pagina >= pagine} onClick={() => setPagina(pagina + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
