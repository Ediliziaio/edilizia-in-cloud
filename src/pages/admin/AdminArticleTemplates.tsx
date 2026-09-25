/**
 * AdminArticleTemplates — la «Libreria listino» del super admin: quello che si
 * dà pronto alle aziende, in tre schede.
 *
 *  - Modelli di area (25/09/2026): un'area intera — tipologie, prodotti con
 *    foto e schede, varianti — presa dal listino di un'azienda e installabile
 *    in un'altra come copia sua (ModelliAreaTab, listino_modelli_area).
 *  - Prodotti singoli: la libreria GLOBALE dei template articoli
 *    (`article_family_templates`) che le aziende importano dal Listino con
 *    «Importa → Modelli pronti». Qui si vedono TUTTI (anche disattivati), si
 *    cercano, si modificano metadati e GRIGLIA PREZZI, si attivano, duplicano,
 *    eliminano, e si importano in blocco le librerie base e fornitore.
 *  - Marche e serie dei serramenti (LibreriaMarcheSerie).
 *
 * RLS: select/insert/update/delete riservati a super_admin (policy aft_*).
 */
import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Boxes, Plus, Search, Pencil, Copy, Trash2, Download, Loader2, Grid3x3,
  Image as ImageIcon, X, Minus, ChevronDown, ChevronRight, Layers, Library, Tags, MoreHorizontal,
} from "lucide-react";
import { GlobalPhotoLibraryPicker } from "@/components/admin/GlobalPhotoLibraryPicker";
import { LibreriaMarcheSerie } from "@/components/admin/LibreriaMarcheSerie";
import { ModelliAreaTab } from "@/components/admin/listino/ModelliAreaTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FILTRO_VUOTO, MODALITA_PREZZO, categorieProdotti, etichettaModalita, etichettaSlug, filtraProdotti,
  gruppiProdotti, testoConteggio, type FiltroProdotti, type ProdottoLibreria,
} from "@/lib/listino/prodottiLibreria";
import { VERTICALI_GALLERIA } from "@/lib/verticalMapping";
import { cn } from "@/lib/utils";
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

/** «serramenti» → «Serramenti», con l'etichetta che vede l'azienda. */
const etichettaVerticale = (slug: string) =>
  VERTICALI_GALLERIA.find((v) => v.value === slug)?.label ?? etichettaSlug(slug);

const SCHEDE = ["aree", "prodotti", "marche"] as const;
type Scheda = (typeof SCHEDE)[number];

/** Cosa c'è nella scheda aperta, detto sotto il titolo: niente riquadri in più sopra gli elenchi. */
const SPIEGAZIONE: Record<Scheda, string> = {
  aree: "Aree intere prese dal listino di un'azienda: chi le installa ne riceve una copia sua, da modificare.",
  prodotti: "Un prodotto alla volta, con disegno e griglia prezzi: le aziende li prendono con «Importa → Modelli pronti».",
  marche: "Marche e serie di profilo dei serramenti.",
};

export default function AdminArticleTemplates() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  // La scheda aperta sta nell'indirizzo: si ricarica e si linka.
  const [parametri, setParametri] = useSearchParams();
  const richiesta = parametri.get("scheda");
  const scheda: Scheda = SCHEDE.includes(richiesta as Scheda) ? (richiesta as Scheda) : "aree";
  const cambiaScheda = (v: string) =>
    setParametri(
      (prima) => {
        const dopo = new URLSearchParams(prima);
        if (v === "aree") dopo.delete("scheda");
        else dopo.set("scheda", v);
        return dopo;
      },
      { replace: true },
    );
  const [filtro, setFiltro] = useState<FiltroProdotti>(FILTRO_VUOTO);
  const cambiaFiltro = (patch: Partial<FiltroProdotti>) => setFiltro((f) => ({ ...f, ...patch }));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);

  // Lista LEGGERA: solo colonne necessarie, niente jsonb pesanti (griglia/assi).
  const { data: templates = [], isLoading, isError, error: listError, refetch } = useQuery({
    queryKey: ["admin-article-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("article_family_templates")
        .select("id,nome,vertical_slug,categoria_slug,tipologia,tags,modalita_prezzo_base,image_url,is_active,sort_order")
        .order("vertical_slug", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ProdottoLibreria[];
    },
  });

  const categorie = useMemo(() => categorieProdotti(templates), [templates]);
  const nascosti = useMemo(() => templates.filter((t) => !t.is_active).length, [templates]);
  const filtered = useMemo(() => filtraProdotti(templates, filtro), [templates, filtro]);
  // Raggruppamento per verticale → categoria (collassabile): scala a centinaia di prodotti.
  const groups = useMemo(() => gruppiProdotti(filtered), [filtered]);
  const piuVerticali = new Set(groups.map((g) => g.verticale)).size > 1;
  const filtriAttivi = filtro.cerca.trim() !== "" || filtro.categoria !== null || filtro.tag !== null || filtro.soloSpenti;

  const toggleGroup = (key: string) =>
    setCollapsed((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed.has(g.chiave));
  const toggleAll = () => setCollapsed(allCollapsed ? new Set() : new Set(groups.map((g) => g.chiave)));

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
      toast.success(r.label, {
        description: `${r.inserted === 1 ? "1 prodotto nuovo" : `${r.inserted} prodotti nuovi`}, ${r.skipped} già presenti.`,
      });
      qc.invalidateQueries({ queryKey: ["admin-article-templates"] });
    },
    onError: (e: unknown) => toast.error("Catalogo non aggiunto", { description: (e as Error).message }),
  });

  const del = useMutation({
    mutationFn: async (t: ProdottoLibreria) => {
      const { error } = await supabase.from("article_family_templates").delete().eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: (_d, t) => {
      toast.success(`«${t.nome}» eliminato`);
      qc.invalidateQueries({ queryKey: ["admin-article-templates"] });
    },
    onError: (e: unknown) => toast.error("Prodotto non eliminato", { description: (e as Error).message }),
  });

  // Le aziende importano una COPIA (import_article_family_template): nessun
  // legame col modello, quindi eliminarlo non tocca i loro listini.
  const eliminaProdotto = async (t: ProdottoLibreria) => {
    const ok = await confirm({
      title: `Eliminare «${t.nome}»?`,
      description:
        "Sparisce dalla libreria. Le aziende che l'hanno già preso tengono il loro prodotto: è una copia loro. Per toglierlo solo alla vista delle aziende basta spegnere «Visibile».",
      confirmLabel: "Elimina",
      variant: "destructive",
    });
    if (ok) del.mutate(t);
  };

  // Spento = le aziende non lo vedono (policy article_family_templates_lettura_authenticated).
  const toggleActive = useMutation({
    mutationFn: async (t: ProdottoLibreria) => {
      const { error } = await supabase
        .from("article_family_templates")
        .update({ is_active: !t.is_active })
        .eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: (_d, t) => {
      toast.success(t.is_active ? `«${t.nome}» è nascosto alle aziende` : `«${t.nome}» è visibile alle aziende`);
      qc.invalidateQueries({ queryKey: ["admin-article-templates"] });
    },
    onError: (e: unknown) => toast.error("Non salvato", { description: (e as Error).message }),
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
        .insert({ ...rest, nome: `${(rest as { nome?: string }).nome ?? "Prodotto"} (copia)`, is_active: false } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Copia creata, nascosta alle aziende", { description: "Accendi «Visibile» quando è pronta." });
      qc.invalidateQueries({ queryKey: ["admin-article-templates"] });
    },
    onError: (e: unknown) => toast.error("Copia non creata", { description: (e as Error).message }),
  });

  const aggiungiCatalogo = (gruppo: LibrarySource["gruppo"]) =>
    LIBRARY_SOURCES.filter((s) => s.gruppo === gruppo).map((s) => (
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
    ));

  return (
    <div className="space-y-4">
      <Tabs value={scheda} onValueChange={cambiaScheda} className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Library className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold leading-tight">Libreria listino</h1>
              <p className="text-sm text-muted-foreground">{SPIEGAZIONE[scheda]}</p>
            </div>
          </div>
          <TabsList className="h-auto w-full shrink-0 flex-wrap justify-start sm:w-auto">
            <TabsTrigger value="aree" className="gap-1.5">
              <Layers className="h-4 w-4" aria-hidden="true" /> Modelli di area
            </TabsTrigger>
            <TabsTrigger value="prodotti" className="gap-1.5">
              <Boxes className="h-4 w-4" aria-hidden="true" /> Prodotti singoli
              {templates.length > 0 && <span className="text-xs text-muted-foreground">{templates.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="marche" className="gap-1.5">
              <Tags className="h-4 w-4" aria-hidden="true" /> Marche e serie
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="aree" className="mt-0">
          <ModelliAreaTab />
        </TabsContent>

        <TabsContent value="marche" className="mt-0">
          {/* Il livello sopra le tipologie: la marca e la serie di profilo, che è
              il modo in cui un serramentista descrive davvero il suo listino. */}
          <LibreriaMarcheSerie />
        </TabsContent>

        <TabsContent value="prodotti" className="mt-0 space-y-3">
          {/* Una riga sola per cercare e agire, le pastiglie sotto: l'elenco subito. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative sm:w-72">
              <Search className="pointer-events-none h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                className="pl-8"
                placeholder="Cerca per nome, codice, tag…"
                aria-label="Cerca un prodotto"
                value={filtro.cerca}
                onChange={(e) => cambiaFiltro({ cerca: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2 sm:ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="flex-1 sm:flex-none" disabled={importLibrary.isPending}>
                    {importLibrary.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                    <span className="sm:hidden">Cataloghi</span>
                    <span className="hidden sm:inline">Aggiungi un catalogo</span>
                    <ChevronDown className="h-4 w-4 ml-1.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <DropdownMenuLabel>Cataloghi base, senza fornitore</DropdownMenuLabel>
                  {aggiungiCatalogo("base")}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Cataloghi di un fornitore</DropdownMenuLabel>
                  {aggiungiCatalogo("fornitore")}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button className="flex-1 sm:flex-none" onClick={() => setCreatingNew(true)}>
                <Plus className="h-4 w-4 mr-2" /> Nuovo prodotto
              </Button>
            </div>
          </div>

          {(categorie.length > 1 || nascosti > 0 || filtro.tag) && (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtra i prodotti">
              {categorie.length > 1 && (
                <>
                  <Button size="sm" variant={filtro.categoria === null ? "default" : "outline"} className="h-8" onClick={() => cambiaFiltro({ categoria: null })}>
                    Tutte
                  </Button>
                  {categorie.map((c) => (
                    <Button
                      key={c.slug}
                      size="sm"
                      variant={filtro.categoria === c.slug ? "default" : "outline"}
                      className="h-8 gap-1.5"
                      aria-pressed={filtro.categoria === c.slug}
                      onClick={() => cambiaFiltro({ categoria: filtro.categoria === c.slug ? null : c.slug })}
                    >
                      {etichettaSlug(c.slug)} <span className="text-xs opacity-70">{c.conta}</span>
                    </Button>
                  ))}
                </>
              )}
              {nascosti > 0 && (
                <Button
                  size="sm"
                  variant={filtro.soloSpenti ? "default" : "outline"}
                  className="h-8 gap-1.5"
                  aria-pressed={filtro.soloSpenti}
                  onClick={() => cambiaFiltro({ soloSpenti: !filtro.soloSpenti })}
                >
                  Nascosti <span className="text-xs opacity-70">{nascosti}</span>
                </Button>
              )}
              {filtro.tag && (
                <Button size="sm" variant="secondary" className="h-8 gap-1" onClick={() => cambiaFiltro({ tag: null })} aria-label={`Togli il filtro ${filtro.tag}`}>
                  Tag «{filtro.tag}» <X className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              )}
            </div>
          )}

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-2">
              <p className="text-sm font-medium">
                {isLoading ? "Carico i prodotti…" : testoConteggio(filtered.length, groups.length)}
              </p>
              <div className="flex items-center gap-1">
                {filtriAttivi && (
                  <Button variant="ghost" size="sm" className="h-7" onClick={() => setFiltro(FILTRO_VUOTO)}>
                    Togli i filtri
                  </Button>
                )}
                {groups.length > 1 && (
                  <Button variant="ghost" size="sm" className="h-7" onClick={toggleAll}>
                    {allCollapsed ? "Apri tutte" : "Chiudi tutte"}
                  </Button>
                )}
              </div>
            </div>
            {groups.map((g) => {
              const isOpen = !collapsed.has(g.chiave);
              return (
                <div key={g.chiave} className="border-t">
                  <button
                    type="button"
                    onClick={() => toggleGroup(g.chiave)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center gap-2 px-4 py-2 bg-muted/40 hover:bg-muted/60 text-left"
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <span className="font-semibold text-sm">{etichettaSlug(g.categoria)}</span>
                    {piuVerticali && <Badge variant="outline" className="text-[10px]">{etichettaVerticale(g.verticale)}</Badge>}
                    <span className="ml-auto text-xs text-muted-foreground">{g.prodotti.length}</span>
                  </button>
                  {isOpen && (
                    <div className="divide-y">
                      {g.prodotti.map((t) => (
                        <div key={t.id} className="flex items-center gap-2 px-4 py-2 hover:bg-muted/40 sm:gap-3">
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                            onClick={() => setEditingId(t.id)}
                            aria-label={`Modifica ${t.nome}`}
                          >
                            <div className={cn("h-10 w-10 rounded border bg-muted/40 overflow-hidden flex items-center justify-center shrink-0", !t.is_active && "opacity-60")}>
                              {t.image_url
                                ? <img src={t.image_url} alt="" className="w-full h-full object-contain" loading="lazy" />
                                : <ImageIcon className="h-4 w-4 text-muted-foreground/50" />}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={cn("font-medium text-sm truncate", !t.is_active && "text-muted-foreground")}>{t.nome}</span>
                                {!t.is_active && (
                                  <Badge variant="outline" className="shrink-0 text-[10px] border-amber-300 text-amber-700 bg-amber-50">nascosto</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-x-2 text-xs text-muted-foreground flex-wrap mt-0.5">
                                {t.tipologia && <span className="font-mono">{t.tipologia}</span>}
                                {t.modalita_prezzo_base && (
                                  <span className="inline-flex items-center gap-1">
                                    {t.modalita_prezzo_base === "griglia" && <Grid3x3 className="h-3 w-3" aria-hidden="true" />}
                                    {etichettaModalita(t.modalita_prezzo_base)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                          {/* I tag filtrano l'elenco: al posto della tendina con cinquanta voci. */}
                          {(t.tags ?? []).length > 0 && (
                            <div className="hidden max-w-[40%] flex-wrap justify-end gap-1 md:flex">
                              {(t.tags ?? []).slice(0, 3).map((x) => (
                                <button
                                  key={x}
                                  type="button"
                                  onClick={() => cambiaFiltro({ tag: filtro.tag === x ? null : x })}
                                  title={`Solo i prodotti con «${x}»`}
                                  aria-pressed={filtro.tag === x}
                                  className={cn(
                                    "rounded-full px-2 py-0.5 text-[11px] transition-colors",
                                    filtro.tag === x ? "bg-primary text-primary-foreground" : "border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                                  )}
                                >
                                  {x}
                                </button>
                              ))}
                            </div>
                          )}
                          <Switch
                            checked={t.is_active}
                            disabled={toggleActive.isPending}
                            onCheckedChange={() => toggleActive.mutate(t)}
                            title="Visibile alle aziende"
                            aria-label={`${t.nome}: visibile alle aziende`}
                          />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={`Altre azioni per ${t.nome}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setEditingId(t.id)}>
                                <Pencil className="mr-2 h-4 w-4" /> Modifica
                              </DropdownMenuItem>
                              <DropdownMenuItem disabled={duplicate.isPending} onSelect={() => duplicate.mutate(t.id)}>
                                <Copy className="mr-2 h-4 w-4" /> Duplica
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => void eliminaProdotto(t)}>
                                <Trash2 className="mr-2 h-4 w-4" /> Elimina
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {/* Errore di caricamento ONESTO: prima un fetch fallito al primo load
                mostrava l'empty-state "Nessun template" (data=[], niente toast). */}
            {isError && (
              <div className="flex flex-col items-center gap-3 py-12 text-center border-t">
                <p className="text-sm text-destructive">
                  Non riesco a caricare i prodotti{listError instanceof Error ? `: ${listError.message}` : "."}
                </p>
                <Button size="sm" variant="outline" onClick={() => refetch()}>Riprova</Button>
              </div>
            )}
            {!isLoading && !isError && templates.length === 0 && (
              <div className="py-12 text-center border-t">
                <p className="font-medium">La libreria dei prodotti è vuota</p>
                <p className="mt-1 text-sm text-muted-foreground">Parti da un catalogo base o crea il primo prodotto.</p>
              </div>
            )}
            {!isLoading && !isError && templates.length > 0 && filtered.length === 0 && (
              <div className="py-12 text-center text-muted-foreground text-sm border-t">Nessun prodotto con questi filtri.</div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {editingId && (
        <EditDialogLoader
          id={editingId}
          categorie={categorie.map((c) => c.slug)}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null);
            qc.invalidateQueries({ queryKey: ["admin-article-templates"] });
            // ATTENZIONE: la chiave del DETTAGLIO è al singolare ("…-template") —
            // NON è un prefisso della lista, quindi va invalidata a parte. Senza,
            // riaprire lo stesso template entro lo staleTime serviva la versione
            // vecchia e un secondo salvataggio poteva annullare le modifiche.
            qc.invalidateQueries({ queryKey: ["admin-article-template"] });
          }}
        />
      )}
      {creatingNew && (
        <EditDialog
          template={BLANK_TEMPLATE}
          categorie={categorie.map((c) => c.slug)}
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
function EditDialogLoader({ id, categorie, onClose, onSaved }: { id: string; categorie: string[]; onClose: () => void; onSaved: () => void }) {
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
          <DialogHeader><DialogTitle>{isError ? "Errore" : "Carico il prodotto…"}</DialogTitle></DialogHeader>
          <div className="py-6 flex items-center justify-center">
            {isError
              ? <span className="text-sm text-destructive">Non riesco a caricare il prodotto.</span>
              : <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  return <EditDialog template={data} categorie={categorie} onClose={onClose} onSaved={onSaved} />;
}

function EditDialog({ template, categorie, onClose, onSaved }: {
  template: Template; categorie: string[]; onClose: () => void; onSaved: () => void;
}) {
  const isNew = !template.id;
  const [f, setF] = useState<Template>(template);
  const set = <K extends keyof Template>(k: K, v: Template[K]) => setF((p) => ({ ...p, [k]: v }));
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  // Un verticale salvato fuori elenco resta scelto, invece di sparire dalla tendina.
  const verticali = !f.vertical_slug || VERTICALI_GALLERIA.some((v) => v.value === f.vertical_slug)
    ? VERTICALI_GALLERIA
    : [...VERTICALI_GALLERIA, { value: f.vertical_slug, label: etichettaSlug(f.vertical_slug) }];

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
    onSuccess: () => { toast.success(isNew ? `«${f.nome}» aggiunto alla libreria` : `«${f.nome}» salvato`); onSaved(); },
    onError: (e: unknown) => toast.error("Non salvato", { description: (e as Error).message }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/* minmax(0,1fr): senza, la riga della foto allargava il dialogo oltre lo schermo del telefono. */}
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto grid-cols-[minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle>{isNew ? "Nuovo prodotto" : "Modifica prodotto"}</DialogTitle>
          <DialogDescription>
            Le aziende lo prendono con «Importa → Modelli pronti» e ne ricevono una copia loro: quello che cambi qui vale
            per chi lo prende dopo.
          </DialogDescription>
        </DialogHeader>

        {/* Foto */}
        <div className="flex items-start gap-4">
          <div className="h-24 w-24 rounded-lg border bg-muted/40 overflow-hidden flex items-center justify-center shrink-0">
            {f.image_url
              ? <img src={f.image_url} alt="Anteprima" className="w-full h-full object-contain" />
              : <ImageIcon className="h-8 w-8 text-muted-foreground" />}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <Label>Foto prodotto</Label>
            <div className="flex flex-wrap items-center gap-2">
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

        {/* Verticale e modalità si scelgono da un elenco: la modalità ha un CHECK nel
            database, e un verticale fuori elenco l'azienda non lo trova nel filtro. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><Label htmlFor="prodotto-nome">Nome</Label><Input id="prodotto-nome" value={f.nome} onChange={(e) => set("nome", e.target.value)} /></div>
          <div><Label htmlFor="prodotto-codice">Codice / Tipologia</Label><Input id="prodotto-codice" value={f.tipologia ?? ""} onChange={(e) => set("tipologia", e.target.value)} /></div>
          <div>
            <Label htmlFor="prodotto-categoria">Categoria</Label>
            <Input id="prodotto-categoria" list="prodotto-categorie" placeholder="es. infissi" value={f.categoria_slug ?? ""} onChange={(e) => set("categoria_slug", e.target.value)} />
            <datalist id="prodotto-categorie">
              {categorie.map((c) => <option key={c} value={c}>{etichettaSlug(c)}</option>)}
            </datalist>
          </div>
          <div>
            <Label>Verticale</Label>
            <Select value={f.vertical_slug} onValueChange={(v) => set("vertical_slug", v)}>
              <SelectTrigger aria-label="Verticale"><SelectValue placeholder="Scegli il verticale" /></SelectTrigger>
              <SelectContent>
                {verticali.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label htmlFor="prodotto-tag">Tag (separati da virgola)</Label><Input id="prodotto-tag" value={(f.tags ?? []).join(", ")} onChange={(e) => set("tags", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} /></div>
          <div className="sm:col-span-2"><Label htmlFor="prodotto-descrizione">Descrizione / note</Label><Textarea id="prodotto-descrizione" rows={2} value={f.descrizione ?? ""} onChange={(e) => set("descrizione", e.target.value)} /></div>
          <div>
            <Label>Modalità prezzo</Label>
            <Select value={f.modalita_prezzo_base ?? ""} onValueChange={(v) => set("modalita_prezzo_base", v)}>
              <SelectTrigger aria-label="Modalità prezzo"><SelectValue placeholder="Scegli come si prezza" /></SelectTrigger>
              <SelectContent>
                {MODALITA_PREZZO.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {f.modalita_prezzo_base !== "griglia" && (
            <div>
              {/* Senza griglia il prezzo è questo: prima non c'era modo di cambiarlo da qui. */}
              <Label htmlFor="prodotto-prezzo">Prezzo di vendita (€ / {f.unit_of_measure || "pz"})</Label>
              <Input
                id="prodotto-prezzo"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={f.prezzo_base_vendita ?? ""}
                onChange={(e) => set("prezzo_base_vendita", e.target.value === "" ? null : Number(e.target.value))}
              />
            </div>
          )}
          <div><Label htmlFor="prodotto-iva">IVA %</Label><Input id="prodotto-iva" type="number" value={f.vat_rate ?? 22} onChange={(e) => set("vat_rate", Number(e.target.value))} /></div>
          <div>
            <Label htmlFor="prodotto-um">Unità di misura</Label>
            <Input id="prodotto-um" list="prodotto-unita" value={f.unit_of_measure ?? ""} onChange={(e) => set("unit_of_measure", e.target.value)} />
            <datalist id="prodotto-unita">
              {["pz", "mq", "ml", "kg", "h"].map((u) => <option key={u} value={u} />)}
            </datalist>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
            <Switch checked={f.is_active} onCheckedChange={(v) => set("is_active", v)} /> Visibile alle aziende
          </label>
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
