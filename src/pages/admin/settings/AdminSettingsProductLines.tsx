/**
 * AdminSettingsProductLines — catalogo "Prodotti & Servizi" AEDIX (super admin).
 *
 * Gestisce public.aedix_product_lines: i servizi che il gruppo vende oltre a
 * Edilizia in Cloud (Marketing Edile, Vendita Edile, Numeri, Delega, consulenze…),
 * ognuno con una CATEGORIA/natura (SaaS · Consulenza · Agenzia · Performance ·
 * Una-tantum) e parametri economici (prezzo indicativo, LTV, ricorrenza).
 *
 * Questo catalogo alimenta le card "Prodotti · Performance & LTV" della dashboard
 * CRM (prima mostravano dati hardcoded) e sarà la base per collegare le
 * opportunità/clienti ai servizi e tracciarne fatturato/incassato.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BrandPageHeader } from "@/components/admin/BrandPageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Package, Plus, Pencil, Trash2, Loader2, Cloud, Megaphone, Trophy, BarChart3, Handshake, Layers, Users,
} from "lucide-react";
import { ProductPackagesDialog } from "@/components/admin/settings/ProductPackagesDialog";

interface ProductLine {
  id: string;
  slug: string;
  nome: string;
  categoria: string;
  tipo: string | null;
  descrizione: string | null;
  colore: string | null;
  icona: string | null;
  ltv_target: number;
  quota_mensile: number;
  prezzo_indicativo: number;
  ricorrenza: string;
  attivo: boolean;
  ordine: number;
}

const CATEGORIE: { value: string; label: string; badge: string }[] = [
  { value: "saas", label: "SaaS", badge: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" },
  { value: "consulenza", label: "Consulenza", badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
  { value: "agenzia", label: "Agenzia / retainer", badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  { value: "performance", label: "Performance", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  { value: "una_tantum", label: "Una-tantum", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
];
const RICORRENZE = [
  { value: "mensile", label: "Mensile" },
  { value: "annuale", label: "Annuale" },
  { value: "una_tantum", label: "Una-tantum" },
];
const ICONE = ["Package", "Cloud", "Megaphone", "Trophy", "BarChart3", "Handshake"];
const ICON_MAP: Record<string, typeof Package> = { Package, Cloud, Megaphone, Trophy, BarChart3, Handshake };
const COLORI = [1, 2, 3, 4, 5].map((n) => `hsl(var(--chart-${n}))`);

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Math.round(n || 0));
const catMeta = (c: string) => CATEGORIE.find((x) => x.value === c) ?? { value: c, label: c, badge: "bg-muted text-muted-foreground" };
const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

type Draft = Partial<ProductLine>;
const EMPTY: Draft = { categoria: "consulenza", ricorrenza: "mensile", icona: "Package", colore: "hsl(var(--chart-1))", attivo: true, ltv_target: 0, quota_mensile: 0, prezzo_indicativo: 0, ordine: 0 };

export default function AdminSettingsProductLines() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);
  const [pkgLine, setPkgLine] = useState<{ id: string; nome: string } | null>(null);
  const isEdit = !!draft.id;

  const { data: pkgCounts = {} } = useQuery({
    queryKey: ["admin", "product-packages-counts"],
    queryFn: async (): Promise<Record<string, number>> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("aedix_product_packages") as any).select("product_line_id");
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of (data ?? []) as { product_line_id: string }[]) map[r.product_line_id] = (map[r.product_line_id] ?? 0) + 1;
      return map;
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin", "product-lines"],
    queryFn: async (): Promise<ProductLine[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("aedix_product_lines") as any)
        .select("*").order("ordine", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProductLine[];
    },
  });

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const payload = {
        slug: d.slug || slugify(d.nome || ""),
        nome: d.nome, categoria: d.categoria, tipo: d.tipo ?? null, descrizione: d.descrizione ?? null,
        colore: d.colore ?? null, icona: d.icona ?? null,
        ltv_target: Number(d.ltv_target) || 0, quota_mensile: Number(d.quota_mensile) || 0,
        prezzo_indicativo: Number(d.prezzo_indicativo) || 0, ricorrenza: d.ricorrenza,
        attivo: d.attivo ?? true, ordine: Number(d.ordine) || 0, updated_at: new Date().toISOString(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase.from("aedix_product_lines") as any;
      const { error } = d.id ? await sb.update(payload).eq("id", d.id) : await sb.insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "product-lines"] });
      qc.invalidateQueries({ queryKey: ["crm-dash", "product-lines"] });
      toast.success(isEdit ? "Servizio aggiornato" : "Servizio creato");
      setDialogOpen(false);
    },
    onError: (e: unknown) => toast.error("Errore nel salvataggio", { description: e instanceof Error ? e.message : String(e) }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("aedix_product_lines") as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "product-lines"] });
      qc.invalidateQueries({ queryKey: ["crm-dash", "product-lines"] });
      toast.success("Servizio eliminato");
    },
    onError: (e: unknown) => toast.error("Errore nell'eliminazione", { description: e instanceof Error ? e.message : String(e) }),
  });

  const openNew = () => { setDraft({ ...EMPTY, ordine: (rows.at(-1)?.ordine ?? 0) + 1 }); setSlugTouched(false); setDialogOpen(true); };
  const openEdit = (r: ProductLine) => { setDraft({ ...r }); setSlugTouched(true); setDialogOpen(true); };
  const totali = useMemo(() => ({ attivi: rows.filter((r) => r.attivo).length, tot: rows.length }), [rows]);

  const canSave = !!draft.nome?.trim() && !!draft.categoria;

  return (
    <div className="space-y-5">
      <BrandPageHeader
        icon={Package}
        eyebrow="Impostazioni"
        title="Prodotti & Servizi"
        subtitle="Il catalogo dei servizi che vendi oltre a Edilizia in Cloud — con la natura (consulenza, agenzia, performance…). Alimenta le card CRM e la futura sezione Fatturato Servizi."
        actions={
          <>
            <Button asChild variant="outline" className="gap-2 bg-white/10 text-white border-white/25 hover:bg-white/20 hover:text-white">
              <Link to="/admin/marketing/clienti-servizio"><Users className="h-4 w-4" /> Clienti-Servizio</Link>
            </Button>
            <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Nuovo servizio</Button>
          </>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Package className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nessun servizio nel catalogo. Aggiungi il primo.</p>
              <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Nuovo servizio</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[820px]">
                <TableHeader className="[&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-slate-500">
                  <TableRow>
                    <TableHead>Servizio</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Prezzo</TableHead>
                    <TableHead className="text-right">LTV</TableHead>
                    <TableHead className="text-center">Clienti/mese</TableHead>
                    <TableHead>Ricorrenza</TableHead>
                    <TableHead className="text-center">Pacchetti</TableHead>
                    <TableHead className="text-center">Attivo</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const Icon = ICON_MAP[r.icona ?? "Package"] ?? Package;
                    const cat = catMeta(r.categoria);
                    return (
                      <TableRow key={r.id} className={r.attivo ? "" : "opacity-55"}>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white" style={{ background: r.colore ?? "hsl(var(--chart-1))" }}>
                              <Icon className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <div className="font-medium leading-tight">{r.nome}</div>
                              <div className="truncate text-xs text-muted-foreground">{r.tipo}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell><Badge variant="secondary" className={`border-0 ${cat.badge}`}>{cat.label}</Badge></TableCell>
                        <TableCell className="text-right tabular-nums">{eur(r.prezzo_indicativo)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{eur(r.ltv_target)}</TableCell>
                        <TableCell className="text-center tabular-nums">{r.quota_mensile}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{RICORRENZE.find((x) => x.value === r.ricorrenza)?.label ?? r.ricorrenza}</TableCell>
                        <TableCell className="text-center">
                          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setPkgLine({ id: r.id, nome: r.nome })}>
                            <Layers className="h-3.5 w-3.5" /> {pkgCounts[r.id] ?? 0}
                          </Button>
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch checked={r.attivo} onCheckedChange={(v) => save.mutate({ ...r, attivo: v })} aria-label="Attivo" />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)} aria-label="Modifica"><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { if (confirm(`Eliminare "${r.nome}"?`)) del.mutate(r.id); }} aria-label="Elimina"><Trash2 className="h-4 w-4" /></Button>
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

      {rows.length > 0 && (
        <p className="text-xs text-muted-foreground">{totali.tot} servizi in catalogo · {totali.attivi} attivi</p>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Modifica servizio" : "Nuovo servizio"}</DialogTitle>
            <DialogDescription>Definisci nome, natura e parametri economici indicativi.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <div className="grid gap-1.5">
              <Label>Nome *</Label>
              <Input value={draft.nome ?? ""} onChange={(e) => setDraft((d) => ({ ...d, nome: e.target.value, slug: slugTouched ? d.slug : slugify(e.target.value) }))} placeholder="Es. Marketing Edile" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Categoria *</Label>
                <Select value={draft.categoria} onValueChange={(v) => setDraft((d) => ({ ...d, categoria: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIE.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Ricorrenza</Label>
                <Select value={draft.ricorrenza} onValueChange={(v) => setDraft((d) => ({ ...d, ricorrenza: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RICORRENZE.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Sottotitolo / tipo</Label>
              <Input value={draft.tipo ?? ""} onChange={(e) => setDraft((d) => ({ ...d, tipo: e.target.value }))} placeholder="Es. Agenzia · retainer mensile" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label>Prezzo €</Label>
                <Input type="number" value={draft.prezzo_indicativo ?? 0} onChange={(e) => setDraft((d) => ({ ...d, prezzo_indicativo: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>LTV €</Label>
                <Input type="number" value={draft.ltv_target ?? 0} onChange={(e) => setDraft((d) => ({ ...d, ltv_target: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Clienti/mese</Label>
                <Input type="number" value={draft.quota_mensile ?? 0} onChange={(e) => setDraft((d) => ({ ...d, quota_mensile: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Icona</Label>
                <Select value={draft.icona ?? "Package"} onValueChange={(v) => setDraft((d) => ({ ...d, icona: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ICONE.map((ic) => <SelectItem key={ic} value={ic}>{ic}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Colore</Label>
                <div className="flex items-center gap-1.5 pt-1">
                  {COLORI.map((c) => (
                    <button key={c} type="button" onClick={() => setDraft((d) => ({ ...d, colore: c }))}
                      className={`h-7 w-7 rounded-full ring-offset-2 ${draft.colore === c ? "ring-2 ring-foreground" : ""}`} style={{ background: c }} aria-label="colore" />
                  ))}
                </div>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Descrizione</Label>
              <Textarea rows={2} value={draft.descrizione ?? ""} onChange={(e) => setDraft((d) => ({ ...d, descrizione: e.target.value }))} placeholder="Note interne sul servizio (opzionale)" />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div><Label className="cursor-pointer">Attivo</Label><p className="text-xs text-muted-foreground">Visibile nelle card e nei report</p></div>
              <Switch checked={draft.attivo ?? true} onCheckedChange={(v) => setDraft((d) => ({ ...d, attivo: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button disabled={!canSave || save.isPending} onClick={() => save.mutate(draft)} className="gap-2">
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{isEdit ? "Salva" : "Crea servizio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProductPackagesDialog line={pkgLine} open={!!pkgLine} onOpenChange={(v) => { if (!v) setPkgLine(null); }} />
    </div>
  );
}
