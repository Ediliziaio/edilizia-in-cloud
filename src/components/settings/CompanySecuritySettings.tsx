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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
        .select("enforce_2fa, allowed_ips, password_expiry_days, max_failed_attempts")
        .eq("id", effectiveCompany!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveCompany?.id && isAdmin,
  });

  const [enforce2fa, setEnforce2fa] = useState(false);
  const [maxFailedAttempts, setMaxFailedAttempts] = useState(5);
  const [passwordExpiryDays, setPasswordExpiryDays] = useState(0);
  const [allowedIps, setAllowedIps] = useState("");

  useEffect(() => {
    if (company) {
      setEnforce2fa(company.enforce_2fa ?? false);
      setMaxFailedAttempts(company.max_failed_attempts ?? 5);
      setPasswordExpiryDays(company.password_expiry_days ?? 0);
      setAllowedIps((company.allowed_ips || []).join("\n"));
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
          max_failed_attempts: maxFailedAttempts,
          password_expiry_days: passwordExpiryDays,
          allowed_ips: ipList.length > 0 ? ipList : null,
        })
        .eq("id", effectiveCompany!);
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
          <CardDescription>Configura il numero massimo di tentativi di login prima del blocco.</CardDescription>
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
              Dopo {maxFailedAttempts} tentativi falliti, l'account verrà bloccato temporaneamente.
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
          <CardDescription>Obbliga tutti gli utenti a configurare la 2FA.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="enforce-2fa">2FA obbligatoria</Label>
              <p className="text-xs text-muted-foreground">Tutti gli utenti dovranno abilitare la 2FA al prossimo login.</p>
            </div>
            <Switch id="enforce-2fa" checked={enforce2fa} onCheckedChange={setEnforce2fa} />
          </div>
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

      <div className="flex justify-end">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salva Impostazioni
        </Button>
      </div>
    </div>
  );
}
