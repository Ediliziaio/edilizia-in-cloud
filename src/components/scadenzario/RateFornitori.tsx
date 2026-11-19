import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { tutteLePagine } from "@/lib/fatturazione/registroVendite";
import { etichettaMetodo, gruppoMetodo } from "@/lib/finance/metodoScadenza";
import { formatCurrency, formatDateIt } from "@/lib/formatters";

import { PagaRataDialog, type RataDaPagare } from "./PagaRataDialog";

const RiepilogoFatturaRicevuta = lazy(() => import("@/components/fatturazione/RiepilogoFatturaRicevuta").then(m => ({ default: m.RiepilogoFatturaRicevuta })));

export function RateFornitori({ companyId, anno, cerca }: { companyId: string; anno: string; cerca: string }) {
  const [fattura, setFattura] = useState<string | null>(null);
  const [soloRiba, setSoloRiba] = useState(false);
  const [soloAperte, setSoloAperte] = useState(true);
  const [scelta, setScelta] = useState<RataDaPagare | null>(null);
  const permessi = usePermissions();
  const rate = useQuery({
    queryKey: ["scadenzario", "rate-fornitori", companyId],
    queryFn: () => tutteLePagine((from, to) => {
      const q = supabase.from("rate_fornitori")
        .select("id,numero,scadenza,importo,metodo,stato,fatture_ricevute!rate_fornitori_fattura_ricevuta_id_fkey(id,numero_fattura,cedente_ragione_sociale)")
        .eq("company_id", companyId).neq("stato", "stornata");
      return q.order("scadenza", { nullsFirst: false }).order("id").range(from, to);
    }),
  });
  const residui = new Map<string, number | null>();
  for (const r of rate.data ?? []) {
    const id = r.fatture_ricevute?.id;
    if (!id || r.stato === "pagata") continue;
    const precedente = residui.get(id);
    residui.set(id, precedente === null || r.importo == null ? null : (precedente ?? 0) + Math.round(r.importo * 100));
  }
  const righe = (rate.data ?? []).filter(r => {
    const f = r.fatture_ricevute;
    return (anno === "all" || r.scadenza?.startsWith(anno + "-")) && (!soloAperte || r.stato !== "pagata") && (!soloRiba || gruppoMetodo(r.metodo) === "riba") &&
      [f?.numero_fattura, f?.cedente_ragione_sociale, etichettaMetodo(r.metodo)].join(" ").toLowerCase().includes(cerca.trim().toLowerCase());
  });
  return <section aria-label="Rate fornitori" className="space-y-2">
    <div className="flex gap-2">
      <Button size="sm" variant={soloAperte ? "secondary" : "outline"} aria-pressed={soloAperte} onClick={() => setSoloAperte(!soloAperte)}>Solo da pagare</Button>
      <Button size="sm" variant={soloRiba ? "secondary" : "outline"} aria-pressed={soloRiba} onClick={() => setSoloRiba(!soloRiba)}>Solo Ri.Ba.</Button>
    </div>
    {rate.isError ? <Button variant="outline" onClick={() => void rate.refetch()}>Errore nel caricamento · Riprova</Button> :
      rate.isLoading ? <p>Caricamento rate…</p> : !righe.length ? <p className="p-3 text-sm">Nessuna rata per i filtri scelti.</p> :
      <div className="overflow-x-auto rounded-lg border"><table className="w-full whitespace-nowrap text-left text-sm [&_td]:px-3 [&_th]:px-3 [&_td]:py-1.5">
        <thead className="bg-muted/50 text-xs"><tr>{["Scadenza", "Modalità", "Fattura ricevuta", "Rata", "Da pagare", "Residuo fattura", "Fornitore", "Importo rata", "Stato", "Azioni"].map(h => <th key={h} className="py-2">{h}</th>)}</tr></thead>
        <tbody>{righe.map(r => {
          const f = r.fatture_ricevute;
          const importo = r.importo == null ? "—" : formatCurrency(r.importo);
          return <tr key={r.id} className="border-t">
            <td>{r.scadenza ? formatDateIt(r.scadenza) : "—"}</td>
            <td>{gruppoMetodo(r.metodo) === "riba" ? <strong className="rounded bg-sky-100 px-2 py-0.5 text-sky-800">Ri.Ba.</strong> : etichettaMetodo(r.metodo) ?? "—"}</td>
            <td>{f ? <button className="text-primary hover:underline" onClick={() => setFattura(f.id)}>{f.numero_fattura || "Apri fattura"}</button> : "—"}</td>
            <td>{r.numero}</td><td className="font-semibold tabular-nums">{r.stato === "pagata" ? formatCurrency(0) : importo}</td>
            <td className="tabular-nums">{f && residui.get(f.id) !== null ? formatCurrency((residui.get(f.id) ?? 0) / 100) : "—"}</td>
            <td>{f?.cedente_ragione_sociale ?? "—"}</td><td>{importo}</td><td className="capitalize">{r.stato.replaceAll("_", " ")}</td>
            <td>{r.stato !== "pagata" && r.importo != null && permessi.canViewCosts && !permessi.solaLettura &&
              <Button size="sm" variant="outline" onClick={() => {
                if (r.importo == null) return;
                setScelta({ id: r.id, stato: r.stato, importo: r.importo, titolo: `Rata ${r.numero} · ${f?.numero_fattura ?? "Fornitore"} · ${importo}` });
              }}>Segna pagata</Button>}</td>
          </tr>;
        })}</tbody>
      </table></div>}
    {scelta && <PagaRataDialog companyId={companyId} scelta={scelta} onClose={() => setScelta(null)} />}
    {fattura && <Suspense fallback={<p>Caricamento fattura…</p>}><RiepilogoFatturaRicevuta companyId={companyId} fatturaId={fattura} onClose={() => setFattura(null)} /></Suspense>}
  </section>;
}
