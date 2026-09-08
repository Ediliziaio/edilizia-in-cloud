/**
 * MioProfilo — Pagina unica "Il mio profilo" nelle impostazioni
 * Include: Dati personali, Sicurezza, Calendari, Notifiche
 * Accessibile a TUTTI i ruoli
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  Camera, User, Save, Loader2, Phone, Mail, Lock, Eye, EyeOff,
  Shield, Check, X, CalendarDays, RefreshCw, Unlink, Clock, Bell,
  BellRing, MessageSquare, FileText, Briefcase, Calendar, AlarmClock,
  Inbox, UserPlus, BellOff, MailCheck, Settings2, EyeOff as EyeOffIcon,
  AlertTriangle,
} from "lucide-react";
import GoogleCalendarSyncPrefsDialog from "@/components/settings/GoogleCalendarSyncPrefsDialog";
import OutlookCalendarConnectionTab from "@/components/settings/OutlookCalendarConnectionTab";
import AppleCalendarConnectionTab from "@/components/settings/AppleCalendarConnectionTab";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { EmailOAuthConnectionsCard } from "@/components/integrations/EmailOAuthConnectionsCard";
import { TwoFactorSetup } from "@/components/auth/TwoFactorSetup";
import { CompanySecuritySettings } from "@/components/settings/CompanySecuritySettings";
import { useUserCalendarPrefs } from "@/hooks/useUserCalendarPrefs";
import { useCalendariDiCasella } from "@/hooks/useCalendariEsterni";
import { direzioneDaModo, etichettaDirezione, type DirezioneSync } from "@/lib/calendar/direzioneSync";
// v8.6.39 H1 — hook persistenza preferenze notifiche (tabella user_notification_preferences)
import {
  useUserNotifPrefs,
  useSaveUserNotifPrefs,
  DEFAULT_NOTIF_PREFS,
  type NotifPrefs,
} from "@/hooks/useUserNotificationPrefs";
// v8.6.36 — MySurveysTab rimosso dal profilo (non era semantica corretta:
// è una LISTA OPERATIVA di sopralluoghi assegnati, non un'impostazione
// personale). Il componente resta disponibile per future dashboard widget.
// import { MySurveysTab } from "@/components/sopralluoghi/MySurveysTab";

// ── Role labels ──
const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin", company_admin: "Admin Azienda",
  company_staff: "Staff", customer: "Cliente", employee: "Dipendente",
  subcontractor: "Subappaltatore", salesperson: "Venditore",
  call_center: "Call Center", referrer: "Segnalatore",
};

type ProfileTab = "profilo" | "sicurezza" | "calendari" | "email" | "notifiche";
const PROFILE_TABS: ProfileTab[] = ["profilo", "sicurezza", "calendari", "email", "notifiche"];

function isProfileTab(tab: string | null): tab is ProfileTab {
  return PROFILE_TABS.includes(tab as ProfileTab);
}

// ── Calendar Icons ──
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
/**
 * Le preferenze che qualcuno legge davvero, oggi.
 *
 * La tabella `user_notification_preferences` ha 60 colonne e questa schermata
 * ne esponeva 21: ma cercando chi le rilegge, i lettori sono due soli —
 * l'invio email di riepilogo attività (`task-riepilogo-email`, che guarda
 * `task_assigned_email`, `task_due_soon_email`, `task_overdue_email`) e
 * l'assegnazione di un sopralluogo (che guarda `task_assigned_in_app`).
 * Tutte le altre si salvavano e non le consultava nessuno: diciotto
 * interruttori che si spostavano senza cambiare niente.
 *
 * Un interruttore inerte non è neutro: insegna a non fidarsi anche di quelli
 * che funzionano. Qui restano visibili — così si vede cosa arriverà — ma
 * spenti e dichiarati tali, invece di fingere di comandare qualcosa.
 * Quando chi manda le notifiche comincerà a leggerne un'altra, basta
 * aggiungere la sua chiave qui sotto.
 */
const PREFERENZE_ONORATE: ReadonlySet<string> = new Set([
  "email_new_task",      // task_assigned_email    → task-riepilogo-email
  "push_new_task",       // task_assigned_in_app   → SurveyAssignDialog
  "email_task_due",      // task_due_soon_email    → task-riepilogo-email
  "email_task_overdue",  // task_overdue_email     → task-riepilogo-email
]);

export default function MioProfilo() {
  const { user, role, refreshAuth, effectiveCompany, profile: authProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;
  const canManageCompanySecurity = role === "company_admin" || role === "super_admin";
  const tabParam = searchParams.get("tab");
  const activeTab: ProfileTab = isProfileTab(tabParam) ? tabParam : "profilo";
  const handleTabChange = (tab: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };
  // v8.6.36 — surveysEnabled rimosso (la tab Sopralluoghi non era nel posto giusto).

  // ── Profile data ──
  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user?.id,
    initialData: authProfile ? {
      first_name: authProfile.first_name ?? "",
      last_name: authProfile.last_name ?? "",
      avatar_url: authProfile.avatar_url,
      phone: authProfile.phone,
      email: authProfile.email,
      created_at: authProfile.created_at,
      last_login_at: authProfile.last_login_at,
    } : undefined,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("first_name, last_name, avatar_url, phone, email, created_at, last_login_at")
        .eq("id", user!.id).single();
      if (error) throw error;
      return data;
    },
  });

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name ?? "");
      setLastName(profile.last_name ?? "");
      setPhone(profile.phone ?? "");
    }
  }, [profile]);

  // v8.6.36 — Dirty-state: il bottone "Salva Modifiche" è abilitato solo
  // se l'utente ha effettivamente cambiato qualcosa rispetto al DB.
  // Evita salvataggi inutili e dà feedback visivo immediato.
  const profileDirty = !!profile && (
    firstName !== (profile.first_name ?? "") ||
    lastName !== (profile.last_name ?? "") ||
    phone !== (profile.phone ?? "")
  );

  // ── Avatar ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    if (!file.type.startsWith("image/")) { toast.error("Carica un file immagine valido"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Max 2 MB"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    setIsUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `users/${user.id}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      const urlWithCache = `${publicUrl}?t=${Date.now()}`;
      await supabase.from("profiles").update({ avatar_url: urlWithCache }).eq("id", user.id);
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      queryClient.invalidateQueries({ queryKey: ["chat-profiles"] });
      refreshAuth();
      toast.success("Foto aggiornata!");
    } catch (err: any) {
      toast.error("Errore upload", { description: err.message });
      setAvatarPreview(null);
    } finally { setIsUploading(false); }
  };

  // v8.6.39 H2 — removeAvatar con try/catch + loading state per evitare
  // toast success "Foto rimossa" anche quando il DB update fallisce
  // (RLS, rete, ecc.) → prima si vedeva ack false-positive.
  const [isRemovingAvatar, setIsRemovingAvatar] = useState(false);
  const removeAvatar = async () => {
    if (!user?.id || isRemovingAvatar) return;
    setIsRemovingAvatar(true);
    try {
      const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
      if (error) throw error;
      setAvatarPreview(null);
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      refreshAuth();
      toast.success("Foto rimossa");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Si è verificato un errore. Riprova tra qualche secondo.";
      toast.error("Impossibile rimuovere la foto", { description: msg });
    } finally {
      setIsRemovingAvatar(false);
    }
  };

  // ── Save profile ──
  const updateProfile = useMutation({
    mutationFn: async () => {
      if (!firstName.trim() || !lastName.trim()) throw new Error("Nome e cognome obbligatori");
      const { error } = await supabase.from("profiles")
        .update({ first_name: firstName.trim(), last_name: lastName.trim(), phone: phone.trim() || null })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      queryClient.invalidateQueries({ queryKey: ["chat-profiles"] });
      refreshAuth();
      toast.success("Profilo salvato!");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // ── Password ──
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  // v8.6.39 M5 — Calcolo strength score riutilizzabile (display + guard submit).
  // Prima score era inline dentro il JSX, e il bottone disabled controllava solo
  // length >= 8 — una password "aaaaaaaa" (8x 'a') passava i guard pur essendo
  // score=1 (solo lunghezza). Ora il bottone richiede score >= 2.
  const pwStrength = useMemo(() => {
    let score = 0;
    if (newPw.length >= 8) score++;
    if (newPw.length >= 12) score++;
    if (/[A-Z]/.test(newPw) && /[a-z]/.test(newPw)) score++;
    if (/\d/.test(newPw)) score++;
    if (/[^A-Za-z0-9]/.test(newPw)) score++;
    return score;
  }, [newPw]);

  const handleChangePassword = async () => {
    if (newPw.length < 8) { toast.error("Minimo 8 caratteri"); return; }
    if (newPw !== confirmPw) { toast.error("Le password non coincidono"); return; }
    setChangingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;
      setNewPw(""); setConfirmPw("");
      toast.success("Password aggiornata!");
    } catch (err: any) {
      toast.error(err.message);
    } finally { setChangingPw(false); }
  };

  // ── Calendar connections ──
  const { data: googleConn } = useQuery({
    queryKey: ["google-calendar-connection", companyId, user?.id],
    enabled: !!companyId && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("google_calendar_connections").select("*")
        .eq("company_id", companyId!).eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });
  const { data: googleSettings } = useQuery({
    queryKey: ["google-calendar-settings", companyId, user?.id],
    enabled: !!companyId && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("google_calendar_settings").select("*")
        .eq("company_id", companyId!).eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });

  // Direzione della sincronizzazione: comanda la riga di preferenze utente,
  // il vecchio sync_mode vale solo per chi non ne ha ancora una.
  const { data: calPrefs } = useUserCalendarPrefs(user?.id);
  // `calPrefs` torna i valori di default anche quando la riga non esiste: senza
  // guardare l'id si direbbe "Bidirezionale" a chi non ha mai scelto niente.
  const direzioneCalendario: DirezioneSync = calPrefs?.id
    ? (calPrefs.sync_direction as DirezioneSync)
    : direzioneDaModo((googleSettings as { sync_mode?: string } | null | undefined)?.sync_mode);

  // Il nome vero del calendario scelto: la scheda mostrava l'id grezzo
  // ("primary"), che non dice a nessuno dove finiscono gli appuntamenti.
  const casellaGoogle = googleConn?.id && googleConn.status === "connected"
    ? { provider: "google" as const, connectionId: googleConn.id, email: googleConn.google_account_email ?? "Account Google", status: googleConn.status }
    : null;
  const { data: calendariGoogle = [] } = useCalendariDiCasella(casellaGoogle);
  const idCalendarioScelto = (googleSettings as { primary_calendar_id?: string | null } | null | undefined)?.primary_calendar_id;
  const nomeCalendarioScelto =
    calendariGoogle.find((c) => c.id === idCalendarioScelto)?.nome ||
    (!idCalendarioScelto || idCalendarioScelto === "primary" ? "Principale" : idCalendarioScelto);

  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const connectGoogle = async () => {
    if (!companyId || !user?.id) return;
    setConnectingGoogle(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("google-calendar-auth", {
        body: { action: "start", companyId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.url) {
        const popup = window.open(res.data.url, "google-cal-auth", "width=500,height=700,left=400,top=100");
        // v8.6.39 H3 — Early return se popup bloccato dal browser
        if (!popup) {
          toast.error("Popup bloccato", {
            description: "Abilita i popup per questo sito nelle impostazioni del browser e riprova.",
          });
          setConnectingGoogle(false);
          return;
        }
        const pollInterval = setInterval(() => {
          if (popup.closed) {
            clearInterval(pollInterval);
            setConnectingGoogle(false);
            queryClient.invalidateQueries({ queryKey: ["google-calendar-connection"] });
          }
        }, 1000);
        setTimeout(() => { clearInterval(pollInterval); setConnectingGoogle(false); }, 300_000);
      }
    } catch (err: unknown) {
      toast.error("Errore connessione Google", { description: err instanceof Error ? err.message : String(err) });
      setConnectingGoogle(false);
    }
  };

  // 2026-05-26 (audit fix P0): listener postMessage per esito OAuth Google
  // Calendar. Prima il polling rilevava solo popup.closed, senza distinguere
  // tra successo, errore, annullamento → utente non sapeva se aveva
  // funzionato. Ora mostra toast esplicito + invalidate query.
  useEffect(() => {
    const trustedOrigins = [window.location.origin, "https://app.ediliziaincloud.com"];
    const handler = (event: MessageEvent) => {
      if (!trustedOrigins.includes(event.origin)) return;
      if (event.data?.type !== "GOOGLE_OAUTH_RESULT") return;
      if (event.data.status === "success") {
        toast.success("Google Calendar collegato", {
          description: "Sto importando i tuoi appuntamenti delle prossime 4 settimane…",
        });
        queryClient.invalidateQueries({ queryKey: ["google-calendar-connection"] });
        queryClient.invalidateQueries({ queryKey: ["google-calendar-settings"] });
      } else {
        toast.error("Collegamento non completato", {
          description: event.data.error || "Riprova dalle impostazioni.",
        });
      }
      setConnectingGoogle(false);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [queryClient]);

  const disconnectGoogle = async () => {
    if (!companyId || !user?.id) return;
    await supabase.from("google_calendar_connections").delete()
      .eq("company_id", companyId).eq("user_id", user.id);
    await supabase.from("google_calendar_settings").delete()
      .eq("company_id", companyId).eq("user_id", user.id);
    queryClient.invalidateQueries({ queryKey: ["google-calendar-connection"] });
    queryClient.invalidateQueries({ queryKey: ["google-calendar-settings"] });
    toast.success("Google Calendar disconnesso");
  };

  const [syncing, setSyncing] = useState(false);
  // 2026-05-26: dialog preferenze sync (bidirezionale + privacy busy_only)
  const [syncPrefsOpen, setSyncPrefsOpen] = useState(false);
  const updateGoogleSettings = useMutation({
    // La direzione vive nelle preferenze utente (e' quella che legge la sync);
    // su google_calendar_settings resta il riflesso a due valori, che le schede
    // continuano a mostrare. Prima si salvava solo il riflesso, e la direzione
    // scelta nella scheda utente non contava nulla.
    mutationFn: async (updates: Record<string, unknown>) => {
      if (!effectiveCompany?.id || !user?.id) throw new Error("Missing context");
      const { sync_direction: direzione, ...settings } = updates as { sync_direction?: DirezioneSync };
      const { error } = await (supabase as unknown as { from: (t: string) => { update: (p: unknown) => { eq: (k: string, v: string) => { eq: (k: string, v: string) => Promise<{ error: { message: string } | null }> } } } })
        .from("google_calendar_settings")
        .update(settings)
        .eq("company_id", effectiveCompany.id)
        .eq("user_id", user.id);
      if (error) throw new Error(error.message);
      if (direzione) {
        const { error: prefErr } = await supabase
          .from("user_calendar_preferences")
          .upsert(
            { user_id: user.id, company_id: effectiveCompany.id, sync_direction: direzione, updated_at: new Date().toISOString() } as never,
            { onConflict: "user_id" },
          );
        if (prefErr) throw new Error(prefErr.message);
      }
    },
    onSuccess: () => {
      toast.success("Preferenze calendario aggiornate");
      queryClient.invalidateQueries({ queryKey: ["google-calendar-settings"] });
      queryClient.invalidateQueries({ queryKey: ["user-calendar-prefs", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  // 2026-05-26 (audit fix P1): handling errori migliorato. Prima il catch
  // mostrava `err.message` anche se undefined → "Errore" generico senza
  // dettaglio. Ora controllo esplicito su res.error + invalidate query
  // così la UI mostra subito i nuovi busy slots.
  const syncGoogle = async () => {
    if (!companyId || !user?.id) return;
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("google-calendar-sync", {
        body: { action: "full-sync", companyId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message || "Sync fallita");
      const result = res.data as { synced?: number; skipped?: number } | null;
      const synced = result?.synced ?? 0;
      toast.success("Sincronizzazione completata", {
        description: synced > 0
          ? `${synced} appuntamenti dal tuo Google Calendar importati.`
          : "Nessun nuovo appuntamento trovato nelle prossime 4 settimane.",
      });
      queryClient.invalidateQueries({ queryKey: ["google-calendar-connection"] });
      queryClient.invalidateQueries({ queryKey: ["gcal-busy-slots"] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Sincronizzazione non riuscita", {
        description: msg.includes("token") || msg.includes("auth")
          ? "Sembra che il collegamento sia scaduto. Riconnetti Google Calendar."
          : msg,
      });
    } finally { setSyncing(false); }
  };

  // ── Notification preferences (local state, will persist to DB when table exists) ──
  // v8.6.39 H1 — Persistenza vera tramite tabella user_notification_preferences
  // (esisteva già nel DB con 60+ colonne, hook useUserNotifPrefs già pronto).
  // Prima era solo useState locale → al refresh tornava ai default = bug subdolo.
  // Mapping form ↔ colonne DB:
  //   email_new_order      → order_new_email
  //   push_new_order       → order_new_in_app   (push = notifica in-app)
  //   email_order_update   → order_status_changed_email
  //   push_order_update    → order_status_changed_in_app
  //   email_new_message    → message_whatsapp_email (più rappresentativo di "chat")
  //   push_new_message     → message_whatsapp_in_app
  //   email_new_task       → task_assigned_email
  //   push_new_task        → task_assigned_in_app
  //   email_weekly_report  → report_weekly_email
  // email_marketing rimosso dalla UI: nessuna colonna corrispondente,
  // l'utente può disiscriversi direttamente dalle newsletter via link in fondo.
  const { data: dbPrefs } = useUserNotifPrefs(user?.id);
  const savePrefs = useSaveUserNotifPrefs(user?.id, companyId);

  // Mappa stato form ↔ chiavi DB (per coerenza UI esistente).
  // v8.6.40 — Estesa con eventi appuntamenti, scadenze, lead, email/whatsapp
  // ricevute, report giornaliero/mensile. Tutti già supportati dal DB
  // (vedi NotifPrefs) ma prima non esposti nella UI.
  type FormPrefKey =
    | "email_new_order" | "push_new_order"
    | "email_order_update" | "push_order_update"
    | "email_new_message" | "push_new_message"
    | "email_new_task" | "push_new_task"
    | "email_task_due" | "push_task_due"
    | "email_task_overdue" | "push_task_overdue"
    | "email_new_appointment" | "push_new_appointment"
    | "email_appointment_reminder" | "push_appointment_reminder"
    | "email_new_lead" | "push_new_lead"
    | "email_email_received" | "push_email_received"
    | "email_daily_report" | "email_weekly_report" | "email_monthly_report";
  const formToDbKey: Record<FormPrefKey, keyof NotifPrefs> = {
    email_new_order: "order_new_email",
    push_new_order: "order_new_in_app",
    email_order_update: "order_status_changed_email",
    push_order_update: "order_status_changed_in_app",
    email_new_message: "message_whatsapp_email",
    push_new_message: "message_whatsapp_in_app",
    email_new_task: "task_assigned_email",
    push_new_task: "task_assigned_in_app",
    email_task_due: "task_due_soon_email",
    push_task_due: "task_due_soon_in_app",
    email_task_overdue: "task_overdue_email",
    push_task_overdue: "task_overdue_in_app",
    email_new_appointment: "appointment_new_email",
    push_new_appointment: "appointment_new_in_app",
    email_appointment_reminder: "appointment_reminder_email",
    push_appointment_reminder: "appointment_reminder_in_app",
    email_new_lead: "lead_new_email",
    push_new_lead: "lead_new_in_app",
    email_email_received: "message_email_received_email",
    push_email_received: "message_email_received_in_app",
    email_daily_report: "report_daily_email",
    email_weekly_report: "report_weekly_email",
    email_monthly_report: "report_monthly_email",
  };
  // notifPrefs è derivato dal DB tramite il mapping (read-only locale)
  const notifPrefs = useMemo(() => {
    const src = dbPrefs ?? DEFAULT_NOTIF_PREFS;
    return {
      email_new_order: src.order_new_email,
      push_new_order: src.order_new_in_app,
      email_order_update: src.order_status_changed_email,
      push_order_update: src.order_status_changed_in_app,
      email_new_message: src.message_whatsapp_email,
      push_new_message: src.message_whatsapp_in_app,
      email_new_task: src.task_assigned_email,
      push_new_task: src.task_assigned_in_app,
      email_task_due: src.task_due_soon_email,
      push_task_due: src.task_due_soon_in_app,
      email_task_overdue: src.task_overdue_email,
      push_task_overdue: src.task_overdue_in_app,
      email_new_appointment: src.appointment_new_email,
      push_new_appointment: src.appointment_new_in_app,
      email_appointment_reminder: src.appointment_reminder_email,
      push_appointment_reminder: src.appointment_reminder_in_app,
      email_new_lead: src.lead_new_email,
      push_new_lead: src.lead_new_in_app,
      email_email_received: src.message_email_received_email,
      push_email_received: src.message_email_received_in_app,
      email_daily_report: src.report_daily_email,
      email_weekly_report: src.report_weekly_email,
      email_monthly_report: src.report_monthly_email,
    };
  }, [dbPrefs]);

  // v8.6.40 — Quick actions (bulk toggle): attiva/disattiva canale per
  // tutti gli eventi operativi. Non tocca i report periodici (sotto).
  const bulkSetChannel = async (channel: "email" | "in_app", enabled: boolean) => {
    if (!user?.id || !companyId) {
      toast.error("Sessione non valida");
      return;
    }
    const current = dbPrefs ?? DEFAULT_NOTIF_PREFS;
    const next: NotifPrefs = { ...current };
    // Solo le preferenze che qualcuno rilegge: accendere in blocco anche le
    // altre darebbe l'impressione di aver attivato notifiche che non partono.
    const eventKeys = [...PREFERENZE_ONORATE].map((k) => formToDbKey[k as FormPrefKey]);
    const suffix = channel === "email" ? "_email" : "_in_app";
    for (const k of eventKeys) {
      if (k.endsWith(suffix)) next[k] = enabled;
    }
    try {
      await savePrefs.mutateAsync(next);
      toast.success(enabled ? "Notifiche attivate" : "Notifiche disattivate");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Riprova tra qualche secondo.";
      toast.error("Impossibile aggiornare", { description: msg });
    }
  };

  // Contatori per il riepilogo header
  // Il riepilogo conta solo le notifiche che partono davvero: un "9 email"
  // che comprende sette eventi mai inviati sarebbe un numero falso.
  const notifCounts = useMemo(() => {
    let email = 0, push = 0;
    for (const k of PREFERENZE_ONORATE) {
      if (!notifPrefs[k as FormPrefKey]) continue;
      if (k.startsWith("email_")) email++; else push++;
    }
    return { email, push, totaleEmail: 3, totalePush: 1 };
  }, [notifPrefs]);

  /** Toggle con persistenza ottimistica: aggiorna subito UI, fa upsert,
   *  rollback + toast errore se l'upsert fallisce. */
  const toggleNotif = async (key: FormPrefKey) => {
    if (!user?.id || !companyId) {
      toast.error("Sessione non valida", { description: "Ricarica la pagina e riprova." });
      return;
    }
    const dbKey = formToDbKey[key];
    const current = dbPrefs ?? DEFAULT_NOTIF_PREFS;
    const next: NotifPrefs = { ...current, [dbKey]: !current[dbKey] };
    // optimistic update via mutation
    try {
      await savePrefs.mutateAsync(next);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Riprova tra qualche secondo.";
      toast.error("Impossibile salvare la preferenza", { description: msg });
    }
  };

  const avatarUrl = avatarPreview ?? profile?.avatar_url ?? null;
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();

  if (isLoading) {
    return (
      <div className="max-w-6xl space-y-5">
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-56 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />

      {/* ── Header con avatar ── */}
      <div className="flex items-center gap-4 mb-6 sm:gap-5">
        <div className="relative group">
          <Avatar className="h-20 w-20 ring-4 ring-primary/10">
            <AvatarImage src={avatarUrl ?? undefined} />
            <AvatarFallback className="text-2xl bg-primary/10 text-primary font-bold">
              {initials || <User className="h-8 w-8" />}
            </AvatarFallback>
          </Avatar>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary text-white flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors"
          >
            {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
          </button>
          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/80">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
        </div>
        <div>
          <h2 className="text-lg font-semibold">{firstName} {lastName}</h2>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="text-[10px] h-5">
              {ROLE_LABELS[role ?? ""] ?? role}
            </Badge>
            {profile?.avatar_url && (
              <button
                type="button"
                onClick={removeAvatar}
                disabled={isRemovingAvatar}
                className="text-xs text-destructive hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
              >
                {isRemovingAvatar ? "Rimozione…" : "Rimuovi foto"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        {/* v8.6.75 — Mobile-friendly scrolling tabs con fade gradient a destra
            che indica "scroll possibile". Padding ridotto px-2 sm:px-3 +
            gap-0.5 sm:gap-1 per far stare più tab a vista su 375px. */}
        <div className="relative mb-6">
          <div className="-mx-1 overflow-x-auto overscroll-x-contain px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsList className="inline-flex h-auto min-w-max w-max justify-start gap-0.5 sm:gap-1 bg-muted/50 p-1">
              <TabsTrigger value="profilo" className="h-9 shrink-0 gap-1 sm:gap-1.5 whitespace-nowrap px-2 sm:px-3 text-xs sm:text-sm">
                <User className="h-3.5 w-3.5" /> Profilo
              </TabsTrigger>
              <TabsTrigger value="sicurezza" className="h-9 shrink-0 gap-1 sm:gap-1.5 whitespace-nowrap px-2 sm:px-3 text-xs sm:text-sm">
                <Shield className="h-3.5 w-3.5" /> Sicurezza
              </TabsTrigger>
              <TabsTrigger value="calendari" className="h-9 shrink-0 gap-1 sm:gap-1.5 whitespace-nowrap px-2 sm:px-3 text-xs sm:text-sm">
                <CalendarDays className="h-3.5 w-3.5" /> Calendari
              </TabsTrigger>
              <TabsTrigger value="email" className="h-9 shrink-0 gap-1 sm:gap-1.5 whitespace-nowrap px-2 sm:px-3 text-xs sm:text-sm">
                <Mail className="h-3.5 w-3.5" /> Email
              </TabsTrigger>
              <TabsTrigger value="notifiche" className="h-9 shrink-0 gap-1 sm:gap-1.5 whitespace-nowrap px-2 sm:px-3 text-xs sm:text-sm">
                <Bell className="h-3.5 w-3.5" /> Notifiche
              </TabsTrigger>
            </TabsList>
          </div>
          {/* Fade gradient: hint visivo "scrolla per vedere altre tab" */}
          <div className="pointer-events-none absolute top-0 right-0 h-full w-8 bg-gradient-to-l from-background to-transparent sm:hidden" />
        </div>

        {/* ════════════ TAB PROFILO ════════════ */}
        {/* v8.6.37 — Grid 2 colonne su lg+: dati personali (2/3) + cronologia (1/3).
            Riempie meglio lo spazio della pagina che era troppo vuoto a destra. */}
        <TabsContent value="profilo" className="mt-0">
          <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" /> Dati personali
              </CardTitle>
              <CardDescription>Le informazioni che vengono mostrate nella chat, calendario e nel team.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="fn">Nome</Label>
                  <Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ln">Cognome</Label>
                  <Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </div>
              {/* v8.6.39 M7 — Input email rimosso: era duplicato dell'header
                  avatar in cima alla pagina + l'input era disabled (no modifica
                  diretta possibile). Per cambiare email: contatta admin (info
                  spostata nel testo informativo del Telefono). */}
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> Telefono</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+39 333 1234567" />
              </div>
              <div className="flex items-center justify-between pt-2">
                {profileDirty ? (
                  <p className="text-xs text-amber-600 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                    Modifiche non salvate
                  </p>
                ) : (
                  <span />
                )}
                <Button
                  onClick={() => updateProfile.mutate()}
                  disabled={updateProfile.isPending || !profileDirty}
                >
                  {updateProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Salva Modifiche
                </Button>
              </div>
              {/* v8.6.39 M7 — nota separata in fondo: info su modifica email
                  che prima era sotto l'input email duplicato. */}
              <p className="text-xs text-muted-foreground border-t pt-3">
                {role === "super_admin"
                  ? "L'email di accesso del super admin si gestisce dal pannello Supabase (Auth → Users)."
                  : "Per modificare l'email contatta l'amministratore della tua azienda."}
              </p>
            </CardContent>
          </Card>
          </div>

          {/* Colonna laterale: cronologia account */}
          <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" /> Cronologia account
              </CardTitle>
              <CardDescription>Informazioni di utilizzo del tuo account.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Account creato</p>
                  <p className="font-medium">
                    {profile?.created_at ? format(new Date(profile.created_at), "d MMMM yyyy", { locale: it }) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Ultimo accesso</p>
                  <p className="font-medium">
                    {(() => {
                      // profiles.last_login_at non viene popolato per tutti gli
                      // utenti (es. super admin): fallback al dato auth nativo.
                      const lastAccess = profile?.last_login_at ?? user?.last_sign_in_at;
                      return lastAccess ? format(new Date(lastAccess), "d MMM yyyy, HH:mm", { locale: it }) : "—";
                    })()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          </div>
          </div>
        </TabsContent>

        {/* ════════════ TAB SICUREZZA ════════════ */}
        {/* v8.6.37 — Grid 2 colonne su lg+: cambio password + privacy GDPR */}
        <TabsContent value="sicurezza" className="mt-0">
          <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Lock className="h-4 w-4" /> Cambia Password
              </CardTitle>
              <CardDescription>Scegli una password sicura con almeno 8 caratteri.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-pw">Nuova Password</Label>
                <div className="relative">
                  <Input id="new-pw" type={showPw ? "text" : "password"} value={newPw}
                    onChange={(e) => setNewPw(e.target.value)} placeholder="Minimo 8 caratteri" />
                  <button onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    type="button" aria-label={showPw ? "Nascondi password" : "Mostra password"}>
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {/* v8.6.36 — Password strength indicator (5 livelli) */}
                {newPw.length > 0 && (() => {
                  const labels = ["Troppo debole", "Debole", "Media", "Buona", "Forte"];
                  const colors = ["bg-red-500", "bg-orange-500", "bg-amber-500", "bg-lime-500", "bg-emerald-500"];
                  return (
                    <div className="space-y-1 pt-0.5">
                      <div className="flex gap-1">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className={`h-1 flex-1 rounded-full transition-colors ${i < pwStrength ? colors[pwStrength - 1] : "bg-muted"}`}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Sicurezza: <span className="font-medium">{labels[Math.max(0, pwStrength - 1)] ?? "Troppo debole"}</span>
                        {pwStrength < 3 && newPw.length >= 8 && (
                          <span className="ml-2 text-amber-600">· aggiungi maiuscole, numeri o simboli</span>
                        )}
                      </p>
                    </div>
                  );
                })()}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-pw">Conferma Password</Label>
                <Input id="confirm-pw" type={showPw ? "text" : "password"} value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)} placeholder="Ripeti la password" />
                {newPw && confirmPw && newPw !== confirmPw && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <X className="h-3 w-3" /> Le password non coincidono
                  </p>
                )}
                {newPw && confirmPw && newPw === confirmPw && newPw.length >= 8 && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <Check className="h-3 w-3" /> Le password coincidono
                  </p>
                )}
              </div>
              <div className="flex justify-end pt-2">
                <Button onClick={handleChangePassword}
                  /* v8.6.39 M5 — guard score>=2: prima "aaaaaaaa" (8x 'a',
                     score=1) passava il check. Ora richiede almeno 2 criteri
                     soddisfatti (es. lunghezza + numero/maiuscole/simbolo). */
                  disabled={changingPw || !newPw || newPw !== confirmPw || newPw.length < 8 || pwStrength < 2}>
                  {changingPw ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
                  Aggiorna Password
                </Button>
              </div>
            </CardContent>
          </Card>

          <TwoFactorSetup />

          {/* v8.6.36 — Card "Privacy" pulita: rimosso duplicato date
              account (già nella tab Profilo). Focus su GDPR + sicurezza. */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" /> Privacy & dati personali
              </CardTitle>
              <CardDescription>Esercita i tuoi diritti GDPR sui dati conservati dalla piattaforma.</CardDescription>
            </CardHeader>
            <CardContent>
              {/* v8.6.36 — Card 'Privacy' pulita: rimosso duplicato date account (già nella tab Profilo) */}
              <div className="rounded-md border border-muted bg-muted/30 p-3 text-sm text-muted-foreground">
                <p>
                  Per richiedere la <strong>cancellazione</strong> del tuo account o l'<strong>esportazione</strong> dei tuoi dati
                  personali (Regolamento UE 2016/679, art. 15-17), contatta l'amministratore della tua azienda
                  o scrivi a <a href="mailto:privacy@ediliziaincloud.com" className="text-primary hover:underline">privacy@ediliziaincloud.com</a>.
                </p>
              </div>
            </CardContent>
          </Card>
          {canManageCompanySecurity && (
            <div className="lg:col-span-2">
              <CompanySecuritySettings />
            </div>
          )}
          </div>
        </TabsContent>

        {/* ════════════ TAB CALENDARI ════════════ */}
        {/* v8.6.37 — Grid 2 colonne su lg+: Google (con dettagli) span 2,
            Outlook + Apple side-by-side. Riempie meglio orizzontalmente. */}
        <TabsContent value="calendari" className="mt-0">
          <div className="grid gap-5 lg:grid-cols-2">
          <div className="lg:col-span-2">
          {/* Google Calendar */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-white border shadow-sm flex items-center justify-center">
                    <GoogleIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Google Calendar</CardTitle>
                    <CardDescription>Sincronizza eventi e disponibilità</CardDescription>
                  </div>
                </div>
                {/* 2026-05-27: badge stato accurato — verde solo se status="connected".
                    token_expired/error → giallo "Da rinnovare" per non mentire all'utente. */}
                {googleConn ? (
                  googleConn.status === "connected" ? (
                    <Badge variant="default" className="bg-green-100 text-green-700 border-green-200 gap-1">
                      <Check className="h-3 w-3" /> Connesso
                    </Badge>
                  ) : (
                    <Badge variant="default" className="bg-amber-100 text-amber-700 border-amber-200 gap-1">
                      <AlertTriangle className="h-3 w-3" /> Da rinnovare
                    </Badge>
                  )
                ) : (
                  <Badge variant="secondary">Non connesso</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {googleConn ? (
                <div className="space-y-4">
                  {/* 2026-05-27: stato connessione differenziato.
                      - status=connected → card verde con email reale
                      - status=token_expired/error → card amber con prompt
                        "Riconnetti" e mostra last_error se presente.
                      - email NULL = connessione legacy bug encrypt (vedi commit
                        189ae73e3): mostra hint chiaro all'utente. */}
                  {(() => {
                    const isHealthy = googleConn.status === "connected";
                    const email = googleConn.google_account_email;
                    const hasEmail = !!email && email.trim() !== "";
                    return (
                      <div className={`rounded-lg border p-4 ${
                        isHealthy
                          ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900"
                          : "bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-900"
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          {isHealthy ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                          )}
                          <span className={`font-medium text-sm ${
                            isHealthy
                              ? "text-green-800 dark:text-green-300"
                              : "text-amber-800 dark:text-amber-300"
                          }`}>
                            {isHealthy ? "Calendario collegato" : "Connessione da rinnovare"}
                          </span>
                        </div>
                        <p className={`text-xs ${
                          isHealthy
                            ? "text-green-700 dark:text-green-400"
                            : "text-amber-700 dark:text-amber-400"
                        }`}>
                          Account: <strong>{hasEmail ? email : "non rilevato"}</strong>
                          {!hasEmail && (
                            <span className="ml-1 italic text-amber-700/80">
                              (l'email non era stata salvata correttamente — clicca "Disconnetti" e poi "Connetti" per fixare)
                            </span>
                          )}
                        </p>
                        {!isHealthy && googleConn.last_error && (
                          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-2 leading-snug">
                            <strong>Errore:</strong> {googleConn.last_error}
                          </p>
                        )}
                        {googleConn.last_sync_at ? (
                          <p className={`text-xs mt-1 ${
                            isHealthy ? "text-green-600/70" : "text-amber-600/70"
                          }`}>
                            Ultima sync: {format(new Date(googleConn.last_sync_at), "d MMM yyyy, HH:mm", { locale: it })}
                          </p>
                        ) : (
                          <p className={`text-xs mt-1 italic ${
                            isHealthy ? "text-green-600/70" : "text-amber-600/70"
                          }`}>
                            Mai sincronizzato — clicca "Sincronizza ora" per il primo import.
                          </p>
                        )}
                      </div>
                    );
                  })()}
                  {googleSettings && (
                    <div className="text-sm space-y-1">
                      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Impostazioni sync</p>
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Calendario: <strong>{nomeCalendarioScelto}</strong></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Modalità: <strong>{etichettaDirezione(direzioneCalendario)}</strong></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <EyeOffIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Privacy eventi Google: <strong>
                          {googleSettings.event_privacy === "busy_only" ? "Mostra solo \"Occupato\"" : "Titolo e dettagli visibili"}
                        </strong></span>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={syncGoogle} disabled={syncing} className="gap-2">
                      {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Sincronizza ora
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setSyncPrefsOpen(true)} className="gap-2">
                      <Settings2 className="h-3.5 w-3.5" />
                      Preferenze sync
                    </Button>
                    <Button size="sm" variant="ghost" onClick={disconnectGoogle} className="gap-2 text-destructive hover:text-destructive">
                      <Unlink className="h-3.5 w-3.5" /> Disconnetti
                    </Button>
                  </div>
                </div>
              ) : (
                /* v8.6.38 — Onboarding compresso: 3 bullet inline invece di
                    card colorata che occupava tutto lo spazio. CTA primaria
                    subito visibile. */
                <div className="space-y-4">
                  <ul className="text-sm text-muted-foreground space-y-1.5">
                    <li className="flex items-start gap-2"><Check className="h-3.5 w-3.5 shrink-0 mt-0.5 text-green-600" /> Appuntamenti sincronizzati automaticamente</li>
                    <li className="flex items-start gap-2"><Check className="h-3.5 w-3.5 shrink-0 mt-0.5 text-green-600" /> Il team vede la tua disponibilità</li>
                    <li className="flex items-start gap-2"><Check className="h-3.5 w-3.5 shrink-0 mt-0.5 text-green-600" /> Evita sovrapposizioni con appuntamenti personali</li>
                  </ul>
                  <Button onClick={connectGoogle} disabled={connectingGoogle} className="gap-2 w-full sm:w-auto">
                    {connectingGoogle ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon className="h-4 w-4" />}
                    Collega Google Calendar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          </div>

          {/* Outlook e Apple: gli stessi componenti di Impostazioni → Calendari →
              Collegamenti. Fino al 2026-09-08 qui c'erano due schede
              "Prossimamente" scritte a mano, mentre edge function, tabelle e
              componenti erano pronti da mesi: il profilo diceva il falso. */}
          <div>
            <OutlookCalendarConnectionTab />
          </div>
          <div>
            <AppleCalendarConnectionTab />
          </div>
          </div>

          {/* Dialog preferenze sync Google Calendar (bidirezionale + privacy) */}
          <GoogleCalendarSyncPrefsDialog
            open={syncPrefsOpen}
            onOpenChange={setSyncPrefsOpen}
            syncMode={googleSettings?.sync_mode || "one_way"}
            direzione={direzioneCalendario}
            importGoogleEvents={Boolean((googleSettings as { import_google_events_to_crm?: boolean } | null | undefined)?.import_google_events_to_crm)}
            createContactsFromGuests={Boolean((googleSettings as { create_contacts_from_guests?: boolean } | null | undefined)?.create_contacts_from_guests)}
            eventPrivacy={(googleSettings as { event_privacy?: "full" | "busy_only" } | null | undefined)?.event_privacy === "busy_only" ? "busy_only" : "full"}
            allowTwoWay={true}
            allowGuestContactCreate={true}
            allowGoogleToImport={true}
            onSave={(prefs) => {
              updateGoogleSettings.mutate(prefs);
              setSyncPrefsOpen(false);
            }}
            isSaving={updateGoogleSettings.isPending}
          />
        </TabsContent>

        {/* ════════════ TAB EMAIL — connessioni personali ════════════ */}
        {/* v8.6.38 — Rimossa card info blu duplicata: il titolo era
            ripetuto nella card EmailOAuthConnectionsCard sotto. Il
            messaggio "ogni utente collega il proprio" è ora compresso
            in piccolo testo sopra (subtitle) — niente più sezione
            colorata che ruba spazio. */}
        <TabsContent value="email" className="mt-0 space-y-3">
          {/* v8.6.39 M6 — subtitle ora in mini-card neutra (border-dashed)
              per coerenza visiva con le altre tab che iniziano con una Card. */}
          <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground flex items-start gap-2">
            <Mail className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Ogni utente collega il proprio Gmail o Outlook. Vedi solo le tue connessioni;
              le email di altri membri del team non sono visibili.
            </span>
          </div>
          <EmailOAuthConnectionsCard />
        </TabsContent>

        {/* v8.6.36 — tab Sopralluoghi rimossa (era una lista operativa,
            non un'impostazione personale). Per vedere i tuoi sopralluoghi
            assegnati vai a /azienda/sopralluoghi. */}

        {/* ════════════ TAB NOTIFICHE ════════════ */}
        {/* v8.6.40 — Sezione riprogettata:
            - Header con riepilogo + quick actions bulk (Email tutto / Push
              tutto / Disattiva tutto)
            - Eventi raggruppati per categoria (Operativi, Comunicazione,
              Calendario & attività, Lead)
            - Più eventi esposti (appuntamenti, scadenze task, email/whatsapp
              ricevuti, lead nuovi) tutti già nello schema DB
            - Report periodici giornaliero / settimanale / mensile */}
        <TabsContent value="notifiche" className="mt-0 space-y-5">
          {/* Header — riepilogo + quick actions */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bell className="h-4 w-4" /> Preferenze notifiche
                  </CardTitle>
                  <CardDescription>
                    Oggi partono davvero solo gli avvisi sulle attività. Gli altri
                    eventi sono in elenco ma spenti: li vedi qui perché arriveranno,
                    non perché siano già attivi.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="gap-1 text-xs">
                    <Mail className="h-3 w-3" /> {notifCounts.email} di {notifCounts.totaleEmail} email
                  </Badge>
                  <Badge variant="secondary" className="gap-1 text-xs">
                    <BellRing className="h-3 w-3" /> {notifCounts.push} di {notifCounts.totalePush} push
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {/* Su mobile i tre pulsanti riempiono la riga (due in griglia + uno
                  a tutta larghezza): allineati a sinistra lasciavano metà riga
                  vuota. Su schermo grande tornano in fila. */}
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => bulkSetChannel("in_app", true)}
                  disabled={savePrefs.isPending}
                  className="h-8 w-full gap-1.5 text-xs sm:w-auto"
                >
                  <BellRing className="h-3 w-3 shrink-0" />
                  <span className="truncate sm:hidden">Attiva push</span>
                  <span className="hidden sm:inline">Attiva i push disponibili</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => bulkSetChannel("email", true)}
                  disabled={savePrefs.isPending}
                  className="h-8 w-full gap-1.5 text-xs sm:w-auto"
                >
                  <MailCheck className="h-3 w-3 shrink-0" />
                  <span className="truncate sm:hidden">Attiva email</span>
                  <span className="hidden sm:inline">Attiva le email disponibili</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await bulkSetChannel("in_app", false);
                    await bulkSetChannel("email", false);
                  }}
                  disabled={savePrefs.isPending}
                  className="col-span-2 h-8 w-full gap-1.5 text-xs text-muted-foreground sm:col-span-1 sm:w-auto"
                >
                  <BellOff className="h-3 w-3" /> Disattiva tutto
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Eventi raggruppati per categoria */}
          <Card>
            <CardContent className="p-0">
              {/* Header colonne */}
              <div className="hidden sm:grid grid-cols-[1fr_72px_72px] gap-2 px-4 pt-3 pb-2 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <div>Evento</div>
                <div className="text-center flex items-center justify-center gap-1"><Mail className="h-3 w-3" /> Email</div>
                <div className="text-center flex items-center justify-center gap-1"><BellRing className="h-3 w-3" /> Push</div>
              </div>

              {/* Categoria: Ordini & cantieri */}
              <NotifGroupHeader icon={Briefcase} label="Ordini & cantieri" />
              <NotifMatrixRow
                icon={Briefcase}
                label="Nuovo ordine / cantiere"
                desc="Quando viene creato un nuovo ordine assegnato a te"
                emailChecked={notifPrefs.email_new_order}
                pushChecked={notifPrefs.push_new_order}
                onEmailToggle={() => toggleNotif("email_new_order")}
                onPushToggle={() => toggleNotif("push_new_order")}
                emailAttiva={false}
                pushAttiva={false}
              />
              <NotifMatrixRow
                icon={RefreshCw}
                label="Aggiornamento ordine"
                desc="Cambi di stato sugli ordini in cui sei coinvolto"
                emailChecked={notifPrefs.email_order_update}
                pushChecked={notifPrefs.push_order_update}
                onEmailToggle={() => toggleNotif("email_order_update")}
                onPushToggle={() => toggleNotif("push_order_update")}
                emailAttiva={false}
                pushAttiva={false}
              />

              {/* Categoria: Comunicazione */}
              <NotifGroupHeader icon={MessageSquare} label="Comunicazione" />
              <NotifMatrixRow
                icon={MessageSquare}
                label="Nuovo messaggio chat / WhatsApp"
                desc="Messaggi diretti e menzioni nelle chat interne e WhatsApp"
                emailChecked={notifPrefs.email_new_message}
                pushChecked={notifPrefs.push_new_message}
                onEmailToggle={() => toggleNotif("email_new_message")}
                onPushToggle={() => toggleNotif("push_new_message")}
                emailAttiva={false}
                pushAttiva={false}
              />
              <NotifMatrixRow
                icon={Inbox}
                label="Email ricevuta"
                desc="Nuove email nella casella collegata (Gmail / Outlook / IMAP)"
                emailChecked={notifPrefs.email_email_received}
                pushChecked={notifPrefs.push_email_received}
                onEmailToggle={() => toggleNotif("email_email_received")}
                onPushToggle={() => toggleNotif("push_email_received")}
                emailAttiva={false}
                pushAttiva={false}
              />

              {/* Categoria: Calendario & attività */}
              <NotifGroupHeader icon={Calendar} label="Calendario & attività" />
              <NotifMatrixRow
                icon={Calendar}
                label="Nuovo appuntamento"
                desc="Quando ti viene creato un appuntamento in agenda"
                emailChecked={notifPrefs.email_new_appointment}
                pushChecked={notifPrefs.push_new_appointment}
                onEmailToggle={() => toggleNotif("email_new_appointment")}
                onPushToggle={() => toggleNotif("push_new_appointment")}
                emailAttiva={false}
                pushAttiva={false}
              />
              <NotifMatrixRow
                icon={AlarmClock}
                label="Promemoria appuntamento"
                desc="Promemoria prima dell'inizio (15 min default)"
                emailChecked={notifPrefs.email_appointment_reminder}
                pushChecked={notifPrefs.push_appointment_reminder}
                onEmailToggle={() => toggleNotif("email_appointment_reminder")}
                onPushToggle={() => toggleNotif("push_appointment_reminder")}
                emailAttiva={false}
                pushAttiva={false}
              />
              <NotifMatrixRow
                icon={FileText}
                label="Nuova attività assegnata"
                desc="Quando ti viene assegnata un'attività / to-do"
                emailChecked={notifPrefs.email_new_task}
                pushChecked={notifPrefs.push_new_task}
                onEmailToggle={() => toggleNotif("email_new_task")}
                onPushToggle={() => toggleNotif("push_new_task")}
              />
              <NotifMatrixRow
                icon={Clock}
                label="Attività in scadenza"
                desc="Alert quando un'attività sta per scadere"
                emailChecked={notifPrefs.email_task_due}
                pushChecked={notifPrefs.push_task_due}
                onEmailToggle={() => toggleNotif("email_task_due")}
                onPushToggle={() => toggleNotif("push_task_due")}
                pushAttiva={false}
              />
              {/* Questa email parte davvero (task-riepilogo-email la manda con
                  default acceso) ma non era esposta da nessuna parte: si
                  ricevevano avvisi che non si potevano spegnere. */}
              <NotifMatrixRow
                icon={AlarmClock}
                label="Attività in ritardo"
                desc="Riepilogo delle attività con la scadenza già passata"
                emailChecked={notifPrefs.email_task_overdue}
                pushChecked={notifPrefs.push_task_overdue}
                onEmailToggle={() => toggleNotif("email_task_overdue")}
                onPushToggle={() => toggleNotif("push_task_overdue")}
                pushAttiva={false}
              />

              {/* Categoria: Lead & vendita */}
              <NotifGroupHeader icon={UserPlus} label="Lead & vendita" />
              <NotifMatrixRow
                icon={UserPlus}
                label="Nuovo lead in arrivo"
                desc="Lead dai form, Facebook Ads, WhatsApp o chat sito"
                emailChecked={notifPrefs.email_new_lead}
                pushChecked={notifPrefs.push_new_lead}
                onEmailToggle={() => toggleNotif("email_new_lead")}
                onPushToggle={() => toggleNotif("push_new_lead")}
                emailAttiva={false}
                pushAttiva={false}
                isLast
              />
            </CardContent>
          </Card>

          {/* Email periodiche: report giornaliero / settimanale / mensile */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="h-4 w-4" /> Email periodiche
              </CardTitle>
              <CardDescription>
                Riepiloghi automatici dell'attività via email. Indipendenti dalle notifiche per evento.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              <NotifRow
                icon={FileText}
                label="Report giornaliero"
                desc="Riepilogo della giornata, inviato ogni sera"
                checked={notifPrefs.email_daily_report}
                onChange={() => toggleNotif("email_daily_report")}
                attiva={false}
              />
              <NotifRow
                icon={FileText}
                label="Report settimanale"
                desc="Riepilogo della settimana, inviato il lunedì mattina"
                checked={notifPrefs.email_weekly_report}
                onChange={() => toggleNotif("email_weekly_report")}
                attiva={false}
              />
              <NotifRow
                icon={FileText}
                label="Report mensile"
                desc="Riepilogo del mese, inviato il 1° del mese"
                checked={notifPrefs.email_monthly_report}
                onChange={() => toggleNotif("email_monthly_report")}
                attiva={false}
              />
            </CardContent>
          </Card>

          <p className="text-[11px] text-muted-foreground px-1">
            Le modifiche vengono salvate automaticamente. Per ricevere notifiche push sul browser,
            assicurati di aver dato il permesso quando richiesto dal browser.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// v8.6.40 — Divider/header di gruppo dentro la matrice eventi.
function NotifGroupHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
  );
}

// ── Notification row component (per Email periodiche, single-channel) ──
function NotifRow({
  icon: Icon, label, desc, checked, onChange, attiva = true,
}: {
  icon: React.ElementType; label: string; desc: string; checked: boolean;
  onChange: () => void;
  /** false = nessuno manda questa email: switch spento e bloccato. */
  attiva?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3 px-1 hover:bg-muted/30 rounded-lg transition-colors">
      <div className="flex items-center gap-3">
        <Icon className={`h-4 w-4 shrink-0 ${attiva ? "text-muted-foreground" : "text-muted-foreground/50"}`} />
        <div className="min-w-0">
          <p className={`text-sm font-medium ${attiva ? "" : "text-muted-foreground"}`}>{label}</p>
          <p className="text-xs text-muted-foreground">
            {!attiva && (
              <span className="mr-1 whitespace-nowrap rounded bg-muted px-1.5 py-px text-[10px] font-medium">
                non ancora
              </span>
            )}
            {desc}
          </p>
        </div>
      </div>
      <Switch
        checked={attiva && checked}
        onCheckedChange={onChange}
        disabled={!attiva}
        aria-label={attiva ? label : `${label} (non ancora disponibile)`}
      />
    </div>
  );
}

// v8.6.38 — Matrix row per "Notifiche per evento": una riga = un evento,
// 2 colonne switch (Email + Push). Più compatto e scansionabile rispetto
// alla vecchia struttura 3 card con eventi duplicati.
function NotifMatrixRow({
  icon: Icon, label, desc, emailChecked, pushChecked, onEmailToggle, onPushToggle, isLast,
  emailAttiva = true, pushAttiva = true,
}: {
  icon: React.ElementType;
  label: string;
  desc: string;
  emailChecked: boolean;
  pushChecked: boolean;
  onEmailToggle: () => void;
  onPushToggle: () => void;
  isLast?: boolean;
  /** false = nessuno legge questa preferenza: lo switch si mostra spento e bloccato. */
  emailAttiva?: boolean;
  pushAttiva?: boolean;
}) {
  const inerte = !emailAttiva && !pushAttiva;
  return (
    <div className={`grid grid-cols-[1fr_52px_52px] items-center gap-2 px-3 py-3 sm:grid-cols-[1fr_72px_72px] sm:px-4 ${!isLast ? "border-b" : ""} hover:bg-muted/30 transition-colors`}>
      <div className="flex items-center gap-3 min-w-0">
        <Icon className={`h-4 w-4 shrink-0 ${inerte ? "text-muted-foreground/50" : "text-muted-foreground"}`} />
        <div className="min-w-0">
          <p className={`truncate text-sm font-medium ${inerte ? "text-muted-foreground" : ""}`}>{label}</p>
          {/* Il marcatore sta nella riga della descrizione, non accanto al nome:
              su schermo stretto accanto al nome lo riduceva a una lettera.
              La descrizione dell'evento resta anche quando la riga è spenta:
              serve a capire cosa arriverà, non solo che non arriva. */}
          <p className="text-xs text-muted-foreground line-clamp-2">
            {inerte && (
              <span className="mr-1 whitespace-nowrap rounded bg-muted px-1.5 py-px text-[10px] font-medium">
                non ancora
              </span>
            )}
            {desc}
          </p>
        </div>
      </div>
      <div className="flex justify-center">
        <Switch
          checked={emailAttiva && emailChecked}
          onCheckedChange={onEmailToggle}
          disabled={!emailAttiva}
          aria-label={`Email: ${label}${emailAttiva ? "" : " (non ancora disponibile)"}`}
        />
      </div>
      <div className="flex justify-center">
        <Switch
          checked={pushAttiva && pushChecked}
          onCheckedChange={onPushToggle}
          disabled={!pushAttiva}
          aria-label={`Push: ${label}${pushAttiva ? "" : " (non ancora disponibile)"}`}
        />
      </div>
    </div>
  );
}
