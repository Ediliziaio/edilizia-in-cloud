import { useForm, Controller } from "react-hook-form";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { useSaveAutomazione, type AutomationRule } from "@/hooks/useAutomazioni";
import { toast } from "sonner";

const TRIGGER_OPTIONS = [
  { group: "CRM", options: [
    { value: "contatto_creato", label: "👤 Nuovo contatto/lead" },
    { value: "opportunita_creata", label: "🆕 Nuova opportunità" },
    { value: "opportunita_stage_cambiato", label: "🔄 Cambio fase opportunità" },
  ]},
  { group: "Appuntamenti", options: [
    { value: "appuntamento_confermato", label: "📅 Appuntamento confermato" },
    { value: "appuntamento_completato", label: "✅ Appuntamento completato" },
  ]},
  { group: "Cantieri", options: [
    { value: "cantiere_creato", label: "🏗️ Nuovo cantiere" },
    { value: "cantiere_fase_completata", label: "🔨 Fase cantiere completata" },
  ]},
  { group: "Task", options: [
    { value: "task_completato", label: "✅ Task completato" },
    { value: "scadenza_reminder", label: "⏰ Promemoria scadenza" },
  ]},
  { group: "Programmato", options: [
    { value: "cron", label: "🕐 Schedulato (cron)" },
  ]},
];

const AZIONE_OPTIONS = [
  { value: "crea_task", label: "✅ Crea task" },
  { value: "invia_notifica", label: "🔔 Invia notifica in-app" },
  { value: "invia_email", label: "📧 Invia email" },
  { value: "invia_sms", label: "💬 Invia SMS" },
  { value: "assegna_agente", label: "👤 Riassegna agente" },
  { value: "esegui_agente_ai", label: "🤖 Chiama agente AI" },
  { value: "crea_appuntamento", label: "📅 Crea appuntamento" },
  { value: "aggiorna_campo", label: "✏️ Aggiorna campo" },
  { value: "chiama_webhook", label: "🔗 Chiama webhook" },
];

interface FormValues {
  nome: string;
  descrizione: string;
  categoria: string;
  icona: string;
  attiva: boolean;
  trigger_tipo: string;
  trigger_config: string;
  condizioni: string;
  azione_tipo: string;
  azione_config: string;
}

interface Props {
  rule?: AutomationRule | null;
  onClose: () => void;
}

export function AutomazioneFormDrawer({ rule, onClose }: Props) {
  const saveAutomazione = useSaveAutomazione();
  const isTemplate = rule?.is_template ?? false;

  const { register, handleSubmit, watch, control, setValue } = useForm<FormValues>({
    defaultValues: {
      nome: rule?.nome ?? "",
      descrizione: rule?.descrizione ?? "",
      categoria: rule?.categoria ?? "generale",
      icona: rule?.icona ?? "⚡",
      attiva: rule?.attiva ?? true,
      trigger_tipo: rule?.trigger_tipo ?? "contatto_creato",
      trigger_config: JSON.stringify(rule?.trigger_config ?? {}, null, 2),
      condizioni: JSON.stringify(rule?.condizioni ?? [], null, 2),
      azione_tipo: rule?.azione_tipo ?? "crea_task",
      azione_config: JSON.stringify(rule?.azione_config ?? {}, null, 2),
    }
  });

  const triggerTipo = watch("trigger_tipo");

  const onSubmit = async (data: FormValues) => {
    try {
      await saveAutomazione.mutateAsync({
        id: !isTemplate ? rule?.id : undefined,
        nome: data.nome,
        descrizione: data.descrizione,
        categoria: data.categoria,
        icona: data.icona,
        attiva: data.attiva,
        trigger_tipo: data.trigger_tipo,
        trigger_config: JSON.parse(data.trigger_config || "{}"),
        condizioni: JSON.parse(data.condizioni || "[]"),
        azione_tipo: data.azione_tipo,
        azione_config: JSON.parse(data.azione_config || "{}"),
        template_id: isTemplate ? rule?.id : rule?.template_id,
      } as Partial<AutomationRule>);
      toast.success(rule?.id && !isTemplate ? "Automazione aggiornata" : "Automazione creata");
      onClose();
    } catch {
      toast.error("Errore nel salvataggio");
    }
  };

  return (
    <Sheet open onOpenChange={open => !open && onClose()}>
      <SheetContent side="right" className="w-full max-w-2xl flex flex-col p-0 sm:max-w-2xl">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle>
            {isTemplate
              ? `Personalizza: ${rule?.nome}`
              : rule?.id ? "Modifica automazione" : "Nuova automazione"
            }
          </SheetTitle>
          <SheetDescription>
            Configura trigger, condizioni e azione dell'automazione.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 flex flex-col overflow-hidden">
          <Tabs defaultValue="base" className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 border-b">
              <TabsList className="h-9 bg-transparent p-0 gap-0">
                <TabsTrigger value="base" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs px-4">
                  Informazioni
                </TabsTrigger>
                <TabsTrigger value="trigger" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs px-4">
                  Trigger
                </TabsTrigger>
                <TabsTrigger value="azione" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs px-4">
                  Azione
                </TabsTrigger>
                <TabsTrigger value="avanzato" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs px-4">
                  Avanzato
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Base */}
              <TabsContent value="base" className="m-0 p-6 space-y-4">
                <div className="grid grid-cols-[auto_1fr] gap-3 items-start">
                  <div>
                    <Label>Icona</Label>
                    <Input {...register("icona")} className="w-16 text-center text-xl" maxLength={2} />
                  </div>
                  <div>
                    <Label>Nome *</Label>
                    <Input {...register("nome", { required: true })} placeholder="Es. Nuovo lead → Prima chiamata" />
                  </div>
                </div>

                <div>
                  <Label>Descrizione</Label>
                  <textarea {...register("descrizione")} rows={2} placeholder="Cosa fa questa automazione..."
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Categoria</Label>
                    <Controller name="categoria" control={control} render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="task">✅ Task</SelectItem>
                          <SelectItem value="marketing">📢 Marketing</SelectItem>
                          <SelectItem value="crm">💼 CRM</SelectItem>
                          <SelectItem value="cantieri">🏗️ Cantieri</SelectItem>
                          <SelectItem value="notifiche">🔔 Notifiche</SelectItem>
                          <SelectItem value="generale">🔧 Generale</SelectItem>
                        </SelectContent>
                      </Select>
                    )} />
                  </div>
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <Label>Stato</Label>
                      <div className="flex items-center gap-2 mt-2">
                        <Controller name="attiva" control={control} render={({ field }) => (
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        )} />
                        <span className="text-sm text-muted-foreground">
                          {watch("attiva") ? "Attiva" : "Inattiva"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Trigger */}
              <TabsContent value="trigger" className="m-0 p-6 space-y-4">
                <div>
                  <Label>Evento scatenante *</Label>
                  <Controller name="trigger_tipo" control={control} render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue placeholder="Scegli trigger..." /></SelectTrigger>
                      <SelectContent>
                        {TRIGGER_OPTIONS.map(g => (
                          <div key={g.group}>
                            <div className="px-2 py-1 text-xs text-muted-foreground font-semibold uppercase">{g.group}</div>
                            {g.options.map(o => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </div>
                        ))}
                      </SelectContent>
                    </Select>
                  )} />
                </div>

                {triggerTipo === "cron" && (
                  <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-4 border border-amber-200 dark:border-amber-800 text-sm space-y-2">
                    <p className="font-medium text-amber-800 dark:text-amber-200">⚠️ Automazione schedulata</p>
                    <p className="text-amber-700 dark:text-amber-300">Configura il cron nel campo JSON qui sotto.</p>
                    <code className="text-xs bg-amber-100 dark:bg-amber-900 px-2 py-1 rounded block text-amber-900 dark:text-amber-100">
                      {`{"cron": "0 9 * * 1-5", "descrizione": "Ogni giorno lavorativo alle 9"}`}
                    </code>
                  </div>
                )}

                <div>
                  <Label>Configurazione trigger (JSON)</Label>
                  <textarea
                    {...register("trigger_config")}
                    rows={4}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    placeholder='{"a_stage": "trattativa"}'
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Lascia <code>{"{}"}</code> per reagire a qualsiasi evento di questo tipo.
                  </p>
                </div>
              </TabsContent>

              {/* Azione */}
              <TabsContent value="azione" className="m-0 p-6 space-y-4">
                <div>
                  <Label>Tipo di azione *</Label>
                  <Controller name="azione_tipo" control={control} render={({ field }) => (
                    <Select value={field.value} onValueChange={val => {
                      field.onChange(val);
                      const defaults: Record<string, unknown> = {
                        crea_task: { titolo: "", priorita: "media", assegna_a: "assegnatario_entita", scadenza_giorni: 1, tempo_stimato: 15 },
                        invia_notifica: { titolo: "", destinatario: "assegnatario" },
                        invia_email: { template: "", destinatario: "contatto" },
                        assegna_agente: { strategia: "round_robin", ruolo: "agente" },
                        chiama_webhook: { url: "", metodo: "POST" },
                      };
                      if (defaults[val]) {
                        setValue("azione_config", JSON.stringify(defaults[val], null, 2));
                      }
                    }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {AZIONE_OPTIONS.map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )} />
                </div>

                <div>
                  <Label>Configurazione azione (JSON)</Label>
                  <textarea
                    {...register("azione_config")}
                    rows={6}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Variabili: {"{{nome_contatto}}"}, {"{{nome_opportunita}}"}, {"{{nome_cantiere}}"}, {"{{fonte_lead}}"}
                  </p>
                </div>
              </TabsContent>

              {/* Avanzato */}
              <TabsContent value="avanzato" className="m-0 p-6 space-y-4">
                <div>
                  <Label>Condizioni aggiuntive (JSON array)</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Filtra quando eseguire. Tutte le condizioni devono essere vere (AND).
                  </p>
                  <textarea
                    {...register("condizioni")}
                    rows={4}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    placeholder='[{"campo": "fonte_lead", "operatore": "=", "valore": "facebook"}]'
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Operatori: =, !=, &gt;, &lt;, contains. Lascia <code>[]</code> per nessuna.
                  </p>
                </div>
              </TabsContent>
            </div>
          </Tabs>

          <div className="border-t px-6 py-4 flex gap-3">
            <Button type="submit" disabled={saveAutomazione.isPending} className="flex-1">
              {saveAutomazione.isPending ? "Salvataggio..." : rule?.id && !isTemplate ? "Aggiorna" : "Crea automazione"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Annulla
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
