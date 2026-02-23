import { useState, useRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Code, Eye, Variable } from "lucide-react";

interface TemplateEditorProps {
  value: string;
  onChange: (value: string) => void;
}

const VARIABLES = [
  { label: "Nome contatto", value: "{{contact.first_name}}" },
  { label: "Cognome contatto", value: "{{contact.last_name}}" },
  { label: "Email contatto", value: "{{contact.email}}" },
  { label: "Nome azienda", value: "{{company.name}}" },
  { label: "Link disiscrizione", value: "{{unsubscribe_url}}" },
];

export function TemplateEditor({ value, onChange }: TemplateEditorProps) {
  const [preview, setPreview] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (preview && iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(value || "<p>Anteprima vuota</p>");
        doc.close();
      }
    }
  }, [preview, value]);

  const insertVariable = (variable: string) => {
    onChange(value + variable);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={preview ? "outline" : "default"}
          onClick={() => setPreview(false)}
        >
          <Code className="h-3.5 w-3.5 mr-1" /> HTML
        </Button>
        <Button
          type="button"
          size="sm"
          variant={preview ? "default" : "outline"}
          onClick={() => setPreview(true)}
        >
          <Eye className="h-3.5 w-3.5 mr-1" /> Anteprima
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="outline">
              <Variable className="h-3.5 w-3.5 mr-1" /> Variabili
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {VARIABLES.map((v) => (
              <DropdownMenuItem key={v.value} onClick={() => insertVariable(v.value)}>
                {v.label} <span className="ml-auto text-xs text-muted-foreground">{v.value}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {preview ? (
        <iframe
          ref={iframeRef}
          className="w-full h-80 border rounded-md bg-background"
          sandbox="allow-same-origin"
          title="Anteprima email"
        />
      ) : (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-sm min-h-[320px]"
          placeholder="<html><body><h1>Ciao {{contact.first_name}}</h1></body></html>"
        />
      )}
    </div>
  );
}
