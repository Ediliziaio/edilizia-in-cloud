/**
 * Il contenuto della colonna «Da ordinare» della pipeline acquisti: i
 * materiali validati dal tecnico, raggruppati per commessa › fase, con la
 * selezione multipla e le azioni dell'ufficio acquisti (assegna fornitore,
 * richiedi offerta, crea ordine). Era la pagina «Acquisti da fare».
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, ShoppingCart } from "lucide-react";
import { useOperationalSuppliers } from "@/hooks/useOperationalSuppliers";
import { useAzioniMateriali } from "@/hooks/useMaterialiPerFase";
import { importoMateriale, raggruppaMateriali, type MaterialeAcquisti } from "@/lib/acquisti/pipelineAcquisti";
import { formatCurrency } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Fornitore { id: string; name: string; is_active?: boolean | null }

export function DaOrdinareMateriali({
  materiali,
  puoAgire,
  vedeCosti,
}: {
  materiali: MaterialeAcquisti[];
  /** Ufficio acquisti, chi modifica le commesse o l'amministratore. */
  puoAgire: boolean;
  vedeCosti: boolean;
}) {
  const { suppliers } = useOperationalSuppliers();
  const fornitori = suppliers as Fornitore[];
  const attivi = fornitori.filter((s) => s.is_active !== false);
  const navigate = useNavigate();
  const azioni = useAzioniMateriali("");
  const [selezione, setSelezione] = useState<Set<string>>(new Set());
  const [offerta, setOfferta] = useState(false);
  const [titolo, setTitolo] = useState("Richiesta d'offerta materiali");
  const [fornitoriOfferta, setFornitoriOfferta] = useState<Set<string>>(new Set());

  const nomeFornitore = (id: string | null) => (id ? fornitori.find((s) => s.id === id)?.name ?? "Fornitore" : null);
  // Un filtro cambiato non deve lasciare selezionate righe che non si vedono più.
  const scelti = materiali.filter((m) => selezione.has(m.id));
  const gruppi = raggruppaMateriali(materiali);
  const toggle = (ids: string[], v: boolean) => {
    const s = new Set(selezione);
    for (const id of ids) { if (v) s.add(id); else s.delete(id); }
    setSelezione(s);
  };

  if (materiali.length === 0) {
    return (
      <p className="px-2 py-4 text-center text-xs text-muted-foreground">
        Niente da ordinare. I materiali arrivano qui quando il tecnico valida una fase della commessa.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {puoAgire && scelti.length > 0 && (
        <div className="sticky top-0 z-10 space-y-1.5 rounded-lg border border-orange-200 bg-orange-50/95 p-2 text-xs shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <strong className="tabular-nums">{scelti.length} selezionati</strong>
            <button type="button" className="text-slate-600 underline-offset-2 hover:underline" onClick={() => setSelezione(new Set())}>Annulla</button>
          </div>
          <Select onValueChange={(v) => azioni.assegnaFornitore.mutate({ ids: scelti.map((m) => m.id), supplierId: v === "_nessuno" ? null : v, diretto: false })}>
            <SelectTrigger className="h-8 bg-white text-xs" aria-label="Assegna fornitore"><SelectValue placeholder="Assegna fornitore" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_nessuno">Nessun fornitore</SelectItem>
              {attivi.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="h-8 flex-1 bg-white text-xs" onClick={() => {
              setFornitoriOfferta(new Set(scelti.flatMap((m) => (m.supplier_id ? [m.supplier_id] : []))));
              setOfferta(true);
            }}>Richiedi offerta</Button>
            <Button size="sm" className="h-8 flex-1 text-xs" disabled={azioni.creaOrdini.isPending}
              title="Un ordine in bozza per commessa e fornitore"
              onClick={() => azioni.creaOrdini.mutate({
                materiali: scelti.filter((m) => m.ordinabile),
                orderIdDi: (m) => m.order_id,
                codiceDi: (m) => (m as MaterialeAcquisti).commessa,
              }, { onSuccess: () => setSelezione(new Set()) })}>
              <ShoppingCart className="mr-1 h-3.5 w-3.5" /> Crea ordine
            </Button>
          </div>
        </div>
      )}

      {gruppi.map((g) => {
        const importo = g.fasi.reduce((t, f) => t + f.materiali.reduce((s, m) => s + importoMateriale(m), 0), 0);
        const quanti = g.fasi.reduce((t, f) => t + f.materiali.length, 0);
        return (
          <section key={g.orderId} aria-label={`Commessa ${g.commessa}`} className="overflow-hidden rounded-lg border bg-card shadow-sm">
            <header className="flex items-center justify-between gap-2 bg-slate-50 px-2.5 py-1.5">
              <Link to={`/azienda/ordini/${g.orderId}?tab=articoli&vista_materiali=articoli`} className="truncate text-sm font-semibold hover:underline">{g.commessa}</Link>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {quanti} {quanti === 1 ? "materiale" : "materiali"}{vedeCosti && importo > 0 ? ` · ${formatCurrency(importo)}` : ""}
              </span>
            </header>
            {g.fasi.map((f) => {
              const ids = f.materiali.map((m) => m.id);
              return (
                <div key={f.id} className="border-t">
                  <div className="flex items-center gap-2 px-2.5 py-1">
                    {puoAgire && (
                      <Checkbox checked={ids.every((id) => selezione.has(id))} onCheckedChange={(v) => toggle(ids, !!v)} aria-label={`Seleziona la fase ${f.nome}`} />
                    )}
                    <span className="min-w-0 truncate text-xs font-medium">{f.nome}</span>
                    <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">{f.materiali.length}</span>
                  </div>
                  <ul className="divide-y">
                    {f.materiali.map((m) => (
                      <li key={m.id} className="flex items-start gap-2 px-2.5 py-1.5 text-xs">
                        {puoAgire && <Checkbox className="mt-0.5" checked={selezione.has(m.id)} onCheckedChange={(v) => toggle([m.id], !!v)} aria-label={`Seleziona ${m.name}`} />}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium" title={m.name}>{m.name}</p>
                          {m.specifiche && <p className="truncate text-muted-foreground">{m.specifiche}</p>}
                          <p className="truncate text-muted-foreground">
                            {nomeFornitore(m.supplier_id) ?? <span className="text-amber-700">Fornitore da scegliere</span>}
                          </p>
                          {m.avviso && (
                            <p className="mt-0.5 flex items-center gap-1 text-amber-700" title={m.avviso}>
                              <AlertTriangle className="h-3 w-3 shrink-0" /><span className="truncate">{m.avviso}</span>
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 text-right tabular-nums">
                          {m.quantity.toLocaleString("it-IT")} <span className="text-muted-foreground">{m.unita_misura ?? "pz"}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        );
      })}

      <Dialog open={offerta} onOpenChange={setOfferta}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Richiedi offerta ai fornitori</DialogTitle>
            <DialogDescription>{scelti.length} materiali. La richiesta si apre poi per inviarla e confrontare le offerte.</DialogDescription>
          </DialogHeader>
          <Input value={titolo} onChange={(e) => setTitolo(e.target.value)} aria-label="Titolo" />
          <fieldset className="max-h-56 space-y-1 overflow-auto rounded border p-2">
            <legend className="px-1 text-sm font-medium">Fornitori</legend>
            {attivi.map((s) => (
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
