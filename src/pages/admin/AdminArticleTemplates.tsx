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
import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Boxes, Plus, Search, Pencil, Copy, Trash2, Download, Loader2, Grid3x3,
  Upload, Image as ImageIcon, X, Minus,
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

/** Upload foto template nel bucket pubblico article-photo-templates (super_admin). */
async function uploadTemplateImage(file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `templates/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("article-photo-templates")
    .upload(path, file, { contentType: file.type || "image/png", upsert: false });
  if (error) throw error;
  return supabase.storage.from("article-photo-templates").getPublicUrl(path).data.publicUrl;
}

function EditDialog({ template, onClose, onSaved }: { template: Template; onClose: () => void; onSaved: () => void }) {
  const isNew = !template.id;
  const [f, setF] = useState<Template>(template);
  const set = <K extends keyof Template>(k: K, v: Template[K]) => setF((p) => ({ ...p, [k]: v }));

  // Foto
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadTemplateImage(file);
      set("image_url", url);
      toast.success("Foto caricata");
    } catch (err) {
      toast.error(`Upload fallito: ${(err as Error).message}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // Griglia prezzi: headers in state (rari), celle in ref (perf su griglie grandi)
  const [xs, setXs] = useState<number[]>(template.griglia_default?.xs ?? []);
  const [ys, setYs] = useState<number[]>(template.griglia_default?.ys ?? []);
  const mRef = useRef<(number | null)[][]>(
    (template.griglia_default?.ys ?? []).map((_, i) =>
      (template.griglia_default?.xs ?? []).map((_, j) => template.griglia_default?.m?.[i]?.[j] ?? null)),
  );
  const setX = (j: number, v: number) => setXs((p) => p.map((x, k) => (k === j ? v : x)));
  const setY = (i: number, v: number) => setYs((p) => p.map((y, k) => (k === i ? v : y)));
  const addCol = () => { const nx = xs.length ? xs[xs.length - 1] + 50 : 1000; mRef.current.forEach((r) => r.push(null)); setXs([...xs, nx]); };
  const addRow = () => { const ny = ys.length ? ys[ys.length - 1] + 50 : 1000; mRef.current.push(new Array(xs.length).fill(null)); setYs([...ys, ny]); };
  const removeCol = (j: number) => { mRef.current.forEach((r) => r.splice(j, 1)); setXs(xs.filter((_, k) => k !== j)); };
  const removeRow = (i: number) => { mRef.current.splice(i, 1); setYs(ys.filter((_, k) => k !== i)); };
  const createGrid = () => { mRef.current = [[null]]; setXs([1000]); setYs([1000]); };
  const buildGrid = (): GridDefault | null => {
    if (f.modalita_prezzo_base !== "griglia" || !xs.length || !ys.length) return null;
    const m = ys.map((_, i) => xs.map((_, j) => mRef.current[i]?.[j] ?? null));
    return { xs, ys, m };
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        nome: f.nome, descrizione: f.descrizione, vertical_slug: f.vertical_slug,
        categoria_slug: f.categoria_slug, tipologia: f.tipologia, tags: f.tags,
        modalita_prezzo_base: f.modalita_prezzo_base, prezzo_base_vendita: f.prezzo_base_vendita,
        vat_rate: f.vat_rate, unit_of_measure: f.unit_of_measure,
        griglia_asse_x_label: f.griglia_asse_x_label, griglia_asse_y_label: f.griglia_asse_y_label,
        griglia_unita: f.griglia_unita, griglia_default: buildGrid() as never, image_url: f.image_url, is_active: f.is_active,
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

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "Nuovo template" : "Modifica template"}</DialogTitle>
          <DialogDescription>Dati globali del template articolo, importabile dalle aziende.</DialogDescription>
        </DialogHeader>

        {/* Foto */}
        <div className="flex items-start gap-4">
          <div className="h-24 w-24 rounded-lg border bg-muted/40 overflow-hidden flex items-center justify-center shrink-0">
            {f.image_url
              ? <img src={f.image_url} alt="Anteprima" className="w-full h-full object-contain" />
              : <ImageIcon className="h-8 w-8 text-muted-foreground" />}
          </div>
          <div className="flex-1 space-y-2">
            <Label>Foto / icona articolo</Label>
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />} Carica foto
              </Button>
              {f.image_url && (
                <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => set("image_url", null)}>
                  <X className="h-4 w-4 mr-1" /> Rimuovi
                </Button>
              )}
            </div>
            <Input className="text-xs" placeholder="…oppure incolla un URL immagine" value={f.image_url ?? ""} onChange={(e) => set("image_url", e.target.value || null)} />
          </div>
        </div>

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
          <div className="flex items-center gap-2 pt-6"><Switch checked={f.is_active} onCheckedChange={(v) => set("is_active", v)} /><Label>Attivo</Label></div>
        </div>

        {f.modalita_prezzo_base === "griglia" && (
          xs.length && ys.length ? (
            <div className="mt-1">
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-medium flex items-center gap-2">
                  <Grid3x3 className="h-4 w-4" /> Griglia prezzi {xs.length}×{ys.length} — € (Larghezza × Altezza, mm)
                </div>
                <div className="flex gap-1">
                  <Button type="button" size="sm" variant="outline" className="h-7" onClick={addCol}><Plus className="h-3 w-3 mr-1" />Larghezza</Button>
                  <Button type="button" size="sm" variant="outline" className="h-7" onClick={addRow}><Plus className="h-3 w-3 mr-1" />Altezza</Button>
                </div>
              </div>
              <div className="overflow-auto max-h-[45vh] border rounded-md">
                <table className="text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="sticky left-0 top-0 z-20 bg-muted border px-1 py-1 text-muted-foreground">A\\L</th>
                      {xs.map((x, j) => (
                        <th key={j} className="sticky top-0 z-10 bg-muted border px-0.5 py-0.5">
                          <div className="flex flex-col items-center gap-0.5">
                            <input className="w-14 text-center bg-muted font-medium outline-none rounded" value={String(x)} onChange={(e) => setX(j, parseInt(e.target.value, 10) || 0)} />
                            <button type="button" className="text-destructive/70 hover:text-destructive" onClick={() => removeCol(j)} title="Rimuovi colonna"><Minus className="h-3 w-3" /></button>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ys.map((y, i) => (
                      <tr key={i}>
                        <th className="sticky left-0 z-10 bg-muted border px-0.5">
                          <div className="flex items-center gap-0.5">
                            <input className="w-14 text-center bg-muted font-medium outline-none rounded" value={String(y)} onChange={(e) => setY(i, parseInt(e.target.value, 10) || 0)} />
                            <button type="button" className="text-destructive/70 hover:text-destructive" onClick={() => removeRow(i)} title="Rimuovi riga"><Minus className="h-3 w-3" /></button>
                          </div>
                        </th>
                        {xs.map((_, j) => (
                          <td key={j} className="border p-0">
                            <input
                              key={`${i}-${j}-${xs.length}x${ys.length}`}
                              className="w-16 px-1 py-0.5 text-right bg-transparent focus:bg-primary/10 outline-none"
                              defaultValue={mRef.current[i]?.[j] ?? ""}
                              inputMode="numeric"
                              onChange={(e) => {
                                const v = e.target.value.trim();
                                if (!mRef.current[i]) mRef.current[i] = [];
                                mRef.current[i][j] = v === "" ? null : Number(v);
                              }}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Celle vuote = misura non quotata. Modifica intestazioni Larghezza/Altezza o aggiungi/rimuovi con i pulsanti.</p>
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" className="mt-1 self-start" onClick={createGrid}>
              <Plus className="h-3 w-3 mr-1" /> Crea griglia prezzi L×H
            </Button>
          )
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
