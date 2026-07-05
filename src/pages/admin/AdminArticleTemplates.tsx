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
  Image as ImageIcon, X, Minus, ChevronDown, ChevronRight, Layers,
} from "lucide-react";
import { GlobalPhotoLibraryPicker } from "@/components/admin/GlobalPhotoLibraryPicker";
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
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
interface GridDefault { xs: number[]; ys: number[]; m: (number | null)[][] }

/**
 * Sorgenti importabili nella libreria globale. Le "Base Edilizia" sono NEUTRE
 * (nessun fornitore) — punto di partenza per il listino di qualsiasi azienda.
 * WnD è UN fornitore (serramenti), una sorgente tra le tante: prima era l'unico
 * bottone di import, dando l'impressione sbagliata che la libreria fosse "di WnD".
 * Ogni loader è un dynamic import, così i dataset non pesano sul bundle pagina.
 */
type LibrarySource = {
  key: string;
  gruppo: "base" | "fornitore";
  label: string;
  hint: string;
  load: () => Promise<{ nome: string }[]>;
};
const LIBRARY_SOURCES: LibrarySource[] = [
  {
    key: "base-piastrelle", gruppo: "base", label: "Base Edilizia · Piastrelle",
    hint: "Gres, rivestimenti, mosaici, klinker, battiscopa — al m²",
    load: async () => (await import("@/data/baseArticleTemplates")).BASE_PIASTRELLE_TEMPLATES,
  },
  {
    key: "base-porte", gruppo: "base", label: "Base Edilizia · Porte",
    hint: "Interne, scorrevoli, vetro, tagliafuoco, blindati — a pezzo",
    load: async () => (await import("@/data/baseArticleTemplates")).BASE_PORTE_TEMPLATES,
  },
  {
    key: "base-bagno", gruppo: "base", label: "Base Edilizia · Bagno & Sanitari",
    hint: "Sanitari, docce, rubinetteria, mobili, scaldasalviette — a pezzo",
    load: async () => (await import("@/data/baseArticleTemplates")).BASE_BAGNO_TEMPLATES,
  },
  {
    key: "base-elettrico", gruppo: "base", label: "Base Edilizia · Elettrico",
    hint: "Punti, placche, quadri, salvavita, LED, cavi/tubi (al ml)",
    load: async () => (await import("@/data/baseArticleTemplates")).BASE_ELETTRICO_TEMPLATES,
  },
  {
    key: "wnd", gruppo: "fornitore", label: "Fornitore WnD · Serramenti",
    hint: "Listino WnD estratto dai PDF (un fornitore)",
    load: async () => (await import("@/data/wndArticleTemplates")).WND_ARTICLE_TEMPLATES,
  },
];

/** Riga leggera per la lista: niente griglia_default/assi_default (jsonb pesanti),
 * caricati on-demand solo all'apertura dell'editor. */
interface TemplateListItem {
  id: string; nome: string; vertical_slug: string; categoria_slug: string | null;
  tipologia: string | null; tags: string[] | null; modalita_prezzo_base: string | null;
  image_url: string | null; is_active: boolean; sort_order: number | null;
}

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

/** "porta_finestra" → "Porta Finestra", "veneziane" → "Veneziane". */
const prettyLabel = (s: string) => (s || "Senza categoria").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function AdminArticleTemplates() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState<string>("");
  const [onlyInactive, setOnlyInactive] = useState(false);
  const [categoria, setCategoria] = useState<string>("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);

  // Lista LEGGERA: solo colonne necessarie, niente jsonb pesanti (griglia/assi).
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["admin-article-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("article_family_templates")
        .select("id,nome,vertical_slug,categoria_slug,tipologia,tags,modalita_prezzo_base,image_url,is_active,sort_order")
        .order("vertical_slug", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as TemplateListItem[];
    },
  });

  const allTags = useMemo(() => {
    const s = new Set<string>();
    templates.forEach((t) => (t.tags ?? []).forEach((x) => s.add(x)));
    return Array.from(s).sort();
  }, [templates]);

  const allCategorie = useMemo(() => {
    const s = new Set<string>();
    templates.forEach((t) => { if (t.categoria_slug) s.add(t.categoria_slug); });
    return Array.from(s).sort();
  }, [templates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (onlyInactive && t.is_active) return false;
      if (tag && !(t.tags ?? []).includes(tag)) return false;
      if (categoria && (t.categoria_slug ?? "") !== categoria) return false;
      if (!q) return true;
      return (
        t.nome.toLowerCase().includes(q) ||
        (t.tipologia ?? "").toLowerCase().includes(q) ||
        (t.categoria_slug ?? "").toLowerCase().includes(q)
      );
    });
  }, [templates, search, tag, categoria, onlyInactive]);

  // Raggruppamento per verticale → categoria (collassabile): scala a centinaia di template.
  const groups = useMemo(() => {
    const map = new Map<string, TemplateListItem[]>();
    for (const t of filtered) {
      const key = `${t.vertical_slug || "—"}/${t.categoria_slug || "senza-categoria"}`;
      const arr = map.get(key); if (arr) arr.push(t); else map.set(key, [t]);
    }
    return Array.from(map.entries())
      .map(([key, items]) => ({ key, vertical: key.split("/")[0], categoria: key.split("/")[1], items }))
      .sort((a, b) => a.key.localeCompare(b.key, "it"));
  }, [filtered]);

  const toggleGroup = (key: string) =>
    setCollapsed((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed.has(g.key));
  const toggleAll = () => setCollapsed(allCollapsed ? new Set() : new Set(groups.map((g) => g.key)));

  // Import generico da una qualsiasi sorgente libreria (base neutre o fornitore).
  // Idempotente per `nome`: reimportare non duplica. Dataset caricati lazy.
  const [importingKey, setImportingKey] = useState<string | null>(null);
  const importLibrary = useMutation({
    mutationFn: async (src: LibrarySource) => {
      const rows = await src.load();
      const existing = new Set(templates.map((t) => t.nome));
      const toInsert = rows.filter((r) => !existing.has(r.nome));
      let ok = 0;
      for (let i = 0; i < toInsert.length; i += 10) {
        const batch = toInsert.slice(i, i + 10);
        const { error } = await supabase.from("article_family_templates").insert(batch as never);
        if (error) throw error;
        ok += batch.length;
      }
      return { label: src.label, inserted: ok, skipped: rows.length - ok };
    },
    onMutate: (src) => setImportingKey(src.key),
    onSettled: () => setImportingKey(null),
    onSuccess: (r) => {
      toast.success(`${r.label}: ${r.inserted} nuovi, ${r.skipped} già presenti`);
      qc.invalidateQueries({ queryKey: ["admin-article-templates"] });
    },
    onError: (e: unknown) => toast.error(`Errore import: ${(e as Error).message}`),
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
    mutationFn: async (t: TemplateListItem) => {
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
    mutationFn: async (id: string) => {
      // Carica la riga COMPLETA (con griglia/assi) prima di duplicare.
      const { data: full, error: e1 } = await supabase
        .from("article_family_templates").select("*").eq("id", id).single();
      if (e1) throw e1;
      const { id: _id, sort_order: _so, created_at: _ca, updated_at: _ua, created_by: _cb, ...rest } =
        (full ?? {}) as Record<string, unknown>;
      void _id; void _so; void _ca; void _ua; void _cb;
      const { error } = await supabase
        .from("article_family_templates")
        .insert({ ...rest, nome: `${(rest as { nome?: string }).nome ?? "Template"} (copia)`, is_active: false } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template duplicato (disattivato)");
      qc.invalidateQueries({ queryKey: ["admin-article-templates"] });
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={importLibrary.isPending}>
                {importLibrary.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Importa da libreria
                <ChevronDown className="h-4 w-4 ml-1.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Librerie base (neutre)</DropdownMenuLabel>
              {LIBRARY_SOURCES.filter((s) => s.gruppo === "base").map((s) => (
                <DropdownMenuItem
                  key={s.key}
                  disabled={importLibrary.isPending}
                  onSelect={(e) => { e.preventDefault(); importLibrary.mutate(s); }}
                  className="flex-col items-start gap-0.5"
                >
                  <span className="font-medium flex items-center gap-2">
                    {importingKey === s.key && <Loader2 className="h-3 w-3 animate-spin" />}
                    {s.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{s.hint}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Cataloghi fornitore</DropdownMenuLabel>
              {LIBRARY_SOURCES.filter((s) => s.gruppo === "fornitore").map((s) => (
                <DropdownMenuItem
                  key={s.key}
                  disabled={importLibrary.isPending}
                  onSelect={(e) => { e.preventDefault(); importLibrary.mutate(s); }}
                  className="flex-col items-start gap-0.5"
                >
                  <span className="font-medium flex items-center gap-2">
                    {importingKey === s.key && <Loader2 className="h-3 w-3 animate-spin" />}
                    {s.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{s.hint}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => setCreatingNew(true)}>
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
          <select className="h-10 rounded-md border bg-background px-2 text-sm" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Tutte le categorie</option>
            {allCategorie.map((c) => <option key={c} value={c}>{prettyLabel(c)}</option>)}
          </select>
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
        <CardHeader className="pb-2 flex-row items-center justify-between gap-2 space-y-0">
          <div className="min-w-0">
            <CardTitle className="text-base">
              {isLoading ? "Caricamento…" : `${filtered.length} template · ${groups.length} categorie`}
            </CardTitle>
            <CardDescription>Clic su un template per modificarne dati e griglia prezzi.</CardDescription>
          </div>
          {groups.length > 1 && (
            <Button variant="ghost" size="sm" className="shrink-0" onClick={toggleAll}>
              {allCollapsed ? "Espandi tutto" : "Collassa tutto"}
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {groups.map((g) => {
            const isOpen = !collapsed.has(g.key);
            return (
              <div key={g.key} className="border-t first:border-t-0">
                <button
                  type="button"
                  onClick={() => toggleGroup(g.key)}
                  className="w-full flex items-center gap-2 px-4 py-2 bg-muted/40 hover:bg-muted/60 text-left"
                >
                  {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <Layers className="h-4 w-4 text-primary/70" />
                  <span className="font-semibold text-sm">{prettyLabel(g.categoria)}</span>
                  {g.vertical && g.vertical !== "serramenti" && <Badge variant="outline" className="text-[10px]">{g.vertical}</Badge>}
                  <Badge variant="secondary" className="text-[10px] ml-auto">{g.items.length}</Badge>
                </button>
                {isOpen && (
                  <div className="divide-y">
                    {g.items.map((t) => (
                      <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40">
                        <div className="h-9 w-9 rounded border bg-muted/40 overflow-hidden flex items-center justify-center shrink-0">
                          {t.image_url
                            ? <img src={t.image_url} alt="" className="w-full h-full object-contain" loading="lazy" />
                            : <ImageIcon className="h-4 w-4 text-muted-foreground/50" />}
                        </div>
                        <button className="flex-1 min-w-0 text-left" onClick={() => setEditingId(t.id)}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm truncate">{t.nome}</span>
                            {!t.is_active && <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50">disattivo</Badge>}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap mt-0.5">
                            {t.tipologia && <span className="font-mono">{t.tipologia}</span>}
                            {t.modalita_prezzo_base === "griglia" && (
                              <span className="inline-flex items-center gap-1"><Grid3x3 className="h-3 w-3" /> Griglia L×H</span>
                            )}
                            {(t.tags ?? []).slice(0, 3).map((x) => <Badge key={x} variant="secondary" className="text-[10px]">{x}</Badge>)}
                          </div>
                        </button>
                        <Switch checked={t.is_active} onCheckedChange={() => toggleActive.mutate(t)} title="Attiva/disattiva" />
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingId(t.id)} title="Modifica"><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => duplicate.mutate(t.id)} title="Duplica"><Copy className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => { if (confirm(`Eliminare "${t.nome}"?`)) del.mutate(t.id); }} title="Elimina"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {!isLoading && filtered.length === 0 && (
            <div className="py-12 text-center text-muted-foreground text-sm">Nessun template con questi filtri.</div>
          )}
        </CardContent>
      </Card>

      {editingId && (
        <EditDialogLoader
          id={editingId}
          onClose={() => setEditingId(null)}
          onSaved={() => { setEditingId(null); qc.invalidateQueries({ queryKey: ["admin-article-templates"] }); }}
        />
      )}
      {creatingNew && (
        <EditDialog
          template={BLANK_TEMPLATE}
          onClose={() => setCreatingNew(false)}
          onSaved={() => { setCreatingNew(false); qc.invalidateQueries({ queryKey: ["admin-article-templates"] }); }}
        />
      )}
    </div>
  );
}

const BLANK_TEMPLATE: Template = {
  id: "", nome: "", descrizione: "", vertical_slug: "serramenti", categoria_slug: "",
  tipologia: "", tags: [], modalita_prezzo_base: "griglia", prezzo_base_vendita: 0,
  vat_rate: 22, unit_of_measure: "pz", griglia_asse_x_label: "Larghezza (mm)",
  griglia_asse_y_label: "Altezza (mm)", griglia_unita: "mm", griglia_default: null,
  image_url: null, is_active: true, sort_order: 0,
};

/** Carica la riga COMPLETA on-demand (con griglia_default/assi) e apre l'editor. */
function EditDialogLoader({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: () => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-article-template", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("article_family_templates").select("*").eq("id", id).single();
      if (error) throw error;
      return data as unknown as Template;
    },
  });
  if (isLoading || isError || !data) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{isError ? "Errore" : "Caricamento template…"}</DialogTitle></DialogHeader>
          <div className="py-6 flex items-center justify-center">
            {isError
              ? <span className="text-sm text-destructive">Impossibile caricare il template.</span>
              : <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  return <EditDialog template={data} onClose={onClose} onSaved={onSaved} />;
}

function EditDialog({ template, onClose, onSaved }: { template: Template; onClose: () => void; onSaved: () => void }) {
  const isNew = !template.id;
  const [f, setF] = useState<Template>(template);
  const set = <K extends keyof Template>(k: K, v: Template[K]) => setF((p) => ({ ...p, [k]: v }));
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);

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
            <Label>Foto prodotto</Label>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setPhotoPickerOpen(true)}>
                <ImageIcon className="h-4 w-4 mr-2" /> Scegli dalla libreria
              </Button>
              {f.image_url && (
                <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => set("image_url", null)}>
                  <X className="h-4 w-4 mr-1" /> Rimuovi
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">Foto salvate nella libreria globale con un nome, riutilizzabili su altri articoli.</p>
          </div>
        </div>
        <GlobalPhotoLibraryPicker
          open={photoPickerOpen}
          onOpenChange={setPhotoPickerOpen}
          defaultVertical={f.vertical_slug}
          onSelect={(p) => set("image_url", p.url)}
        />

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
