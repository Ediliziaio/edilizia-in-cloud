import { StatoSalvataggio } from "@/components/impostazioni/StatoSalvataggio";
/**
 * SettingsNotifiche — quali avvisi ricevo e come arrivano i messaggi automatici.
 *
 * Ordine (09/10/2026, dal più usato al meno usato):
 *   1. Avvisi — la campanella e le email delle attività (si salvano da soli: vedi AvvisiPerEvento)
 *   2. Orari di silenzio — valgono per i messaggi programmati e per le notifiche sul dispositivo
 *   3. Messaggi automatici dell'amministratore — canali e ordine in cui arrivano (chiusa)
 *   4. Messaggi programmati — solo per gli amministratori, in fondo (chiusa)
 *
 * Tabella: user_messaging_channels (1 riga per utente, upsert).
 * Auth: self-only via RLS (umc_self_read + umc_self_write).
 *
 * Canali: Chat Silvio ed Email funzionano. WhatsApp e Telegram sono «Prossimamente»: il runner dei messaggi
 * programmati (automation-bulk-scheduler-runner) usa WhatsApp solo se `whatsapp_verified_at` è pieno e nessun
 * codice lo scrive mai (la pagina diceva «Inserisci il tuo numero verificato» ma un numero non si poteva
 * verificare); Telegram non ha nessun account collegato. Il salvataggio non scrive più né il numero né la
 * verifica: i dati che ci fossero restano dove sono.
 */
import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { AvvisiPerEvento } from "@/components/notifications/AvvisiPerEvento";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  MessageSquare, Send, Mail, Smartphone, ArrowUp, ArrowDown, Save, Plus, Pause, Play, Trash2,
} from "lucide-react";
import { BulkScheduleWizard } from "@/components/automazioni/BulkScheduleWizard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AmbitoImpostazione, SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { useVaiASezione } from "@/hooks/useVaiASezione";
import { MessaggioPerUtente, motivoDelRifiuto } from "@/lib/impostazioni/erroriPerUtente";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

type ChannelKey = "silvio_chat" | "telegram" | "whatsapp" | "email";

interface ChannelMeta {
  key: ChannelKey;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  available: boolean;
}

const CHANNELS: ChannelMeta[] = [
  {
    key: "silvio_chat",
    label: "Chat Silvio nell'app",
    description: "Messaggi nella tua chat con Silvio. Sempre disponibili quando apri l'app.",
    icon: MessageSquare,
    color: "text-orange-600 bg-orange-50",
    available: true,
  },
  {
    key: "telegram",
    label: "Telegram",
    description: "Messaggi su Telegram, dopo aver collegato il tuo account al bot dell'azienda.",
    icon: Send,
    color: "text-blue-600 bg-blue-50",
    available: false,
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    description: "Messaggi su WhatsApp Business. Arriverà con la verifica del tuo numero.",
    icon: Smartphone,
    color: "text-emerald-600 bg-emerald-50",
    available: false,
  },
  {
    key: "email",
    label: "Email",
    description: "Email all'indirizzo del tuo profilo (puoi scriverne un altro).",
    icon: Mail,
    color: "text-slate-600 bg-slate-50",
    available: true,
  },
];

interface UMCRow {
  user_id: string;
  company_id: string | null;
  silvio_chat_enabled: boolean;
  email_enabled: boolean;
  email_override: string | null;
  preferred_order: ChannelKey[];
  quiet_from: string | null;
  quiet_to: string | null;
  quiet_timezone: string;
}

const DEFAULT_ORDER: ChannelKey[] = ["silvio_chat", "telegram", "whatsapp", "email"];

const STATO_MESSAGGIO: Record<string, string> = { published: "attivo", draft: "in pausa", archived: "archiviato" };

export default function SettingsNotifiche({ soloPersonali = false }: { soloPersonali?: boolean } = {}) {
  const t = useT();
  const { user, effectiveCompany } = useAuth();
  const { isAdmin: amministratore } = usePermissions();
  const isAdmin = amministratore && !soloPersonali;
  const qc = useQueryClient();
  const confirm = useConfirm();
  // Con l'àncora (…/notifiche#messaggi-automatici) la sezione chiusa si apre già aperta.
  const { hash, search } = useLocation();
  const navigate = useNavigate();
  const messaggiAziendali = isAdmin && (hash === "#messaggi-programmati" || new URLSearchParams(search).get("tab") === "azienda");
  const cambiaAmbito = (ambito: "personale" | "azienda") => {
    const next = new URLSearchParams(search);
    next.set("tab", ambito);
    navigate({ search: next.toString(), hash: "" }, { replace: true });
  };

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
  const { data: companyFlows = [], isError: flowsError, isLoading: flowsLoading, refetch: rileggiFlussi } = useQuery({
    queryKey: ["settings-notifiche-bulk-flows", effectiveCompany?.id],
    enabled: !!effectiveCompany?.id && messaggiAziendali,
    queryFn: async (): Promise<CompanyBulkFlow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("automation_flows")
        .select("id, name, status, bulk_trigger_config")
        .eq("company_id", effectiveCompany!.id)
        .not("bulk_trigger_config", "is", null)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as CompanyBulkFlow[];
    },
  });

  // Toggle status flow (pause/resume)
  const toggleFlowMut = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: string }) => {
      if (!isAdmin || !effectiveCompany?.id) throw new MessaggioPerUtente(t("Non hai i permessi per gestire le automazioni aziendali."));
      const { error } = await supabase
        .from("automation_flows")
        .update({ status: newStatus })
        .eq("id", id)
        .eq("company_id", effectiveCompany.id).select("id").single();
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("Stato aggiornato"));
      void qc.invalidateQueries({ queryKey: ["settings-notifiche-bulk-flows"] });
    },
    onError: (e: unknown) => toast.error(t("Non aggiornato"), { description: motivoDelRifiuto(e, t("Riprova tra poco.")) }),
  });

  const deleteFlowMut = useMutation({
    mutationFn: async (id: string) => {
      if (!isAdmin || !effectiveCompany?.id) throw new MessaggioPerUtente(t("Non hai i permessi per gestire le automazioni aziendali."));
      // Nel cestino delle automazioni, come «Elimina» nella lista.
      const { error } = await supabase.from("automation_flows").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("company_id", effectiveCompany.id).select("id").single();
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("Messaggio programmato spostato nel cestino"), { description: t("Lo ritrovi in Automazioni → Cestino.") });
      void qc.invalidateQueries({ queryKey: ["settings-notifiche-bulk-flows"] });
    },
    onError: (e: unknown) => toast.error(t("Non spostato nel cestino"), { description: motivoDelRifiuto(e, t("Riprova tra poco.")) }),
  });

  // Carica preferenze esistenti (può essere null → defaults)
  const { data: prefs, isLoading, isError, refetch } = useQuery({
    queryKey: ["user-messaging-channels", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<UMCRow | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("user_messaging_channels")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as UMCRow | null) ?? null;
    },
  });
  const { evidenziata } = useVaiASezione(!isLoading && !isError && !!user?.id);

  // Stato locale (controlla il form)
  const [silvioChatEnabled, setSilvioChatEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [emailOverride, setEmailOverride] = useState("");
  const [order, setOrder] = useState<ChannelKey[]>(DEFAULT_ORDER);
  const [quietFrom, setQuietFrom] = useState("");
  const [quietTo, setQuietTo] = useState("");
  const [baseline, setBaseline] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  const snapshot = JSON.stringify({ silvioChatEnabled, emailEnabled, emailOverride, order, quietFrom, quietTo });
  const dirty = baseline != null && baseline !== snapshot;
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  // Accoda la lettura per applicare insieme i valori, anche quando la query
  // viene aggiornata al ritorno nell'app.
  useEffect(() => {
    let attivo = true;
    queueMicrotask(() => {
      if (!attivo || dirtyRef.current || isLoading || isError) return;
      const valori = {
        silvioChatEnabled: prefs?.silvio_chat_enabled ?? true,
        emailEnabled: prefs?.email_enabled ?? true,
        emailOverride: prefs?.email_override ?? "",
        order: Array.isArray(prefs?.preferred_order) && prefs.preferred_order.length ? prefs.preferred_order : DEFAULT_ORDER,
        quietFrom: prefs?.quiet_from ?? "",
        quietTo: prefs?.quiet_to ?? "",
      };
      setBaseline(JSON.stringify(valori));
      setSilvioChatEnabled(valori.silvioChatEnabled);
      setEmailEnabled(valori.emailEnabled);
      setEmailOverride(valori.emailOverride);
      setOrder(valori.order);
      setQuietFrom(valori.quietFrom);
      setQuietTo(valori.quietTo);
    });
    return () => { attivo = false; };
  }, [prefs, isLoading, isError]);

  // Save
  const saveMut = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new MessaggioPerUtente(t("Utente non autenticato"));
      if (isLoading || isError) throw new MessaggioPerUtente(t("Carica le preferenze prima di salvarle."));
      if (!!quietFrom !== !!quietTo) throw new MessaggioPerUtente(t("Indica sia l'inizio sia la fine dell'orario di silenzio."));
      // WhatsApp e Telegram non si scrivono: sono «Prossimamente» e i dati che ci fossero restano come sono.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("user_messaging_channels")
        .upsert({
          user_id: user.id,
          company_id: effectiveCompany?.id ?? null,
          silvio_chat_enabled: silvioChatEnabled,
          email_enabled: emailEnabled,
          email_override: emailOverride.trim() || null,
          preferred_order: order,
          quiet_from: quietFrom || null,
          quiet_to: quietTo || null,
        }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      setBaseline(snapshot);
      dirtyRef.current = false;
      toast.success(t("Preferenze salvate"));
      void qc.invalidateQueries({ queryKey: ["user-messaging-channels"] });
    },
    onError: (e: unknown) => toast.error(t("Preferenze non salvate"), { description: motivoDelRifiuto(e, t("Riprova tra poco.")) }),
  });
  useSettingsDraftGuard(dirty || saveMut.isPending);

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
      <div className="space-y-3 max-w-3xl">
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  if (isError || !user?.id) {
    return <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-3">{t("Non riesco a leggere le preferenze. Nessuna modifica verrà salvata.")}<Button size="sm" variant="outline" onClick={() => refetch()}>{t("Riprova")}</Button></AlertDescription></Alert>;
  }


  return (
    // Niente titolo né riquadro informativo: il titolo lo mette il layout delle impostazioni (un solo h1).
    // Da 768 senza margine proprio né centratura: il margine lo dà la cornice delle impostazioni.
    <div className="max-w-3xl space-y-4 max-sm:space-y-3">
      {soloPersonali && <h1 className="text-xl font-semibold">{t("Notifiche")}</h1>}
      {isAdmin && <nav aria-label={t("Ambito delle notifiche")} className="flex flex-wrap gap-1.5">
        <Button className="min-h-11 px-2.5 md:min-h-9" variant={messaggiAziendali ? "ghost" : "secondary"} onClick={() => cambiaAmbito("personale")} aria-pressed={!messaggiAziendali}>{t("Le mie notifiche")}</Button>
        <Button className="min-h-11 px-2.5 md:min-h-9" variant={messaggiAziendali ? "secondary" : "ghost"} onClick={() => cambiaAmbito("azienda")} aria-pressed={messaggiAziendali}>{t("Messaggi all’azienda")}</Button>
      </nav>}
      <div hidden={messaggiAziendali} className="space-y-4">
      {/* 1 · Avvisi: la campanella e le email delle attività. Si salvano da soli. */}
      <AvvisiPerEvento evidenziata={evidenziata === "avvisi"} />

      {/* Orari di silenzio e canali si salvano insieme, col pulsante: la barra resta in vista mentre si scorre. */}
      <fieldset disabled={saveMut.isPending} className="m-0 min-w-0 space-y-4 border-0 p-0 max-sm:space-y-3">
        <div className="settings-save-bar sticky top-2 z-20 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border bg-card/95 px-3 py-2 shadow-sm backdrop-blur">
          <p className="text-xs text-muted-foreground max-sm:hidden">{t("Orari di silenzio e canali si salvano con il pulsante.")}</p>
          <div className="ml-auto flex items-center gap-3">
            <StatoSalvataggio modificato={dirty} inCorso={saveMut.isPending} />
            <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !dirty} className="gap-2">
              <Save className="h-4 w-4" />
              {saveMut.isPending ? t("Salvataggio...") : t("Salva preferenze")}
            </Button>
          </div>
        </div>

        {/* 2 · Orari di silenzio */}
        <SezioneImpostazione
          id="orari-di-silenzio"
          titolo={t("Orari di silenzio")}
          descrizione={t("In questi orari non arrivano avvisi sul telefono né messaggi automatici. Lascia vuoto per riceverli sempre.")}
          ambito={<AmbitoImpostazione>{t("Per te")}</AmbitoImpostazione>}
          evidenziata={evidenziata === "orari-di-silenzio"}
        >
          <div className="grid grid-cols-2 gap-3 px-4 py-4 max-sm:px-3">
            <div className="space-y-1.5">
              <Label htmlFor="silenzio-dalle" className="text-sm">{t("Dalle")}</Label>
              <Input id="silenzio-dalle" type="time" value={quietFrom} onChange={(e) => setQuietFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="silenzio-alle" className="text-sm">{t("Alle")}</Label>
              <Input id="silenzio-alle" type="time" value={quietTo} onChange={(e) => setQuietTo(e.target.value)} />
            </div>
          </div>
        </SezioneImpostazione>

        {/* 3 · Messaggi automatici dell'amministratore: canali e ordine (chiusa) */}
        <SezioneImpostazione
          id="messaggi-automatici"
          titolo={t("Messaggi automatici dell'amministratore")}
          descrizione={t("Se l'amministratore programma messaggi per te (briefing, promemoria), arrivano da questi canali, nell'ordine che scegli.")}
          ambito={<AmbitoImpostazione>{t("Per te")}</AmbitoImpostazione>}
          evidenziata={evidenziata === "messaggi-automatici"}
        >
          <details key={hash === "#messaggi-automatici" ? "aperta" : "chiusa"} open={hash === "#messaggi-automatici"} className="group">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium max-sm:px-3">{t("Scegli i canali e l'ordine")}</summary>
            <div className="space-y-4 border-t px-4 py-4 max-sm:px-3">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">{t("Canali")}</h3>
                {CHANNELS.map((ch) => {
                  const Icon = ch.icon;
                  const acceso = ch.key === "silvio_chat" ? silvioChatEnabled : ch.key === "email" ? emailEnabled : false;
                  return (
                    <div
                      key={ch.key}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 max-sm:gap-2.5 max-sm:p-2.5",
                        !ch.available && "bg-muted/40",
                      )}
                    >
                      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg max-sm:h-8 max-sm:w-8", ch.color)}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1 max-sm:pt-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className={cn("text-sm font-medium", !ch.available && "text-muted-foreground")}>{t(ch.label)}</p>
                          {!ch.available && <Badge variant="outline" className="text-[10px]">{t("Prossimamente")}</Badge>}
                        </div>
                        {/* Telefono: il nome del canale basta. */}
                        <p className="mt-0.5 text-xs text-muted-foreground max-sm:hidden">{t(ch.description)}</p>
                        {ch.key === "email" && emailEnabled && (
                          // Telefono no: facoltativa, basta l'email del profilo.
                          <div className="mt-2 max-w-xs max-sm:hidden">
                            <Label htmlFor="notifications-email" className="text-[11px] text-muted-foreground">{t("Email alternativa (opzionale)")}</Label>
                            <Input
                              id="notifications-email"
                              type="email"
                              value={emailOverride}
                              onChange={(e) => setEmailOverride(e.target.value)}
                              placeholder={user?.email ?? "io@esempio.it"}
                              className="mt-0.5 h-8 text-sm"
                            />
                          </div>
                        )}
                      </div>
                      <Switch
                        aria-label={t("Abilita {label}", { label: t(ch.label) })}
                        className="max-sm:mt-1"
                        checked={acceso}
                        disabled={!ch.available}
                        onCheckedChange={(v) => {
                          if (ch.key === "silvio_chat") setSilvioChatEnabled(v);
                          if (ch.key === "email") setEmailEnabled(v);
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Ordine di preferenza (riordinabile): il sistema prova prima il canale in cima. */}
              <div className="space-y-2">
                <div>
                  <h3 className="text-sm font-semibold">{t("Ordine di preferenza")}</h3>
                  <p className="text-xs text-muted-foreground max-sm:hidden">
                    {t("Il sistema prova prima il canale in cima. Se non è disponibile o è spento, passa al successivo.")}
                  </p>
                </div>
                {order.map((key, idx) => {
                  const ch = channelByKey.get(key);
                  if (!ch) return null;
                  const Icon = ch.icon;
                  return (
                    <div key={key} className="flex items-center gap-2 rounded-lg border bg-card p-2 max-sm:py-1">
                      <span className="w-5 text-center text-[11px] font-bold tabular-nums text-muted-foreground">
                        {idx + 1}
                      </span>
                      <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded", ch.color)}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <span className="flex-1 text-sm font-medium">{t(ch.label)}</span>
                      {!ch.available && <Badge variant="outline" className="text-[10px] max-sm:hidden">{t("Prossimamente")}</Badge>}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => moveChannel(idx, "up")}
                        disabled={idx === 0}
                        aria-label={t("Sposta {label} più in alto", { label: t(ch.label) })}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => moveChannel(idx, "down")}
                        disabled={idx === order.length - 1}
                        aria-label={t("Sposta {label} più in basso", { label: t(ch.label) })}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          </details>
        </SezioneImpostazione>
      </fieldset>

      </div>
      {messaggiAziendali && (
        <div>
          <SezioneImpostazione
            id="messaggi-programmati"
            titolo={t("Messaggi programmati")}
            descrizione={
              <>
                {t("Messaggi automatici che invii ai tuoi utenti (operai, staff, amministratori): briefing, promemoria. Li trovi anche in")}{" "}
                <Link to="/azienda/automazioni" className="font-medium underline">{t("Automazioni")}</Link>{t(", con l'editor completo.")}
              </>
            }
            ambito={<AmbitoImpostazione>{t("Tutta l'azienda")}</AmbitoImpostazione>}
            azione={
              <Button size="sm" onClick={() => setBulkWizardOpen(true)} className="min-h-11 gap-1.5 md:min-h-9">
                <Plus className="h-3.5 w-3.5" />
                {t("Nuovo")}
              </Button>
            }
            evidenziata={evidenziata === "messaggi-programmati"}
          >
            {flowsLoading ? <p role="status" className="p-3 text-sm text-muted-foreground">{t("Carico i messaggi…")}</p>
              : flowsError ? <p role="alert" className="p-3 text-sm">
                {t("Non riesco a caricare i messaggi programmati.")}{" "}
                <Button variant="ghost" className="min-h-11" onClick={() => void rileggiFlussi()}>{t("Riprova")}</Button>
              </p>
              : companyFlows.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">
                {t("Nessun messaggio programmato. Premi «Nuovo» per crearne uno (per esempio il briefing del mattino agli operai).")}
              </p>
            ) : (
              <details key={hash === "#messaggi-programmati" ? "aperta" : "chiusa"} open={hash === "#messaggi-programmati"}>
                <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
                  {companyFlows.length === 1 ? t("1 messaggio programmato") : t("{n} messaggi programmati", { n: companyFlows.length })}
                </summary>
                <div className="space-y-2 border-t px-3 py-3 md:px-4">
                  {companyFlows.map((f) => {
                    const cfg = f.bulk_trigger_config;
                    const isActive = f.status === "published";
                    return (
                      <div key={f.id} className={cn(
                        "flex items-start justify-between gap-2 rounded-lg border p-2.5",
                        !isActive && "bg-muted/40 opacity-70",
                      )}>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-medium">{f.name}</span>
                            {isActive ? (
                              <Badge className="border-emerald-300 bg-emerald-100 text-[10px] text-emerald-700">{t("attivo")}</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">{STATO_MESSAGGIO[f.status] ? t(STATO_MESSAGGIO[f.status]) : t("in pausa")}</Badge>
                            )}
                            {cfg.template.mode === "ai_generated" && (
                              <Badge variant="outline" className="border-violet-200 bg-violet-50 text-[10px] text-violet-700">AI</Badge>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                            <code className="font-mono text-[10px]">{cfg.cron}</code>
                            <span>·</span>
                            <span>{cfg.target.type === "role" ? `${cfg.target.value}` : cfg.target.type}</span>
                            <span>·</span>
                            <span>{cfg.channels.map((c) => c.type).join(", ") || "—"}</span>
                          </div>
                          {cfg.next_run_at && isActive && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">{t("Prossimo invio: {valore}", { valore: new Date(cfg.next_run_at).toLocaleString(intlCampo()) })}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <Button
                            size="icon" variant="ghost" className="size-11 md:size-8"
                            aria-label={isActive ? t("Metti in pausa «{name}»", { name: String(f.name ?? "") }) : t("Riattiva «{name}»", { name: String(f.name ?? "") })}
                            title={isActive ? t("Metti in pausa") : t("Riattiva")}
                            onClick={() => toggleFlowMut.mutate({ id: f.id, newStatus: isActive ? "draft" : "published" })}
                          >
                            {isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            size="icon" variant="ghost" className="size-11 text-rose-600 md:size-8"
                            aria-label={t("Sposta «{name}» nel cestino", { name: String(f.name ?? "") })}
                            title={t("Sposta nel cestino")}
                            onClick={async () => {
                              const ok = await confirm({
                                title: t("Spostare «{name}» nel cestino?", { name: String(f.name ?? "") }),
                                description: t("Lo ritrovi in Automazioni → Cestino."),
                                confirmLabel: t("Sposta nel cestino"),
                                variant: "destructive",
                              });
                              if (ok) deleteFlowMut.mutate(f.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            )}
          </SezioneImpostazione>
        </div>
      )}

      {/* Wizard nuovo messaggio programmato — montato qui per riuso, gestito
          via stato bulkWizardOpen + chiamato dal pulsante Nuovo */}
      {isAdmin && <BulkScheduleWizard
        open={bulkWizardOpen}
        onClose={() => setBulkWizardOpen(false)}
      />}
    </div>
  );
}
