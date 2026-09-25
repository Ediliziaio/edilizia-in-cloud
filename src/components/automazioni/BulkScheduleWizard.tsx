/**
 * BulkScheduleWizard — wizard 4-step per creare "messaggi programmati bulk".
 *
 * Non sostituisce il builder xyflow per workflow complessi: è la corsia veloce
 * per il caso d'uso più frequente:
 *   "ogni mattina alle 7 manda a TUTTI gli operai un messaggio con cosa fare".
 *
 * Output: insert in `automation_flows` con bulk_trigger_config JSONB.
 * Il runner edge function `automation-bulk-scheduler-runner` (ogni 5 min via
 * pg_cron) trova i flow dovuti, risolve i target, manda i messaggi.
 *
 * MVP: solo canale `silvio_chat` (chat in-app). Telegram/WhatsApp/Email
 * vengono mostrati come "Prossimamente" in checkbox disabled.
 */
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  RadioGroup, RadioGroupItem,
} from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Sparkles, Users, Clock, MessageSquare, Send, ChevronRight, ChevronLeft, Bot } from "lucide-react";
import { BulkScheduleTemplateGallery } from "./BulkScheduleTemplateGallery";
import type { BulkScheduleTemplate } from "@/lib/automations/bulkScheduleTemplates";

// ─── Costanti ───────────────────────────────────────────────────────────

interface SchedulePreset {
  id: string;
  label: string;
  cron: string;
  description: string;
}

const SCHEDULE_PRESETS: SchedulePreset[] = [
  { id: "every_workday_7", label: "Lun-Ven 07:00", cron: "0 7 * * 1-5", description: "Tutte le mattine lavorative alle 7:00" },
  { id: "every_day_7", label: "Ogni giorno 07:00", cron: "0 7 * * *", description: "Tutti i giorni alle 7:00 (incluso weekend)" },
  { id: "every_workday_6_30", label: "Lun-Ven 06:30", cron: "30 6 * * 1-5", description: "Mattina presto, prima dell'avvio cantiere" },
  { id: "every_monday_8", label: "Lunedì 08:00", cron: "0 8 * * 1", description: "Briefing settimanale all'inizio settimana" },
  { id: "every_friday_17", label: "Venerdì 17:00", cron: "0 17 * * 5", description: "Riepilogo fine settimana" },
  { id: "first_of_month_9", label: "1° del mese 09:00", cron: "0 9 1 * *", description: "Promemoria mensile" },
];

interface TargetPreset {
  id: string;
  label: string;
  target_type: string;
  target_value: string | null;
  icon: string;
}

const TARGET_PRESETS: TargetPreset[] = [
  { id: "all_workers", label: "Tutti gli operai", target_type: "all_workers", target_value: null, icon: "👷" },
  { id: "all_company_admins", label: "Tutti gli amministratori", target_type: "all_company_admins", target_value: null, icon: "👔" },
  { id: "role_employee", label: "Tutti i dipendenti", target_type: "role", target_value: "employee", icon: "💼" },
];

interface VariableHint {
  key: string;
  description: string;
  example: string;
}

const AVAILABLE_VARIABLES: VariableHint[] = [
  { key: "{nome}", description: "Nome dell'utente destinatario", example: "Mario" },
  { key: "{ruolo}", description: "Ruolo dell'utente", example: "company_admin" },
  { key: "{azienda}", description: "Ragione sociale dell'azienda", example: "Rossi Costruzioni Srl" },
  { key: "{data_oggi}", description: "Data corrente (lungo, italiano)", example: "lunedì 21 maggio 2026" },
  { key: "{cantiere_oggi}", description: "Cantiere assegnato oggi (per operai)", example: "ORD-2026-024 Bianchi Srl" },
  { key: "{task_oggi}", description: "Task primario in corso sul cantiere oggi", example: "Posa serramenti piano 2" },
  { key: "{ore_pianificate}", description: "Ore pianificate per oggi", example: "8 ore" },
  { key: "{operai_oggi}", description: "Operai pianificati in cantieri oggi (per admin)", example: "12" },
  { key: "{numero_cantieri_aperti}", description: "Numero commesse attive azienda", example: "12" },
  { key: "{crediti_scaduti}", description: "Totale crediti scaduti azienda", example: "€18.400 su 4 ordini" },
  { key: "{ddt_in_arrivo}", description: "DDT in arrivo prossima settimana", example: "3" },
  { key: "{prossimi_appuntamenti}", description: "Appuntamenti prossime 48h", example: "5" },
  { key: "{meteo}", description: "Meteo cantiere oggi (richiede lat/lng company)", example: "sereno 22°C" },
];

// ─── Wizard ─────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
}

export function BulkScheduleWizard({ open, onClose }: Props) {
  const { effectiveCompany, user } = useAuth();
  const qc = useQueryClient();

  // Step 0 = scelta template (opzionale, sempre prima)
  // Step 1-4 = wizard normale
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");

  // Step 1: schedule
  const [schedulePreset, setSchedulePreset] = useState<string>("every_workday_7");
  const [customCron, setCustomCron] = useState<string>("");

  // Step 2: target
  const [targetPreset, setTargetPreset] = useState<string>("all_workers");

  // Step 3: channels (multi-select con preferred order per fallback)
  const [channelSilvioChat, setChannelSilvioChat] = useState(true);
  const [channelTelegram, setChannelTelegram] = useState(false);
  const [channelWhatsapp, setChannelWhatsapp] = useState(false);
  const [channelEmail, setChannelEmail] = useState(false);

  // Step 4: template
  const [templateMode, setTemplateMode] = useState<"static" | "ai_generated">("static");
  const [templateBody, setTemplateBody] = useState(
    "Ciao {nome}, oggi sei assegnato a {cantiere_oggi} per {ore_pianificate}. Buona giornata!"
  );
  const [aiPrompt, setAiPrompt] = useState(
    "Genera un breve briefing operativo (max 200 char) per {nome} che oggi lavora a {cantiere_oggi}. Includi 1-2 cose pratiche da ricordare. Tono diretto, italiano."
  );

  // Computed cron
  const finalCron = useMemo(() => {
    if (schedulePreset === "custom") return customCron.trim();
    return SCHEDULE_PRESETS.find((p) => p.id === schedulePreset)?.cron ?? "0 7 * * 1-5";
  }, [schedulePreset, customCron]);

  const selectedTarget = TARGET_PRESETS.find((t) => t.id === targetPreset)!;

  const reset = () => {
    setStep(0);
    setName("");
    setSchedulePreset("every_workday_7");
    setCustomCron("");
    setTargetPreset("all_workers");
    setChannelSilvioChat(true);
    setChannelTelegram(false);
    setChannelWhatsapp(false);
    setChannelEmail(false);
    setTemplateMode("static");
  };

  /**
   * Applica un template pre-fatto allo stato del wizard, poi salta allo step 1
   * (l'utente può rivedere/personalizzare prima del submit).
   */
  const applyTemplate = (t: BulkScheduleTemplate) => {
    setName(t.name);
    // Trova il preset matching della cron, altrimenti usa custom
    const matchingPreset = SCHEDULE_PRESETS.find((p) => p.cron === t.config.cron);
    if (matchingPreset) {
      setSchedulePreset(matchingPreset.id);
    } else {
      setSchedulePreset("custom");
      setCustomCron(t.config.cron);
    }
    // Target
    const matchingTarget = TARGET_PRESETS.find(
      (p) => p.target_type === t.config.target.type && p.target_value === t.config.target.value,
    );
    if (matchingTarget) setTargetPreset(matchingTarget.id);
    // Channels: applica preset dal template
    setChannelSilvioChat(t.config.channels.some((c) => c.type === "silvio_chat"));
    setChannelTelegram(t.config.channels.some((c) => c.type === "telegram"));
    setChannelWhatsapp(t.config.channels.some((c) => c.type === "whatsapp"));
    setChannelEmail(t.config.channels.some((c) => c.type === "email"));
    // Template
    setTemplateMode(t.config.template.mode);
    if (t.config.template.body) setTemplateBody(t.config.template.body);
    if (t.config.template.ai_prompt) setAiPrompt(t.config.template.ai_prompt);
    setStep(1);
    toast.success(`Template "${t.name}" caricato`, {
      description: "Personalizza nei prossimi step o clicca direttamente Crea.",
    });
  };

  const createMut = useMutation({
    mutationFn: async () => {
      if (!effectiveCompany?.id || !user?.id) throw new Error("Sessione non valida");
      if (!name.trim()) throw new Error("Dai un nome al messaggio");
      if (!finalCron.trim()) throw new Error("Schedule mancante");
      if (templateMode === "static" && !templateBody.trim()) throw new Error("Template messaggio vuoto");
      if (templateMode === "ai_generated" && !aiPrompt.trim()) throw new Error("Prompt AI vuoto");

      // Calcola next_run_at: prossima occorrenza del cron a partire da ora.
      // Computato lato client come stima (il runner ricalcola comunque).
      // Approccio semplice: +5 min (sarà ricalcolato al primo trigger dal runner).
      const nextRunAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      const config = {
        type: "bulk_scheduler",
        cron: finalCron,
        timezone: "Europe/Rome",
        target: {
          type: selectedTarget.target_type,
          value: selectedTarget.target_value,
        },
        channels: [
          ...(channelSilvioChat ? [{ type: "silvio_chat" }] : []),
          ...(channelTelegram ? [{ type: "telegram" }] : []),
          ...(channelWhatsapp ? [{ type: "whatsapp" }] : []),
          ...(channelEmail ? [{ type: "email" }] : []),
        ],
        // Se l'utente seleziona più canali, attiva il fallback chain:
        // il runner prova il prossimo se uno fallisce.
        use_fallback: [channelSilvioChat, channelTelegram, channelWhatsapp, channelEmail].filter(Boolean).length > 1,
        template: {
          mode: templateMode,
          body: templateMode === "static" ? templateBody.trim() : "",
          ai_prompt: templateMode === "ai_generated" ? aiPrompt.trim() : undefined,
        },
        next_run_at: nextRunAt,
        last_run_at: null,
      };

      const { error } = await supabase.from("automation_flows").insert({
        company_id: effectiveCompany.id,
        name: name.trim(),
        description: "Messaggio programmato",
        status: "published",
        created_by: user.id,
        bulk_trigger_config: config,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Messaggio programmato creato", {
        description: "Verrà inviato secondo lo schedule scelto.",
      });
      void qc.invalidateQueries({ queryKey: ["automation-flows"] });
      reset();
      onClose();
    },
    onError: (e: Error) => {
      toast.error("Errore", { description: e.message });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-orange-500" />
            Nuovo messaggio programmato
          </DialogTitle>
          <DialogDescription>
            Manda un messaggio in automatico a un gruppo di utenti su uno schedule fisso.
            {/* L'esempio lo danno già i modelli qui sotto: da tablet si toglie. */}
            <span className="sm:hidden"> Es. "ogni mattina alle 7 ai miei operai con il cantiere di oggi".</span>
          </DialogDescription>
        </DialogHeader>

        {/* Progress dots — visibili solo dopo lo step 0 (galleria template) */}
        {step > 0 && (
          <>
            <div className="flex items-center gap-2 my-2">
              {[1, 2, 3, 4].map((s) => (
                <div key={s} className={cn(
                  "flex-1 h-1.5 rounded-full transition-colors",
                  s <= step ? "bg-orange-500" : "bg-slate-200",
                )} />
              ))}
            </div>
            <div className="text-xs text-slate-500 -mt-1">Step {step} di 4</div>
          </>
        )}

        {/* ────────── STEP 0: GALLERIA TEMPLATE ────────── */}
        {step === 0 && (
          <BulkScheduleTemplateGallery
            onSelect={applyTemplate}
            onSkip={() => setStep(1)}
          />
        )}

        {/* ────────── STEP 1: NOME + QUANDO ────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label>Come si chiama questo messaggio?</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="es. Briefing operai mattutino"
                className="mt-1"
                autoFocus
              />
            </div>

            <div>
              <Label className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4" /> Quando va inviato?
              </Label>
              {/* Da tablet due colonne: sette opzioni una sotto l'altra facevano
                  scorrere il popup. */}
              <RadioGroup value={schedulePreset} onValueChange={setSchedulePreset} className="sm:grid-cols-2">
                {SCHEDULE_PRESETS.map((p) => (
                  <label
                    key={p.id}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                      schedulePreset === p.id ? "border-orange-400 bg-orange-50" : "border-slate-200 hover:bg-slate-50",
                    )}
                  >
                    <RadioGroupItem value={p.id} className="mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{p.label}</p>
                      <p className="text-xs text-slate-500">{p.description}</p>
                    </div>
                    {/* Il cron ripete l'etichetta in linguaggio tecnico: via da tablet. */}
                    <code className="text-[10px] text-slate-400 mt-0.5 sm:hidden">{p.cron}</code>
                  </label>
                ))}
                <label
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                    schedulePreset === "custom" ? "border-orange-400 bg-orange-50" : "border-slate-200 hover:bg-slate-50",
                  )}
                >
                  <RadioGroupItem value="custom" className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">Cron personalizzato</p>
                    {schedulePreset === "custom" && (
                      <Input
                        value={customCron}
                        onChange={(e) => setCustomCron(e.target.value)}
                        placeholder="es. 0 7 * * 1-5"
                        className="mt-2 font-mono text-xs"
                      />
                    )}
                  </div>
                </label>
              </RadioGroup>
            </div>
          </div>
        )}

        {/* ────────── STEP 2: A CHI ────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <Label className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4" /> A chi va inviato?
            </Label>
            <RadioGroup value={targetPreset} onValueChange={setTargetPreset}>
              {TARGET_PRESETS.map((t) => (
                <label
                  key={t.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3 cursor-pointer",
                    targetPreset === t.id ? "border-orange-400 bg-orange-50" : "border-slate-200 hover:bg-slate-50",
                  )}
                >
                  <RadioGroupItem value={t.id} />
                  <span className="text-2xl">{t.icon}</span>
                  <span className="font-medium text-sm flex-1">{t.label}</span>
                </label>
              ))}
            </RadioGroup>
            {/* Da tablet via: un percorso /azienda/… e «custom query» non dicono
                niente a chi usa l'app, e il builder è la pagina stessa. */}
            <p className="text-xs text-slate-500 sm:hidden">
              Per filtri più complessi (tag specifici, sede operativa, custom query) usa il builder
              avanzato in /azienda/automazioni.
            </p>
          </div>
        )}

        {/* ────────── STEP 3: CANALI ────────── */}
        {step === 3 && (
          <div className="space-y-4">
            <Label className="flex items-center gap-2 mb-2">
              <MessageSquare className="h-4 w-4" /> Su quali canali?
            </Label>
            {/* Da tablet via: «fallback», «preferred chain» e un percorso /azienda/… */}
            <p className="text-xs text-slate-500 -mt-2 sm:hidden">
              Se selezioni più canali, il sistema usa quello preferito dall'utente. Se non disponibile,
              fa fallback sul successivo nella sua preferred chain (configurabile in
              /azienda/impostazioni/notifiche).
            </p>
            <div className="space-y-2">
              {([
                { key: "silvio_chat", emoji: "💬", label: "Chat Silvio (in-app)", desc: "Messaggio nella chat con Silvio. Sempre disponibile per gli utenti dell'app.", descBreve: "Messaggio nella chat con Silvio, sempre disponibile.", checked: channelSilvioChat, setter: setChannelSilvioChat, recommended: true },
                { key: "telegram", emoji: "📱", label: "Telegram", desc: "Notifica push via bot Telegram. L'utente deve aver legato il proprio account al bot aziendale.", descBreve: "Notifica dal bot Telegram: l'utente deve aver collegato il suo account.", checked: channelTelegram, setter: setChannelTelegram, recommended: false },
                { key: "whatsapp", emoji: "💚", label: "WhatsApp", desc: "Via WhatsApp Business. Richiede company config (whatsapp-send edge function).", descBreve: "Via WhatsApp Business: serve il numero aziendale collegato.", checked: channelWhatsapp, setter: setChannelWhatsapp, recommended: false },
                { key: "email", emoji: "📧", label: "Email", desc: "Email all'indirizzo del profilo (o override personale).", descBreve: "All'indirizzo email del profilo.", checked: channelEmail, setter: setChannelEmail, recommended: false },
              ] as const).map((ch) => (
                <label
                  key={ch.key}
                  className={cn(
                    "flex items-center justify-between rounded-lg border p-3 cursor-pointer",
                    ch.checked ? "border-orange-400 bg-orange-50" : "border-slate-200 hover:bg-slate-50",
                  )}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-xl shrink-0">{ch.emoji}</span>
                    <div className="min-w-0">
                      <p className="font-medium text-sm flex items-center gap-1.5">
                        {ch.label}
                        {ch.recommended && (
                          <Badge variant="outline" className="text-[9px] h-4 bg-emerald-50 text-emerald-700 border-emerald-300">consigliato</Badge>
                        )}
                      </p>
                      {/* Da tablet la versione breve: quella lunga parlava di «edge
                          function» e «override» a chi usa l'app. */}
                      <p className="text-xs text-slate-500 mt-0.5 leading-snug sm:hidden">{ch.desc}</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-snug max-sm:hidden">{ch.descBreve}</p>
                    </div>
                  </div>
                  <Switch checked={ch.checked} onCheckedChange={ch.setter} />
                </label>
              ))}
            </div>
          </div>
        )}

        {/* ────────── STEP 4: COSA ────────── */}
        {step === 4 && (
          <div className="space-y-4">
            <Label>Cosa scrivere?</Label>
            <RadioGroup value={templateMode} onValueChange={(v) => setTemplateMode(v as "static" | "ai_generated")}>
              <label className={cn(
                "flex items-start gap-3 rounded-lg border p-3 cursor-pointer",
                templateMode === "static" ? "border-orange-400 bg-orange-50" : "border-slate-200",
              )}>
                <RadioGroupItem value="static" className="mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-sm">Template fisso con variabili</p>
                  <p className="text-xs text-slate-500">Stesso testo per tutti, ma con {`{nome}`}, {`{cantiere_oggi}`}, ecc.</p>
                </div>
              </label>
              <label className={cn(
                "flex items-start gap-3 rounded-lg border p-3 cursor-pointer",
                templateMode === "ai_generated" ? "border-orange-400 bg-orange-50" : "border-slate-200",
              )}>
                <RadioGroupItem value="ai_generated" className="mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-sm flex items-center gap-1">
                    <Bot className="h-3.5 w-3.5 text-violet-600" /> Silvio personalizza per ogni utente
                  </p>
                  <p className="text-xs text-slate-500">L'AI scrive un messaggio diverso a ciascuno in base ai dati (più caro)</p>
                </div>
              </label>
            </RadioGroup>

            {templateMode === "static" && (
              <div>
                <Label className="text-xs">Testo</Label>
                <Textarea
                  value={templateBody}
                  onChange={(e) => setTemplateBody(e.target.value)}
                  rows={4}
                  className="mt-1"
                />
                <div className="mt-2">
                  <p className="text-[11px] text-slate-500 mb-1">Variabili disponibili (click per inserire):</p>
                  <div className="flex flex-wrap gap-1">
                    {AVAILABLE_VARIABLES.map((v) => (
                      <button
                        key={v.key}
                        type="button"
                        onClick={() => setTemplateBody((b) => `${b}${b.endsWith(" ") || !b ? "" : " "}${v.key}`)}
                        className="text-[11px] px-2 py-0.5 rounded bg-slate-100 hover:bg-orange-100 text-slate-700 border border-slate-200"
                        title={`${v.description}\nEs: ${v.example}`}
                      >
                        {v.key}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {templateMode === "ai_generated" && (
              <div>
                <Label className="text-xs">Prompt per Silvio</Label>
                <Textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  rows={5}
                  className="mt-1"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Le stesse variabili sono disponibili nel prompt. Silvio le risolverà e genererà
                  un messaggio personalizzato per ogni destinatario.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={createMut.isPending}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Indietro
            </Button>
          )}
          {step === 1 && (
            <Button variant="ghost" onClick={() => setStep(0)} disabled={createMut.isPending}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Template
            </Button>
          )}
          <div className="flex-1" />
          {step > 0 && step < 4 && (
            <Button onClick={() => setStep((s) => s + 1)} disabled={
              (step === 1 && (!name.trim() || (schedulePreset === "custom" && !customCron.trim()))) ||
              (step === 3 && !channelSilvioChat && !channelTelegram && !channelWhatsapp && !channelEmail)
            }>
              Avanti <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
          {step === 4 && (
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending} className="gap-2">
              <Send className="h-4 w-4" />
              {createMut.isPending ? "Creazione..." : "Crea e attiva"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
