import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Loader2, FileText, Settings2, Download, Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/utils/logger";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface FormListStepProps {
  hook: any;
  onMapFields: (formId: string) => void;
}

export function FormListStep({ hook, onMapFields }: FormListStepProps) {
  const { selectedPages, callProxy, forms, updateFormStatus } = hook;
  const [metaForms, setMetaForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [backfillFormId, setBackfillFormId] = useState<string | null>(null);
  const [backfillMode, setBackfillMode] = useState<"all" | "since_date">("all");
  const [backfillDate, setBackfillDate] = useState<Date | undefined>(undefined);
  const [backfillProgress, setBackfillProgress] = useState<{ running: boolean; imported: number; total: number } | null>(null);
  // Con anni di campagne i moduli sono centinaia: senza una ricerca, trovarne
  // uno del 2024 vuol dire scorrere a mano.
  const [cerca, setCerca] = useState("");
  const [erroreMeta, setErroreMeta] = useState<string | null>(null);

  const selectedPageIds = selectedPages.map((p: any) => p.id).sort().join(",");

  useEffect(() => {
    loadForms();
  }, [selectedPageIds]);

  const loadForms = async () => {
    if (selectedPages.length === 0) return;
    setLoading(true);
    setErroreMeta(null);
    try {
      const allForms: any[] = [];
      for (const page of selectedPages) {
        try {
          const result = await callProxy("get-forms", { page_asset_id: page.id });
          if (result.errore) setErroreMeta(String(result.errore));
          const pageForms = (result.forms || []).map((f: any) => ({
            ...f,
            page_name: page.asset_name,
            page_asset_id: page.id,
          }));
          allForms.push(...pageForms);
        } catch (e: any) {
          logger.error(`Error loading forms for page ${page.asset_name}:`, e);
        }
      }
      setMetaForms(allForms);
    } catch (error: any) {
      toast.error(`Errore caricamento moduli: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const chiave = cerca.trim().toLowerCase();
  const mostrati = chiave
    ? metaForms.filter((f: any) =>
        String(f.name ?? "").toLowerCase().includes(chiave) ||
        String(f.id ?? "").includes(chiave) ||
        String(f.created_time ?? "").includes(chiave))
    : metaForms;

  const isFormActive = (formId: string) => {
    return forms.some((f: any) => f.form_id === formId && f.status === "active");
  };

  const handleToggle = (form: any) => {
    const currentActive = isFormActive(form.id);
    updateFormStatus.mutate({
      formId: form.id,
      formName: form.name,
      pageAssetId: form.page_asset_id,
      status: currentActive ? "inactive" : "active",
      syncMode: "new_only",
    });
  };

  const handleBackfill = useCallback(async (formId: string) => {
    setBackfillProgress({ running: true, imported: 0, total: 0 });
    try {
      const params: any = { form_id: formId, mode: backfillMode };
      if (backfillMode === "since_date" && backfillDate) {
        params.since_date = format(backfillDate, "yyyy-MM-dd");
      }
      const result = await callProxy("backfill-leads", params);
      const imported = result.imported || 0;
      setBackfillProgress({ running: false, imported, total: imported });
      toast.success(`${imported} lead importati con successo`);
    } catch (error: any) {
      toast.error(`Errore backfill: ${error.message}`);
      setBackfillProgress(null);
    } finally {
      setBackfillFormId(null);
    }
  }, [backfillMode, backfillDate, callProxy]);

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

      {erroreMeta && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Meta ha interrotto l'elenco: {erroreMeta}. Quelli qui sotto potrebbero non essere tutti.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
          placeholder="Cerca per nome, identificativo o anno (es. 2024)"
          className="h-8 max-w-sm text-sm"
        />
        <span className="text-xs text-muted-foreground">
          {chiave ? `${mostrati.length} di ${metaForms.length} moduli` : `${metaForms.length} moduli`}
        </span>
      </div>

      {/* Backfill progress */}
      {backfillProgress?.running && (
        <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Importazione lead storici in corso...</span>
          </div>
          <Progress value={backfillProgress.total > 0 ? (backfillProgress.imported / backfillProgress.total) * 100 : undefined} className="h-2" />
          <p className="text-xs text-muted-foreground">{backfillProgress.imported} lead importati</p>
        </div>
      )}

      {backfillProgress && !backfillProgress.running && (
        <div className="border rounded-lg p-3 bg-accent/50 text-sm text-primary">
          ✓ Importazione completata: {backfillProgress.imported} lead importati.
        </div>
      )}

      <div className="border rounded-lg divide-y max-h-[420px] overflow-y-auto">
        {mostrati.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Nessun modulo con «{cerca}».
          </p>
        )}
        {mostrati.map((form) => {
          const active = isFormActive(form.id);
          const isBackfillTarget = backfillFormId === form.id;
          return (
            <div key={form.id} className="px-4 py-3 space-y-2">
              <div className="flex items-center gap-3">
                <Switch
                  checked={active}
                  onCheckedChange={() => handleToggle(form)}
                  disabled={updateFormStatus.isPending}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{form.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {form.page_name}
                    {form.created_time ? ` · creato il ${format(new Date(form.created_time), "d MMM yyyy", { locale: it })}` : ""}
                    {form.status && form.status !== "ACTIVE" ? ` · ${String(form.status).toLowerCase()}` : ""}
                  </p>
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
                    onClick={() => setBackfillFormId(isBackfillTarget ? null : form.id)}
                    className="h-7 px-2 text-xs"
                    title="Importa lead storici"
                  >
                    <Download className="h-3 w-3" />
                  </Button>
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

              {/* Backfill panel */}
              {isBackfillTarget && (
                <div className="border rounded-lg p-3 bg-muted/30 space-y-3 ml-8">
                  <p className="text-xs font-medium">Importa lead storici</p>
                  <div className="flex items-center gap-2">
                    <Select value={backfillMode} onValueChange={(v) => setBackfillMode(v as any)}>
                      <SelectTrigger className="h-8 text-xs w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tutti i lead</SelectItem>
                        <SelectItem value="since_date">Da una data</SelectItem>
                      </SelectContent>
                    </Select>

                    {backfillMode === "since_date" && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                            <CalendarIcon className="h-3 w-3" />
                            {backfillDate ? format(backfillDate, "dd/MM/yyyy", { locale: it }) : "Seleziona data"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={backfillDate} onSelect={setBackfillDate} locale={it} />
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs" onClick={() => handleBackfill(form.id)} disabled={backfillProgress?.running || (backfillMode === "since_date" && !backfillDate)}>
                      Avvia importazione
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setBackfillFormId(null)}>
                      Annulla
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
