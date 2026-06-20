/**
 * AdminArticleTemplates — gestione super_admin della libreria GLOBALE dei
 * template articoli (`article_family_templates`), quella che le aziende
 * importano dal Listino con "Importa da template".
 *
 * Qui il super_admin può: vedere TUTTI i template (anche disattivati),
 * cercarli/filtrarli, modificarne metadati e GRIGLIA PREZZI, attivarli/
 * disattivarli, duplicarli, eliminarli, e importare in blocco la libreria
 * fornitore WnD (estratta dai listini PDF, file src/data/wndArticleTemplates.ts).
 *
 * RLS: select/insert/update/delete riservati a super_admin (policy aft_*).
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Boxes, Plus, Search, Pencil, Copy, Trash2, Download, Loader2, Grid3x3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { WND_ARTICLE_TEMPLATES } from "@/data/wndArticleTemplates";

interface GridDefault { xs: number[]; ys: number[]; m: (number | null)[][] }
interface Template {
  id: string;
  nome: string;
  descrizione: string | null;
  vertical_slug: string;
  categoria_slug: string | null;
  tipologia: string | null;
  tags: string[] | null;
  modalita_prezzo_base: string | null;
  prezzo_base_vendita: number | null;
  vat_rate: number | null;
  unit_of_measure: string | null;
  griglia_asse_x_label: string | null;
  griglia_asse_y_label: string | null;
  griglia_unita: string | null;
  griglia_default: GridDefault | null;
  image_url: string | null;
  is_active: boolean;
  sort_order: number | null;
}

const cellCount = (g: GridDefault | null) =>
  g?.m ? g.m.reduce((s, row) => s + row.filter((v) => v != null).length, 0) : 0;

export default function AdminArticleTemplates() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState<string>("");
  const [onlyInactive, setOnlyInactive] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["admin-article-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("article_family_templates")
        .select("*")
        .order("vertical_slug", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Template[];
    },
  });

  const allTags = useMemo(() => {
    const s = new Set<string>();
    templates.forEach((t) => (t.tags ?? []).forEach((x) => s.add(x)));
    return Array.from(s).sort();
  }, [templates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (onlyInactive && t.is_active) return false;
      if (tag && !(t.tags ?? []).includes(tag)) return false;
      if (!q) return true;
      return (
        t.nome.toLowerCase().includes(q) ||
        (t.tipologia ?? "").toLowerCase().includes(q) ||
        (t.categoria_slug ?? "").toLowerCase().includes(q)
      );
    });
  }, [templates, search, tag, onlyInactive]);

  const importWnd = useMutation({
    mutationFn: async () => {
      const existing = new Set(templates.map((t) => t.nome));
      const toInsert = WND_ARTICLE_TEMPLATES.filter((r) => !existing.has(r.nome));
      let ok = 0;
      // inserimento a piccoli lotti per non superare i limiti di payload
      for (let i = 0; i < toInsert.length; i += 10) {
        const batch = toInsert.slice(i, i + 10);
        const { error } = await supabase.from("article_family_templates").insert(batch as never);
        if (error) throw error;
        ok += batch.length;
      }
      return { inserted: ok, skipped: WND_ARTICLE_TEMPLATES.length - ok };
    },
    onSuccess: (r) => {
      toast.success(`Libreria WnD importata: ${r.inserted} nuovi, ${r.skipped} già presenti`);
      qc.invalidateQueries({ queryKey: ["admin-article-templates"] });
    },
    onError: (e: unknown) => toast.error(`Errore import WnD: ${(e as Error).message}`),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("article_family_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template eliminato");
      qc.invalidateQueries({ queryKey: ["admin-article-templates"] });
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const toggleActive = useMutation({
    mutationFn: async (t: Template) => {
      const { error } = await supabase
        .from("article_family_templates")
        .update({ is_active: !t.is_active })
        .eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-article-templates"] }),
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const duplicate = useMutation({
    mutationFn: async (t: Template) => {
      const { id, sort_order, ...rest } = t;
      void id; void sort_order;
      const { error } = await supabase
        .from("article_family_templates")
        .insert({ ...rest, nome: `${t.nome} (copia)`, is_active: false } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template duplicato (disattivato)");
      qc.invalidateQueries({ queryKey: ["admin-article-templates"] });
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const wndInLibrary = templates.filter((t) => (t.tags ?? []).includes("WnD")).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Boxes className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">Template Articoli</h1>
            <p className="text-sm text-muted-foreground">
              Libreria globale importabile dalle aziende ("Importa da template" nel Listino).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => importWnd.mutate()}
            disabled={importWnd.isPending}
            title={`${wndInLibrary} template WnD già in libreria`}
          >
            {importWnd.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Importa libreria WnD
          </Button>
          <Button onClick={() => setEditing({
            id: "", nome: "", descrizione: "", vertical_slug: "serramenti", categoria_slug: "",
            tipologia: "", tags: [], modalita_prezzo_base: "griglia", prezzo_base_vendita: 0,
            vat_rate: 22, unit_of_measure: "pz", griglia_asse_x_label: "Larghezza (mm)",
            griglia_asse_y_label: "Altezza (mm)", griglia_unita: "mm", griglia_default: null,
            image_url: null, is_active: true, sort_order: 0,
          })}>
            <Plus className="h-4 w-4 mr-2" /> Nuovo
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-3 flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Cerca per nome, codice, categoria…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="h-10 rounded-md border bg-background px-2 text-sm" value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">Tutti i tag</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm whitespace-nowrap px-1">
            <Switch checked={onlyInactive} onCheckedChange={setOnlyInactive} /> Solo disattivati
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {isLoading ? "Caricamento…" : `${filtered.length} template`}
          </CardTitle>
          <CardDescription>Clic su un template per modificarne dati e griglia prezzi.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {filtered.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40">
                <button className="flex-1 min-w-0 text-left" onClick={() => setEditing(t)}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{t.nome}</span>
                    {!t.is_active && <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50">disattivo</Badge>}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap mt-0.5">
                    {t.tipologia && <span className="font-mono">{t.tipologia}</span>}
                    {t.categoria_slug && <span>· {t.categoria_slug}</span>}
                    {t.modalita_prezzo_base === "griglia" && (
                      <span className="inline-flex items-center gap-1">· <Grid3x3 className="h-3 w-3" />
                        {(t.griglia_default?.xs?.length ?? 0)}×{(t.griglia_default?.ys?.length ?? 0)} ({cellCount(t.griglia_default)} prezzi)</span>
                    )}
                    {(t.tags ?? []).slice(0, 3).map((x) => <Badge key={x} variant="secondary" className="text-[10px]">{x}</Badge>)}
                  </div>
                </button>
                <Switch checked={t.is_active} onCheckedChange={() => toggleActive.mutate(t)} title="Attiva/disattiva" />
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(t)} title="Modifica"><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => duplicate.mutate(t)} title="Duplica"><Copy className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => { if (confirm(`Eliminare "${t.nome}"?`)) del.mutate(t.id); }} title="Elimina"><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            {!isLoading && filtered.length === 0 && (
              <div className="py-12 text-center text-muted-foreground text-sm">Nessun template con questi filtri.</div>
            )}
          </div>
        </CardContent>
      </Card>

      {editing && <EditDialog template={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["admin-article-templates"] }); }} />}
    </div>
  );
}

function EditDialog({ template, onClose, onSaved }: { template: Template; onClose: () => void; onSaved: () => void }) {
  const isNew = !template.id;
  const [f, setF] = useState<Template>(template);
  const [grid, setGrid] = useState<GridDefault | null>(template.griglia_default);
  const set = <K extends keyof Template>(k: K, v: Template[K]) => setF((p) => ({ ...p, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        nome: f.nome, descrizione: f.descrizione, vertical_slug: f.vertical_slug,
        categoria_slug: f.categoria_slug, tipologia: f.tipologia, tags: f.tags,
        modalita_prezzo_base: f.modalita_prezzo_base, prezzo_base_vendita: f.prezzo_base_vendita,
        vat_rate: f.vat_rate, unit_of_measure: f.unit_of_measure,
        griglia_asse_x_label: f.griglia_asse_x_label, griglia_asse_y_label: f.griglia_asse_y_label,
        griglia_unita: f.griglia_unita, griglia_default: grid as never, image_url: f.image_url, is_active: f.is_active,
      };
      if (isNew) {
        const { error } = await supabase.from("article_family_templates").insert(payload as never);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("article_family_templates").update(payload as never).eq("id", template.id);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(isNew ? "Template creato" : "Template aggiornato"); onSaved(); },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const editableGrid = grid && (grid.xs?.length ?? 0) * (grid.ys?.length ?? 0) <= 700;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "Nuovo template" : "Modifica template"}</DialogTitle>
          <DialogDescription>Dati globali del template articolo, importabile dalle aziende.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><Label>Nome</Label><Input value={f.nome} onChange={(e) => set("nome", e.target.value)} /></div>
          <div><Label>Codice / Tipologia</Label><Input value={f.tipologia ?? ""} onChange={(e) => set("tipologia", e.target.value)} /></div>
          <div><Label>Categoria (slug)</Label><Input value={f.categoria_slug ?? ""} onChange={(e) => set("categoria_slug", e.target.value)} /></div>
          <div><Label>Verticale</Label><Input value={f.vertical_slug} onChange={(e) => set("vertical_slug", e.target.value)} /></div>
          <div><Label>Tag (separati da virgola)</Label><Input value={(f.tags ?? []).join(", ")} onChange={(e) => set("tags", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} /></div>
          <div className="sm:col-span-2"><Label>Descrizione / note</Label><Textarea rows={2} value={f.descrizione ?? ""} onChange={(e) => set("descrizione", e.target.value)} /></div>
          <div><Label>Modalità prezzo</Label><Input value={f.modalita_prezzo_base ?? ""} onChange={(e) => set("modalita_prezzo_base", e.target.value)} /></div>
          <div><Label>IVA %</Label><Input type="number" value={f.vat_rate ?? 22} onChange={(e) => set("vat_rate", Number(e.target.value))} /></div>
          <div><Label>UM</Label><Input value={f.unit_of_measure ?? ""} onChange={(e) => set("unit_of_measure", e.target.value)} /></div>
          <div><Label>URL icona</Label><Input value={f.image_url ?? ""} onChange={(e) => set("image_url", e.target.value || null)} /></div>
          <div className="flex items-center gap-2 pt-6"><Switch checked={f.is_active} onCheckedChange={(v) => set("is_active", v)} /><Label>Attivo</Label></div>
        </div>

        {f.modalita_prezzo_base === "griglia" && grid && (
          <div className="mt-2">
            <div className="flex items-center gap-2 mb-1 text-sm font-medium">
              <Grid3x3 className="h-4 w-4" /> Griglia prezzi {grid.xs.length}×{grid.ys.length} ({cellCount(grid)} prezzi) — €
            </div>
            {!editableGrid && <p className="text-xs text-muted-foreground mb-1">Griglia grande: modifica i singoli prezzi prossimamente. Sotto è in sola lettura.</p>}
            <div className="overflow-auto max-h-[40vh] border rounded-md">
              <table className="text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 top-0 z-10 bg-muted px-2 py-1 border">A\\L</th>
                    {grid.xs.map((x) => <th key={x} className="bg-muted px-2 py-1 border font-medium">{x}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {grid.ys.map((y, i) => (
                    <tr key={y}>
                      <th className="sticky left-0 bg-muted px-2 py-1 border font-medium">{y}</th>
                      {grid.xs.map((x, j) => (
                        <td key={x} className="border p-0">
                          {editableGrid ? (
                            <input
                              className="w-16 px-1 py-0.5 text-right bg-transparent focus:bg-primary/10 outline-none"
                              value={grid.m[i]?.[j] ?? ""}
                              onChange={(e) => {
                                const v = e.target.value.trim();
                                setGrid((prev) => {
                                  if (!prev) return prev;
                                  const m = prev.m.map((r) => r.slice());
                                  m[i][j] = v === "" ? null : Number(v);
                                  return { ...prev, m };
                                });
                              }}
                            />
                          ) : <span className="block w-16 px-1 text-right">{grid.m[i]?.[j] ?? "—"}</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !f.nome.trim()}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isNew ? "Crea" : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
