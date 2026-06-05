/**
 * EmailBodyEditor — editor visuale (WYSIWYG) per il corpo delle email nei nodi
 * automazione. Sostituisce la vecchia textarea HTML grezza: l'utente formatta
 * visivamente (grassetto, liste, link, colori) e il componente produce HTML nel
 * campo `corpo`, quindi l'engine NON cambia.
 *
 * Riusa il `RichTextEditor` (TipTap) già presente in EiC. Aggiunge un selettore
 * di variabili che le inserisce al punto del cursore ({{nome}}, {{azienda}}, …).
 */
import { useRef, useState } from "react";
import { Variable } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RichTextEditor, type RichTextEditorHandle } from "@/components/ui/rich-text-editor";

export interface EmailVariable {
  key: string;
  label: string;
}

/** Variabili di default per i nodi email automazione (contesto azienda/piattaforma). */
const DEFAULT_EMAIL_VARIABLES: EmailVariable[] = [
  { key: "nome", label: "Nome (admin)" },
  { key: "cognome", label: "Cognome (admin)" },
  { key: "azienda", label: "Nome azienda" },
  { key: "azienda.name", label: "Nome azienda (alt.)" },
  { key: "azienda.email", label: "Email admin" },
];

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

  const filtered = variables.filter(
    (v) => v.label.toLowerCase().includes(search.toLowerCase()) || v.key.toLowerCase().includes(search.toLowerCase()),
  );

  const insertVariable = (key: string) => {
    editorRef.current?.insertContent(`{{${key}}}`);
  };

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
          <PopoverContent className="w-64 p-2" align="end">
            <Input
              autoFocus
              placeholder="Cerca variabile…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs mb-2"
            />
            <ScrollArea className="max-h-56">
              <div className="space-y-0.5">
                {filtered.length === 0 && (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">Nessuna variabile</p>
                )}
                {filtered.map((v) => (
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
