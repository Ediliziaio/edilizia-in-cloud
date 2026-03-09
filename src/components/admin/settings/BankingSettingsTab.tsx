import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Landmark, Eye, EyeOff, ExternalLink, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function BankingSettingsTab() {
  const [secretId, setSecretId] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [showId, setShowId] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [hasExistingId, setHasExistingId] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [editingId, setEditingId] = useState(false);
  const [editingKey, setEditingKey] = useState(false);

  // Companies with tesoreria
  const [companies, setCompanies] = useState<any[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);

  useEffect(() => {
    loadSettings();
    loadCompanies();
  }, []);

  async function loadSettings() {
    setLoading(true);
    const { data } = await supabase
      .from("platform_settings")
      .select("key, value")
      .in("key", ["bank_gocardless_secret_id", "bank_gocardless_secret_key", "bank_gocardless_enabled"]);

    for (const row of data || []) {
      if (row.key === "bank_gocardless_secret_id" && row.value) setHasExistingId(true);
      if (row.key === "bank_gocardless_secret_key" && row.value) setHasExistingKey(true);
      if (row.key === "bank_gocardless_enabled") setEnabled(row.value === "true");
    }
    setLoading(false);
  }

  async function loadCompanies() {
    setLoadingCompanies(true);
    const { data } = await supabase
      .from("companies")
      .select("id, name, tesoreria_enabled")
      .order("name");

    // For each company with tesoreria, get bank connections count
    const companiesWithStats = await Promise.all(
      (data || []).map(async (c) => {
        const { count } = await supabase
          .from("bank_connections")
          .select("id", { count: "exact", head: true })
          .eq("company_id", c.id)
          .eq("status", "active");
        return { ...c, active_connections: count || 0 };
      })
    );
    setCompanies(companiesWithStats);
    setLoadingCompanies(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const upserts: { key: string; value: string }[] = [
        { key: "bank_gocardless_enabled", value: String(enabled) },
      ];
      if (editingId || !hasExistingId) {
        upserts.push({ key: "bank_gocardless_secret_id", value: secretId });
      }
      if (editingKey || !hasExistingKey) {
        upserts.push({ key: "bank_gocardless_secret_key", value: secretKey });
      }

      for (const item of upserts) {
        const { error } = await supabase.from("platform_settings").upsert(
          { key: item.key, value: item.value, updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );
        if (error) throw error;
      }

      toast.success("Configurazione salvata");
      setHasExistingId(true);
      setHasExistingKey(true);
      setEditingId(false);
      setEditingKey(false);
      setSecretId("");
      setSecretKey("");
    } catch (e: any) {
      toast.error("Errore: " + e.message);
    }
    setSaving(false);
  }

  async function handleTest() {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("bank-test-connection");
      if (error) throw error;
      if (data?.success) {
        toast.success(data.message || "Connessione OK");
      } else {
        toast.error(data?.error || "Test fallito");
      }
    } catch (e: any) {
      toast.error("Errore: " + e.message);
    }
    setTesting(false);
  }

  async function toggleCompanyTesoreria(companyId: string, value: boolean) {
    const { error } = await supabase
      .from("companies")
      .update({ tesoreria_enabled: value } as any)
      .eq("id", companyId);
    if (error) {
      toast.error("Errore: " + error.message);
    } else {
      toast.success(value ? "Tesoreria abilitata" : "Tesoreria disabilitata");
      setCompanies((prev) =>
        prev.map((c) => (c.id === companyId ? { ...c, tesoreria_enabled: value } : c))
      );
    }
  }

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Landmark className="h-8 w-8 text-primary" />
              <div>
                <CardTitle>GoCardless Bank Account Data</CardTitle>
                <CardDescription>
                  Connetti banche europee tramite PSD2 Open Banking
                </CardDescription>
              </div>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline">Provider Open Banking</Badge>
              {hasExistingId && hasExistingKey ? (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Configurato
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <XCircle className="h-3 w-3 mr-1" /> Non configurato
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Registrati su{" "}
            <a
              href="https://bankaccountdata.gocardless.com/overview/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              bankaccountdata.gocardless.com <ExternalLink className="h-3 w-3" />
            </a>{" "}
            per ottenere le credenziali API.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>GoCardless Secret ID</Label>
              {hasExistingId && !editingId ? (
                <div className="flex gap-2">
                  <Input value="••••••••••••" disabled />
                  <Button variant="outline" size="sm" onClick={() => { setEditingId(true); setSecretId(""); }}>
                    Modifica
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    type={showId ? "text" : "password"}
                    value={secretId}
                    onChange={(e) => setSecretId(e.target.value)}
                    placeholder="Inserisci Secret ID"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0"
                    onClick={() => setShowId(!showId)}
                  >
                    {showId ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>GoCardless Secret Key</Label>
              {hasExistingKey && !editingKey ? (
                <div className="flex gap-2">
                  <Input value="••••••••••••" disabled />
                  <Button variant="outline" size="sm" onClick={() => { setEditingKey(true); setSecretKey(""); }}>
                    Modifica
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    type={showKey ? "text" : "password"}
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    placeholder="Inserisci Secret Key"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0"
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <Label>Abilita modulo Tesoreria sulla piattaforma</Label>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salva Configurazione
            </Button>
            <Button variant="outline" onClick={handleTest} disabled={testing}>
              {testing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Testa Connessione
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aziende con Tesoreria</CardTitle>
          <CardDescription>Abilita o disabilita la tesoreria per singola azienda</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingCompanies ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : companies.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nessuna azienda trovata</p>
          ) : (
            <div className="space-y-2">
              {companies.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2 px-3 rounded-lg border">
                  <div>
                    <p className="font-medium text-sm">{c.name}</p>
                    {c.tesoreria_enabled && (
                      <p className="text-xs text-muted-foreground">
                        {c.active_connections} connessioni attive
                      </p>
                    )}
                  </div>
                  <Switch
                    checked={c.tesoreria_enabled || false}
                    onCheckedChange={(val) => toggleCompanyTesoreria(c.id, val)}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
