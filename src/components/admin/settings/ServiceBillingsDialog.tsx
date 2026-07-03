/**
 * ServiceBillingsDialog — registro incassi mensili di un cliente-servizio
 * (public.aedix_service_billings). Per ogni mese: dovuto (fatturato) vs incassato,
 * data incasso, SOCIETÀ del gruppo su cui è stato incassato (un cliente può pagare
 * su società diverse), stato. Alimenta la tab "Servizi" di /admin/fatturato.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Loader2, Wallet } from "lucide-react";

export interface ProvRiga { line_id: string; etichetta: string; base: string; base_valore: number; percentuale: number; importo: number; }
export interface ServiceBilling {
  id: string;
  service_client_id: string;
  periodo: string;        // YYYY-MM-DD (primo del mese)
  importo_dovuto: number;
  importo_incassato: number;
  data_incasso: string | null;
  societa: string | null;
  stato: string;
  note: string | null;
  righe_provvigione: ProvRiga[] | null;
  provvigione_commerciale: string | null;
  provvigione_pct: number | null;
  provvigione_importo: number;
  provvigione_stato: string;
  provvigione_pagata_at: string | null;
}
interface CommLineLite { id: string; etichetta: string; base: string; percentuale: number; }

const STATI = [
  { value: "dovuto", label: "Dovuto" },
  { value: "parziale", label: "Parziale" },
  { value: "incassato", label: "Incassato" },
];
const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Math.round(n || 0));
const monthLabel = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("it-IT", { month: "short", year: "numeric" });
const toMonthInput = (d?: string) => (d ? d.slice(0, 7) : "");
const fromMonthInput = (m: string) => (m ? `${m}-01` : "");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = () => supabase as any;

type Draft = Partial<ServiceBilling>;

export function ServiceBillingsDialog({
  client, open, onOpenChange,
}: {
  client: { id: string; cliente_nome: string; importo: number; commerciale?: string | null } | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Draft | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    enabled: !!client?.id && open,
    queryKey: ["admin", "service-billings", client?.id],
    queryFn: async (): Promise<ServiceBilling[]> => {
      const { data, error } = await sb().from("aedix_service_billings").select("*").eq("service_client_id", client!.id).order("periodo", { ascending: false });
      if (error) throw error; return (data ?? []) as ServiceBilling[];
    },
  });

  // Righe provvigione ricorrenti del cliente (se modello "provvigione").
  const { data: commLines = [] } = useQuery({
    enabled: !!client?.id && open,
    queryKey: ["admin", "commission-lines", client?.id],
    queryFn: async (): Promise<CommLineLite[]> => {
      const { data, error } = await sb().from("aedix_service_commission_lines").select("*").eq("service_client_id", client!.id).eq("attivo", true).order("ordine");
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[]).map((l) => ({ id: l.id as string, etichetta: (l.etichetta ?? "") as string, base: (l.base ?? "fatturato") as string, percentuale: Number(l.percentuale) || 0 }));
    },
  });
  const isProvClient = commLines.length > 0;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "service-billings", client?.id] });
    qc.invalidateQueries({ queryKey: ["admin", "servizi-fatturato"] });
  };

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const incassato = Number(d.importo_incassato) || 0;
      const dovuto = Number(d.importo_dovuto) || 0;
      const stato = d.stato || (incassato <= 0 ? "dovuto" : incassato >= dovuto ? "incassato" : "parziale");
      const payload = {
        service_client_id: client!.id, periodo: d.periodo, importo_dovuto: dovuto, importo_incassato: incassato,
        data_incasso: d.data_incasso || null, societa: d.societa?.trim() || null, stato, note: d.note ?? null,
        righe_provvigione: d.righe_provvigione ?? [],
        provvigione_commerciale: d.provvigione_commerciale?.trim() || null,
        provvigione_pct: d.provvigione_pct != null ? Number(d.provvigione_pct) : null,
        provvigione_importo: Number(d.provvigione_importo) || 0,
        provvigione_stato: d.provvigione_stato || "da_pagare",
        provvigione_pagata_at: d.provvigione_stato === "pagata" ? (d.provvigione_pagata_at || new Date().toISOString().slice(0, 10)) : null,
        updated_at: new Date().toISOString(),
      };
      const t = sb().from("aedix_service_billings");
      const { error } = d.id ? await t.update(payload).eq("id", d.id) : await t.insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Incasso salvato"); setForm(null); },
    onError: (e: unknown) => toast.error("Errore", { description: e instanceof Error ? e.message : String(e) }),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await sb().from("aedix_service_billings").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { invalidate(); toast.success("Eliminato"); },
    onError: (e: unknown) => toast.error("Errore", { description: e instanceof Error ? e.message : String(e) }),
  });

  const tot = useMemo(() => ({
    dovuto: rows.reduce((s, r) => s + Number(r.importo_dovuto), 0),
    incassato: rows.reduce((s, r) => s + Number(r.importo_incassato), 0),
  }), [rows]);

  const seedRighe = (): ProvRiga[] => commLines.map((l) => ({ line_id: l.id, etichetta: l.etichetta, base: l.base, base_valore: 0, percentuale: l.percentuale, importo: 0 }));
  const openNew = () => {
    const now = new Date();
    const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    setForm({ periodo: fromMonthInput(m), importo_dovuto: isProvClient ? 0 : (client?.importo ?? 0), importo_incassato: 0, stato: "dovuto", provvigione_commerciale: client?.commerciale ?? null, provvigione_stato: "da_pagare", provvigione_importo: 0, righe_provvigione: seedRighe() });
  };
  const openEditRow = (r: ServiceBilling) => {
    const righe = r.righe_provvigione && r.righe_provvigione.length ? r.righe_provvigione : seedRighe();
    setForm({ ...r, righe_provvigione: isProvClient ? righe : (r.righe_provvigione ?? []) });
  };
  // Aggiorna la base di una riga → ricalcola importo riga e dovuto totale.
  const updateRiga = (i: number, base_valore: number) => setForm((f) => {
    if (!f?.righe_provvigione) return f;
    const righe = f.righe_provvigione.map((rg, j) => (j === i ? { ...rg, base_valore, importo: Math.round((base_valore * rg.percentuale) / 100) } : rg));
    return { ...f, righe_provvigione: righe, importo_dovuto: righe.reduce((s, rg) => s + rg.importo, 0) };
  });
  const canSave = !!form?.periodo;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setForm(null); onOpenChange(v); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wallet className="h-4 w-4" /> Incassi · {client?.cliente_nome}</DialogTitle>
          <DialogDescription>
            Dovuto {eur(tot.dovuto)} · Incassato {eur(tot.incassato)}
            {tot.dovuto > tot.incassato ? ` · da incassare ${eur(tot.dovuto - tot.incassato)}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : rows.length === 0 && !form ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center">
              <Wallet className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nessun incasso registrato. Aggiungi il primo mese.</p>
            </div>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-lg border p-2.5">
                <div className="min-w-0 flex-1">
                  <div className="font-medium capitalize leading-tight">{monthLabel(r.periodo)}</div>
                  <div className="text-xs text-muted-foreground">
                    {eur(r.importo_incassato)} / {eur(r.importo_dovuto)}
                    {r.societa ? ` · ${r.societa}` : ""}
                    {r.provvigione_importo > 0 ? ` · prov. ${eur(r.provvigione_importo)}${r.provvigione_commerciale ? ` (${r.provvigione_commerciale})` : ""} ${r.provvigione_stato === "pagata" ? "✓" : "⏳"}` : ""}
                  </div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${r.stato === "incassato" ? "bg-emerald-100 text-emerald-700" : r.stato === "parziale" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-600"}`}>{r.stato}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditRow(r)} aria-label="Modifica"><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { if (confirm("Eliminare questo incasso?")) del.mutate(r.id); }} aria-label="Elimina"><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))
          )}
        </div>

        {form ? (
          <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Mese *</Label>
                <Input type="month" value={toMonthInput(form.periodo)} onChange={(e) => setForm((f) => ({ ...f, periodo: fromMonthInput(e.target.value) }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Società</Label>
                <Input value={form.societa ?? ""} onChange={(e) => setForm((f) => ({ ...f, societa: e.target.value }))} placeholder="Su quale società" />
              </div>
            </div>
            {isProvClient && form.righe_provvigione && (
              <div className="rounded-lg border border-dashed p-2.5">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Provvigione del mese — base cliente × %</div>
                <div className="space-y-2">
                  {form.righe_provvigione.map((rg, i) => (
                    <div key={rg.line_id || i} className="grid grid-cols-[1fr_6rem_4.5rem] items-center gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm">{rg.etichetta || "Provvigione"}</div>
                        <div className="text-[11px] text-muted-foreground">{rg.base === "incassato" ? "Incassato" : "Fatturato"} cliente · {rg.percentuale}%</div>
                      </div>
                      <div className="relative">
                        <Input type="number" value={rg.base_valore} onChange={(e) => updateRiga(i, Number(e.target.value))} className="h-9 pr-5" aria-label="Base del mese" placeholder="0" />
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
                      </div>
                      <div className="text-right text-sm font-medium tabular-nums">{eur(rg.importo)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label>Dovuto €</Label>
                <Input type="number" value={form.importo_dovuto ?? 0} readOnly={isProvClient} className={isProvClient ? "bg-muted/50" : ""} title={isProvClient ? "Calcolato dalle basi qui sopra" : undefined} onChange={(e) => setForm((f) => ({ ...f, importo_dovuto: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Incassato €</Label>
                <Input type="number" value={form.importo_incassato ?? 0} onChange={(e) => setForm((f) => ({ ...f, importo_incassato: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Stato</Label>
                <Select value={form.stato} onValueChange={(v) => setForm((f) => ({ ...f, stato: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATI.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Data incasso</Label>
              <Input type="date" value={form.data_incasso ?? ""} onChange={(e) => setForm((f) => ({ ...f, data_incasso: e.target.value }))} />
            </div>

            <div className="rounded-lg border border-dashed p-2.5">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Provvigione commerciale</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Commerciale</Label>
                  <Input value={form.provvigione_commerciale ?? ""} onChange={(e) => setForm((f) => ({ ...f, provvigione_commerciale: e.target.value }))} placeholder="Nome" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Stato</Label>
                  <Select value={form.provvigione_stato ?? "da_pagare"} onValueChange={(v) => setForm((f) => ({ ...f, provvigione_stato: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="da_pagare">Da pagare</SelectItem><SelectItem value="pagata">Pagata</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>% su incassato</Label>
                  <Input type="number" value={form.provvigione_pct ?? ""} placeholder="es. 10"
                    onChange={(e) => {
                      const pct = e.target.value === "" ? null : Number(e.target.value);
                      setForm((f) => ({ ...f, provvigione_pct: pct, provvigione_importo: pct != null ? Math.round(((Number(f.importo_incassato) || 0) * pct) / 100) : (f.provvigione_importo ?? 0) }));
                    }} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Importo €</Label>
                  <Input type="number" value={form.provvigione_importo ?? 0} onChange={(e) => setForm((f) => ({ ...f, provvigione_importo: Number(e.target.value) }))} />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setForm(null)}>Annulla</Button>
              <Button size="sm" disabled={!canSave || save.isPending} onClick={() => save.mutate(form)} className="gap-2">
                {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{form.id ? "Salva" : "Aggiungi"}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" onClick={openNew} className="w-full gap-2"><Plus className="h-4 w-4" /> Registra incasso mese</Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
