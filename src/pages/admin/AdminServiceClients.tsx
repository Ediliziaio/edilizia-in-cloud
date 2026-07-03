/**
 * AdminServiceClients — Clienti-Servizio (Fase 2 della feature "Prodotti & Servizi").
 *
 * Gestisce public.aedix_service_clients: le relazioni RICORRENTI cliente ↔ servizio
 * (es. le aziende clienti di Marketing Edile a provvigione mensile). Il cliente può
 * essere collegato a un contatto CRM o a un'azienda piattaforma (o solo un nome).
 * Mostra un MRR ricorrente stimato e lo stato di ogni relazione.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BrandPageHeader } from "@/components/admin/BrandPageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Users, Plus, Pencil, Trash2, Loader2, Building2, UserRound, Link2 } from "lucide-react";

interface ProductLineLite { id: string; nome: string; colore: string | null; }
interface PackageLite { id: string; nome: string; prezzo: number; product_line_id: string; }
interface ServiceClient {
  id: string;
  product_line_id: string;
  package_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  cliente_nome: string;
  billing_model: string;
  importo: number;
  provvigione_pct: number | null;
  ricorrenza: string;
  stato: string;
  data_inizio: string;
  data_fine: string | null;
  note: string | null;
}

const BILLING = [
  { value: "retainer_fisso", label: "Retainer fisso" },
  { value: "provvigione", label: "Provvigione %" },
  { value: "performance", label: "Performance" },
  { value: "una_tantum", label: "Una-tantum" },
];
const RICORRENZE = [
  { value: "mensile", label: "Mensile" },
  { value: "annuale", label: "Annuale" },
  { value: "una_tantum", label: "Una-tantum" },
];
const STATI: Record<string, string> = { attivo: "bg-emerald-100 text-emerald-700", pausa: "bg-amber-100 text-amber-700", cessato: "bg-slate-200 text-slate-600" };
const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Math.round(n || 0));

type Draft = Partial<ServiceClient>;
const EMPTY: Draft = { billing_model: "retainer_fisso", ricorrenza: "mensile", stato: "attivo", importo: 0, data_inizio: new Date().toISOString().slice(0, 10) };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = () => supabase as any;

export default function AdminServiceClients() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [clientQuery, setClientQuery] = useState("");
  const isEdit = !!draft.id;

  const { data: lines = [] } = useQuery({
    queryKey: ["admin", "product-lines-lite"],
    queryFn: async (): Promise<ProductLineLite[]> => {
      const { data, error } = await sb().from("aedix_product_lines").select("id,nome,colore").order("ordine");
      if (error) throw error; return (data ?? []) as ProductLineLite[];
    },
  });
  const lineMap = useMemo(() => new Map(lines.map((l) => [l.id, l])), [lines]);

  const { data: packages = [] } = useQuery({
    enabled: !!draft.product_line_id && dialogOpen,
    queryKey: ["admin", "packages-of-line", draft.product_line_id],
    queryFn: async (): Promise<PackageLite[]> => {
      const { data, error } = await sb().from("aedix_product_packages").select("id,nome,prezzo,product_line_id").eq("product_line_id", draft.product_line_id).eq("attivo", true).order("ordine");
      if (error) throw error; return (data ?? []) as PackageLite[];
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin", "service-clients"],
    queryFn: async (): Promise<ServiceClient[]> => {
      const { data, error } = await sb().from("aedix_service_clients").select("*").order("created_at", { ascending: false });
      if (error) throw error; return (data ?? []) as ServiceClient[];
    },
  });

  // Ricerca cliente: aziende piattaforma + contatti CRM
  const { data: clientResults = [] } = useQuery({
    enabled: clientQuery.trim().length >= 2,
    queryKey: ["admin", "client-search", clientQuery],
    queryFn: async (): Promise<{ kind: "company" | "contact"; id: string; label: string }[]> => {
      const q = `%${clientQuery.trim()}%`;
      const [comp, cont] = await Promise.all([
        sb().from("companies").select("id,name").ilike("name", q).limit(6),
        sb().from("marketing_contacts").select("id,first_name,last_name,company_name").or(`first_name.ilike.${q},last_name.ilike.${q},company_name.ilike.${q}`).limit(6),
      ]);
      const out: { kind: "company" | "contact"; id: string; label: string }[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const c of (comp.data ?? []) as any[]) out.push({ kind: "company", id: c.id, label: c.name });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const c of (cont.data ?? []) as any[]) out.push({ kind: "contact", id: c.id, label: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company_name || "Contatto" });
      return out;
    },
  });

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const payload = {
        product_line_id: d.product_line_id, package_id: d.package_id ?? null,
        contact_id: d.contact_id ?? null, company_id: d.company_id ?? null, cliente_nome: d.cliente_nome,
        billing_model: d.billing_model, importo: Number(d.importo) || 0,
        provvigione_pct: d.billing_model === "provvigione" ? (Number(d.provvigione_pct) || 0) : null,
        ricorrenza: d.ricorrenza, stato: d.stato, data_inizio: d.data_inizio, data_fine: d.data_fine ?? null,
        note: d.note ?? null, updated_at: new Date().toISOString(),
      };
      const t = sb().from("aedix_service_clients");
      const { error } = d.id ? await t.update(payload).eq("id", d.id) : await t.insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "service-clients"] }); toast.success(isEdit ? "Cliente-servizio aggiornato" : "Cliente-servizio creato"); setDialogOpen(false); },
    onError: (e: unknown) => toast.error("Errore nel salvataggio", { description: e instanceof Error ? e.message : String(e) }),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await sb().from("aedix_service_clients").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "service-clients"] }); toast.success("Eliminato"); },
    onError: (e: unknown) => toast.error("Errore", { description: e instanceof Error ? e.message : String(e) }),
  });

  const openNew = () => { setDraft(EMPTY); setClientQuery(""); setDialogOpen(true); };
  const openEdit = (r: ServiceClient) => { setDraft({ ...r }); setClientQuery(""); setDialogOpen(true); };

  const kpi = useMemo(() => {
    const attivi = rows.filter((r) => r.stato === "attivo");
    const mrr = attivi.reduce((s, r) => s + (r.ricorrenza === "mensile" ? Number(r.importo) : r.ricorrenza === "annuale" ? Number(r.importo) / 12 : 0), 0);
    return { attivi: attivi.length, tot: rows.length, mrr };
  }, [rows]);

  const canSave = !!draft.cliente_nome?.trim() && !!draft.product_line_id;

  return (
    <div className="space-y-5">
      <BrandPageHeader
        icon={Users}
        eyebrow="CRM · Servizi"
        title="Clienti-Servizio"
        subtitle="Le relazioni ricorrenti cliente ↔ servizio (retainer, provvigioni, performance). Collega ogni cliente a un contatto CRM o a un'azienda."
        actions={<Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Nuovo cliente-servizio</Button>}
      >
        <div className="grid grid-cols-3 gap-3">
          {[
            { l: "Clienti attivi", v: String(kpi.attivi) },
            { l: "Totale relazioni", v: String(kpi.tot) },
            { l: "Ricorrente ~mese", v: eur(kpi.mrr) },
          ].map((k) => (
            <div key={k.l} className="rounded-xl bg-white/[0.07] p-3">
              <div className="text-[11px] uppercase tracking-wide text-blue-50/70">{k.l}</div>
              <div className="mt-1 text-xl font-bold">{k.v}</div>
            </div>
          ))}
        </div>
      </BrandPageHeader>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Users className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nessun cliente-servizio. Aggiungi la prima relazione (es. un'azienda cliente di Marketing Edile).</p>
              <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Nuovo cliente-servizio</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[880px]">
                <TableHeader className="[&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-slate-500">
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Servizio</TableHead>
                    <TableHead>Modello</TableHead>
                    <TableHead className="text-right">Importo</TableHead>
                    <TableHead>Dal</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const line = lineMap.get(r.product_line_id);
                    return (
                      <TableRow key={r.id} className={r.stato === "cessato" ? "opacity-55" : ""}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {r.company_id ? <Building2 className="h-3.5 w-3.5 text-muted-foreground" /> : r.contact_id ? <UserRound className="h-3.5 w-3.5 text-muted-foreground" /> : null}
                            <span className="font-medium">{r.cliente_nome}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{ background: line?.colore ?? "hsl(var(--chart-1))" }} />
                            {line?.nome ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {BILLING.find((b) => b.value === r.billing_model)?.label ?? r.billing_model}
                          {r.billing_model === "provvigione" && r.provvigione_pct != null ? ` · ${r.provvigione_pct}%` : ""}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{eur(r.importo)}<span className="text-xs text-muted-foreground">/{r.ricorrenza === "mensile" ? "mese" : r.ricorrenza === "annuale" ? "anno" : "una tantum"}</span></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.data_inizio}</TableCell>
                        <TableCell><Badge variant="secondary" className={`border-0 ${STATI[r.stato] ?? ""}`}>{r.stato}</Badge></TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)} aria-label="Modifica"><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { if (confirm(`Eliminare "${r.cliente_nome}"?`)) del.mutate(r.id); }} aria-label="Elimina"><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Modifica cliente-servizio" : "Nuovo cliente-servizio"}</DialogTitle>
            <DialogDescription>Collega un cliente a un servizio e definisci il modello di incasso ricorrente.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <div className="grid gap-1.5">
              <Label>Cliente (nome) *</Label>
              <Input value={draft.cliente_nome ?? ""} onChange={(e) => { setDraft((d) => ({ ...d, cliente_nome: e.target.value })); setClientQuery(e.target.value); }} placeholder="Cerca azienda/contatto o scrivi un nome" />
              {(draft.company_id || draft.contact_id) && (
                <span className="inline-flex w-fit items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  <Link2 className="h-3 w-3" /> collegato a {draft.company_id ? "azienda" : "contatto"}
                  <button className="ml-1 underline" onClick={() => setDraft((d) => ({ ...d, company_id: null, contact_id: null }))}>scollega</button>
                </span>
              )}
              {clientQuery.trim().length >= 2 && clientResults.length > 0 && !draft.company_id && !draft.contact_id && (
                <div className="max-h-40 overflow-y-auto rounded-lg border">
                  {clientResults.map((c) => (
                    <button key={`${c.kind}-${c.id}`} type="button"
                      onClick={() => { setDraft((d) => ({ ...d, cliente_nome: c.label, company_id: c.kind === "company" ? c.id : null, contact_id: c.kind === "contact" ? c.id : null })); setClientQuery(""); }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted">
                      {c.kind === "company" ? <Building2 className="h-3.5 w-3.5 text-muted-foreground" /> : <UserRound className="h-3.5 w-3.5 text-muted-foreground" />}
                      {c.label} <span className="ml-auto text-[10px] uppercase text-muted-foreground">{c.kind === "company" ? "azienda" : "contatto"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Servizio *</Label>
                <Select value={draft.product_line_id} onValueChange={(v) => setDraft((d) => ({ ...d, product_line_id: v, package_id: null }))}>
                  <SelectTrigger><SelectValue placeholder="Scegli…" /></SelectTrigger>
                  <SelectContent>{lines.map((l) => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Pacchetto</Label>
                <Select value={draft.package_id ?? "none"} onValueChange={(v) => setDraft((d) => ({ ...d, package_id: v === "none" ? null : v }))} disabled={!draft.product_line_id}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— nessuno —</SelectItem>
                    {packages.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome} · {eur(p.prezzo)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Modello</Label>
                <Select value={draft.billing_model} onValueChange={(v) => setDraft((d) => ({ ...d, billing_model: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{BILLING.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Ricorrenza</Label>
                <Select value={draft.ricorrenza} onValueChange={(v) => setDraft((d) => ({ ...d, ricorrenza: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RICORRENZE.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>{draft.billing_model === "provvigione" ? "Importo medio €" : "Importo €"}</Label>
                <Input type="number" value={draft.importo ?? 0} onChange={(e) => setDraft((d) => ({ ...d, importo: Number(e.target.value) }))} />
              </div>
              {draft.billing_model === "provvigione" ? (
                <div className="grid gap-1.5">
                  <Label>Provvigione %</Label>
                  <Input type="number" value={draft.provvigione_pct ?? 0} onChange={(e) => setDraft((d) => ({ ...d, provvigione_pct: Number(e.target.value) }))} />
                </div>
              ) : (
                <div className="grid gap-1.5">
                  <Label>Stato</Label>
                  <Select value={draft.stato} onValueChange={(v) => setDraft((d) => ({ ...d, stato: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="attivo">Attivo</SelectItem><SelectItem value="pausa">In pausa</SelectItem><SelectItem value="cessato">Cessato</SelectItem></SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Dal</Label>
                <Input type="date" value={draft.data_inizio ?? ""} onChange={(e) => setDraft((d) => ({ ...d, data_inizio: e.target.value }))} />
              </div>
              {draft.billing_model === "provvigione" && (
                <div className="grid gap-1.5">
                  <Label>Stato</Label>
                  <Select value={draft.stato} onValueChange={(v) => setDraft((d) => ({ ...d, stato: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="attivo">Attivo</SelectItem><SelectItem value="pausa">In pausa</SelectItem><SelectItem value="cessato">Cessato</SelectItem></SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label>Note</Label>
              <Textarea rows={2} value={draft.note ?? ""} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} placeholder="Note (opzionale)" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button disabled={!canSave || save.isPending} onClick={() => save.mutate(draft)} className="gap-2">
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{isEdit ? "Salva" : "Crea"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
