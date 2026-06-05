/**
 * EmailBodyEditor — editor visuale (WYSIWYG) per il corpo delle email nei nodi
 * automazione. L'utente formatta visivamente e il componente produce HTML nel
 * campo `corpo` (l'engine non cambia).
 *
 * Il selettore variabili è in stile GHL: variabili RAGGRUPPATE PER CATEGORIA
 * (Contatto, Azienda, Opportunità, Appuntamento…), categorie espandibili e
 * RICERCA su tutto. Le variabili sono quelle reali del catalogo trigger +
 * eventuali campi personalizzati (marketing_custom_fields).
 */
import { useMemo, useRef, useState } from "react";
import { Variable, ChevronRight, ChevronDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RichTextEditor, type RichTextEditorHandle } from "@/components/ui/rich-text-editor";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getCatalogItem } from "@/lib/flow-node-catalog";
import { buildVariableCategories, type PickerVariable, type PickerCategory } from "./emailVariableCatalog";

export interface EmailVariable {
  key: string;
  label: string;
  group?: string;
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

interface EmailBodyEditorProps {
  value: string | null | undefined;
  onChange: (html: string) => void;
  /** Variabili extra specifiche del nodo (fuse nelle categorie giuste). */
  variables?: EmailVariable[];
  /** item_id del trigger del flusso: le sue variabili sono quelle che si COMPILANO
   *  davvero → mostrate in cima ("Disponibili in questo flusso"). */
  triggerItemId?: string;
  placeholder?: string;
  minHeight?: number;
}

export function EmailBodyEditor({
  value, onChange, variables = [], triggerItemId, placeholder, minHeight = 200,
}: EmailBodyEditorProps) {
  const editorRef = useRef<RichTextEditorHandle>(null);
  const [search, setSearch] = useState("");
  // La categoria "Disponibili in questo flusso" è espansa di default.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ _flow: true });
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  // Campi personalizzati reali (/admin/impostazioni/campi-personalizzati).
  const { data: customFields = [] } = useQuery({
    queryKey: ["email-merge-custom-fields", companyId],
    queryFn: async (): Promise<PickerVariable[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("marketing_custom_fields")
        .select("name, object_type")
        .eq("company_id", companyId)
        .is("deleted_at", null);
      if (error) throw error;
      return (data || []).map((f: { name: string; object_type: string }) => ({
        key: `${f.object_type}.${slug(f.name)}`,
        label: f.name,
      }));
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const extra: PickerVariable[] = useMemo(
    () => [...variables.map((v) => ({ key: v.key, label: v.label })), ...customFields],
    [variables, customFields],
  );

  // Variabili del trigger del flusso = quelle che si compilano davvero.
  const triggerVars: PickerVariable[] = useMemo(() => {
    const item = triggerItemId ? getCatalogItem(triggerItemId) : null;
    return (item?.outputVariables ?? []).map((v) => ({ key: v.id, label: v.label }));
  }, [triggerItemId]);

  const categories: PickerCategory[] = useMemo(() => {
    const base = buildVariableCategories(extra);
    if (triggerVars.length === 0) return base;
    return [{ id: "_flow", label: "Disponibili in questo flusso", variables: triggerVars }, ...base];
  }, [extra, triggerVars]);

  const q = search.trim().toLowerCase();
  const searchHits = useMemo(() => {
    if (!q) return [];
    const out: { cat: string; v: PickerVariable }[] = [];
    for (const c of categories)
      for (const v of c.variables)
        if (v.label.toLowerCase().includes(q) || v.key.toLowerCase().includes(q))
          out.push({ cat: c.label, v });
    return out;
  }, [q, categories]);

  const insertVariable = (key: string) => editorRef.current?.insertContent(`{{${key}}}`);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-end">
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs">
              <Variable className="h-3.5 w-3.5" />
              Variabile
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2" align="end">
            <Input
              autoFocus
              placeholder="Cerca variabile o campo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs mb-2"
            />
            <ScrollArea className="max-h-80">
              {q ? (
                /* Ricerca: risultati piatti su tutte le categorie */
                <div className="space-y-0.5">
                  {searchHits.length === 0 && (
                    <p className="px-2 py-3 text-center text-xs text-muted-foreground">Nessun risultato</p>
                  )}
                  {searchHits.map(({ cat, v }) => (
                    <button key={v.key} type="button" onClick={() => insertVariable(v.key)}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-muted text-xs">
                      <span className="font-medium">{v.label}</span>
                      <span className="ml-1 text-[10px] text-muted-foreground">· {cat}</span>
                      <span className="block text-[10px] text-muted-foreground font-mono">{`{{${v.key}}}`}</span>
                    </button>
                  ))}
                </div>
              ) : (
                /* Categorie espandibili (stile GHL) */
                <div className="space-y-0.5">
                  {categories.map((c) => {
                    const open = !!expanded[c.id];
                    return (
                      <div key={c.id}>
                        <button type="button"
                          onClick={() => setExpanded((s) => ({ ...s, [c.id]: !s[c.id] }))}
                          className="w-full flex items-center gap-1 px-2 py-1.5 rounded hover:bg-muted text-xs font-medium">
                          {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                          <span className="flex-1 text-left">{c.label}</span>
                          <span className="text-[10px] text-muted-foreground">{c.variables.length}</span>
                        </button>
                        {open && (
                          <div className="pl-5 pb-1">
                            {c.variables.map((v) => (
                              <button key={v.key} type="button" onClick={() => insertVariable(v.key)}
                                className="w-full text-left px-2 py-1 rounded hover:bg-muted text-xs">
                                <span>{v.label}</span>
                                <span className="block text-[10px] text-muted-foreground font-mono">{`{{${v.key}}}`}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </PopoverContent>
        </Popover>
      </div>
      <RichTextEditor
        ref={editorRef}
        value={value}
        onChange={onChange}
        placeholder={placeholder ?? "Scrivi l'email… usa la barra per formattare e il bottone Variabile per personalizzare."}
        minHeight={minHeight}
      />
    </div>
  );
}
