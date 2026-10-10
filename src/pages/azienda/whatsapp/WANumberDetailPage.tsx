// MP-FINAL — Pagina dettaglio singolo numero WhatsApp (edit settings).
//
// 09/10/2026: sola lettura onesta (campi spenti per chi non amministra, con la frase in cima), «Salva» in una barra che
// resta in vista con la protezione delle modifiche non salvate, sezioni nell'ordine in cui si cercano e parole di tutti i
// giorni. Il salvataggio UNISCE le impostazioni operative a quelle già nel database (vedi unisciImpostazioniOperative).

import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, ArrowLeft, Loader2, RefreshCw, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { AvvisoSolaLettura } from "@/components/common/AvvisoSolaLettura";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
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
  unisciImpostazioniOperative,
  useUpdateWANumberSettings,
  useWhatsAppNumber,
  type WAOperationalSettings,
  type WAPurpose,
} from "@/hooks/whatsapp/useWhatsAppNumbers";

/** I campi della pagina, tutti insieme: quelli del numero con sopra le modifiche fatte qui. */
interface CampiNumero {
  displayName: string;
  msgBenvenuto: string;
  msgFuoriOrario: string;
  budget: string;
  operationalSettings: WAOperationalSettings;
}

const uguali = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** «0,00 €»; per cifre piccolissime (la spesa AI di un giorno) qualche decimale in più, così non sembra zero. */
function euro(valore: number): string {
  return valore.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: valore > 0 && valore < 0.01 ? 4 : 2,
  });
}

/** Titolo di sezione: h2 sotto l'h1 col nome del numero. */
function TitoloSezione({ children }: { children: string }) {
  return <h2 className="text-lg font-semibold leading-none tracking-tight">{children}</h2>;
}

export default function WANumberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { base: waBase } = useWhatsAppBase();
  const { data: number, isLoading, isError, error, refetch, isFetching } = useWhatsAppNumber(id);
  const update = useUpdateWANumberSettings();
  // Le impostazioni del numero le salva chi amministra l'azienda (come nel database).
  const { isAdmin } = usePermissions();

  // I valori del numero con sopra le modifiche fatte qui: niente copia dello stato del server da tenere allineata.
  const [modifiche, setModifiche] = useState<Partial<CampiNumero>>({});
  const base = useMemo<CampiNumero | null>(
    () =>
      number
        ? {
            displayName: number.display_name ?? "",
            msgBenvenuto: number.messaggio_benvenuto ?? "",
            msgFuoriOrario: number.messaggio_fuori_orario ?? "",
            budget: String(number.daily_budget_eur ?? 10),
            operationalSettings: normalizeWAOperationalSettings(number.operational_settings),
          }
        : null,
    [number],
  );
  const campi = useMemo<CampiNumero | null>(() => (base ? { ...base, ...modifiche } : null), [base, modifiche]);
  // Modificato = diverso da quello salvato. Dopo «Salva» le modifiche restano finché il numero riletto non le raggiunge:
  // a quel punto sono uguali e la pagina torna «da salvare: niente», senza un salto dei valori.
  const dirty = !!base && (Object.keys(modifiche) as (keyof CampiNumero)[]).some((k) => !uguali(modifiche[k], base[k]));
  useSettingsDraftGuard(isAdmin && dirty);

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

  if (!number || !campi) {
    return <div className="p-6 text-sm text-muted-foreground">Numero non trovato.</div>;
  }

  const purpose = number.purpose as WAPurpose;
  const group = PURPOSE_GROUPS[PURPOSE_GROUP_BY_PURPOSE[purpose]];
  const isOperativo = purpose === "bot_operativo";
  const operationalSettings = campi.operationalSettings;

  const setCampo = <K extends keyof CampiNumero>(chiave: K, valore: CampiNumero[K]) =>
    setModifiche((m) => ({ ...m, [chiave]: valore }));
  const updateOperationalSettings = <K extends keyof WAOperationalSettings>(key: K, value: WAOperationalSettings[K]) =>
    setModifiche((m) => ({
      ...m,
      operationalSettings: { ...(m.operationalSettings ?? base!.operationalSettings), [key]: value },
    }));

  const save = () => {
    update.mutate({
      id: number.id,
      display_name: campi.displayName || null,
      messaggio_benvenuto: campi.msgBenvenuto || null,
      messaggio_fuori_orario: campi.msgFuoriOrario || null,
      // Si UNISCE al JSON che c'è già: ci stanno anche bot_enabled, ai_auto_process… che la pagina non mostra.
      operational_settings: isOperativo
        ? unisciImpostazioniOperative(number.operational_settings, operationalSettings)
        : number.operational_settings,
      daily_budget_eur: Number(campi.budget) || 10,
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

      {!isAdmin && <AvvisoSolaLettura>{SOLO_AMMINISTRATORI_WA}</AvvisoSolaLettura>}

      {/* disabled su un fieldset spegne ogni campo e pulsante che contiene (anche le tendine). */}
      <fieldset disabled={!isAdmin || update.isPending} className="m-0 min-w-0 space-y-6 border-0 p-0">
        {/* «Salva» resta in vista mentre si scorre: prima era in fondo a una pagina lunga. */}
        <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border bg-card/95 px-3 py-2 shadow-sm backdrop-blur">
          <p
            role="status"
            className={cn(
              "text-xs",
              update.isPending || dirty ? "text-muted-foreground" : "sr-only",
              dirty && !update.isPending && "font-medium text-amber-700 dark:text-amber-400",
            )}
          >
            {update.isPending ? "Salvataggio…" : dirty ? "Modifiche non salvate" : "Nessuna modifica da salvare"}
          </p>
          <div className="ml-auto flex items-center gap-2">
            {dirty && (
              <Button variant="outline" size="sm" className="h-11 sm:h-9" onClick={() => setModifiche({})} disabled={update.isPending}>
                Annulla modifiche
              </Button>
            )}
            <Button onClick={save} disabled={!isAdmin || update.isPending} size="sm" className="h-11 sm:h-9">
              {update.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Salva impostazioni
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <TitoloSezione>Nome e spesa</TitoloSezione>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="display-name">Nome visualizzato</Label>
              <Input
                id="display-name"
                value={campi.displayName}
                onChange={(e) => setCampo("displayName", e.target.value)}
                placeholder="Bot Cantieri Rossi Srl"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="budget">Spesa massima AI al giorno (€)</Label>
              <Input
                id="budget"
                type="number"
                step="0.5"
                min="0"
                value={campi.budget}
                onChange={(e) => setCampo("budget", e.target.value)}
                aria-describedby="budget-speso"
              />
              <p id="budget-speso" className="text-xs text-muted-foreground">
                Speso oggi: {euro(Number(number.current_day_spend_eur ?? 0))}
              </p>
            </div>
          </CardContent>
        </Card>

        {isOperativo && (
          <Card>
            <CardHeader>
              <TitoloSezione>Come lavora Silvio sui cantieri</TitoloSezione>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border bg-muted/30 p-3">
                  <Label htmlFor="ai-mode" className="text-sm font-semibold">Quanto fa Silvio da solo</Label>
                  <Select
                    value={operationalSettings.ai_mode}
                    onValueChange={(value: WAOperationalSettings["ai_mode"]) =>
                      updateOperationalSettings("ai_mode", value)
                    }
                  >
                    <SelectTrigger id="ai-mode" className="mt-3">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft_only">Solo bozze</SelectItem>
                      <SelectItem value="confirm_critical">Chiede conferma per i dati importanti</SelectItem>
                      <SelectItem value="auto_with_review">Fa da solo e poi controlli tu</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Decide quanto Silvio può scrivere su rapportini, presenze, DDT e diario.
                  </p>
                </div>

                <div className="rounded-xl border bg-muted/30 p-3">
                  <p className="text-sm font-semibold">Promemoria del rapportino</p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <Label htmlFor="daily-rapportino" className="text-xs text-muted-foreground">
                      Manda il promemoria ogni giorno
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
                    aria-label="A che ora"
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
                    <SelectTrigger className="mt-3" aria-label="A chi">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="assigned_workers">Solo operai assegnati</SelectItem>
                      <SelectItem value="all_field_workers">Tutti gli operativi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-xl border bg-muted/30 p-3">
                  <p className="text-sm font-semibold">DDT e conferme</p>
                  <div className="mt-3 space-y-3">
                    <ToggleLine
                      id="ddt-conferma"
                      label="Conferma prima di registrare"
                      checked={operationalSettings.ddt_requires_confirmation}
                      onCheckedChange={(checked) =>
                        updateOperationalSettings("ddt_requires_confirmation", checked)
                      }
                    />
                    <ToggleLine
                      id="ddt-avvisa"
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
                  <p className="text-sm font-semibold">Foto, documenti e diario</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <ToggleLine
                      id="foto-riconosci"
                      label="Riconosci foto e documenti da solo"
                      checked={operationalSettings.media_auto_classify}
                      onCheckedChange={(checked) =>
                        updateOperationalSettings("media_auto_classify", checked)
                      }
                    />
                    <ToggleLine
                      id="foto-diario"
                      label="Salva nel diario della commessa"
                      checked={operationalSettings.media_save_to_diary}
                      onCheckedChange={(checked) =>
                        updateOperationalSettings("media_save_to_diary", checked)
                      }
                    />
                  </div>
                </div>

                <div className="rounded-xl border bg-background p-3">
                  <p className="text-sm font-semibold">Presenze e sicurezza</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <ToggleLine
                      id="presenze-timbrature"
                      label="Accetta le timbrature da WhatsApp"
                      checked={operationalSettings.attendance_enabled}
                      onCheckedChange={(checked) =>
                        updateOperationalSettings("attendance_enabled", checked)
                      }
                    />
                    <ToggleLine
                      id="sicurezza-avvisa"
                      label="Avvisa il responsabile se c'è un rischio per la sicurezza"
                      checked={operationalSettings.safety_escalation_enabled}
                      onCheckedChange={(checked) =>
                        updateOperationalSettings("safety_escalation_enabled", checked)
                      }
                    />
                  </div>
                  <Label htmlFor="numero-sconosciuto" className="mt-4 block text-xs text-muted-foreground">
                    Se scrive un numero sconosciuto
                  </Label>
                  <Select
                    value={operationalSettings.unknown_worker_mode}
                    onValueChange={(value: WAOperationalSettings["unknown_worker_mode"]) =>
                      updateOperationalSettings("unknown_worker_mode", value)
                    }
                  >
                    <SelectTrigger id="numero-sconosciuto" className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="block">Non rispondere e chiedi di registrarsi</SelectItem>
                      <SelectItem value="create_review_ticket">Apri una richiesta per l'ufficio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="handoff-note">Istruzioni in più per Silvio</Label>
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
            <TitoloSezione>Messaggi automatici</TitoloSezione>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="msg-welcome">Messaggio di benvenuto</Label>
              <Textarea
                id="msg-welcome"
                value={campi.msgBenvenuto}
                onChange={(e) => setCampo("msgBenvenuto", e.target.value)}
                rows={3}
                placeholder="Benvenuto! Come posso aiutarti?"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="msg-offhours">Messaggio fuori orario</Label>
              <Textarea
                id="msg-offhours"
                value={campi.msgFuoriOrario}
                onChange={(e) => setCampo("msgFuoriOrario", e.target.value)}
                rows={3}
                placeholder="Siamo chiusi, ti risponderemo in orario lavorativo."
              />
            </div>
          </CardContent>
        </Card>
      </fieldset>

      {/* A cosa serve questo numero: si legge una volta, sta chiuso (prima apriva la pagina con tre riquadri). */}
      <details className="rounded-lg border bg-card">
        <summary className="cursor-pointer px-6 py-4 text-lg font-semibold leading-none tracking-tight">
          <h2 className="inline">A cosa serve questo numero</h2>
        </summary>
        <div className="space-y-3 px-6 pb-6">
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
        </div>
      </details>
    </div>
  );
}

function ToggleLine({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
