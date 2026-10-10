/**
 * MioProfilo — Pagina unica "Il mio profilo" nelle impostazioni
 * Include: Dati personali, Sicurezza, Calendari, Email e (fuori dall'ufficio) Notifiche
 * Accessibile a TUTTI i ruoli
 *
 * La usano anche il campo (operai e subappaltatori: /campo/impostazioni) e il team della piattaforma
 * (/admin/impostazioni/mio-profilo): ogni modifica va provata nei tre posti.
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { motivoPasswordRifiutata } from "@/lib/auth/cambioPassword";
import { MessaggioPerUtente, motivoDelRifiuto } from "@/lib/impostazioni/erroriPerUtente";
import { EMAIL_PRIVACY } from "@/lib/impostazioni/contattiEdiliziaInCloud";
import { logger } from "@/utils/logger";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  Camera, User, Save, Loader2, Phone, Mail, Lock, Eye, EyeOff,
  Shield, Check, X, CalendarDays, RefreshCw, Unlink, Clock, Bell,
  Settings2, AlertTriangle,
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
import { EmailOAuthConnectionsCard } from "@/components/integrations/EmailOAuthConnectionsCard";
import { TwoFactorSetup } from "@/components/auth/TwoFactorSetup";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { AvvisiPerEvento } from "@/components/notifications/AvvisiPerEvento";
import { CompanySecuritySettings } from "@/components/settings/CompanySecuritySettings";
import { useUserCalendarPrefs } from "@/hooks/useUserCalendarPrefs";
import { useCalendariDiCasella } from "@/hooks/useCalendariEsterni";
import { direzioneDaModo, etichettaDirezione, type DirezioneSync } from "@/lib/calendar/direzioneSync";
// v8.6.36 — MySurveysTab rimosso dal profilo (non era semantica corretta:
// è una LISTA OPERATIVA di sopralluoghi assegnati, non un'impostazione
// personale). Il componente, mai più usato, è uscito dal codice il 25/09/2026:
// se serve per un widget, è nella storia git (components/sopralluoghi/MySurveysTab).

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

export default function MioProfilo() {
  const { user, role, refreshAuth, effectiveCompany, profile: authProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;
  const canManageCompanySecurity = role === "company_admin" || role === "super_admin";
  const tabParam = searchParams.get("tab");
  // Mobile: collegare calendari e caselle email è una configurazione da
  // computer (25/09/2026); un indirizzo che punta lì apre il profilo.
  const isMobile = useIsMobile();
  const schedaSoloDesktop = tabParam === "calendari" || tabParam === "email";
  // Gli avvisi si regolano in un posto solo. Nell'ufficio è la pagina Impostazioni → Notifiche, a qualunque
  // larghezza (prima il profilo ne aveva una copia con ventitré interruttori, quindici dei quali non facevano
  // niente): la scheda qui non c'è e un vecchio indirizzo `?tab=notifiche` rimanda lì. Nel campo (operai e
  // subappaltatori, /campo/impostazioni) e nel team della piattaforma (/admin) non c'è una pagina Notifiche:
  // la scheda resta, con lo stesso componente della pagina.
  const { pathname } = useLocation();
  const inUfficio = pathname.startsWith("/azienda");
  const nelCampo = pathname.startsWith("/campo");
  const schedaNotifiche = !inUfficio;
  const notificheAltrove = inUfficio && tabParam === "notifiche";
  const navigate = useNavigate();
  useEffect(() => {
    if (notificheAltrove) navigate("/azienda/impostazioni/notifiche", { replace: true });
  }, [notificheAltrove, navigate]);
  const activeTab: ProfileTab =
    isProfileTab(tabParam) && !(isMobile && schedaSoloDesktop) && !notificheAltrove && (schedaNotifiche || tabParam !== "notifiche")
      ? tabParam
      : "profilo";
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
    if (file.size > 2 * 1024 * 1024) { toast.error("La foto può pesare al massimo 2 MB."); return; }
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
    } catch (err: unknown) {
      toast.error("Foto non caricata", { description: motivoDelRifiuto(err, "Riprova tra qualche secondo.") });
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
      toast.error("Impossibile rimuovere la foto", { description: motivoDelRifiuto(err, "Riprova tra qualche secondo.") });
    } finally {
      setIsRemovingAvatar(false);
    }
  };

  // ── Save profile ──
  const updateProfile = useMutation({
    mutationFn: async () => {
      if (!firstName.trim() || !lastName.trim()) throw new MessaggioPerUtente("Scrivi nome e cognome.");
      const { error } = await supabase.from("profiles")
        .update({ first_name: firstName.trim(), last_name: lastName.trim(), phone: phone.trim() || null })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      queryClient.invalidateQueries({ queryKey: ["chat-profiles"] });
      refreshAuth();
      toast.success("Profilo salvato");
    },
    onError: (err: unknown) => toast.error("Profilo non salvato", { description: motivoDelRifiuto(err, "Riprova tra qualche secondo.") }),
  });
  // Nome, cognome e telefono scritti e non salvati: chi esce o ricarica deve poterci ripensare.
  useSettingsDraftGuard(profileDirty || updateProfile.isPending);

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
    if (newPw.length < 8) { toast.error("La password deve avere almeno 8 caratteri."); return; }
    if (newPw !== confirmPw) { toast.error("Le due password non coincidono."); return; }
    setChangingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;
      // Scelta da lui: se aveva una password provvisoria, non va più cambiata.
      const { error: erroreObbligo } = await supabase.rpc("staff_update_own_password_flag", { _must_change: false });
      if (erroreObbligo) logger.error("[password] obbligo di cambio non tolto:", erroreObbligo);
      setNewPw(""); setConfirmPw("");
      toast.success("Password aggiornata");
    } catch (err: any) {
      toast.error(motivoPasswordRifiutata(err), { duration: 10000 });
    } finally { setChangingPw(false); }
  };

  // ── Calendar connections ──
  const { data: googleConn } = useQuery({
    queryKey: ["google-calendar-connection", companyId, user?.id],
    enabled: !!companyId && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("google_calendar_connections").select("id, company_id, user_id, google_account_email, google_sub, token_expires_at, status, last_sync_at, last_error, created_at, updated_at, webhook_channel_id, webhook_resource_id, webhook_expiry_at, last_webhook_processed_at, last_sync_source")
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
      toast.error("Collegamento con Google non riuscito", { description: motivoDelRifiuto(err, "Riprova tra qualche secondo.") });
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

  // Passa dalla stessa funzione della scheda Impostazioni → Calendari: revoca
  // il token su Google, toglie canale push, slot occupati ed eventi mappati e
  // sgancia il calendario personale. Prima qui si cancellavano solo due righe
  // (errori ignorati): Google continuava a mandare notifiche e il calendario
  // restava agganciato a una connessione che non c'era più.
  const disconnectGoogle = async () => {
    if (!companyId || !user?.id) return;
    const res = await supabase.functions.invoke("google-calendar-auth", {
      body: { action: "disconnect", companyId },
    });
    if (res.error) {
      toast.error("Scollegamento non riuscito", { description: motivoDelRifiuto(res.error, "Riprova tra qualche secondo.") });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["google-calendar-connection"] });
    queryClient.invalidateQueries({ queryKey: ["google-calendar-settings"] });
    toast.success("Google Calendar scollegato");
  };

  const [syncing, setSyncing] = useState(false);
  // Finestra delle preferenze del calendario (verso degli appuntamenti, importazione degli eventi di Google).
  const [syncPrefsOpen, setSyncPrefsOpen] = useState(false);
  const updateGoogleSettings = useMutation({
    // La direzione vive nelle preferenze utente (e' quella che legge la sync);
    // su google_calendar_settings resta il riflesso a due valori, che le schede
    // continuano a mostrare. Prima si salvava solo il riflesso, e la direzione
    // scelta nella scheda utente non contava nulla.
    mutationFn: async (updates: Record<string, unknown>) => {
      if (!effectiveCompany?.id || !user?.id) throw new MessaggioPerUtente("Non trovo l'azienda attiva: ricarica la pagina.");
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
    onError: (e: unknown) => toast.error("Preferenze non salvate", { description: motivoDelRifiuto(e, "Riprova tra qualche secondo.") }),
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
      if (res.error) throw new Error(res.error.message || "Aggiornamento non riuscito");
      const result = res.data as { synced?: number; skipped?: number } | null;
      const synced = result?.synced ?? 0;
      toast.success("Calendario aggiornato", {
        description: synced > 0
          ? `${synced} appuntamenti dal tuo Google Calendar importati.`
          : "Nessun nuovo appuntamento trovato nelle prossime 4 settimane.",
      });
      queryClient.invalidateQueries({ queryKey: ["google-calendar-connection"] });
      queryClient.invalidateQueries({ queryKey: ["gcal-busy-slots"] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Calendario non aggiornato", {
        description: msg.includes("token") || msg.includes("auth")
          ? "Sembra che il collegamento sia scaduto. Scollega e ricollega Google Calendar."
          : motivoDelRifiuto(err, "Riprova tra qualche secondo."),
      });
    } finally { setSyncing(false); }
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
      <div className="flex items-center gap-4 mb-6 sm:gap-5 max-sm:mb-3 max-sm:gap-3">
        <div className="relative group">
          <Avatar className="h-20 w-20 ring-4 ring-primary/10 max-sm:h-14 max-sm:w-14 max-sm:ring-2">
            <AvatarImage src={avatarUrl ?? undefined} />
            <AvatarFallback className="text-2xl bg-primary/10 text-primary font-bold">
              {initials || <User className="h-8 w-8" />}
            </AvatarFallback>
          </Avatar>
          {/* Il cerchietto resta piccolo; l'area di tocco la allarga il ::after fino a 44 px. */}
          <button
            type="button"
            aria-label="Cambia foto"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="tap-compact absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary text-white flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors after:absolute after:-inset-2 after:content-[''] max-sm:h-6 max-sm:w-6 max-sm:after:-inset-2.5"
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
          <h2 className="text-lg font-semibold max-sm:text-base max-sm:leading-tight">{firstName} {lastName}</h2>
          <p className="text-sm text-muted-foreground max-sm:text-xs">{user?.email}</p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="text-[10px] h-5">
              {ROLE_LABELS[role ?? ""] ?? role}
            </Badge>
            {profile?.avatar_url && (
              <button
                type="button"
                onClick={removeAvatar}
                disabled={isRemovingAvatar}
                className="tap-compact text-xs text-destructive hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
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
        {/* Mobile: le schede visibili riempiono la riga. Calendari ed Email si collegano dal computer (sotto i
            768 px sono nascoste, come il contenuto); Notifiche c'è solo fuori dall'ufficio (campo e team della
            piattaforma), dove non esiste la pagina Notifiche. */}
        <div className="relative mb-6 max-sm:mb-3">
          <div className="-mx-1 overflow-x-auto overscroll-x-contain px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-sm:mx-0 max-sm:px-0">
            <TabsList className={`inline-flex h-auto min-w-max w-max justify-start gap-0.5 sm:gap-1 bg-muted/50 p-1 max-sm:grid max-sm:w-full max-sm:min-w-0 ${schedaNotifiche ? "max-sm:grid-cols-3" : "max-sm:grid-cols-2"}`}>
              <TabsTrigger value="profilo" className="h-9 shrink-0 gap-1 sm:gap-1.5 whitespace-nowrap px-2 sm:px-3 text-xs sm:text-sm">
                <User className="h-3.5 w-3.5" /> Profilo
              </TabsTrigger>
              <TabsTrigger value="sicurezza" className="h-9 shrink-0 gap-1 sm:gap-1.5 whitespace-nowrap px-2 sm:px-3 text-xs sm:text-sm">
                <Shield className="h-3.5 w-3.5" /> Sicurezza
              </TabsTrigger>
              <TabsTrigger value="calendari" className="h-9 shrink-0 gap-1 sm:gap-1.5 whitespace-nowrap px-2 sm:px-3 text-xs sm:text-sm max-md:hidden">
                <CalendarDays className="h-3.5 w-3.5" /> Calendari
              </TabsTrigger>
              <TabsTrigger value="email" className="h-9 shrink-0 gap-1 sm:gap-1.5 whitespace-nowrap px-2 sm:px-3 text-xs sm:text-sm max-md:hidden">
                <Mail className="h-3.5 w-3.5" /> Email
              </TabsTrigger>
              {schedaNotifiche && (
                <TabsTrigger value="notifiche" className="h-9 shrink-0 gap-1 sm:gap-1.5 whitespace-nowrap px-2 sm:px-3 text-xs sm:text-sm">
                  <Bell className="h-3.5 w-3.5" /> Notifiche
                </TabsTrigger>
              )}
            </TabsList>
          </div>

        </div>

        {/* ════════════ TAB PROFILO ════════════ */}
        {/* v8.6.37 — Grid 2 colonne su lg+: dati personali (2/3) + cronologia (1/3).
            Riempie meglio lo spazio della pagina che era troppo vuoto a destra. */}
        <TabsContent value="profilo" className="mt-0">
          <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader className="pb-3 max-sm:p-4 max-sm:pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" /> Dati personali
              </CardTitle>
              <CardDescription className="max-sm:hidden">Le informazioni che vengono mostrate nella chat, calendario e nel team.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-sm:space-y-3 max-sm:p-4 max-sm:pt-0">
              <div className="grid gap-4 sm:grid-cols-2 max-sm:grid-cols-2 max-sm:gap-3">
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
                  Salva modifiche
                </Button>
              </div>
              {/* v8.6.39 M7 — nota separata in fondo: info su modifica email
                  che prima era sotto l'input email duplicato. */}
              <p className="text-xs text-muted-foreground border-t pt-3 max-sm:hidden">
                {role === "super_admin"
                  ? "L'email di accesso del super admin si gestisce dal pannello Supabase (Auth → Users)."
                  : "Per modificare l'email contatta l'amministratore della tua azienda."}
              </p>
            </CardContent>
          </Card>
          </div>

          {/* Colonna laterale: cronologia account (mobile no: dato d'archivio) */}
          <div className="space-y-5 max-sm:hidden">
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
                <Lock className="h-4 w-4" /> Cambia password
              </CardTitle>
              <CardDescription className="max-sm:hidden">Scegli una password sicura con almeno 8 caratteri.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-pw">Nuova password</Label>
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
                <Label htmlFor="confirm-pw">Conferma password</Label>
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
                  Aggiorna password
                </Button>
              </div>
            </CardContent>
          </Card>

          <TwoFactorSetup />

          {/* v8.6.36 — Card "Privacy" pulita: rimosso duplicato date
              account (già nella tab Profilo). Focus su GDPR + sicurezza.
              Mobile no: è un testo informativo, non un'azione. */}
          <Card className="max-sm:hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" /> Privacy e dati personali
              </CardTitle>
              <CardDescription>Esercita i tuoi diritti GDPR sui dati conservati dalla piattaforma.</CardDescription>
            </CardHeader>
            <CardContent>
              {/* v8.6.36 — Card 'Privacy' pulita: rimosso duplicato date account (già nella tab Profilo) */}
              <div className="rounded-md border border-muted bg-muted/30 p-3 text-sm text-muted-foreground">
                <p>
                  Per richiedere la <strong>cancellazione</strong> del tuo account o l'<strong>esportazione</strong> dei tuoi dati
                  personali (Regolamento UE 2016/679, art. 15-17), contatta l'amministratore della tua azienda
                  o scrivi a <a href={`mailto:${EMAIL_PRIVACY}`} className="text-primary hover:underline">{EMAIL_PRIVACY}</a>.
                </p>
              </div>
            </CardContent>
          </Card>
          {canManageCompanySecurity && (
            // Mobile no: le regole di sicurezza dell'azienda si impostano al computer.
            <div className="lg:col-span-2 max-sm:hidden">
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
                              (l'indirizzo email non è stato salvato bene: scollega e ricollega il calendario)
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
                            Ultimo aggiornamento: {format(new Date(googleConn.last_sync_at), "d MMM yyyy, HH:mm", { locale: it })}
                          </p>
                        ) : (
                          <p className={`text-xs mt-1 italic ${
                            isHealthy ? "text-green-600/70" : "text-amber-600/70"
                          }`}>
                            Mai aggiornato: premi «Aggiorna ora» per la prima importazione.
                          </p>
                        )}
                      </div>
                    );
                  })()}
                  {googleSettings && (
                    <div className="text-sm space-y-1">
                      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Come funziona il collegamento</p>
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Calendario: <strong>{nomeCalendarioScelto}</strong></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Modalità: <strong>{etichettaDirezione(direzioneCalendario)}</strong></span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span>Per ora i colleghi dell'azienda vedono il titolo degli eventi di Google nel calendario.</span>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={syncGoogle} disabled={syncing} className="gap-2">
                      {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Aggiorna ora
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setSyncPrefsOpen(true)} className="gap-2">
                      <Settings2 className="h-3.5 w-3.5" />
                      Preferenze del calendario
                    </Button>
                    <Button size="sm" variant="ghost" onClick={disconnectGoogle} className="gap-2 text-destructive hover:text-destructive">
                      <Unlink className="h-3.5 w-3.5" /> Scollega
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

          {/* Preferenze del collegamento con Google Calendar: verso degli appuntamenti e importazione degli eventi. */}
          <GoogleCalendarSyncPrefsDialog
            open={syncPrefsOpen}
            onOpenChange={setSyncPrefsOpen}
            syncMode={googleSettings?.sync_mode || "one_way"}
            direzione={direzioneCalendario}
            importGoogleEvents={Boolean((googleSettings as { import_google_events_to_crm?: boolean } | null | undefined)?.import_google_events_to_crm)}
            allowTwoWay={true}
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

        {/* ════════════ TAB NOTIFICHE (campo e team della piattaforma) ════════════ */}
        {/* Lo stesso componente della pagina Impostazioni → Notifiche. Nel campo la riga «Su questo dispositivo»
            sta già in cima alla pagina (CampoImpostazioni): qui non si ripete. */}
        {schedaNotifiche && (
          <TabsContent value="notifiche" className="mt-0">
            <AvvisiPerEvento conDispositivo={!nelCampo} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
