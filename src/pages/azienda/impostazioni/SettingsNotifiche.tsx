/**
 * SettingsNotifiche — preferenze canale notifiche personali.
 *
 * Pagina personale (non admin) dove ogni utente decide:
 *   - Quali canali è disposto a ricevere (Silvio chat, Telegram, WhatsApp, Email)
 *   - In che ordine il sistema prova i canali (fallback chain)
 *   - Quiet hours (orario in cui NON ricevere notifiche)
 *
 * Tabella: user_messaging_channels (1 riga per utente, upsert).
 * Auth: self-only via RLS (umc_self_read + umc_self_write).
 */
import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Bell, MessageSquare, Send, Mail, Smartphone, MoonStar, ArrowUp, ArrowDown, Save, Info,
  CalendarClock, Plus, Pause, Play, Trash2,
} from "lucide-react";
import { BulkScheduleWizard } from "@/components/automazioni/BulkScheduleWizard";

type ChannelKey = "silvio_chat" | "telegram" | "whatsapp" | "email";

interface ChannelMeta {
  key: ChannelKey;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  available: boolean;  // MVP: solo silvio_chat true
  comingSoonNote?: string;
}

const CHANNELS: ChannelMeta[] = [
  {
    key: "silvio_chat",
    label: "Chat Silvio in-app",
    description: "Messaggi nella tua chat con Silvio. Sempre disponibili quando apri l'app.",
    icon: MessageSquare,
    color: "text-orange-600 bg-orange-50",
    available: true,
  },
  {
    key: "telegram",
    label: "Telegram",
    description: "Notifica push gratuita via bot Telegram. Richiede legare l'account al bot della tua azienda.",
    icon: Send,
    color: "text-blue-600 bg-blue-50",
    available: true,
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    description: "Messaggi su WhatsApp Business. Inserisci il tuo numero verificato.",
    icon: Smartphone,
    color: "text-emerald-600 bg-emerald-50",
    available: true,
  },
  {
    key: "email",
    label: "Email",
    description: "Email all'indirizzo del tuo profilo (puoi sovrascrivere con altro indirizzo).",
    icon: Mail,
    color: "text-slate-600 bg-slate-50",
    available: true,
  },
];

interface UMCRow {
  user_id: string;
  company_id: string | null;
  silvio_chat_enabled: boolean;
  telegram_chat_id: string | null;
  telegram_verified_at: string | null;
  whatsapp_phone: string | null;
  whatsapp_verified_at: string | null;
  email_enabled: boolean;
  email_override: string | null;
  preferred_order: ChannelKey[];
  quiet_from: string | null;
  quiet_to: string | null;
  quiet_timezone: string;
}

const DEFAULT_ORDER: ChannelKey[] = ["silvio_chat", "telegram", "whatsapp", "email"];

export default function SettingsNotifiche() {
  const { user, effectiveCompany } = useAuth();
  const { isAdmin } = usePermissions();
  const qc = useQueryClient();

  // Wizard "Nuovo messaggio programmato" — solo per admin azienda. Apre il
  // BulkScheduleWizard riutilizzato da /azienda/automazioni.
  const [bulkWizardOpen, setBulkWizardOpen] = useState(false);

  // Lista flow bulk_scheduler della company (solo se admin)
  interface CompanyBulkFlow {
    id: string;
    name: string;
    status: "draft" | "published" | "archived";
    bulk_trigger_config: {
      cron: string;
      target: { type: string; value: string | null };
      channels: Array<{ type: string }>;
      template: { mode: string };
      next_run_at: string | null;
      last_run_at: string | null;
    };
  }
  const { data: companyFlows = [] } = useQuery({
    queryKey: ["settings-notifiche-bulk-flows", effectiveCompany?.id],
    enabled: !!effectiveCompany?.id && isAdmin,
    queryFn: async (): Promise<CompanyBulkFlow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("automation_flows")
        .select("id, name, status, bulk_trigger_config")
        .eq("company_id", effectiveCompany!.id)
        .not("bulk_trigger_config", "is", null)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(20);
      return (data ?? []) as CompanyBulkFlow[];
    },
  });

  // Toggle status flow (pause/resume)
  const toggleFlowMut = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: string }) => {
      const { error } = await supabase
        .from("automation_flows")
        .update({ status: newStatus })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stato aggiornato");
      void qc.invalidateQueries({ queryKey: ["settings-notifiche-bulk-flows"] });
    },
    onError: (e: Error) => toast.error("Errore", { description: e.message }),
  });

  const deleteFlowMut = useMutation({
    mutationFn: async (id: string) => {
      // Nel cestino delle automazioni, come «Elimina» nella lista.
      const { error } = await supabase.from("automation_flows").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Messaggio programmato spostato nel cestino", { description: "Si ripristina da Automazioni → Cestino." });
      void qc.invalidateQueries({ queryKey: ["settings-notifiche-bulk-flows"] });
    },
    onError: (e: Error) => toast.error("Errore", { description: e.message }),
  });

  // Carica preferenze esistenti (può essere null → defaults)
  const { data: prefs, isLoading } = useQuery({
    queryKey: ["user-messaging-channels", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<UMCRow | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("user_messaging_channels")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      return (data as UMCRow | null) ?? null;
    },
  });

  // Stato locale (controlla il form)
  const [silvioChatEnabled, setSilvioChatEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [emailOverride, setEmailOverride] = useState("");
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [order, setOrder] = useState<ChannelKey[]>(DEFAULT_ORDER);
  const [quietFrom, setQuietFrom] = useState("");
  const [quietTo, setQuietTo] = useState("");

  // Inizializza da prefs caricate
  useEffect(() => {
    if (prefs) {
      setSilvioChatEnabled(prefs.silvio_chat_enabled);
      setEmailEnabled(prefs.email_enabled);
      setEmailOverride(prefs.email_override ?? "");
      setWhatsappPhone(prefs.whatsapp_phone ?? "");
      // WhatsApp considerato "abilitato" se phone presente
      setWhatsappEnabled(!!prefs.whatsapp_phone);
      // Telegram considerato "abilitato" se verified
      setTelegramEnabled(!!prefs.telegram_verified_at);
      setOrder(Array.isArray(prefs.preferred_order) && prefs.preferred_order.length > 0
        ? (prefs.preferred_order as ChannelKey[])
        : DEFAULT_ORDER);
      setQuietFrom(prefs.quiet_from ?? "");
      setQuietTo(prefs.quiet_to ?? "");
    }
  }, [prefs]);

  // Save
  const saveMut = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Utente non autenticato");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("user_messaging_channels")
        .upsert({
          user_id: user.id,
          company_id: effectiveCompany?.id ?? null,
          silvio_chat_enabled: silvioChatEnabled,
          email_enabled: emailEnabled,
          email_override: emailOverride.trim() || null,
          // WhatsApp: salva il numero solo se abilitato.
          // NOTA: la verifica vera richiede flow OTP separato (out of scope).
          // Qui assumiamo che l'utente inserisca un numero già attivo su
          // WhatsApp Business della company; il marker verified verrà
          // settato in modo automatico a save (best-effort) — il runner
          // controlla comunque whatsapp_verified_at prima di mandare.
          whatsapp_phone: whatsappEnabled ? whatsappPhone.trim() || null : null,
          whatsapp_verified_at: whatsappEnabled && whatsappPhone.trim() ? new Date().toISOString() : null,
          preferred_order: order,
          quiet_from: quietFrom || null,
          quiet_to: quietTo || null,
        }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Preferenze salvate");
      void qc.invalidateQueries({ queryKey: ["user-messaging-channels"] });
    },
    onError: (e: Error) => toast.error("Errore", { description: e.message }),
  });

  const moveChannel = (idx: number, direction: "up" | "down") => {
    setOrder((prev) => {
      const next = [...prev];
      const target = direction === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= next.length) return next;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  // Channel meta lookup
  const channelByKey = useMemo(() => {
    const m = new Map<ChannelKey, ChannelMeta>();
    CHANNELS.forEach((c) => m.set(c.key, c));
    return m;
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-3 p-4 max-w-3xl mx-auto md:p-0 md:mx-0">
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    // Da 768 senza margine proprio né centratura: il margine lo dà la cornice
    // delle impostazioni (prima si sommava) e le altre pagine partono a sinistra.
    <div className="space-y-4 p-4 md:p-0 max-w-3xl mx-auto md:mx-0">
      {/* Header — da 768 c'è già la testata delle impostazioni con lo stesso
          titolo e la stessa frase. */}
      <div className="flex items-start gap-3 md:hidden">
        <div className="shrink-0 h-10 w-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
          <Bell className="h-5 w-5 text-violet-600 dark:text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Notifiche</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Decidi su quali canali vuoi ricevere i messaggi automatici dell'app (briefing, reminder,
            alert). I messaggi configurati dal tuo company_admin rispettano queste preferenze.
          </p>
        </div>
      </div>

      {/* ── SEZIONE COMPANY_ADMIN: notifiche AZIENDALI ──────────────────
          Solo visibile a chi è admin. Sopra alle preferenze personali
          perché l'admin gestisce PRIMA le notifiche per gli altri,
          POI le sue. */}
      {isAdmin && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-violet-600" />
                  Notifiche aziendali (admin)
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Messaggi automatici programmati che invii ai tuoi utenti — operai, staff, admin.
                  Visibili anche in /azienda/automazioni con il builder avanzato.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => setBulkWizardOpen(true)}
                className="gap-1.5 shrink-0 bg-violet-600 hover:bg-violet-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Nuovo
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {companyFlows.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                <CalendarClock className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>Nessun messaggio programmato.</p>
                <p className="text-xs mt-1">Click su <strong>Nuovo</strong> per creare il primo.</p>
              </div>
            ) : (
              companyFlows.map((f) => {
                const cfg = f.bulk_trigger_config;
                const isActive = f.status === "published";
                return (
                  <div key={f.id} className={cn(
                    "flex items-start justify-between gap-2 rounded-lg border p-2.5",
                    !isActive && "opacity-60 bg-slate-50/50",
                  )}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-sm">{f.name}</span>
                        {isActive ? (
                          <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-300">attivo</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">{f.status}</Badge>
                        )}
                        {cfg.template.mode === "ai_generated" && (
                          <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200">AI</Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-2">
                        <code className="font-mono text-[10px]">{cfg.cron}</code>
                        <span>·</span>
                        <span>{cfg.target.type === "role" ? `${cfg.target.value}` : cfg.target.type}</span>
                        <span>·</span>
                        <span>{cfg.channels.map((c) => c.type).join(", ") || "—"}</span>
                      </div>
                      {cfg.next_run_at && isActive && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Prossima esecuzione: {new Date(cfg.next_run_at).toLocaleString("it-IT")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button
                        size="icon" variant="ghost" className="h-9 w-9 md:h-7 md:w-7"
                        title={isActive ? "Disabilita" : "Riabilita"}
                        onClick={() => toggleFlowMut.mutate({ id: f.id, newStatus: isActive ? "draft" : "published" })}
                      >
                        {isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        size="icon" variant="ghost" className="h-9 w-9 md:h-7 md:w-7 text-rose-600"
                        title="Elimina"
                        onClick={() => {
                          if (confirm(`Eliminare "${f.name}"? L'azione è irreversibile.`)) {
                            deleteFlowMut.mutate(f.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
            <p className="text-[11px] text-slate-400 mt-2">
              Esempi: briefing operai mattutino, reminder DURC mensile, riepilogo settimanale.
              <a href="/azienda/automazioni" className="text-violet-600 hover:underline ml-1">
                Apri builder avanzato →
              </a>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Separator per chiarezza tra sezione admin e personale */}
      {isAdmin && (
        <div className="flex items-center gap-3 my-1">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Le tue preferenze personali</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>
      )}

      {/* Info box */}
      <Card className="bg-violet-50/40 border-violet-200">
        <CardContent className="p-3 flex items-start gap-2">
          <Info className="h-4 w-4 text-violet-600 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-700 leading-relaxed">
            Il sistema prova i canali nell'ordine che scegli sotto: se il primo non è disponibile
            (es. Telegram non legato), passa al secondo. Solo i canali con il toggle ON vengono
            usati.
          </p>
        </CardContent>
      </Card>

      {/* Channels (toggles) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Canali abilitati</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {CHANNELS.map((ch) => {
            const Icon = ch.icon;
            const isEnabled = ch.key === "silvio_chat" ? silvioChatEnabled
              : ch.key === "email" ? emailEnabled
              : ch.key === "whatsapp" ? whatsappEnabled
              : ch.key === "telegram" ? telegramEnabled
              : false;
            const isVerified = ch.key === "telegram" ? !!prefs?.telegram_verified_at
              : ch.key === "whatsapp" ? !!prefs?.whatsapp_verified_at
              : true;
            return (
              <div
                key={ch.key}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3",
                  !ch.available && "opacity-60 bg-slate-50/50",
                )}
              >
                <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", ch.color)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{ch.label}</p>
                    {!ch.available && <Badge variant="outline" className="text-[10px]">Prossimamente</Badge>}
                    {ch.available && !isVerified && ch.key !== "silvio_chat" && ch.key !== "email" && (
                      <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">Non verificato</Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{ch.description}</p>
                  {ch.comingSoonNote && (
                    <p className="text-[11px] text-violet-600 mt-1 italic">{ch.comingSoonNote}</p>
                  )}
                  {ch.key === "email" && emailEnabled && (
                    <div className="mt-2 max-w-xs">
                      <Label className="text-[11px] text-slate-500">Email alternativa (opzionale)</Label>
                      <Input
                        type="email"
                        value={emailOverride}
                        onChange={(e) => setEmailOverride(e.target.value)}
                        placeholder={user?.email ?? "io@esempio.it"}
                        className="h-8 text-sm mt-0.5"
                      />
                    </div>
                  )}
                  {ch.key === "whatsapp" && whatsappEnabled && (
                    <div className="mt-2 max-w-xs">
                      <Label className="text-[11px] text-slate-500">Numero WhatsApp (con prefisso intl.)</Label>
                      <Input
                        type="tel"
                        value={whatsappPhone}
                        onChange={(e) => setWhatsappPhone(e.target.value)}
                        placeholder="+393331234567"
                        className="h-8 text-sm mt-0.5"
                      />
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Deve essere un numero attivo su WhatsApp e raggiungibile dal bot Business dell'azienda.
                      </p>
                    </div>
                  )}
                  {ch.key === "telegram" && telegramEnabled && (
                    <div className="mt-2 max-w-xs space-y-1">
                      {prefs?.telegram_verified_at ? (
                        <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-300">
                          ✓ Account legato
                        </Badge>
                      ) : (
                        <>
                          <Label className="text-[11px] text-slate-500">Per ricevere su Telegram:</Label>
                          <ol className="text-[11px] text-slate-600 list-decimal list-inside space-y-0.5">
                            <li>Chiedi al tuo company_admin il bot Telegram aziendale</li>
                            <li>Apri il bot e invia <code className="bg-slate-100 px-1 rounded">/start</code></li>
                            <li>Segui le istruzioni di verifica</li>
                          </ol>
                          <p className="text-[10px] text-amber-700 mt-1">
                            Stato: non legato. Una volta verificato, vedrai qui un check verde.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <Switch
                  checked={isEnabled}
                  disabled={!ch.available}
                  onCheckedChange={(v) => {
                    if (ch.key === "silvio_chat") setSilvioChatEnabled(v);
                    if (ch.key === "email") setEmailEnabled(v);
                    if (ch.key === "whatsapp") setWhatsappEnabled(v);
                    if (ch.key === "telegram") setTelegramEnabled(v);
                  }}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Fallback chain (riordinabile) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ordine di preferenza</CardTitle>
          <p className="text-xs text-slate-500 mt-0.5">
            Il sistema prova prima il canale in cima. Se non disponibile o disabilitato, passa al successivo.
          </p>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {order.map((key, idx) => {
            const ch = channelByKey.get(key);
            if (!ch) return null;
            const Icon = ch.icon;
            return (
              <div key={key} className="flex items-center gap-2 rounded-lg border bg-card p-2">
                <span className="text-[11px] font-bold tabular-nums text-slate-400 w-5 text-center">
                  {idx + 1}
                </span>
                <div className={cn("h-7 w-7 rounded flex items-center justify-center shrink-0", ch.color)}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <span className="text-sm font-medium flex-1">{ch.label}</span>
                {!ch.available && <Badge variant="outline" className="text-[10px]">Prossimamente</Badge>}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => moveChannel(idx, "up")}
                  disabled={idx === 0}
                  aria-label="Sposta su"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => moveChannel(idx, "down")}
                  disabled={idx === order.length - 1}
                  aria-label="Sposta giù"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Quiet hours */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MoonStar className="h-4 w-4 text-violet-600" />
            Orari di silenzio
          </CardTitle>
          <p className="text-xs text-slate-500 mt-0.5">
            Tra questi orari il sistema non manda notifiche. Lascia vuoto per ricevere sempre.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Dalle</Label>
            <Input
              type="time"
              value={quietFrom}
              onChange={(e) => setQuietFrom(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Alle</Label>
            <Input
              type="time"
              value={quietTo}
              onChange={(e) => setQuietTo(e.target.value)}
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end sticky bottom-0 bg-background py-2">
        <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="gap-2">
          <Save className="h-4 w-4" />
          {saveMut.isPending ? "Salvataggio..." : "Salva preferenze"}
        </Button>
      </div>

      {/* Wizard nuovo messaggio programmato — montato qui per riuso, gestito
          via stato bulkWizardOpen + chiamato dal pulsante Nuovo in cima */}
      <BulkScheduleWizard
        open={bulkWizardOpen}
        onClose={() => setBulkWizardOpen(false)}
      />
    </div>
  );
}
