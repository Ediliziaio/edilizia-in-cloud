// MP-FINAL — Configurazione trigger notifiche automatiche (advanced).
// Ogni trigger: toggle on/off + template_name input + destinatario select +
// wa_number_id select + soglie config custom (giorni/percentuale).

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import {
  TRIGGER_LABELS,
  useToggleWATrigger,
  useWANotificheTriggers,
  useUpsertWATrigger,
  usePatchWATrigger,
  type NotificaKind,
} from "@/hooks/whatsapp/useWANotifiche";
import { useWhatsAppNumbers } from "@/hooks/whatsapp/useWhatsAppNumbers";
import { useWAMetaTemplates } from "@/hooks/whatsapp/useWAMetaTemplates";
import type { Json } from "@/integrations/supabase/types";

const KIND_ORDER: NotificaKind[] = [
  "fattura_scaduta",
  "ddt_pendente",
  "margine_basso",
  "approvazione_pendente",
  "preventivo_inviato",
  "sal_raggiunto",
  "fattura_emessa",
];

const DEFAULT_TEMPLATES: Record<NotificaKind, string> = {
  fattura_scaduta: "alert_fattura_scaduta",
  ddt_pendente: "alert_ddt_pendente",
  margine_basso: "alert_margine_basso",
  approvazione_pendente: "alert_approvazione_pendente",
  preventivo_inviato: "notifica_preventivo",
  sal_raggiunto: "notifica_avanzamento",
  fattura_emessa: "notifica_fattura_emessa",
  custom: "",
};

const TRIGGER_DESCRIPTIONS: Record<NotificaKind, string> = {
  fattura_scaduta: "Alert al titolare quando una fattura è scaduta da N giorni.",
  ddt_pendente: "Alert al titolare quando un DDT è ricevuto da N ore ma non validato.",
  margine_basso: "Alert al titolare quando un cantiere scende sotto soglia margine %.",
  approvazione_pendente: "Alert al titolare per approvazioni pending da N giorni.",
  preventivo_inviato: "Notifica al cliente quando gli invii un preventivo.",
  sal_raggiunto: "Notifica al cliente quando il cantiere raggiunge 50/75/100%.",
  fattura_emessa: "Notifica al cliente quando emetti una fattura a suo carico.",
  custom: "Personalizzato.",
};

export default function NotificheConfigPage() {
  const {
    data: triggers,
    isLoading,
    isError: triggersError,
    error: triggersQueryError,
    refetch: refetchTriggers,
    isFetching: triggersFetching,
  } = useWANotificheTriggers();
  const {
    data: numbers,
    isLoading: numbersLoading,
    isError: numbersError,
    error: numbersQueryError,
    refetch: refetchNumbers,
    isFetching: numbersFetching,
  } = useWhatsAppNumbers();
  // Template APPROVED della company: per avvisare se il template configurato
  // non esiste/non è approvato (prima i default erano nomi "indovinati" e gli
  // invii fallivano in silenzio con lo switch verde acceso).
  const { data: approvedTemplates = [] } = useWAMetaTemplates(undefined, true);
  const approvedNames = new Set(approvedTemplates.map((t) => t.template_name));
  const toggle = useToggleWATrigger();
  const patch = usePatchWATrigger();
  const upsert = useUpsertWATrigger();

  const notificheNumbers = (numbers ?? []).filter(
    (n) => n.purpose === "notifiche" || n.purpose === "bot_operativo",
  );

  const byKind = useMemo(() => {
    const map = new Map<NotificaKind, ReturnType<typeof toTriggerView>>();
    for (const t of triggers ?? []) {
      map.set(t.trigger_kind as NotificaKind, toTriggerView(t));
    }
    return map;
  }, [triggers]);

  if (isLoading || numbersLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (triggersError || numbersError) {
    const message = triggersQueryError?.message || numbersQueryError?.message || "Errore nel caricamento delle notifiche WhatsApp.";
    return (
      <div className="p-6">
        <Card className="p-6 border-destructive/20 bg-destructive/5">
          <div className="flex flex-col items-center text-center">
            <AlertTriangle className="h-10 w-10 text-destructive" />
            <h3 className="mt-3 font-semibold">Notifiche non caricate</h3>
            <p className="mt-1 max-w-lg text-sm text-muted-foreground">{message}</p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => {
                void refetchTriggers();
                void refetchNumbers();
              }}
              disabled={triggersFetching || numbersFetching}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${triggersFetching || numbersFetching ? "animate-spin" : ""}`} />
              Riprova
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (notificheNumbers.length === 0) {
    return (
      <div className="p-6">
        <Card className="p-6 border-dashed">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold">Nessun numero disponibile per notifiche</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Prima collega un numero con scopo <strong>Notifiche Transazionali</strong> o <strong>Bot Operativo</strong>.
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const handleToggleAndCreateIfNeeded = async (kind: NotificaKind, enabled: boolean) => {
    const existing = byKind.get(kind);
    if (existing) {
      toggle.mutate({ id: existing.id, enabled });
    } else {
      // Crea trigger con defaults
      upsert.mutate({
        trigger_kind: kind,
        enabled,
        config: defaultConfig(kind) as Json,
        template_name: DEFAULT_TEMPLATES[kind],
        wa_number_id: notificheNumbers[0].id,
        destinatario_kind: kind === "preventivo_inviato" || kind === "sal_raggiunto" || kind === "fattura_emessa"
          ? "cliente"
          : "titolare",
      });
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Notifiche automatiche</h1>
        <p className="text-sm text-muted-foreground">
          Abilita i trigger per ricevere alert proattivi via WhatsApp.
          Richiede template Meta UTILITY approvato.
        </p>
      </div>

      <div className="space-y-4">
        {KIND_ORDER.map((kind) => {
          const t = byKind.get(kind);
          const enabled = t?.enabled ?? false;
          return (
            <Card key={kind}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{TRIGGER_LABELS[kind]}</CardTitle>
                      {t?.fire_count != null && t.fire_count > 0 && (
                        <Badge variant="outline" className="text-xs">
                          Inviate: {t.fire_count}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {TRIGGER_DESCRIPTIONS[kind]}
                    </p>
                    {t?.last_fired_at && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Ultima: {new Date(t.last_fired_at).toLocaleString("it-IT")}
                      </p>
                    )}
                  </div>
                  <Switch
                    checked={enabled}
                    disabled={toggle.isPending || upsert.isPending}
                    onCheckedChange={(v) => handleToggleAndCreateIfNeeded(kind, v)}
                    aria-label={`Abilita ${TRIGGER_LABELS[kind]}`}
                  />
                </div>
              </CardHeader>

              {enabled && t && (
                <CardContent className="space-y-3 border-t pt-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Numero mittente</Label>
                      <Select
                        value={t.wa_number_id ?? ""}
                        onValueChange={(v) => patch.mutate({ id: t.id, wa_number_id: v })}
                      >
                        <SelectTrigger><SelectValue placeholder="Scegli..." /></SelectTrigger>
                        <SelectContent>
                          {notificheNumbers.map((n) => (
                            <SelectItem key={n.id} value={n.id}>
                              {n.display_name ?? n.numero} ({n.purpose})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Template Meta</Label>
                      <Input
                        defaultValue={t.template_name ?? ""}
                        onBlur={(e) => {
                          if (e.target.value !== t.template_name) {
                            patch.mutate({ id: t.id, template_name: e.target.value });
                          }
                        }}
                        placeholder={DEFAULT_TEMPLATES[kind]}
                      />
                      {t.template_name && approvedTemplates.length > 0 && !approvedNames.has(t.template_name) && (
                        <p className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          Template non trovato tra quelli APPROVATI su Meta: gli invii falliranno finché non usi un template approvato (tab Template).
                        </p>
                      )}
                    </div>
                  </div>

                  {kind === "fattura_scaduta" && (
                    <ConfigNumberField
                      id={t.id}
                      configKey="giorni_soglia"
                      label="Giorni dopo scadenza"
                      config={t.config}
                      patch={(c) => patch.mutate({ id: t.id, config: c as Json })}
                      default={7}
                    />
                  )}

                  {kind === "ddt_pendente" && (
                    <ConfigNumberField
                      id={t.id}
                      configKey="ore_soglia"
                      label="Ore senza validazione"
                      config={t.config}
                      patch={(c) => patch.mutate({ id: t.id, config: c as Json })}
                      default={48}
                    />
                  )}

                  {kind === "margine_basso" && (
                    <ConfigNumberField
                      id={t.id}
                      configKey="percentuale"
                      label="Soglia margine % (sotto questa)"
                      config={t.config}
                      patch={(c) => patch.mutate({ id: t.id, config: c as Json })}
                      default={10}
                    />
                  )}

                  {kind === "approvazione_pendente" && (
                    <ConfigNumberField
                      id={t.id}
                      configKey="giorni_soglia"
                      label="Giorni in attesa"
                      config={t.config}
                      patch={(c) => patch.mutate({ id: t.id, config: c as Json })}
                      default={3}
                    />
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Come funzionano</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• Un cron gira ogni 15 minuti e valuta le condizioni di ogni trigger attivo.</p>
          <p>• Anti-spam: la stessa notifica per lo stesso soggetto è inviata al massimo 1 volta ogni 24h.</p>
          <p>• <b>Cron-based</b> (fattura_scaduta, ddt_pendente, margine_basso, approvazione_pendente): valutati a intervalli.</p>
          <p>• <b>Event-driven</b> (preventivo_inviato, sal_raggiunto, fattura_emessa): attivati dai DB trigger su INSERT/UPDATE.</p>
          <p>• Per iniziare serve: (1) numero con purpose=notifiche, (2) template UTILITY approvato su Meta, (3) trigger abilitato qui sopra.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function toTriggerView(t: {
  id: string;
  enabled: boolean | null;
  config: Record<string, unknown> | null;
  template_name: string | null;
  wa_number_id: string | null;
  last_fired_at: string | null;
  fire_count: number | null;
}) {
  return {
    id: t.id,
    enabled: t.enabled ?? false,
    config: t.config ?? {},
    template_name: t.template_name,
    wa_number_id: t.wa_number_id,
    last_fired_at: t.last_fired_at,
    fire_count: t.fire_count,
  };
}

function defaultConfig(kind: NotificaKind): Record<string, unknown> {
  switch (kind) {
    case "fattura_scaduta":
      return { giorni_soglia: 7 };
    case "ddt_pendente":
      return { ore_soglia: 48 };
    case "margine_basso":
      return { percentuale: 10 };
    case "approvazione_pendente":
      return { giorni_soglia: 3 };
    default:
      return {};
  }
}

interface ConfigNumberFieldProps {
  id: string;
  configKey: string;
  label: string;
  config: Record<string, unknown>;
  patch: (newConfig: Record<string, unknown>) => void;
  default: number;
}

function ConfigNumberField({
  configKey,
  label,
  config,
  patch,
  default: defaultValue,
}: ConfigNumberFieldProps) {
  const value = (config?.[configKey] as number) ?? defaultValue;
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        type="number"
        min="0"
        defaultValue={value}
        onBlur={(e) => {
          const newValue = Number(e.target.value);
          if (newValue !== value) {
            patch({ ...config, [configKey]: newValue });
          }
        }}
      />
    </div>
  );
}
