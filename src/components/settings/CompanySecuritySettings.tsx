import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Shield, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

export function CompanySecuritySettings() {
  const { effectiveCompany, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isAdmin = role === "company_admin" || role === "super_admin";

  const { data: company, isLoading } = useQuery({
    queryKey: ["company-security", effectiveCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("enforce_2fa, allowed_ips, password_expiry_days, max_failed_attempts, lockout_duration_minutes, enforce_2fa_roles, security_notifications, password_min_length, password_require_uppercase, password_require_numbers, password_require_special")
        .eq("id", effectiveCompany!.id)
        .single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!effectiveCompany?.id && isAdmin,
  });

  const [enforce2fa, setEnforce2fa] = useState(false);
  const [enforce2faRoles, setEnforce2faRoles] = useState<string[]>([]);
  const [maxFailedAttempts, setMaxFailedAttempts] = useState(5);
  const [lockoutDuration, setLockoutDuration] = useState("30");
  const [passwordExpiryDays, setPasswordExpiryDays] = useState(0);
  const [allowedIps, setAllowedIps] = useState("");
  const [notifications, setNotifications] = useState({
    login_unknown_ip: false,
    account_locked: false,
    admin_permission_change: false,
  });

  useEffect(() => {
    if (company) {
      setEnforce2fa(company.enforce_2fa ?? false);
      setEnforce2faRoles(company.enforce_2fa_roles ?? []);
      setMaxFailedAttempts(company.max_failed_attempts ?? 5);
      setLockoutDuration(String(company.lockout_duration_minutes ?? 30));
      setPasswordExpiryDays(company.password_expiry_days ?? 0);
      setAllowedIps((company.allowed_ips || []).join("\n"));
      setNotifications({
        login_unknown_ip: company.security_notifications?.login_unknown_ip ?? false,
        account_locked: company.security_notifications?.account_locked ?? false,
        admin_permission_change: company.security_notifications?.admin_permission_change ?? false,
      });
    }
  }, [company]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const ipList = allowedIps
        .split("\n")
        .map((ip) => ip.trim())
        .filter((ip) => ip.length > 0);

      const { error } = await supabase
        .from("companies")
        .update({
          enforce_2fa: enforce2fa,
          enforce_2fa_roles: enforce2faRoles.length > 0 ? enforce2faRoles : null,
          max_failed_attempts: maxFailedAttempts,
          lockout_duration_minutes: Number(lockoutDuration),
          password_expiry_days: passwordExpiryDays,
          allowed_ips: ipList.length > 0 ? ipList : null,
          security_notifications: notifications,
        } as any)
        .eq("id", effectiveCompany!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-security"] });
      toast({ title: "Impostazioni salvate", description: "Le policy di sicurezza sono state aggiornate." });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile salvare le impostazioni.", variant: "destructive" });
    },
  });

  if (!isAdmin) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const PASSWORD_EXPIRY_OPTIONS = [
    { value: "0", label: "Mai" },
    { value: "30", label: "30 giorni" },
    { value: "60", label: "60 giorni" },
    { value: "90", label: "90 giorni" },
    { value: "180", label: "180 giorni" },
  ];

  const LOCKOUT_DURATION_OPTIONS = [
    { value: "15", label: "15 minuti" },
    { value: "30", label: "30 minuti" },
    { value: "60", label: "1 ora" },
    { value: "1440", label: "24 ore" },
    { value: "0", label: "Manuale (sblocco admin)" },
  ];

  const toggleNotification = (key: keyof typeof notifications) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggle2faRole = (role: string) => {
    setEnforce2faRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Shield className="h-5 w-5" /> Policy di Sicurezza Aziendale
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configura le regole di sicurezza applicate a tutti gli utenti della tua azienda.
        </p>
      </div>

      {/* Brute Force Protection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Protezione Brute Force</CardTitle>
          <CardDescription>Configura il numero massimo di tentativi di login e la durata del blocco.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm">Tentativi massimi login: {maxFailedAttempts}</Label>
            <Slider
              value={[maxFailedAttempts]}
              onValueChange={([v]) => setMaxFailedAttempts(v)}
              min={3}
              max={10}
              step={1}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Dopo {maxFailedAttempts} tentativi falliti, l'account verrà bloccato.
            </p>
          </div>
          <div>
            <Label className="text-sm">Durata blocco account</Label>
            <Select value={lockoutDuration} onValueChange={setLockoutDuration}>
              <SelectTrigger className="w-full mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCKOUT_DURATION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              {lockoutDuration === "0"
                ? "L'account resterà bloccato fino allo sblocco manuale da parte di un admin."
                : `L'account verrà sbloccato automaticamente dopo ${LOCKOUT_DURATION_OPTIONS.find(o => o.value === lockoutDuration)?.label}.`}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Password Policy */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Policy Password</CardTitle>
          <CardDescription>Definisci la scadenza delle password per tutti gli utenti.</CardDescription>
        </CardHeader>
        <CardContent>
          <div>
            <Label className="text-sm">Scadenza Password</Label>
            <Select value={String(passwordExpiryDays)} onValueChange={(v) => setPasswordExpiryDays(Number(v))}>
              <SelectTrigger className="w-full mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PASSWORD_EXPIRY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              {passwordExpiryDays > 0
                ? `Gli utenti dovranno cambiare la password ogni ${passwordExpiryDays} giorni.`
                : "Le password non scadono mai."}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 2FA */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Autenticazione a Due Fattori (2FA)</CardTitle>
          <CardDescription>Obbliga gli utenti a configurare la 2FA.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="enforce-2fa">2FA obbligatoria per tutti</Label>
              <p className="text-xs text-muted-foreground">Tutti gli utenti dovranno abilitare la 2FA al prossimo login.</p>
            </div>
            <Switch id="enforce-2fa" checked={enforce2fa} onCheckedChange={setEnforce2fa} />
          </div>
          {!enforce2fa && (
            <div className="border-t pt-3">
              <Label className="text-sm font-medium">Obbligatoria per ruoli specifici</Label>
              <p className="text-xs text-muted-foreground mb-2">Seleziona i ruoli per cui la 2FA è obbligatoria.</p>
              <div className="space-y-2">
                {[
                  { key: "company_admin", label: "Amministratori" },
                  { key: "company_staff", label: "Operatori" },
                  { key: "salesperson", label: "Venditori" },
                  { key: "call_center", label: "Call Center" },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={enforce2faRoles.includes(key)}
                      onCheckedChange={() => toggle2faRole(key)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* IP Allowlist */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">IP Allowlist</CardTitle>
          <CardDescription>Limita l'accesso solo a specifici indirizzi IP. Lascia vuoto per permettere tutti gli IP.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder={"192.168.1.0/24\n10.0.0.1\n2001:db8::1"}
            value={allowedIps}
            onChange={(e) => setAllowedIps(e.target.value)}
            rows={4}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1">Inserisci un indirizzo IP o CIDR per riga.</p>
        </CardContent>
      </Card>

      {/* Security Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notifiche Sicurezza</CardTitle>
          <CardDescription>Ricevi notifiche email per eventi di sicurezza critici.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { key: "login_unknown_ip" as const, label: "Login da IP sconosciuto", desc: "Notifica quando un utente accede da un nuovo indirizzo IP." },
            { key: "account_locked" as const, label: "Account bloccato", desc: "Notifica quando un account viene bloccato per troppi tentativi." },
            { key: "admin_permission_change" as const, label: "Modifica permessi admin", desc: "Notifica quando i permessi di un amministratore vengono modificati." },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <Label className="text-sm">{label}</Label>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <Switch checked={notifications[key]} onCheckedChange={() => toggleNotification(key)} />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salva Impostazioni
        </Button>
      </div>
    </div>
  );
}
