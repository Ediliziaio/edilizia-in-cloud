/**
 * FamilyTemplatePicker — Dialog galleria TEMPLATE ARTICOLI pre-confezionati.
 *
 * Workflow:
 *  1. Utente apre dialog dal FamilyCatalog ("Importa da template").
 *  2. Filtra per verticale/categoria/search.
 *  3. Click su una card → vede dettaglio (assi default, prezzo base, IVA).
 *  4. Click su "Importa" → RPC `import_article_family_template` →
 *     creazione famiglia con assi/valori pre-popolati nel listino azienda.
 *  5. Toast + redirect a /listino/famiglie/{id} (optional, gestito dal caller).
 *
 * Differenza da PhotoTemplatePicker (FASE 1):
 *  - PhotoTemplatePicker → restituisce SOLO URL foto (callback onSelect).
 *  - FamilyTemplatePicker → ESEGUE l'import lato DB e restituisce family_id.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, Package, Check, X, Sparkles, Ruler, Tag as TagIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useArticleFamilyTemplates,
  useImportArticleFamilyTemplate,
  type ArticleFamilyTemplate,
} from "@/hooks/useArticleFamilyTemplates";

const VERTICALI = [
  { value: "all",          label: "Tutti i verticali" },
  { value: "serramenti",   label: "Serramenti" },
  { value: "bagno",        label: "Bagno" },
  { value: "fotovoltaico", label: "Fotovoltaico" },
  { value: "tetti",        label: "Tetti" },
  { value: "cappotto",     label: "Cappotto termico" },
  { value: "pompe_calore", label: "Pompe di calore" },
];

const MODALITA_LABEL: Record<string, string> = {
  pz: "A pezzo",
  mq: "Al mq",
  griglia: "Griglia L×H",
  misura_libera: "Misura libera",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** company_id dell'azienda corrente (per la RPC di import). */
  companyId: string;
  /** Pre-filtro verticale (es. "serramenti"). */
  initialVertical?: string | null;
  /** Macrocategoria_id da assegnare alla famiglia importata (opzionale).
   *  Post-refactor 20270513200000 le famiglie si agganciano direttamente
   *  alla macrocategoria, niente più passaggio per categoria. */
  targetMacrocategoriaId?: string | null;
  /** Callback con l'id della famiglia creata, dopo import riuscito. */
  onImported?: (familyId: string, template: ArticleFamilyTemplate) => void;
}

export function FamilyTemplatePicker({
  open, onOpenChange, companyId, initialVertical, targetMacrocategoriaId, onImported,
}: Props) {
  const [vertical, setVertical] = useState<string>(initialVertical ?? "all");
  const [search, setSearch] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(() => new Set());

  // Reset stato quando il dialog viene chiuso, e ri-allinea il verticale al
  // pre-filtro del caller all'apertura.
  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setBrokenImages(new Set());
      setSearch("");
    } else if (initialVertical) {
      setVertical(initialVertical);
      setCategoriaFiltro("all");
    }
  }, [open, initialVertical]);

  const { data: templates = [], isLoading, isError } = useArticleFamilyTemplates({
    vertical: vertical === "all" ? null : vertical,
    search,
  });

  const categoriesAvailable = useMemo(() => {
    const cats = new Set<string>();
    templates.forEach((t) => { if (t.categoria_slug) cats.add(t.categoria_slug); });
    return Array.from(cats).sort();
  }, [templates]);

  const filtered = useMemo(
    () => (categoriaFiltro === "all" ? templates : templates.filter((t) => t.categoria_slug === categoriaFiltro)),
    [templates, categoriaFiltro],
  );

  const selected = filtered.find((t) => t.id === selectedId) ?? null;
  const importMutation = useImportArticleFamilyTemplate();

  const handleImport = async () => {
    if (!selected) return;
    try {
      const familyId = await importMutation.mutateAsync({
        templateId: selected.id,
        companyId,
        macrocategoriaId: targetMacrocategoriaId ?? null,
      });
      toast.success(`Articolo "${selected.nome}" importato dal template`, {
        description: `Assi e prezzi pre-popolati. Personalizza ora il listino.`,
      });
      onImported?.(familyId, selected);
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore import";
      toast.error("Import fallito", { description: msg });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!importMutation.isPending) onOpenChange(o); }}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-orange-600" />
            Importa articolo da template
          </DialogTitle>
          <DialogDescription>
            Scegli un template pre-configurato (foto, variabili standard, griglia prezzi).
            Verrà creato come nuovo articolo nel tuo listino, pronto da personalizzare.
          </DialogDescription>
        </DialogHeader>

        {/* Filtri */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pb-1 shrink-0">
          <div>
            <Label className="text-xs text-muted-foreground">Verticale</Label>
            <Select value={vertical} onValueChange={(v) => { setVertical(v); setCategoriaFiltro("all"); }}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {VERTICALI.map((v) => (
                  <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {categoriesAvailable.length > 1 && (
            <div>
              <Label className="text-xs text-muted-foreground">Categoria</Label>
              <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le categorie</SelectItem>
                  {categoriesAvailable.map((c) => (
                    <SelectItem key={c} value={c}>{prettyLabel(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className={categoriesAvailable.length > 1 ? "" : "sm:col-span-2"}>
            <Label className="text-xs text-muted-foreground">Cerca</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome, materiale, tag…"
                className="h-9 text-xs pl-8"
              />
            </div>
          </div>
        </div>

        {/* Body: griglia + dettaglio */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-3 gap-3 min-h-0">
          {/* Lista template */}
          <div className="md:col-span-2 overflow-y-auto pr-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Caricamento template…</span>
              </div>
            ) : isError ? (
              <div className="text-center py-12 text-sm text-rose-700">
                Errore caricamento. Riprova.
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                <Package className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                Nessun template con questi filtri.
                {search && (
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => { setSearch(""); setCategoriaFiltro("all"); setVertical("all"); }}
                    className="mt-2 text-xs gap-1"
                  >
                    <X className="h-3.5 w-3.5" /> Azzera filtri
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {filtered.map((t) => {
                  const isSelected = selectedId === t.id;
                  const isBroken = brokenImages.has(t.id);
                  return (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => setSelectedId(t.id)}
                      aria-pressed={isSelected}
                      aria-label={`Seleziona template ${t.nome}`}
                      className={cn(
                        "group relative aspect-[4/5] border-2 rounded-md overflow-hidden transition-all bg-slate-50 text-left flex flex-col",
                        isSelected
                          ? "border-orange-500 ring-2 ring-orange-300 shadow-md"
                          : "border-slate-200 hover:border-orange-300 hover:shadow-sm",
                      )}
                    >
                      <div className="flex-1 bg-muted overflow-hidden">
                        {t.image_url && !isBroken ? (
                          <img
                            src={t.thumbnail_url ?? t.image_url}
                            alt={t.nome}
                            loading="lazy"
                            className="w-full h-full object-cover"
                            onError={() => {
                              setBrokenImages((prev) => {
                                const next = new Set(prev);
                                next.add(t.id);
                                return next;
                              });
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                            <Package className="h-8 w-8" />
                          </div>
                        )}
                      </div>
                      <div className="p-2">
                        <p className="text-[11px] font-semibold line-clamp-2 leading-tight">{t.nome}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <Badge variant="outline" className="text-[9px] h-4 px-1">
                            {MODALITA_LABEL[t.modalita_prezzo_base] ?? t.modalita_prezzo_base}
                          </Badge>
                          {t.materiale && (
                            <span className="text-[9px] text-muted-foreground">{prettyLabel(t.materiale)}</span>
                          )}
                        </div>
                      </div>
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-orange-500 text-white flex items-center justify-center shadow">
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pannello dettaglio */}
          <aside className="hidden md:flex md:col-span-1 border-l pl-3 overflow-y-auto flex-col">
            {!selected ? (
              <div className="text-center text-xs text-muted-foreground my-auto py-8">
                <Package className="h-10 w-10 mx-auto opacity-30 mb-2" />
                Seleziona un template per vedere il dettaglio.
              </div>
            ) : (
              <div className="space-y-3">
                {selected.image_url && (
                  <img
                    src={selected.image_url}
                    alt={selected.nome}
                    className="w-full aspect-square object-cover rounded-md border"
                  />
                )}
                <div>
                  <h4 className="font-semibold text-sm leading-tight">{selected.nome}</h4>
                  {selected.descrizione && (
                    <p className="text-xs text-muted-foreground mt-1">{selected.descrizione}</p>
                  )}
                </div>
                <div className="space-y-1.5 text-xs">
                  <Row label="Verticale" value={prettyLabel(selected.vertical_slug)} />
                  {selected.categoria_slug && <Row label="Categoria" value={prettyLabel(selected.categoria_slug)} />}
                  {selected.tipologia && <Row label="Tipologia" value={prettyLabel(selected.tipologia)} />}
                  {selected.materiale && <Row label="Materiale" value={prettyLabel(selected.materiale)} />}
                  <Row label="Modalità prezzo" value={MODALITA_LABEL[selected.modalita_prezzo_base] ?? selected.modalita_prezzo_base} />
                  {selected.vat_rate != null && <Row label="IVA" value={`${selected.vat_rate}%`} />}
                  {selected.unit_of_measure && <Row label="UM" value={selected.unit_of_measure} />}
                </div>
                {selected.assi_default?.length > 0 && (
                  <div className="pt-2 border-t">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground mb-1.5">
                      <Ruler className="h-3 w-3" />
                      Variabili Standard ({selected.assi_default.length})
                    </div>
                    <ul className="space-y-1">
                      {selected.assi_default.map((a) => (
                        <li key={a.codice} className="text-[11px]">
                          <span className="font-semibold">{a.nome}</span>
                          <span className="text-muted-foreground">
                            : {a.values?.map((v) => v.label).slice(0, 3).join(", ")}
                            {a.values && a.values.length > 3 ? ` +${a.values.length - 3}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {selected.tags?.length > 0 && (
                  <div className="pt-2 border-t">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground mb-1.5">
                      <TagIcon className="h-3 w-3" />
                      Tag
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {selected.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-[9px] h-4 px-1">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>

        <DialogFooter className="border-t pt-3 sm:items-center sm:justify-between flex-wrap gap-2 shrink-0">
          <div className="text-xs text-muted-foreground">
            {selected
              ? <>Selezionato: <strong>{selected.nome}</strong></>
              : `${filtered.length} template disponibili`}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importMutation.isPending}>
              Annulla
            </Button>
            <Button
              onClick={handleImport}
              disabled={!selected || importMutation.isPending}
              className="bg-orange-500 hover:bg-orange-600"
            >
              {importMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importazione…</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" />Importa template</>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium truncate">{value}</span>
    </div>
  );
}

function prettyLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
