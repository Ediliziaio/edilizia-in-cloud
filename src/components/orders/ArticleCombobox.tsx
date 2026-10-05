import { useState } from "react";
import { Check, ChevronsUpDown, Plus, Package, FileText } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { applyMarkup, applyScontiFornitore } from "@/lib/priceMarkup";
import type { MarkupTipo } from "@/types/articleFamily";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface ArticleTemplateData {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit_price: number;
  standard_cost: number;
  unit_of_measure: string;
  vat_rate: number;
  supplier_id: string | null;
  description: string | null;
  immagine_url: string | null;
  pdf_scheda_url: string | null;
  /** Origine: catalogo articoli (article_templates) o listino prodotti (article_families). */
  source?: "catalog" | "listino";
  /** Costo manodopera/posa da listino (solo article_families), se valorizzato. */
  manodopera_costo?: number | null;
}

interface ArticleComboboxProps {
  value: string;
  onValueChange: (value: string, templateData?: ArticleTemplateData) => void;
  placeholder?: string;
  /**
   * v8.6.34 — Fallback companyId per super_admin senza impersonation.
   * Se effectiveCompany è null, usiamo questo (es. company della commessa).
   */
  fallbackCompanyId?: string;
  /**
   * Se true, oltre al catalogo articoli (article_templates) mostra anche i
   * prodotti del Listino (article_families, con foto/costo base). Opt-in:
   * attivo solo dove serve (es. articoli di commessa).
   */
  includeListino?: boolean;
}

export function ArticleCombobox({
  value,
  onValueChange,
  placeholder = "Seleziona o digita nome articolo...",
  fallbackCompanyId,
  includeListino = false,
}: ArticleComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();

  const companyId = effectiveCompany?.id ?? fallbackCompanyId;

  const { data: templates = [] } = useQuery({
    queryKey: ["article-templates", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("article_templates")
        .select("id, name, sku, category, unit_price, standard_cost, unit_of_measure, vat_rate, supplier_id, description, immagine_url, pdf_scheda_url")
        .eq("company_id", companyId!)
        .order("name");
      if (error) throw error;
      return data as ArticleTemplateData[];
    },
    enabled: !!companyId,
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!companyId) throw new Error("Company ID non disponibile");
      const { data, error } = await supabase
        .from("article_templates")
        .insert({
          company_id: companyId,
          name: name.trim(),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["article-templates"] });
      queryClient.invalidateQueries({ queryKey: ["article-templates-full"] });
    },
  });

  // Listino prodotti (article_families) — opt-in. Mappa i prodotti del listino
  // nello stesso shape del combobox: costo = acquisto netto degli sconti
  // fornitore, prezzo = vendita salvata (o da costo + ricarico), IVA e unità
  // del prodotto. Fino al 05/10/2026 IVA 22 e «pz» erano fissi e il costo era
  // il lordo di listino del fornitore: margini sottostimati sulle commesse.
  const { data: listino = [] } = useQuery({
    queryKey: ["article-combobox-listino", companyId],
    enabled: !!companyId && includeListino,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const [famRes, catRes, axesRes] = await Promise.all([
        sb.from("article_families")
          .select("id, nome, codice, descrizione, immagine_url, prezzo_base_acquisto, prezzo_base_vendita, categoria_id, manodopera_costo_acquisto, supplier_id, vat_rate, unit_of_measure, prezzo_base_mode, sconto_fornitore_1, sconto_fornitore_2, markup_tipo, markup_valore")
          .eq("company_id", companyId!)
          .eq("attivo", true)
          .eq("mostra_preventivo", true)
          .is("deleted_at", null)
          .order("nome")
          .limit(2000),
        sb.from("listino_categorie").select("id, nome").eq("company_id", companyId!),
        // Varianti: assi + valori. Espandiamo SOLO le famiglie con un singolo
        // asse (es. "Potenza"/"Modello") nelle loro varianti, ognuna col suo
        // codice + prezzo. Famiglie multi-asse → restano una voce (configuratore).
        sb.from("article_family_axes")
          .select("id, family_id, values:article_family_axis_values(id, label, codice, prezzo_vendita, prezzo_acquisto, immagine_url, maggiorazione_tipo, maggiorazione_valore, maggiorazione_acquisto, attivo, sort_order)")
          .eq("company_id", companyId!),
      ]);
      if (famRes.error) throw famRes.error;
      const catName = new Map<string, string>();
      (catRes.data ?? []).forEach((c: { id: string; nome: string | null }) => {
        if (c.nome) catName.set(c.id, c.nome);
      });

      type VariantRow = {
        id: string; label: string; codice: string | null; prezzo_vendita: number | null; immagine_url: string | null;
        prezzo_acquisto: number | null; maggiorazione_acquisto: number | null;
        maggiorazione_tipo: string | null; maggiorazione_valore: number | null; attivo: boolean; sort_order: number;
      };
      const axisCount = new Map<string, number>();
      const variantsByFamily = new Map<string, VariantRow[]>();
      (axesRes.data ?? []).forEach((ax: { id: string; family_id: string; values: VariantRow[] | null }) => {
        axisCount.set(ax.family_id, (axisCount.get(ax.family_id) ?? 0) + 1);
        const vals = (ax.values ?? []).filter((v) => v.attivo).sort((a, b) => a.sort_order - b.sort_order);
        if (vals.length > 0) variantsByFamily.set(ax.family_id, vals);
      });
      // Le maggiorazioni possono essere riduzioni (−8%, −20 €): mai sotto zero.
      const variantPrice = (base: number | null, v: VariantRow): number => {
        if (v.prezzo_vendita != null && Number(v.prezzo_vendita) > 0) return Number(v.prezzo_vendita);
        const b = Number(base ?? 0);
        if (v.maggiorazione_tipo === "percentuale") return Math.max(0, b * (1 + Number(v.maggiorazione_valore ?? 0) / 100));
        if (typeof v.maggiorazione_tipo === "string" && v.maggiorazione_tipo.startsWith("fisso")) {
          return Math.max(0, b + Number(v.maggiorazione_valore ?? 0));
        }
        return b;
      };
      // Il costo della variante con le stesse regole del prezzo, dal lato acquisto.
      const variantCost = (base: number, v: VariantRow): number => {
        if (v.prezzo_acquisto != null && Number(v.prezzo_acquisto) > 0) return Number(v.prezzo_acquisto);
        if (v.maggiorazione_tipo === "percentuale") return Math.max(0, base * (1 + Number(v.maggiorazione_acquisto ?? 0) / 100));
        if (typeof v.maggiorazione_tipo === "string" && v.maggiorazione_tipo.startsWith("fisso")) {
          return Math.max(0, base + Number(v.maggiorazione_acquisto ?? 0));
        }
        return base;
      };

      type FamigliaRow = {
        id: string; nome: string; codice: string | null; descrizione: string | null; immagine_url: string | null;
        prezzo_base_acquisto: number | null; prezzo_base_vendita: number | null; categoria_id: string | null;
        manodopera_costo_acquisto: number | null; supplier_id?: string | null;
        vat_rate: number | null; unit_of_measure: string | null; prezzo_base_mode: string | null;
        sconto_fornitore_1: number | null; sconto_fornitore_2: number | null;
        markup_tipo: string | null; markup_valore: number | null;
      };
      // Costo netto: nei prodotti «acquisto + ricarico» il costo salvato è il
      // lordo di listino del fornitore, da cui si tolgono gli sconti.
      const costoNetto = (f: FamigliaRow): number => {
        const lordo = Number(f.prezzo_base_acquisto ?? 0);
        return f.prezzo_base_mode === "acquisto_markup"
          ? applyScontiFornitore(lordo, Number(f.sconto_fornitore_1 ?? 0), Number(f.sconto_fornitore_2 ?? 0))
          : lordo;
      };
      // Vendita salvata; per un prodotto a ricarico che non l'ha, da costo + ricarico.
      const venditaBase = (f: FamigliaRow): number => {
        const salvata = Number(f.prezzo_base_vendita ?? 0);
        if (salvata > 0 || f.prezzo_base_mode !== "acquisto_markup") return salvata;
        return applyMarkup({
          prezzoAcquisto: costoNetto(f),
          markupTipo: (f.markup_tipo ?? "none") as MarkupTipo,
          markupValore: Number(f.markup_valore ?? 0),
        }).prezzoVendita;
      };

      return ((famRes.data ?? []) as FamigliaRow[]).flatMap((f): ArticleTemplateData[] => {
        const category = f.categoria_id ? (catName.get(f.categoria_id) ?? null) : null;
        const variants = axisCount.get(f.id) === 1 ? variantsByFamily.get(f.id) : undefined;
        const costo = costoNetto(f);
        const vendita = venditaBase(f);
        const iva = f.vat_rate != null && Number.isFinite(Number(f.vat_rate)) ? Number(f.vat_rate) : 22;
        const unita = f.unit_of_measure || "pz";
        // Famiglia a variante singola → una voce per variante (codice + prezzo propri).
        if (variants && variants.length > 0) {
          return variants.map((v): ArticleTemplateData => ({
            id: v.id,
            name: `${f.nome} — ${v.label}`,
            sku: v.codice ?? f.codice,
            category,
            unit_price: variantPrice(vendita, v),
            standard_cost: variantCost(costo, v),
            unit_of_measure: unita,
            vat_rate: iva,
            // Il fornitore della famiglia viaggia con la scelta: cosi'
            // l'articolo atterra nel pannello gia' raggruppato, senza il
            // passaggio a mano "assegna il fornitore". Prima era cablato
            // a null anche quando il listino lo conosceva.
            supplier_id: f.supplier_id ?? null,
            description: f.descrizione,
            // Immagine propria della variante, fallback a quella della famiglia.
            immagine_url: v.immagine_url ?? f.immagine_url,
            pdf_scheda_url: null,
            source: "listino",
            manodopera_costo: Number(f.manodopera_costo_acquisto ?? 0) || null,
          }));
        }
        // Nessuna variante → la famiglia come singola voce (comportamento attuale).
        return [{
          id: f.id,
          name: f.nome,
          sku: f.codice,
          category,
          unit_price: vendita,
          standard_cost: costo,
          unit_of_measure: unita,
          vat_rate: iva,
          supplier_id: f.supplier_id ?? null,
          description: f.descrizione,
          immagine_url: f.immagine_url,
          pdf_scheda_url: null,
          source: "listino",
          manodopera_costo: Number(f.manodopera_costo_acquisto ?? 0) || null,
        }];
      });
    },
  });

  // Catalogo + Listino uniti (catalogo prima). Il catalogo è oggi spesso vuoto:
  // il listino è la fonte reale dei prodotti.
  const allTemplates: ArticleTemplateData[] = [
    ...templates.map((t) => ({ ...t, source: t.source ?? ("catalog" as const) })),
    ...listino,
  ];

  const filteredTemplates = allTemplates.filter((template) =>
    template.name.toLowerCase().includes(searchValue.toLowerCase()) ||
    (template.sku && template.sku.toLowerCase().includes(searchValue.toLowerCase()))
  );

  const exactMatch = allTemplates.some(
    (template) => template.name.toLowerCase() === searchValue.toLowerCase()
  );

  const handleSelect = (template: ArticleTemplateData) => {
    onValueChange(template.name, template);
    setOpen(false);
    setSearchValue("");
  };

  const handleCreateNew = async () => {
    if (!searchValue.trim()) return;
    const trimmed = searchValue.trim();
    onValueChange(trimmed);
    setOpen(false);
    setSearchValue("");
    if (companyId) {
      try {
        await createTemplateMutation.mutateAsync(trimmed);
      } catch {
        // Template non creato, ma il nome è già stato impostato
        toast.error("Articolo aggiunto all'ordine ma non salvato a catalogo");
      }
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {value || placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Cerca o digita nuovo nome..."
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList>
            <CommandEmpty className="py-3 px-4 text-sm text-muted-foreground">
              {searchValue.trim()
                ? <>Nessun articolo "{searchValue}" — premi <kbd className="px-1 py-0.5 mx-0.5 rounded border bg-muted text-[10px]">↩</kbd> o clicca sotto per crearne uno nuovo</>
                : allTemplates.length === 0
                  ? (includeListino
                      ? "Nessun prodotto nel listino né nel catalogo. Digita un nome per aggiungerlo al volo, oppure popola il Listino prodotti in Impostazioni → Listino."
                      : "Il catalogo articoli è vuoto. Digita un nome per aggiungerlo al volo (verrà salvato a catalogo), oppure popolalo in Impostazioni → Catalogo articoli con foto, scheda e prezzi.")
                  : "Digita per cercare, oppure scegli un prodotto qui sotto."}
            </CommandEmpty>
            <CommandGroup>
              {filteredTemplates.map((template) => (
                <CommandItem
                  key={template.id}
                  value={template.name}
                  onSelect={() => handleSelect(template)}
                  className="items-start gap-2"
                >
                  <Check
                    className={cn(
                      "mt-1.5 h-4 w-4 shrink-0",
                      value === template.name ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {template.immagine_url ? (
                    <img
                      src={template.immagine_url}
                      alt=""
                      loading="lazy"
                      className="h-9 w-9 rounded object-cover border shrink-0"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded bg-muted flex items-center justify-center shrink-0">
                      <Package className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium truncate">{template.name}</span>
                      {template.sku && (
                        <span className="text-[10px] text-muted-foreground">({template.sku})</span>
                      )}
                      {template.source === "listino" && (
                        <span className="text-[9px] px-1.5 py-0 rounded-full bg-blue-100 text-blue-700">listino</span>
                      )}
                      {template.category && (
                        <span className="text-[10px] px-1.5 py-0 rounded-full bg-muted text-muted-foreground">
                          {template.category}
                        </span>
                      )}
                    </div>
                    {template.description && (
                      <p className="text-[11px] text-muted-foreground truncate">{template.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      {template.unit_price > 0 && (
                        <span className="text-[11px] text-muted-foreground">€{template.unit_price.toFixed(2)}</span>
                      )}
                      {template.pdf_scheda_url && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-blue-600">
                          <FileText className="h-3 w-3" /> scheda
                        </span>
                      )}
                    </div>
                  </div>
                </CommandItem>
              ))}
              {searchValue.trim() && !exactMatch && (
                <CommandItem
                  value={`create-${searchValue}`}
                  onSelect={handleCreateNew}
                  className="text-primary"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Aggiungi "{searchValue}"
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
