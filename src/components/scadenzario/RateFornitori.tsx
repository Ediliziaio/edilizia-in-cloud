import { lazy, Suspense, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { tutteLePagine } from "@/lib/fatturazione/registroVendite";
import { etichettaMetodo, gruppoMetodo } from "@/lib/finance/metodoScadenza";
import { formatCurrency, formatDateIt } from "@/lib/formatters";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";

const RiepilogoFatturaRicevuta = lazy(() => import("@/components/fatturazione/RiepilogoFatturaRicevuta").then(m => ({ default: m.RiepilogoFatturaRicevuta })));

export function RateFornitori({ companyId, anno, cerca }: { companyId: string; anno: string; cerca: string }) {
  const [fattura, setFattura] = useState<string | null>(null);
  const [soloRiba, setSoloRiba] = useState(false);
  const [soloAperte, setSoloAperte] = useState(true);
  const [scelta, setScelta] = useState<{ id: string; stato: string; importo: number; titolo: string } | null>(null);
  const [data, setData] = useState("");
  const oggi = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  const client = useQueryClient();
  const permessi = usePermissions();
  const rate = useQuery({
    queryKey: ["scadenzario", "rate-fornitori", companyId, anno],
    queryFn: () => tutteLePagine((from, to) => {
      let q = supabase.from("rate_fornitori")
        .select("id,numero,scadenza,importo,metodo,stato,fatture_ricevute!rate_fornitori_fattura_ricevuta_id_fkey(id,numero_fattura,cedente_ragione_sociale)")
        .eq("company_id", companyId).neq("stato", "stornata");
      if (anno !== "all") q = q.gte("scadenza", anno + "-01-01").lte("scadenza", anno + "-12-31");
      return q.order("scadenza", { nullsFirst: false }).order("id").range(from, to);
    }),
  });
  const paga = useMutation({
    mutationFn: async (r: { id: string; stato: string; importo: number; data: string }) => {
      const { error } = await supabase.from("rate_fornitori")
        .update({ stato: "pagata", pagata_il: r.data })
        .eq("company_id", companyId).eq("id", r.id).eq("stato", r.stato).eq("importo", r.importo).select("id").single();
      if (error) throw error;
    },
    onSuccess: () => { setScelta(null); refreshFinancialQueries(client); toast.success("Rata segnata pagata"); },
    onError: () => { void rate.refetch(); toast.error("Rata non aggiornata. Verifica lo stato e i permessi."); },
  });
  const righe = (rate.data ?? []).filter(r => {
    const f = r.fatture_ricevute;
    return (!soloAperte || r.stato !== "pagata") && (!soloRiba || gruppoMetodo(r.metodo) === "riba") &&
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
        <thead className="bg-muted/50 text-xs"><tr>{["Scadenza", "Modalità", "Fattura ricevuta", "Rata", "Da pagare", "Fornitore", "Importo rata", "Stato", "Azioni"].map(h => <th key={h} className="py-2">{h}</th>)}</tr></thead>
        <tbody>{righe.map(r => {
          const f = r.fatture_ricevute;
          const importo = r.importo == null ? "—" : formatCurrency(r.importo);
          return <tr key={r.id} className="border-t">
            <td>{r.scadenza ? formatDateIt(r.scadenza) : "—"}</td>
            <td>{gruppoMetodo(r.metodo) === "riba" ? <strong className="rounded bg-sky-100 px-2 py-0.5 text-sky-800">Ri.Ba.</strong> : etichettaMetodo(r.metodo) ?? "—"}</td>
            <td>{f ? <button className="text-primary hover:underline" onClick={() => setFattura(f.id)}>{f.numero_fattura || "Apri fattura"}</button> : "—"}</td>
            <td>{r.numero}</td><td className="font-semibold tabular-nums">{r.stato === "pagata" ? formatCurrency(0) : importo}</td>
            <td>{f?.cedente_ragione_sociale ?? "—"}</td><td>{importo}</td><td className="capitalize">{r.stato.replaceAll("_", " ")}</td>
            <td>{r.stato !== "pagata" && r.importo != null && permessi.canViewCosts && !permessi.solaLettura &&
              <Button size="sm" variant="outline" disabled={paga.isPending} onClick={() => {
                if (r.importo == null) return;
                setData(oggi);
                setScelta({ id: r.id, stato: r.stato, importo: r.importo, titolo: `Rata ${r.numero} · ${f?.numero_fattura ?? "Fornitore"} · ${importo}` });
              }}>Segna pagata</Button>}</td>
          </tr>;
        })}</tbody>
      </table></div>}
    <Dialog open={!!scelta} onOpenChange={open => { if (!open && !paga.isPending) setScelta(null); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Segna rata pagata</DialogTitle><DialogDescription>{scelta?.titolo}</DialogDescription></DialogHeader>
        <form className="space-y-3" onSubmit={e => {
          e.preventDefault();
          if (scelta && data && data <= oggi && !paga.isPending) paga.mutate({ ...scelta, data });
        }}>
          <Label htmlFor="data-rata-pagata">Data effettiva del pagamento</Label>
          <Input id="data-rata-pagata" type="date" required max={oggi} value={data} onChange={e => setData(e.target.value)} />
          <DialogFooter><Button type="button" variant="outline" disabled={paga.isPending} onClick={() => setScelta(null)}>Annulla</Button>
            <Button type="submit" disabled={!data || data > oggi || paga.isPending}>Conferma pagamento</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    {fattura && <Suspense fallback={<p>Caricamento fattura…</p>}><RiepilogoFatturaRicevuta companyId={companyId} fatturaId={fattura} onClose={() => setFattura(null)} /></Suspense>}
  </section>;
}
