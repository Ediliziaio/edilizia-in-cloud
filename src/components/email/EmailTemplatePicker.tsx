import { useState } from "react";
import { useCompanyEmailTemplates, type CompanyEmailTemplate } from "@/hooks/useCompanyEmailTemplates";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { TemplateManagerDialog } from "./TemplateManagerDialog";
import { Settings2 } from "lucide-react";

export interface EmailTemplatePickerProps {
  onApply: (template: { subject: string; body_text: string }) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  generale: "Generale",
  preventivo: "Preventivo",
  sollecito: "Sollecito pagamento",
  benvenuto: "Benvenuto",
  appuntamento: "Appuntamento",
};

export function EmailTemplatePicker({ onApply }: EmailTemplatePickerProps) {
  const { templates, isLoading, isError } = useCompanyEmailTemplates();
  const [managerOpen, setManagerOpen] = useState(false);
  const [selected, setSelected] = useState<string>("");

  const handleSelect = (id: string) => {
    if (id === "__manager__") {
      setManagerOpen(true);
      return;
    }
    const tpl = templates.find((t) => t.id === id);
    if (tpl) {
      setSelected(id);
      onApply({ subject: tpl.subject, body_text: tpl.body_text });
    }
  };

  // Group templates by category
  const byCategory = templates.reduce<Record<string, CompanyEmailTemplate[]>>((acc, t) => {
    const key = t.category ?? "generale";
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  const categories = Object.keys(byCategory).sort();

  return (
    <>
      <div className="flex items-center gap-1.5">
        {isError ? (
          <span className="text-[11px] text-muted-foreground italic flex-1">
            Template non disponibili (errore).
          </span>
        ) : templates.length === 0 && !isLoading ? (
          <span className="text-[11px] text-muted-foreground italic flex-1">
            Nessun template —{" "}
            <button
              type="button"
              className="underline text-blue-600 hover:text-blue-700"
              onClick={() => setManagerOpen(true)}
            >
              crea il primo
            </button>
          </span>
        ) : (
          <Select value={selected} onValueChange={handleSelect}>
            <SelectTrigger className="h-8 text-xs flex-1 bg-slate-50 border-slate-200">
              <SelectValue placeholder="Usa un template…" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <div key={cat}>
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {CATEGORY_LABELS[cat] ?? cat}
                  </div>
                  {byCategory[cat].map((t) => (
                    <SelectItem key={t.id} value={t.id} className="text-xs pl-4">
                      {t.name}
                      {t.subject && (
                        <span className="ml-2 text-muted-foreground truncate">— {t.subject}</span>
                      )}
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
          onClick={() => setManagerOpen(true)}
          title="Gestisci template email"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <TemplateManagerDialog open={managerOpen} onOpenChange={setManagerOpen} />
    </>
  );
}
