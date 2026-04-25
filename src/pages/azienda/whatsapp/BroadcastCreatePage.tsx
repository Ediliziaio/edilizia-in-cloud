// MP-FINAL — Wizard creazione broadcast 4 step.
// Step 1: nome + selezione numero (purpose=marketing|bot_operativo)
// Step 2: template approvato + mapping variabili → campi contatto
// Step 3: segmento destinatari (tipo + stato + exclude_opt_out) con preview count
// Step 4: schedulazione (now / data/ora) + finestra oraria + riepilogo

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, ArrowRight, Info, Loader2, Send } from "lucide-react";
import { useWhatsAppNumbers } from "@/hooks/whatsapp/useWhatsAppNumbers";
import { useWAMetaTemplates } from "@/hooks/whatsapp/useWAMetaTemplates";
import { useCreateBroadcast } from "@/hooks/whatsapp/useWABroadcasts";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useQuery } from "@tanstack/react-query";

type Step = 1 | 2 | 3 | 4;

const CONTACT_FIELD_OPTIONS = [
  { value: "nome", label: "Nome" },
  { value: "cognome", label: "Cognome" },
  { value: "telefono", label: "Telefono" },
];

export default function BroadcastCreatePage() {
  const navigate = useNavigate();
  const companyId = useEffectiveCompanyId();
  const create = useCreateBroadcast();

  const [step, setStep] = useState<Step>(1);
  const [nome, setNome] = useState("");
  const [waNumberId, setWaNumberId] = useState<string>("");
  const [templateName, setTemplateName] = useState<string>("");
  const [variableMapping, setVariableMapping] = useState<Record<string, string>>({});
  const [tipoFilter, setTipoFilter] = useState<string>("all");
  const [statoFilter, setStatoFilter] = useState<string>("");
  const [excludeOptOut, setExcludeOptOut] = useState(true);
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledDate, setScheduledDate] = useState<string>(
    new Date(Date.now() + 10 * 60_000).toISOString().slice(0, 16),
  );
  const [windowStart, setWindowStart] = useState("09:00");
  const [windowEnd, setWindowEnd] = useState("18:00");

  const { data: numbers, isError: numbersError } = useWhatsAppNumbers();
  const eligibleNumbers = (numbers ?? []).filter(
    (n) => ["marketing", "bot_operativo"].includes(n.purpose ?? ""),
  );

  const { data: templates, isError: templatesError } = useWAMetaTemplates(waNumberId || undefined, true);
  const selectedTemplate = useMemo(
    () => (templates ?? []).find((t) => t.template_name === templateName),
    [templates, templateName],
  );

  const variableIds = useMemo(() => {
    const n = selectedTemplate?.variables_count ?? 0;
    return Array.from({ length: n }, (_, i) => String(i + 1));
  }, [selectedTemplate]);

  // Preview count contatti del segmento
  const { data: previewCount } = useQuery({
    queryKey: ["wa", "broadcast", "preview", companyId, tipoFilter, statoFilter, excludeOptOut],
    enabled: !!companyId && step >= 3,
    queryFn: async () => {
      let q = supabase
        .from("marketing_contacts")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId!)
        .not("telefono", "is", null);
      if (tipoFilter && tipoFilter !== "all") q = q.eq("tipo", tipoFilter);
      if (statoFilter) q = q.eq("stato", statoFilter);
      if (excludeOptOut) q = q.eq("opt_out", false);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  });

  const canAdvance = (): boolean => {
    if (step === 1) return !!nome.trim() && !!waNumberId;
    if (step === 2) {
      if (!templateName) return false;
      const missing = variableIds.some((v) => !variableMapping[v]);
      return !missing;
    }
    if (step === 3) return (previewCount ?? 0) > 0;
    if (step === 4) {
      if (scheduleMode === "later" && Number.isNaN(new Date(scheduledDate).getTime())) return false;
      return windowStart < windowEnd;
    }
    return true;
  };

  const submit = () => {
    const scheduled_at =
      scheduleMode === "now"
        ? new Date(Date.now() + 60_000).toISOString()
        : new Date(scheduledDate).toISOString();

    create.mutate(
      {
        nome,
        wa_number_id: waNumberId,
        template_name: templateName,
        template_variables: variableMapping,
        segment_filter: {
          tipo: tipoFilter === "all" ? undefined : tipoFilter,
          stato: statoFilter || undefined,
          exclude_opt_out: excludeOptOut,
        },
        scheduled_at,
        window_start: windowStart,
        window_end: windowEnd,
      },
      {
        onSuccess: () => navigate("/azienda/whatsapp?tab=broadcast"),
      },
    );
  };

  const headerSteps = [
    "Info base",
    "Template",
    "Destinatari",
    "Schedulazione",
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Nuova campagna broadcast</h1>
        <p className="text-sm text-muted-foreground">
          Step {step} di 4 — {headerSteps[step - 1]}
        </p>
      </div>

      <div className="flex gap-2">
        {headerSteps.map((label, i) => {
          const idx = (i + 1) as Step;
          const state = step === idx ? "active" : step > idx ? "done" : "pending";
          return (
            <div
              key={label}
              className={`flex-1 h-2 rounded-full transition-colors ${
                state === "active"
                  ? "bg-primary"
                  : state === "done"
                  ? "bg-primary/60"
                  : "bg-muted"
              }`}
              aria-label={`Step ${idx}: ${label} — ${state}`}
            />
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{headerSteps[step - 1]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* STEP 1 */}
          {step === 1 && (
            <>
              <div className="space-y-1">
                <Label htmlFor="bc-nome">Nome campagna</Label>
                <Input
                  id="bc-nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="es. Promo primavera 2026"
                  maxLength={80}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bc-number">Numero WhatsApp mittente</Label>
                <Select value={waNumberId} onValueChange={setWaNumberId}>
                  <SelectTrigger id="bc-number">
                    <SelectValue placeholder="Scegli numero..." />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleNumbers.length === 0 && (
                      <div className="px-2 py-2 text-sm text-muted-foreground">
                        Nessun numero con scopo marketing/bot_operativo. Collegane uno prima.
                      </div>
                    )}
                    {numbersError && (
                      <div className="px-2 py-2 text-sm text-destructive">
                        Errore nel caricamento dei numeri.
                      </div>
                    )}
                    {eligibleNumbers.map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.display_name ?? n.numero} ({n.purpose})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <>
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Solo template <b>APPROVED</b> da Meta. Se la lista è vuota, vai in Template e clicca "Sincronizza".
                </AlertDescription>
              </Alert>
              <div className="space-y-1">
                <Label htmlFor="bc-template">Template approvato</Label>
                <Select
                  value={templateName}
                  onValueChange={(v) => {
                    setTemplateName(v);
                    setVariableMapping({});
                  }}
                >
                  <SelectTrigger id="bc-template">
                    <SelectValue placeholder="Scegli template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(templates ?? []).length === 0 && (
                      <div className="px-2 py-2 text-sm text-muted-foreground">
                        Nessun template APPROVED disponibile.
                      </div>
                    )}
                    {templatesError && (
                      <div className="px-2 py-2 text-sm text-destructive">
                        Errore nel caricamento dei template.
                      </div>
                    )}
                    {(templates ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.template_name}>
                        {t.template_name} — {t.category} ({t.variables_count ?? 0} var)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedTemplate && variableIds.length > 0 && (
                <div className="space-y-2">
                  <Label>Mapping variabili → campo contatto</Label>
                  {variableIds.map((v) => (
                    <div key={v} className="flex items-center gap-2">
                      <span className="font-mono text-sm w-14 text-muted-foreground">{`{{${v}}}`}</span>
                      <Select
                        value={variableMapping[v] ?? ""}
                        onValueChange={(field) =>
                          setVariableMapping((m) => ({ ...m, [v]: field }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Scegli campo..." />
                        </SelectTrigger>
                        <SelectContent>
                          {CONTACT_FIELD_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="bc-tipo">Tipo contatto (opzionale)</Label>
                  <Select value={tipoFilter} onValueChange={setTipoFilter}>
                    <SelectTrigger id="bc-tipo">
                      <SelectValue placeholder="Tutti i tipi" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutti i tipi</SelectItem>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="cliente_prospect">Cliente prospect</SelectItem>
                      <SelectItem value="cliente">Cliente</SelectItem>
                      <SelectItem value="lead_qualificato">Lead qualificato</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bc-stato">Stato (opzionale)</Label>
                  <Input
                    id="bc-stato"
                    value={statoFilter}
                    onChange={(e) => setStatoFilter(e.target.value)}
                    placeholder="es. nuovo"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="bc-exclude-optout"
                  checked={excludeOptOut}
                  onCheckedChange={setExcludeOptOut}
                />
                <Label htmlFor="bc-exclude-optout">Escludi opt-out (raccomandato)</Label>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground mb-1">Anteprima destinatari</p>
                <p className="text-3xl font-bold">
                  {previewCount ?? "…"}
                  <span className="text-sm text-muted-foreground font-normal ml-2">contatti</span>
                </p>
                {(previewCount ?? 0) === 0 && (
                  <p className="text-xs text-red-600 mt-2">
                    Nessun contatto con questi filtri. Allenta i criteri.
                  </p>
                )}
              </div>
            </>
          )}

          {/* STEP 4 */}
          {step === 4 && (
            <>
              <div className="space-y-2">
                <Label>Quando inviare</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={scheduleMode === "now" ? "default" : "outline"}
                    onClick={() => setScheduleMode("now")}
                  >
                    Subito
                  </Button>
                  <Button
                    type="button"
                    variant={scheduleMode === "later" ? "default" : "outline"}
                    onClick={() => setScheduleMode("later")}
                  >
                    Programma
                  </Button>
                </div>
              </div>
              {scheduleMode === "later" && (
                <div className="space-y-1">
                  <Label htmlFor="bc-scheduled">Data e ora</Label>
                  <Input
                    id="bc-scheduled"
                    type="datetime-local"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                  />
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="bc-win-start">Finestra oraria (inizio)</Label>
                  <Input
                    id="bc-win-start"
                    type="time"
                    value={windowStart}
                    onChange={(e) => setWindowStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bc-win-end">Finestra oraria (fine)</Label>
                  <Input
                    id="bc-win-end"
                    type="time"
                    value={windowEnd}
                    onChange={(e) => setWindowEnd(e.target.value)}
                  />
                </div>
              </div>
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <div className="text-sm space-y-1">
                    <p><b>Riepilogo</b></p>
                    <ul className="list-disc pl-5 space-y-0.5 text-xs">
                      <li>Campagna: {nome}</li>
                      <li>Template: {templateName}</li>
                      <li>Destinatari: ~{previewCount ?? "—"}</li>
                      <li>Invio: {scheduleMode === "now" ? "tra 1 minuto" : new Date(scheduledDate).toLocaleString("it-IT")}</li>
                      <li>Finestra oraria: {windowStart}–{windowEnd}</li>
                    </ul>
                  </div>
                </AlertDescription>
              </Alert>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => {
            if (step === 1) navigate("/azienda/whatsapp?tab=broadcast");
            else setStep((s) => (Math.max(1, s - 1) as Step));
          }}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {step === 1 ? "Annulla" : "Indietro"}
        </Button>

        {step < 4 && (
          <Button
            disabled={!canAdvance()}
            onClick={() => setStep((s) => ((s + 1) as Step))}
          >
            Avanti
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
        {step === 4 && (
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Conferma e invia
          </Button>
        )}
      </div>
    </div>
  );
}
