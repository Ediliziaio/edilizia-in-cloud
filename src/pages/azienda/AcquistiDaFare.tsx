/**
 * Acquisti da fare — l'ufficio acquisti: i materiali VALIDATI dal tecnico di
 * tutte le commesse, raggruppati per commessa › fase. Si sceglie il
 * fornitore, si chiede l'offerta o si crea l'ordine; lo stato di ogni riga
 * segue offerte e ordini (bozza, ordinato, consegnato).
 */
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useOperationalSuppliers } from "@/hooks/useOperationalSuppliers";
import { loadMaterialCoverage } from "@/hooks/useMaterialProcurement";
import { useAzioniMateriali, type MaterialeFase } from "@/hooks/useMaterialiPerFase";
import { planMaterial } from "@/lib/orders/materialProcurement";
import { ETICHETTA_STATO_ACQUISTO, riepilogoFase, statoAcquistoMateriale, type StatoAcquistoMateriale } from "@/lib/distinta/fasiMateriali";
import { formatCurrency } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface MaterialeAcquisti extends MaterialeFase {
  commessa: string;
  fase: string;
  posizioneFase: number;
}

const DA_FARE: StatoAcquistoMateriale[] = ["da_ordinare", "in_offerta", "in_bozza_oda"];

async function caricaAcquisti(companyId: string): Promise<MaterialeAcquisti[]> {
  const { data: fasi, error } = await supabase
    .from("materiali_fasi_validazione")
    .select("phase_id, order_id, validata_il, fase:order_work_phases(name, position), commessa:orders(order_code)")
    .eq("company_id", companyId)
    .eq("stato", "validata");
  if (error) throw error;
  const info = new Map((fasi ?? []).map((f) => {
    const r = f as unknown as { phase_id: string; fase: { name: string; position: number } | null; commessa: { order_code: string | null } | null };
    return [r.phase_id, { fase: r.fase?.name ?? "Fase", posizione: r.fase?.position ?? 0, commessa: r.commessa?.order_code ?? "Commessa" }];
  }));
  const idsFasi = [...info.keys()];
  const righe: Omit<MaterialeFase, "stato" | "ordinabile" | "avviso">[] = [];
  for (let i = 0; i < idsFasi.length; i += 100) {
    const { data, error: e } = await supabase.from("order_items")
      .select("id, order_id, name, description, quantity, status, supplier_id, purchase_price, vat_rate, phase_id, unita_misura, specifiche, origine_materiale, quantita_calcolata, origini, locale, supplier_rfq_item_id, stock_item_id, posizioni")
      .in("phase_id", idsFasi.slice(i, i + 100)).eq("natura_riga", "materiale").order("position").limit(5000);
    if (e) throw e;
    righe.push(...((data ?? []) as unknown as typeof righe));
  }
  const copertura = await loadMaterialCoverage(companyId, righe.map((r) => r.id));
  return righe.map((r) => {
    const piano = planMaterial({ ...r, quantity: Number(r.quantity) }, copertura);
    const i = info.get(r.phase_id!)!;
    return {
      ...r,
      quantity: Number(r.quantity),
      stato: statoAcquistoMateriale({ ...r, quantity: Number(r.quantity), drafted: piano.drafted, issued: piano.issued, received: piano.received }),
      ordinabile: piano.canOrder,
      avviso: piano.review,
      commessa: i.commessa,
      fase: i.fase,
      posizioneFase: i.posizione,
    };
  });
}

export default function AcquistiDaFare() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? "";
  const perm = usePermissions();
  const { suppliers } = useOperationalSuppliers();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const commessaFiltro = params.get("commessa") ?? "tutte";
  const [stato, setStato] = useState<"da_fare" | "tutti" | StatoAcquistoMateriale>("da_fare");
  const [fornitore, setFornitore] = useState("tutti");
  const [cerca, setCerca] = useState("");
  const [selezione, setSelezione] = useState<Set<string>>(new Set());
  const [offerta, setOfferta] = useState(false);
  const [titolo, setTitolo] = useState("Richiesta d'offerta materiali");
  const [fornitoriOfferta, setFornitoriOfferta] = useState<Set<string>>(new Set());
  const azioni = useAzioniMateriali("");

  const dati = useQuery({ queryKey: ["acquisti-da-fare", companyId], enabled: !!companyId, queryFn: () => caricaAcquisti(companyId) });
  const tutti = useMemo(() => dati.data ?? [], [dati.data]);
  const commesse = [...new Map(tutti.map((m) => [m.order_id, m.commessa])).entries()];
  const nomeFornitore = (id: string | null) => (id ? suppliers.find((s: { id: string }) => s.id === id)?.name ?? "Fornitore" : null);

  const visibili = tutti.filter((m) =>
    (commessaFiltro === "tutte" || m.order_id === commessaFiltro)
    && (stato === "tutti" || (stato === "da_fare" ? DA_FARE.includes(m.stato) : m.stato === stato))
    && (fornitore === "tutti" || (fornitore === "_nessuno" ? !m.supplier_id : m.supplier_id === fornitore))
    && (!cerca.trim() || `${m.name} ${m.specifiche ?? ""}`.toLowerCase().includes(cerca.trim().toLowerCase())));

  const gruppi = useMemo(() => {
    const m = new Map<string, { commessa: string; orderId: string; fasi: Map<string, { nome: string; posizione: number; materiali: MaterialeAcquisti[] }> }>();
    for (const x of visibili) {
      const c = m.get(x.order_id) ?? { commessa: x.commessa, orderId: x.order_id, fasi: new Map() };
      const f = c.fasi.get(x.phase_id!) ?? { nome: x.fase, posizione: x.posizioneFase, materiali: [] };
      f.materiali.push(x);
      c.fasi.set(x.phase_id!, f);
      m.set(x.order_id, c);
    }
    return [...m.values()].sort((a, b) => a.commessa.localeCompare(b.commessa, "it", { numeric: true }));
  }, [visibili]);

  const scelti = tutti.filter((m) => selezione.has(m.id));
  const totale = riepilogoFase(visibili);
  const toggle = (ids: string[], v: boolean) => {
    const s = new Set(selezione);
    for (const id of ids) { if (v) s.add(id); else s.delete(id); }
    setSelezione(s);
  };

  if (!perm.canManagePurchasing && !perm.isAdmin) {
    return <p className="m-6 rounded-lg border bg-white p-4 text-sm">Questa pagina è dell'ufficio acquisti: chiedi all'amministratore il permesso «Ufficio acquisti».</p>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-3 p-3 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold">Acquisti da fare</h1>
        <p className="text-sm text-slate-600">I materiali validati dal tecnico, commessa per commessa e fase per fase.</p>
        <p className="mt-1 text-xs text-slate-500 tabular-nums">
          {totale.totale} materiali · {totale.daOrdinare} da ordinare · {totale.inCorso} in corso · {totale.ordinati} ordinati · {totale.consegnati} consegnati
          {perm.canViewCosts && totale.importo > 0 ? ` · ${formatCurrency(totale.importo)}` : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={commessaFiltro} onValueChange={(v) => { const p = new URLSearchParams(params); if (v === "tutte") p.delete("commessa"); else p.set("commessa", v); setParams(p, { replace: true }); }}>
          <SelectTrigger className="h-9 w-52" aria-label="Commessa"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutte">Tutte le commesse</SelectItem>
            {commesse.map(([id, codice]) => <SelectItem key={id} value={id}>{codice}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={stato} onValueChange={(v) => setStato(v as typeof stato)}>
          <SelectTrigger className="h-9 w-44" aria-label="Stato"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="da_fare">Da fare</SelectItem>
            <SelectItem value="tutti">Tutti gli stati</SelectItem>
            {(Object.keys(ETICHETTA_STATO_ACQUISTO) as StatoAcquistoMateriale[]).map((s) => <SelectItem key={s} value={s}>{ETICHETTA_STATO_ACQUISTO[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fornitore} onValueChange={setFornitore}>
          <SelectTrigger className="h-9 w-48" aria-label="Fornitore"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti i fornitori</SelectItem>
            <SelectItem value="_nessuno">Senza fornitore</SelectItem>
            {suppliers.map((s: { id: string; name: string }) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input className="h-9 w-56" placeholder="Cerca materiale" value={cerca} onChange={(e) => setCerca(e.target.value)} />
      </div>

      {scelti.length > 0 && (
        <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-orange-200 bg-orange-50/95 px-3 py-2 text-sm shadow-sm">
          <strong className="tabular-nums">{scelti.length} selezionati</strong>
          <Select onValueChange={(v) => azioni.assegnaFornitore.mutate({ ids: scelti.map((m) => m.id), supplierId: v === "_nessuno" ? null : v, diretto: false })}>
            <SelectTrigger className="h-8 w-48 bg-white"><SelectValue placeholder="Assegna fornitore" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_nessuno">Nessun fornitore</SelectItem>
              {suppliers.filter((s: { is_active?: boolean | null }) => s.is_active !== false).map((s: { id: string; name: string }) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-8 bg-white" onClick={() => {
            setFornitoriOfferta(new Set(scelti.flatMap((m) => (m.supplier_id ? [m.supplier_id] : []))));
            setOfferta(true);
          }}>Richiedi offerta</Button>
          <Button size="sm" className="h-8" disabled={azioni.creaOrdini.isPending}
            onClick={() => azioni.creaOrdini.mutate({
              materiali: scelti.filter((m) => m.ordinabile),
              orderIdDi: (m) => m.order_id,
              codiceDi: (m) => (m as MaterialeAcquisti).commessa,
            }, { onSuccess: () => setSelezione(new Set()) })}>
            <ShoppingCart className="mr-1.5 h-3.5 w-3.5" /> Crea ordine
          </Button>
          <span className="text-xs text-slate-600">Un ordine in bozza per commessa e fornitore.</span>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setSelezione(new Set())}>Annulla</Button>
        </div>
      )}

      {dati.isLoading ? <p className="text-sm text-slate-500">Carico i materiali validati…</p> : dati.isError ? (
        <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">Materiali non caricati. <button type="button" className="underline" onClick={() => dati.refetch()}>Riprova</button></p>
      ) : gruppi.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-white p-6 text-center text-sm text-slate-500">
          Niente da acquistare con questi filtri. I materiali arrivano qui quando il tecnico valida una fase della commessa.
        </p>
      ) : gruppi.map((g) => (
        <section key={g.orderId} aria-label={`Commessa ${g.commessa}`} className="overflow-hidden rounded-lg border bg-white">
          <header className="flex items-center justify-between bg-slate-50 px-3 py-2">
            <Link to={`/azienda/ordini/${g.orderId}?tab=articoli&vista_materiali=articoli`} className="font-semibold hover:underline">{g.commessa}</Link>
          </header>
          {[...g.fasi.entries()].sort((a, b) => a[1].posizione - b[1].posizione).map(([faseId, f]) => {
            const ids = f.materiali.map((m) => m.id);
            const r = riepilogoFase(f.materiali);
            return (
              <div key={faseId} className="border-t">
                <div className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                  <Checkbox checked={ids.every((id) => selezione.has(id))} onCheckedChange={(v) => toggle(ids, !!v)} aria-label={`Seleziona la fase ${f.nome}`} />
                  <span className="font-medium">{f.nome}</span>
                  <span className="text-xs text-slate-500 tabular-nums">{r.daOrdinare} da ordinare · {r.inCorso} in corso · {r.ordinati} ordinati · {r.consegnati} consegnati</span>
                </div>
                <ul className="divide-y">
                  {f.materiali.map((m) => (
                    <li key={m.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 px-3 py-1.5 text-sm sm:grid-cols-[auto_minmax(0,1fr)_7rem_10rem_8rem]">
                      <Checkbox checked={selezione.has(m.id)} onCheckedChange={(v) => toggle([m.id], !!v)} aria-label={`Seleziona ${m.name}`} />
                      <div className="min-w-0">
                        <p className="truncate font-medium" title={m.name}>{m.name}</p>
                        {m.specifiche && <p className="truncate text-xs text-slate-500">{m.specifiche}</p>}
                      </div>
                      <span className="text-right tabular-nums sm:text-left">{m.quantity.toLocaleString("it-IT")} <span className="text-xs text-slate-500">{m.unita_misura ?? "pz"}</span></span>
                      <span className="col-start-2 truncate text-xs text-slate-600 sm:col-start-auto">{nomeFornitore(m.supplier_id) ?? <span className="text-slate-400">Fornitore da scegliere</span>}</span>
                      <span className={cn("col-start-3 justify-self-end rounded border px-1.5 py-0.5 text-[11px] sm:col-start-auto sm:justify-self-start",
                        m.stato === "consegnato" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : m.stato === "ordinato" ? "border-sky-200 bg-sky-50 text-sky-800" : m.stato === "da_ordinare" ? "border-slate-200 bg-slate-100 text-slate-700" : "border-amber-200 bg-amber-50 text-amber-800")}>
                        {ETICHETTA_STATO_ACQUISTO[m.stato]}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      ))}

      <Dialog open={offerta} onOpenChange={setOfferta}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Richiedi offerta ai fornitori</DialogTitle>
            <DialogDescription>{scelti.length} materiali. La richiesta si apre poi per inviarla e confrontare le offerte.</DialogDescription>
          </DialogHeader>
          <Input value={titolo} onChange={(e) => setTitolo(e.target.value)} aria-label="Titolo" />
          <fieldset className="max-h-56 space-y-1 overflow-auto rounded border p-2">
            <legend className="px-1 text-sm font-medium">Fornitori</legend>
            {suppliers.filter((s: { is_active?: boolean | null }) => s.is_active !== false).map((s: { id: string; name: string }) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={fornitoriOfferta.has(s.id)} onCheckedChange={(v) => { const n = new Set(fornitoriOfferta); if (v) n.add(s.id); else n.delete(s.id); setFornitoriOfferta(n); }} />
                {s.name}
              </label>
            ))}
          </fieldset>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOfferta(false)}>Annulla</Button>
            <Button disabled={azioni.richiediOfferta.isPending} onClick={() => azioni.richiediOfferta.mutate(
              { ids: scelti.map((m) => m.id), titolo, fornitori: [...fornitoriOfferta] },
              { onSuccess: (rfq) => { setOfferta(false); setSelezione(new Set()); if (rfq) navigate(`/azienda/richieste-offerta/${rfq}`); } },
            )}>Crea richiesta d'offerta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
