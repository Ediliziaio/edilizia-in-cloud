// MP-FINAL — Pagina dettaglio singolo numero WhatsApp (edit settings).

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, ArrowLeft, Camera, Clock3, FileCheck2, Loader2, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { useWhatsAppBase } from "./useWhatsAppBase";
import { usePermissions } from "@/hooks/usePermissions";
import {
  PURPOSE_AUTONOMY,
  PURPOSE_DESCRIPTIONS,
  PURPOSE_EXAMPLES,
  PURPOSE_GROUP_BY_PURPOSE,
  PURPOSE_GROUPS,
  PURPOSE_LABELS,
  normalizeWAOperationalSettings,
  SOLO_AMMINISTRATORI_WA,
  useUpdateWANumberSettings,
  useWhatsAppNumber,
  type WAOperationalSettings,
  type WAPurpose,
} from "@/hooks/whatsapp/useWhatsAppNumbers";

export default function WANumberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { base: waBase } = useWhatsAppBase();
  const { data: number, isLoading, isError, error, refetch, isFetching } = useWhatsAppNumber(id);
  const update = useUpdateWANumberSettings();
  // Le impostazioni del numero le salva chi amministra l'azienda (come nel database).
  const { isAdmin } = usePermissions();

  const [displayName, setDisplayName] = useState("");
  const [msgBenvenuto, setMsgBenvenuto] = useState("");
  const [msgFuoriOrario, setMsgFuoriOrario] = useState("");
  const [budget, setBudget] = useState<string>("10");
  const [operationalSettings, setOperationalSettings] = useState<WAOperationalSettings>(
    normalizeWAOperationalSettings(null),
  );

  useEffect(() => {
    if (number) {
      setDisplayName(number.display_name ?? "");
      setMsgBenvenuto(number.messaggio_benvenuto ?? "");
      setMsgFuoriOrario(number.messaggio_fuori_orario ?? "");
      setBudget(String(number.daily_budget_eur ?? 10));
      setOperationalSettings(normalizeWAOperationalSettings(number.operational_settings));
    }
  }, [number]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6 p-4 md:p-6 max-w-3xl mx-auto">
        <Button variant="ghost" size="sm" onClick={() => navigate(`${waBase}?tab=numeri`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Torna ai numeri
        </Button>
        <Card className="p-8 text-center border-destructive/20 bg-destructive/5">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-destructive" />
          <h1 className="font-semibold">Numero non caricato</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {(error as Error)?.message || "Non riesco a caricare il dettaglio del numero."}
          </p>
          <Button className="mt-4" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Riprova
          </Button>
        </Card>
      </div>
    );
  }

  if (!number) {
    return <div className="p-6 text-sm text-muted-foreground">Numero non trovato.</div>;
  }

  const purpose = number.purpose as WAPurpose;
  const group = PURPOSE_GROUPS[PURPOSE_GROUP_BY_PURPOSE[purpose]];
  const isOperativo = purpose === "bot_operativo";

  const updateOperationalSettings = <K extends keyof WAOperationalSettings>(
    key: K,
    value: WAOperationalSettings[K],
  ) => {
    setOperationalSettings((current) => ({ ...current, [key]: value }));
  };

  const save = () => {
    update.mutate({
      id: number.id,
      display_name: displayName || null,
      messaggio_benvenuto: msgBenvenuto || null,
      messaggio_fuori_orario: msgFuoriOrario || null,
      operational_settings: isOperativo ? operationalSettings : number.operational_settings,
      daily_budget_eur: Number(budget) || 10,
    });
  };

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(`${waBase}?tab=numeri`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Torna ai numeri
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">{number.display_name ?? number.numero}</h1>
        <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
          <Badge variant="outline">{PURPOSE_LABELS[purpose]}</Badge>
          <span className="font-mono">{number.numero}</span>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ruolo nel sistema</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-xl border bg-muted/40 p-3">
            <p className="text-sm font-semibold text-foreground">{group.label}</p>
            <p className="mt-1 text-sm text-muted-foreground">{group.description}</p>
          </div>
          <div>
            <p className="text-sm font-semibold">{PURPOSE_LABELS[purpose]}</p>
            <p className="mt-1 text-sm text-muted-foreground">{PURPOSE_DESCRIPTIONS[purpose]}</p>
            <p className="mt-2 text-xs font-semibold text-primary">{PURPOSE_AUTONOMY[purpose]}</p>
          </div>
          <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
            {PURPOSE_EXAMPLES[purpose].map((example) => (
              <li key={example} className="rounded-lg border bg-background p-3">
                {example}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Impostazioni generali</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="display-name">Nome visualizzato</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Bot Cantieri Rossi Srl"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="budget">Budget giornaliero AI (€)</Label>
            <Input
              id="budget"
              type="number"
              step="0.5"
              min="0"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Speso oggi: € {Number(number.current_day_spend_eur ?? 0).toFixed(4)}
            </p>
          </div>
        </CardContent>
      </Card>

      {isOperativo && (
        <Card>
          <CardHeader>
            <CardTitle>Playbook operativo cantieri</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Modalità Silvio
                </div>
                <Select
                  value={operationalSettings.ai_mode}
                  onValueChange={(value: WAOperationalSettings["ai_mode"]) =>
                    updateOperationalSettings("ai_mode", value)
                  }
                >
                  <SelectTrigger className="mt-3">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft_only">Solo bozze</SelectItem>
                    <SelectItem value="confirm_critical">Conferma dati critici</SelectItem>
                    <SelectItem value="auto_with_review">Autonomo con revisione</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-2 text-xs text-muted-foreground">
                  Decide quanto Silvio può scrivere su rapportini, presenze, DDT e diario.
                </p>
              </div>

              <div className="rounded-xl border bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Clock3 className="h-4 w-4 text-primary" />
                  Rapportino giornaliero
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <Label htmlFor="daily-rapportino" className="text-xs text-muted-foreground">
                    Promemoria automatico
                  </Label>
                  <Switch
                    id="daily-rapportino"
                    checked={operationalSettings.daily_rapportino_enabled}
                    onCheckedChange={(checked) =>
                      updateOperationalSettings("daily_rapportino_enabled", checked)
                    }
                  />
                </div>
                <Input
                  className="mt-3"
                  type="time"
                  value={operationalSettings.daily_rapportino_time}
                  onChange={(e) => updateOperationalSettings("daily_rapportino_time", e.target.value)}
                  disabled={!operationalSettings.daily_rapportino_enabled}
                />
                <Select
                  value={operationalSettings.daily_rapportino_target}
                  onValueChange={(value: WAOperationalSettings["daily_rapportino_target"]) =>
                    updateOperationalSettings("daily_rapportino_target", value)
                  }
                  disabled={!operationalSettings.daily_rapportino_enabled}
                >
                  <SelectTrigger className="mt-3">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="assigned_workers">Solo operai assegnati</SelectItem>
                    <SelectItem value="all_field_workers">Tutti gli operativi</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-xl border bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <FileCheck2 className="h-4 w-4 text-primary" />
                  DDT e conferme
                </div>
                <div className="mt-3 space-y-3">
                  <ToggleLine
                    label="Conferma prima di registrare"
                    checked={operationalSettings.ddt_requires_confirmation}
                    onCheckedChange={(checked) =>
                      updateOperationalSettings("ddt_requires_confirmation", checked)
                    }
                  />
                  <ToggleLine
                    label="Avvisa amministrazione"
                    checked={operationalSettings.ddt_notify_admin}
                    onCheckedChange={(checked) => updateOperationalSettings("ddt_notify_admin", checked)}
                  />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Una foto DDT diventa proposta controllabile, non un dato salvato alla cieca.
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border bg-background p-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Camera className="h-4 w-4 text-primary" />
                  Foto, documenti e diario
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <ToggleLine
                    label="Classifica foto/documenti"
                    checked={operationalSettings.media_auto_classify}
                    onCheckedChange={(checked) =>
                      updateOperationalSettings("media_auto_classify", checked)
                    }
                  />
                  <ToggleLine
                    label="Salva nel diario commessa"
                    checked={operationalSettings.media_save_to_diary}
                    onCheckedChange={(checked) =>
                      updateOperationalSettings("media_save_to_diary", checked)
                    }
                  />
                </div>
              </div>

              <div className="rounded-xl border bg-background p-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Presenze ed escalation
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <ToggleLine
                    label="Accetta timbrature via chat"
                    checked={operationalSettings.attendance_enabled}
                    onCheckedChange={(checked) =>
                      updateOperationalSettings("attendance_enabled", checked)
                    }
                  />
                  <ToggleLine
                    label="Escalation sicurezza"
                    checked={operationalSettings.safety_escalation_enabled}
                    onCheckedChange={(checked) =>
                      updateOperationalSettings("safety_escalation_enabled", checked)
                    }
                  />
                </div>
                <Label className="mt-4 block text-xs text-muted-foreground">Numeri non riconosciuti</Label>
                <Select
                  value={operationalSettings.unknown_worker_mode}
                  onValueChange={(value: WAOperationalSettings["unknown_worker_mode"]) =>
                    updateOperationalSettings("unknown_worker_mode", value)
                  }
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="block">Blocca e chiedi registrazione</SelectItem>
                    <SelectItem value="create_review_ticket">Apri ticket ufficio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="handoff-note">Regola interna per Silvio</Label>
              <Textarea
                id="handoff-note"
                value={operationalSettings.handoff_note}
                onChange={(e) => updateOperationalSettings("handoff_note", e.target.value)}
                rows={3}
                placeholder="Quando deve chiedere conferma o passare al responsabile?"
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Messaggi automatici</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="msg-welcome">Messaggio di benvenuto</Label>
            <Textarea
              id="msg-welcome"
              value={msgBenvenuto}
              onChange={(e) => setMsgBenvenuto(e.target.value)}
              rows={3}
              placeholder="Benvenuto! Come posso aiutarti?"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="msg-offhours">Messaggio fuori orario</Label>
            <Textarea
              id="msg-offhours"
              value={msgFuoriOrario}
              onChange={(e) => setMsgFuoriOrario(e.target.value)}
              rows={3}
              placeholder="Siamo chiusi, ti risponderemo in orario lavorativo."
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {!isAdmin && <p className="text-sm text-muted-foreground">{SOLO_AMMINISTRATORI_WA}</p>}
        <Button onClick={save} disabled={!isAdmin || update.isPending}>
          {update.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Salva impostazioni
        </Button>
      </div>
    </div>
  );
}

function ToggleLine({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
