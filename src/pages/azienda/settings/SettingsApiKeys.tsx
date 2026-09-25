import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useApiKeys, useCreateApiKey, useRevokeApiKey, useRotateApiKey } from "@/hooks/useApiKeys";
import { API_SCOPE_GROUPS, ALL_SCOPE_IDS } from "@/types/apiKeys";
import type { ApiKey } from "@/types/apiKeys";
import type { ExpiryOption } from "@/lib/apiKeyUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, Key, Copy, CheckCircle2, Trash2, Clock, Loader2, AlertTriangle, Activity, Book, ShieldAlert,
  Search, RotateCcw, ShieldCheck,
} from "lucide-react";
import { formatRelativeTime, formatDate } from "@/lib/formatters";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ApiDocsTab } from "@/components/api/ApiDocsTab";
import { ApiUsageChart } from "@/components/api/ApiUsageChart";

const EXPIRY_OPTIONS: { value: ExpiryOption; label: string }[] = [
  { value: "never", label: "Non scade mai" },
  { value: "30d", label: "30 giorni" },
  { value: "90d", label: "90 giorni" },
  { value: "1y", label: "1 anno" },
];

// ---- CreateApiKeyDialog ----
function CreateApiKeyDialog({
  open,
  onOpenChange,
  companyId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
}) {
  const createMutation = useCreateApiKey(companyId);
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [expiry, setExpiry] = useState<ExpiryOption>("never");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const resetForm = () => {
    setStep(1);
    setName("");
    setSelectedScopes([]);
    setExpiry("never");
    setGeneratedKey(null);
    setCopied(false);
  };

  const handleClose = (v: boolean) => {
    if (!v) resetForm();
    onOpenChange(v);
  };

  const toggleScope = (scopeId: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scopeId) ? prev.filter((s) => s !== scopeId) : [...prev, scopeId]
    );
  };

  const toggleGroup = (groupScopeIds: string[], enable: boolean) => {
    setSelectedScopes((prev) => {
      const filtered = prev.filter((s) => !groupScopeIds.includes(s));
      return enable ? [...filtered, ...groupScopeIds] : filtered;
    });
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    const normalizedScopes = Array.from(new Set(selectedScopes)).filter((scope) => ALL_SCOPE_IDS.includes(scope));
    if (!trimmedName || normalizedScopes.length === 0) {
      toast.error("Inserisci nome e seleziona almeno uno scope.");
      return;
    }
    if (trimmedName.length < 3 || trimmedName.length > 80) {
      toast.error("Il nome della chiave deve contenere tra 3 e 80 caratteri.");
      return;
    }
    try {
      const key = await createMutation.mutateAsync({ name: trimmedName, scopes: normalizedScopes, expiryOption: expiry });
      setGeneratedKey(key);
      setStep(2);
    } catch (e) {
      toast.error("Impossibile creare la chiave API: " + (e as Error).message);
    }
  };

  const copyKey = async () => {
    if (!generatedKey) return;
    await navigator.clipboard.writeText(generatedKey);
    setCopied(true);
    toast.success("Chiave copiata negli appunti");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{step === 1 ? "Crea API Key" : "Chiave API creata"}</DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Configura nome, permessi e scadenza della nuova chiave."
              : "Copia la chiave ora — non sarà più visibile."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome chiave *</Label>
              <Input placeholder="Es. Integrazione ERP" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Scadenza</Label>
              <Select value={expiry} onValueChange={(v) => setExpiry(v as ExpiryOption)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Permessi (scopes) *</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const allSelected = ALL_SCOPE_IDS.every((s) => selectedScopes.includes(s));
                    setSelectedScopes(allSelected ? [] : [...ALL_SCOPE_IDS]);
                  }}
                >
                  {ALL_SCOPE_IDS.every((s) => selectedScopes.includes(s)) ? "Deseleziona tutti" : "Seleziona tutti"}
                </Button>
              </div>

              {API_SCOPE_GROUPS.map((group) => {
                const groupIds = group.scopes.map((s) => s.id);
                const selectedCount = groupIds.filter((id) => selectedScopes.includes(id)).length;
                const allGroupSelected = selectedCount === groupIds.length;

                return (
                  <div key={group.id} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={allGroupSelected}
                        onCheckedChange={(v) => toggleGroup(groupIds, !!v)}
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium">{group.label}</span>
                        <span className="text-xs text-muted-foreground ml-2">{group.description}</span>
                      </div>
                      {selectedCount > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {selectedCount}/{groupIds.length}
                        </Badge>
                      )}
                    </div>
                    <div className="ml-6 grid grid-cols-1 gap-1.5">
                      {group.scopes.map((scope) => (
                        <div key={scope.id} className="flex items-start gap-2">
                          <Checkbox
                            checked={selectedScopes.includes(scope.id)}
                            onCheckedChange={() => toggleScope(scope.id)}
                            className="mt-0.5"
                          />
                          <div>
                            <span className="text-sm">{scope.label}</span>
                            <p className="text-xs text-muted-foreground">{scope.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Salva questa chiave adesso. Per sicurezza non viene mai memorizzata
                in chiaro — non potrai più vederla dopo aver chiuso questa finestra.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label>Chiave API</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-muted p-3 rounded-lg font-mono break-all select-all">
                  {generatedKey}
                </code>
                <Button size="icon" variant="outline" onClick={copyKey}>
                  {copied ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-sm font-medium">Riepilogo</p>
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nome:</span>
                  <span className="font-medium">{name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Scadenza:</span>
                  <span>{expiry === "never" ? "Mai" : EXPIRY_OPTIONS.find((o) => o.value === expiry)?.label}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Permessi:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedScopes.map((s) => (
                      <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 1 ? (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>Annulla</Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Crea chiave
              </Button>
            </>
          ) : (
            <Button onClick={() => handleClose(false)} className="w-full">
              Ho salvato la chiave — Chiudi
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- ScopeBadges ----
function ScopeBadges({ scopes }: { scopes: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {scopes.slice(0, 4).map((s) => (
        <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
      ))}
      {scopes.length > 4 && (
        <Badge variant="outline" className="text-xs">+{scopes.length - 4}</Badge>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  description,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number | string;
  description: string;
  icon: typeof Key;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    default: "border-l-primary text-primary",
    success: "border-l-emerald-500 text-emerald-600",
    warning: "border-l-amber-500 text-amber-600",
    danger: "border-l-destructive text-destructive",
  }[tone];

  return (
    <Card className={cn("border-l-4", toneClass)}>
      <CardContent className="p-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Icon className={cn("h-5 w-5", toneClass.split(" ").at(-1))} />
      </CardContent>
    </Card>
  );
}

// ---- PAGINA PRINCIPALE ----
export default function SettingsApiKeys() {
  const { effectiveCompany, role } = useAuth();
  const companyId = effectiveCompany?.id as string;
  const revokeMutation = useRevokeApiKey(companyId);
  const rotateMutation = useRotateApiKey(companyId);
  const { data: apiKeys = [], isLoading } = useApiKeys(companyId);
  const [formOpen, setFormOpen] = useState(false);
  const [revokedOpen, setRevokedOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "unused" | "expired">("all");
  const [rotatedKey, setRotatedKey] = useState<{ rawKey: string; name: string } | null>(null);
  const [rotatedCopied, setRotatedCopied] = useState(false);
  const permissions = usePermissions();
  // 13/7/2026: vale anche il permesso "Integrazioni & Canali" (Modifica), non solo il ruolo admin
  const canManageApiKeys = role === "company_admin" || role === "super_admin" || permissions.canEditSettingsIntegrations;

  const activeKeys = apiKeys.filter((k) => k.is_active && !k.revoked_at);
  const revokedKeys = apiKeys.filter((k) => !k.is_active || !!k.revoked_at);

  const isExpired = (key: typeof apiKeys[0]) =>
    key.expires_at ? new Date(key.expires_at) < new Date() : false;

  const filteredActiveKeys = activeKeys.filter((key) => {
    const matchesSearch = [key.name, key.key_prefix, ...(key.scopes ?? [])]
      .join(" ")
      .toLowerCase()
      .includes(searchTerm.trim().toLowerCase());
    const expired = isExpired(key);
    const unused = !key.last_used_at;
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && !expired && !unused) ||
      (statusFilter === "unused" && unused) ||
      (statusFilter === "expired" && expired);
    return matchesSearch && matchesStatus;
  });

  const expiredCount = activeKeys.filter((key) => isExpired(key)).length;
  const unusedCount = activeKeys.filter((key) => !key.last_used_at).length;

  const handleRevoke = async (keyId: string) => {
    if (!canManageApiKeys) {
      toast.error("Non hai i permessi per revocare chiavi API.");
      return;
    }
    try {
      await revokeMutation.mutateAsync(keyId);
      toast.success("Chiave revocata");
    } catch (e) {
      toast.error("Impossibile revocare: " + (e as Error).message);
    }
  };

  const handleRotate = async (key: ApiKey) => {
    if (!canManageApiKeys) {
      toast.error("Non hai i permessi per ruotare chiavi API.");
      return;
    }
    try {
      const result = await rotateMutation.mutateAsync(key);
      setRotatedKey(result);
      setRotatedCopied(false);
      toast.success("Chiave ruotata. Copia subito il nuovo secret.");
    } catch (e) {
      toast.error("Impossibile ruotare: " + (e as Error).message);
    }
  };

  const copyRotatedKey = async () => {
    if (!rotatedKey) return;
    await navigator.clipboard.writeText(rotatedKey.rawKey);
    setRotatedCopied(true);
    toast.success("Nuova chiave copiata negli appunti");
    setTimeout(() => setRotatedCopied(false), 2000);
  };

  return (
    <div className="space-y-5">
      {/* Header standardizzato */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Da 768 icona e titolo li mostra già la testata delle Impostazioni
              (erano due volte): resta la riga sotto, con numeri e azioni. */}
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 md:hidden">
            <Key className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight md:hidden">API Platform</h1>
            <p className="text-sm text-muted-foreground">
              {activeKeys.length} chiav{activeKeys.length === 1 ? "e attiva" : "i attive"}
              {revokedKeys.length > 0 && (
                <> · <span className="text-muted-foreground/60">{revokedKeys.length} revocat{revokedKeys.length === 1 ? "a" : "e"}</span></>
              )}
            </p>
          </div>
        </div>
        <Button onClick={() => setFormOpen(true)} className="gap-2 h-9" size="sm" disabled={!canManageApiKeys}>
          <Plus className="h-4 w-4" /> Nuova API Key
        </Button>
      </div>

      <Tabs defaultValue="keys" className="space-y-4">
        <TabsList>
          <TabsTrigger value="keys" className="gap-2"><Key className="h-4 w-4" /> Chiavi API</TabsTrigger>
          <TabsTrigger value="usage" className="gap-2"><Activity className="h-4 w-4" /> Utilizzo</TabsTrigger>
          <TabsTrigger value="docs" className="gap-2"><Book className="h-4 w-4" /> Documentazione</TabsTrigger>
        </TabsList>

        <TabsContent value="keys" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Attive" value={activeKeys.length} description="key utilizzabili ora" icon={Key} tone="success" />
            <StatCard label="Mai usate" value={unusedCount} description="da verificare o revocare" icon={Clock} tone={unusedCount > 0 ? "warning" : "default"} />
            <StatCard label="Scadute" value={expiredCount} description="da ruotare o revocare" icon={AlertTriangle} tone={expiredCount > 0 ? "danger" : "default"} />
            <StatCard label="Revocate" value={revokedKeys.length} description="storico accessi chiusi" icon={ShieldCheck} />
          </div>

          {/* Security info */}
          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>
              <p className="font-medium">Le chiavi API danno accesso ai dati della tua azienda.</p>
              <ul className="text-xs text-muted-foreground mt-1 list-disc list-inside space-y-0.5">
                <li>Non condividere mai una chiave in pubblico o inserirla nel codice sorgente.</li>
                <li>Usa variabili d'ambiente o un secret manager.</li>
                <li>Limite: 100 richieste/minuto per chiave.</li>
              </ul>
            </AlertDescription>
          </Alert>

          {!canManageApiKeys && (
            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>
                Puoi consultare le API key, ma solo un amministratore aziendale può crearle o revocarle.
              </AlertDescription>
            </Alert>
          )}

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Cerca per nome, prefisso o scope..."
                    className="pl-9"
                  />
                </div>
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti gli stati</SelectItem>
                    <SelectItem value="active">Usate e valide</SelectItem>
                    <SelectItem value="unused">Mai usate</SelectItem>
                    <SelectItem value="expired">Scadute</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Active keys */}
              {activeKeys.length === 0 ? (
                <Card>
                  <CardContent className="py-12">
                    <div className="flex flex-col items-center text-center gap-3">
                      <div className="p-3 rounded-full bg-muted">
                        <Key className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">Nessuna chiave attiva</p>
                        <p className="text-sm text-muted-foreground">Crea la tua prima API key per iniziare ad integrare.</p>
                      </div>
                      <Button onClick={() => setFormOpen(true)} className="gap-2" disabled={!canManageApiKeys}>
                        <Plus className="h-4 w-4" /> Crea API Key
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : filteredActiveKeys.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center">
                    <Search className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="font-medium">Nessuna chiave corrisponde ai filtri</p>
                    <p className="text-sm text-muted-foreground">Riduci ricerca o cambia stato selezionato.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {filteredActiveKeys.map((key) => {
                    const expired = isExpired(key);
                    const unused = !key.last_used_at;
                    return (
                      <Card
                        key={key.id}
                        className={cn(
                          "overflow-hidden border-l-4 transition-colors",
                          expired ? "border-l-red-500" : unused ? "border-l-amber-400" : "border-l-emerald-500"
                        )}
                      >
                        <CardContent className="py-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0 space-y-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-medium">{key.name}</p>
                                {expired ? (
                                  <Badge variant="destructive" className="text-xs gap-1">
                                    <AlertTriangle className="h-3 w-3" /> Scaduta
                                  </Badge>
                                ) : unused ? (
                                  <Badge variant="outline" className="text-xs gap-1 border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-950/30">
                                    Mai usata
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs gap-1 border-emerald-400 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30">
                                    <CheckCircle2 className="h-3 w-3" /> Attiva
                                  </Badge>
                                )}
                              </div>
                              <code className="text-xs text-muted-foreground font-mono block">
                                {key.key_prefix}{"•".repeat(44)}
                              </code>
                              <ScopeBadges scopes={key.scopes} />
                              <div className="flex items-center gap-x-4 gap-y-1 text-xs text-muted-foreground flex-wrap">
                                {key.last_used_at ? (
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    Usata {formatRelativeTime(key.last_used_at)}
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 text-amber-600">
                                    <Clock className="h-3 w-3" />
                                    Mai usata
                                  </span>
                                )}
                                {key.expires_at && (
                                  <span className={expired ? "text-destructive" : ""}>
                                    {expired ? "Scaduta il" : "Scade"}: {formatDate(key.expires_at)}
                                  </span>
                                )}
                                <span>Creata {formatRelativeTime(key.created_at)}</span>
                              </div>
                            </div>

                            <div className="flex shrink-0 flex-col sm:flex-row gap-2">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5"
                                  disabled={!canManageApiKeys || rotateMutation.isPending || expired}
                                >
                                  {rotateMutation.isPending && rotateMutation.variables?.id === key.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <RotateCcw className="h-3.5 w-3.5" />
                                  )}
                                  Ruota
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Ruotare la chiave API?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Verrà creata una nuova chiave con gli stessi scope e la chiave attuale <strong>{key.name}</strong> verrà revocata.
                                    Copia subito il nuovo secret dopo la conferma.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleRotate(key)} disabled={rotateMutation.isPending}>
                                    {rotateMutation.isPending ? "Rotazione..." : "Ruota chiave"}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 shrink-0"
                                  disabled={!canManageApiKeys || revokeMutation.isPending}
                                >
                                  {revokeMutation.isPending && revokeMutation.variables === key.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  )}
                                  Revoca
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Revocare la chiave?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    La chiave <strong>{key.name}</strong> ({key.key_prefix}...) cesserà immediatamente di funzionare.
                                    Questa azione è irreversibile.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleRevoke(key.id)}
                                    disabled={revokeMutation.isPending}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    {revokeMutation.isPending ? (
                                      <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Revoca in corso...
                                      </>
                                    ) : (
                                      "Sì, revoca"
                                    )}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              {/* Revoked keys */}
              {revokedKeys.length > 0 && (
                <div className="mt-6">
                  <button
                    onClick={() => setRevokedOpen(!revokedOpen)}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Chiavi revocate ({revokedKeys.length}) {revokedOpen ? "▾" : "▸"}
                  </button>
                  {revokedOpen && (
                    <div className="mt-2 space-y-2">
                      {revokedKeys.map((key) => (
                        <Card key={key.id} className="opacity-60">
                          <CardContent className="py-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium">{key.name}</p>
                                  <Badge variant="outline" className="text-xs">Revocata</Badge>
                                </div>
                                <code className="text-xs text-muted-foreground font-mono">{key.key_prefix}...</code>
                                {key.revoked_at && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Revocata {formatRelativeTime(key.revoked_at)}
                                  </p>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="usage">
          <ApiUsageChart keys={apiKeys} />
        </TabsContent>

        <TabsContent value="docs">
          <ApiDocsTab />
        </TabsContent>
      </Tabs>

      <CreateApiKeyDialog open={formOpen} onOpenChange={setFormOpen} companyId={companyId} />
      <Dialog open={!!rotatedKey} onOpenChange={(open) => !open && setRotatedKey(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuova API key generata</DialogTitle>
            <DialogDescription>
              Copia questa chiave ora. Dopo la chiusura non sarà più visibile.
            </DialogDescription>
          </DialogHeader>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>La vecchia chiave è stata revocata. Aggiorna subito l'integrazione esterna.</AlertDescription>
          </Alert>
          <div className="space-y-2">
            <Label>{rotatedKey?.name}</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted p-3 rounded-lg font-mono break-all select-all">
                {rotatedKey?.rawKey}
              </code>
              <Button size="icon" variant="outline" onClick={copyRotatedKey}>
                {rotatedCopied ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setRotatedKey(null)} className="w-full">Ho salvato la chiave — Chiudi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
