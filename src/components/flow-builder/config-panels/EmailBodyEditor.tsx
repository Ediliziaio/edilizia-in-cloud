/**
 * EmailBodyEditor — editor visuale (WYSIWYG) per il corpo delle email nei nodi
 * automazione. Sostituisce la vecchia textarea HTML grezza: l'utente formatta
 * visivamente (grassetto, liste, link, colori) e il componente produce HTML nel
 * campo `corpo`, quindi l'engine NON cambia.
 *
 * Riusa il `RichTextEditor` (TipTap) già presente in EiC. Il selettore di
 * variabili è DATA-DRIVEN: mostra le variabili base passate dal nodo PIÙ i
 * campi personalizzati reali caricati da `marketing_custom_fields`
 * (gli stessi di /admin/impostazioni/campi-personalizzati), raggruppati.
 */
import { useRef, useState } from "react";
import { Variable } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RichTextEditor, type RichTextEditorHandle } from "@/components/ui/rich-text-editor";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface EmailVariable {
  key: string;
  label: string;
  /** Gruppo nel selettore (es. "Variabili", "Campi personalizzati"). */
  group?: string;
}

/** Variabili di default per i nodi email automazione (contesto azienda/piattaforma). */
const DEFAULT_EMAIL_VARIABLES: EmailVariable[] = [
  { key: "nome", label: "Nome (admin)" },
  { key: "cognome", label: "Cognome (admin)" },
  { key: "azienda", label: "Nome azienda" },
  { key: "azienda.name", label: "Nome azienda (alt.)" },
  { key: "azienda.email", label: "Email admin" },
];

/** Etichette leggibili per gli object_type dei campi personalizzati. */
const OBJECT_LABEL: Record<string, string> = {
  contact: "Contatto", contatto: "Contatto", opportunity: "Opportunità",
  opportunita: "Opportunità", company: "Azienda", azienda: "Azienda",
  ordine: "Ordine", ticket: "Ticket", product: "Prodotto",
};

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

interface EmailBodyEditorProps {
  value: string | null | undefined;
  onChange: (html: string) => void;
  variables?: EmailVariable[];
  placeholder?: string;
  minHeight?: number;
}

export function EmailBodyEditor({
  value, onChange, variables = DEFAULT_EMAIL_VARIABLES, placeholder, minHeight = 200,
}: EmailBodyEditorProps) {
  const editorRef = useRef<RichTextEditorHandle>(null);
  const [search, setSearch] = useState("");
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  // Campi personalizzati reali (gli stessi di /admin/impostazioni/campi-personalizzati).
  const { data: customFields = [] } = useQuery({
    queryKey: ["email-merge-custom-fields", companyId],
    queryFn: async (): Promise<EmailVariable[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("marketing_custom_fields")
        .select("name, object_type")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("object_type", { ascending: true })
        .order("position", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data || []).map((f: { name: string; object_type: string }) => {
        const obj = OBJECT_LABEL[f.object_type] ?? f.object_type;
        return {
          key: `${f.object_type}.${slug(f.name)}`,
          label: `${f.name} · ${obj}`,
          group: "Campi personalizzati",
        };
      });
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const baseVars: EmailVariable[] = variables.map((v) => ({ ...v, group: v.group ?? "Variabili" }));
  const allVars = [...baseVars, ...customFields];
  const q = search.toLowerCase();
  const filtered = allVars.filter(
    (v) => v.label.toLowerCase().includes(q) || v.key.toLowerCase().includes(q),
  );
  // raggruppa preservando l'ordine dei gruppi
  const groups: string[] = [];
  for (const v of filtered) if (!groups.includes(v.group!)) groups.push(v.group!);

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
            <ScrollArea className="max-h-72">
              <div className="space-y-1">
                {filtered.length === 0 && (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">Nessun risultato</p>
                )}
                {groups.map((g) => (
                  <div key={g}>
                    <p className="px-2 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{g}</p>
                    {filtered.filter((v) => v.group === g).map((v) => (
                      <button
                        key={v.key}
                        type="button"
                        onClick={() => insertVariable(v.key)}
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-muted text-xs"
                      >
                        <span className="font-medium">{v.label}</span>
                        <span className="block text-[10px] text-muted-foreground font-mono">{`{{${v.key}}}`}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
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
