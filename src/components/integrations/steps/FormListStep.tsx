import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, FileText, Settings2 } from "lucide-react";
import { toast } from "sonner";

interface FormListStepProps {
  hook: any;
  onMapFields: (formId: string) => void;
}

export function FormListStep({ hook, onMapFields }: FormListStepProps) {
  const { selectedPages, callProxy, forms, updateFormStatus } = hook;
  const [metaForms, setMetaForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const selectedPageIds = selectedPages.map((p: any) => p.id).sort().join(",");

  useEffect(() => {
    loadForms();
  }, [selectedPageIds]);

  const loadForms = async () => {
    if (selectedPages.length === 0) return;
    setLoading(true);
    try {
      const allForms: any[] = [];
      for (const page of selectedPages) {
        try {
          const result = await callProxy("get-forms", { page_asset_id: page.id });
          const pageForms = (result.forms || []).map((f: any) => ({
            ...f,
            page_name: page.asset_name,
            page_asset_id: page.id,
          }));
          allForms.push(...pageForms);
        } catch (e: any) {
          console.error(`Error loading forms for page ${page.asset_name}:`, e);
        }
      }
      setMetaForms(allForms);
    } catch (error: any) {
      toast.error(`Errore caricamento moduli: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const isFormActive = (formId: string) => {
    return forms.some((f: any) => f.form_id === formId && f.status === "active");
  };

  const handleToggle = (formId: string, formName: string) => {
    const currentActive = isFormActive(formId);
    updateFormStatus.mutate({
      formId,
      status: currentActive ? "inactive" : "active",
      syncMode: "new_only",
    });
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Caricamento moduli Lead Ads...</p>
      </div>
    );
  }

  if (selectedPages.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">Nessuna pagina selezionata. Torna indietro e seleziona almeno una pagina.</p>
      </div>
    );
  }

  if (metaForms.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Nessun modulo Lead Ads trovato sulle pagine selezionate.</p>
        <p className="text-xs mt-1">Crea un modulo Lead Ads su Facebook Ads Manager.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Attiva i moduli da cui vuoi importare i lead e configura la mappatura dei campi.
      </p>
      <div className="border rounded-lg divide-y max-h-[300px] overflow-y-auto">
        {metaForms.map((form) => {
          const active = isFormActive(form.id);
          return (
            <div key={form.id} className="flex items-center gap-3 px-4 py-3">
              <Switch
                checked={active}
                onCheckedChange={() => handleToggle(form.id, form.name)}
                disabled={updateFormStatus.isPending}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{form.name}</p>
                <p className="text-xs text-muted-foreground">{form.page_name}</p>
              </div>
              <div className="flex items-center gap-1">
                {form.questions && (
                  <span className="text-xs text-muted-foreground">
                    {form.questions.length} campi
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onMapFields(form.id)}
                  className="h-7 px-2 text-xs"
                >
                  <Settings2 className="h-3 w-3 mr-1" />
                  Mappa
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
