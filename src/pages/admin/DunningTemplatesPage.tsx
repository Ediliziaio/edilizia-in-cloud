import DOMPurify from "dompurify";
import { useState, useRef, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, FileText } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  useDunningTemplatesList,
  useUpdateDunningTemplate,
} from "@/hooks/superadmin/useDunningTemplates";
import type { DunningTemplate } from "@/hooks/superadmin/useDunningTemplates";

// ─── Valori esempio per l'anteprima ────────────────────────

const PREVIEW_VARS: Record<string, string> = {
  company_name: "Acme Edili",
  amount_due: "1.250,00",
  due_date: "15/04/2026",
  payment_link: "https://pagamento.example.com",
};

/** Sostituisce le variabili {{nome}} con i valori esempio */
function applyPreviewVars(html: string): string {
  return html.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return PREVIEW_VARS[key] ?? `{{${key}}}`;
  });
}

// ─── Helpers cursore textarea ─────────────────────────

/** Inserisce testo nella posizione del cursore in una textarea */
function insertAtCursor(
  textarea: HTMLTextAreaElement,
  text: string,
  onUpdate: (value: string) => void
): void {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const before = textarea.value.substring(0, start);
  const after = textarea.value.substring(end);
  const newValue = before + text + after;
  onUpdate(newValue);
  // Ripristina la posizione del cursore dopo il testo inserito
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(start + text.length, start + text.length);
  });
}

// ─── Skeleton lista step ────────────────────────────

function StepListSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-20 w-full rounded-lg" />
      ))}
    </div>
  );
}

// ─── Editor template ────────────────────────────────

interface DunningTemplateEditorProps {
  template: DunningTemplate;
}

function DunningTemplateEditor({ template }: DunningTemplateEditorProps) {
  // Stato locale del form
  const [subject, setSubject] = useState(template.subject);
  const [bodyHtml, setBodyHtml] = useState(template.body_html);
  const [bodyText, setBodyText] = useState(template.body_text);
  const [isActive, setIsActive] = useState(template.is_active);

  // Tab modifica / anteprima
  const [editorTab, setEditorTab] = useState<"modifica" | "anteprima">("modifica");

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mutation = useUpdateDunningTemplate();

  // Ricalcola il corpo di anteprima con variabili sostituite
  const previewBody = applyPreviewVars(bodyHtml);

  /** Inserisce la variabile {{nome}} nel textarea alla posizione del cursore */
  const insertVariable = useCallback((varName: string) => {
    const textarea = textareaRef.current;
    if (textarea) {
      insertAtCursor(textarea, `{{${varName}}}`, setBodyHtml);
    } else {
      setBodyHtml((prev) => prev + `{{${varName}}}`);
    }
  }, []);

  const handleSave = () => {
    mutation.mutate({
      id: template.id,
      subject,
      body_html: bodyHtml,
      body_text: bodyText,
      is_active: isActive,
    });
  };

  return (
    <div className="space-y-5">
      {/* Intestazione editor */}
      <div>
        <h3 className="text-base font-semibold">
          Step {template.step_number} — {template.step_name}
        </h3>
        <p className="text-sm text-muted-foreground">
          Invio dopo {template.trigger_days_overdue} giorni di scaduto
        </p>
      </div>

      {/* Campo Oggetto */}
      <div className="space-y-1.5">
        <Label htmlFor="dunning-subject">Oggetto email</Label>
        <Input
          id="dunning-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Oggetto del messaggio..."
        />
      </div>

      {/* Toggle attivo/inattivo */}
      <div className="flex items-center gap-3">
        <Switch
          id="dunning-active"
          checked={isActive}
          onCheckedChange={setIsActive}
        />
        <Label htmlFor="dunning-active" className="cursor-pointer">
          {isActive ? "Template attivo" : "Template inattivo"}
        </Label>
      </div>

      {/* Editor corpo HTML con tab Modifica / Anteprima */}
      <div className="space-y-2">
        <Label>Corpo HTML</Label>
        <Tabs
          value={editorTab}
          onValueChange={(v) => setEditorTab(v as "modifica" | "anteprima")}
        >
          <TabsList className="h-8">
            <TabsTrigger value="modifica" className="text-xs">Modifica</TabsTrigger>
            <TabsTrigger value="anteprima" className="text-xs">Anteprima</TabsTrigger>
          </TabsList>

          {/* Tab modifica: textarea */}
          <TabsContent value="modifica" className="mt-2">
            <textarea
              ref={textareaRef}
              className="font-mono text-sm w-full rounded-md border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
              rows={12}
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              placeholder="<p>Inserisci il corpo HTML del messaggio...</p>"
            />
          </TabsContent>

          {/* Tab anteprima: rendering HTML */}
          <TabsContent value="anteprima" className="mt-2">
            <div
              className="min-h-[200px] rounded-md border border-input bg-white p-4 text-sm text-gray-900 overflow-auto prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewBody) }}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Valori esempio: company_name="{PREVIEW_VARS.company_name}", amount_due="{PREVIEW_VARS.amount_due}", due_date="{PREVIEW_VARS.due_date}"
            </p>
          </TabsContent>
        </Tabs>
      </div>

      {/* Corpo testo plain */}
      <div className="space-y-1.5">
        <Label htmlFor="dunning-body-text">Corpo testo semplice</Label>
        <textarea
          id="dunning-body-text"
          className="font-mono text-sm w-full rounded-md border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
          rows={6}
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          placeholder="Versione testo semplice del messaggio..."
        />
      </div>

      {/* Sidebar variabili disponibili */}
      {template.variables.available.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            Variabili disponibili — clicca per inserire nel corpo HTML
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {template.variables.available.map((varName) => (
              <button
                key={varName}
                type="button"
                onClick={() => insertVariable(varName)}
                className="inline-flex items-center"
              >
                <Badge
                  variant="outline"
                  className="cursor-pointer font-mono text-xs hover:bg-primary/10 hover:border-primary transition-colors"
                >
                  {`{{${varName}}}`}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Footer: ultimo aggiornamento + bottone salva */}
      <div className="flex items-center justify-between pt-2 border-t gap-4 flex-wrap">
        <p className="text-xs text-muted-foreground">
          {template.updated_at
            ? `Ultimo aggiornamento: ${format(new Date(template.updated_at), "dd/MM/yyyy HH:mm", { locale: it })}`
            : "Mai modificato"}
        </p>
        <Button onClick={handleSave} disabled={mutation.isPending} size="sm">
          {mutation.isPending ? "Salvataggio..." : "Salva"}
        </Button>
      </div>
    </div>
  );
}

// ─── Scheda step nella lista sinistra ─────────────────────────

interface StepCardProps {
  template: DunningTemplate;
  isSelected: boolean;
  onClick: () => void;
}

function StepCard({ template, isSelected, onClick }: StepCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-3 transition-colors ${
        isSelected
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/40 hover:bg-muted/40"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">
            Step {template.step_number} — {template.step_name}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Invia dopo {template.trigger_days_overdue} giorni
          </p>
        </div>
        <Badge
          variant="outline"
          className={
            template.is_active
              ? "bg-green-50 text-green-700 border-green-300 shrink-0"
              : "bg-gray-50 text-gray-500 border-gray-300 shrink-0"
          }
        >
          {template.is_active ? "Attivo" : "Inattivo"}
        </Badge>
      </div>
    </button>
  );
}

// ─── Pagina principale ────────────────────────────────────

/** Pagina di gestione e modifica dei template email dunning */
export default function DunningTemplatesPage() {
  const { data: templates, isLoading } = useDunningTemplatesList();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Template selezionato (oppure il primo disponibile)
  const selectedTemplate =
    templates?.find((t) => t.id === selectedId) ?? templates?.[0] ?? null;

  return (
    <div className="space-y-6">
      {/* Header pagina */}
      <div>
        <h1 className="text-2xl font-bold">Template Email Dunning</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gestisci i messaggi automatici inviati alle aziende con pagamenti scaduti
        </p>
      </div>

      {/* Layout due colonne */}
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6 items-start">
        {/* Colonna sinistra: lista step */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            Sequenza dunning
          </p>

          {isLoading ? (
            <StepListSkeleton />
          ) : !templates || templates.length === 0 ? (
            <div className="py-8 text-center rounded-lg border border-dashed">
              <Mail className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nessun template trovato</p>
            </div>
          ) : (
            templates.map((template) => (
              <StepCard
                key={template.id}
                template={template}
                isSelected={
                  selectedTemplate?.id === template.id
                }
                onClick={() => setSelectedId(template.id)}
              />
            ))
          )}
        </div>

        {/* Colonna destra: editor */}
        <Card>
          <CardContent className="pt-5">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-56 w-full" />
                <Skeleton className="h-10 w-24 ml-auto" />
              </div>
            ) : !selectedTemplate ? (
              <div className="py-12 text-center">
                <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  Seleziona uno step per modificare il template
                </p>
              </div>
            ) : (
              // Usa la key per resettare lo stato locale quando cambia il template selezionato
              <DunningTemplateEditor
                key={selectedTemplate.id}
                template={selectedTemplate}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
