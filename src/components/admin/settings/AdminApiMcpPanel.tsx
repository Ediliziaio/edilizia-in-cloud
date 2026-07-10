/**
 * API & MCP — pannello superadmin.
 *
 * Gestisce le chiavi API della piattaforma (tabella api_keys, mai in chiaro:
 * solo hash SHA-256 + prefisso) e spiega come collegare Claude Code / Claude
 * Desktop / qualsiasi client MCP al server nativo `platform-mcp`.
 * La chiave viene generata nel browser e mostrata UNA SOLA VOLTA.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  generateApiKey, hashApiKey, apiKeyPrefix,
  API_SCOPES, ALL_SCOPES_VALUE, MCP_ENDPOINT,
  claudeCodeCommand, claudeDesktopConfig, curlExample,
} from "@/lib/platformApi";
import {
  Bot, Copy, KeyRound, Plus, ShieldCheck, Trash2, Ban, RotateCcw, Terminal, Activity,
} from "lucide-react";
import { formatDate } from "@/lib/formatters";

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  company_id: string | null;
  scopes: string[] | null;
  is_active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

interface UsageRow {
  id: string;
  api_key_id: string | null;
  endpoint: string;
  status_code: number | null;
  response_time_ms: number | null;
  created_at: string;
}

function CopyButton({ text, label = "Copia" }: { text: string; label?: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        toast.success("Copiato negli appunti");
      }}
    >
      <Copy className="h-3.5 w-3.5" /> {label}
    </Button>
  );
}

function CodeBlock({ text }: { text: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">
      <code>{text}</code>
    </pre>
  );
}

export default function AdminApiMcpPanel() {
  const qc = useQueryClient();

  // ── Dati ──────────────────────────────────────────────────────────────────
  const keysQ = useQuery({
    queryKey: ["admin-api-keys"],
    queryFn: async (): Promise<ApiKeyRow[]> => {
      const { data, error } = await supabase
        .from("api_keys")
        .select("id, name, key_prefix, company_id, scopes, is_active, expires_at, last_used_at, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ApiKeyRow[];
    },
  });

  const companiesQ = useQuery({
    queryKey: ["admin-api-companies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const usageQ = useQuery({
    queryKey: ["admin-api-usage"],
    queryFn: async (): Promise<UsageRow[]> => {
      const { data, error } = await supabase
        .from("api_usage_log")
        .select("id, api_key_id, endpoint, status_code, response_time_ms, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as UsageRow[];
    },
  });

  const companyName = useMemo(() => {
    const map = new Map<string, string>();
    (companiesQ.data ?? []).forEach((c) => map.set(c.id, c.name));
    return map;
  }, [companiesQ.data]);

  const keyNameById = useMemo(() => {
    const map = new Map<string, string>();
    (keysQ.data ?? []).forEach((k) => map.set(k.id, k.name));
    return map;
  }, [keysQ.data]);

  // ── Creazione chiave ──────────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopeMode, setScopeMode] = useState<"all" | "custom">("all");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [ambito, setAmbito] = useState<string>("platform"); // "platform" | company uuid
  const [expiry, setExpiry] = useState<string>("never"); // never | 30 | 90 | 365
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setScopeMode("all");
    setSelectedScopes([]);
    setAmbito("platform");
    setExpiry("never");
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Dai un nome alla chiave (es. 'Claude di Florin')");
      const scopes = scopeMode === "all" ? [ALL_SCOPES_VALUE] : selectedScopes;
      if (scopes.length === 0) throw new Error("Seleziona almeno uno scope");
      const plainKey = generateApiKey();
      const keyHash = await hashApiKey(plainKey);
      const expiresAt = expiry === "never"
        ? null
        : new Date(Date.now() + Number(expiry) * 86_400_000).toISOString();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessione scaduta: accedi di nuovo");
      const { error } = await supabase.from("api_keys").insert({
        name: trimmed,
        key_hash: keyHash,
        key_prefix: apiKeyPrefix(plainKey),
        company_id: ambito === "platform" ? null : ambito,
        scopes,
        is_active: true,
        expires_at: expiresAt,
        created_by: user.id,
      });
      if (error) throw error;
      return plainKey;
    },
    onSuccess: (plainKey) => {
      qc.invalidateQueries({ queryKey: ["admin-api-keys"] });
      setCreateOpen(false);
      resetForm();
      setCreatedKey(plainKey);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const revokeMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("api_keys")
        .update({ is_active: active, revoked_at: active ? null : new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["admin-api-keys"] });
      toast.success(v.active ? "Chiave riattivata" : "Chiave revocata: smette di funzionare subito");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("api_keys").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-api-keys"] });
      toast.success("Chiave eliminata definitivamente");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const activeCount = (keysQ.data ?? []).filter((k) => k.is_active).length;

  return (
    <div className="space-y-6">
      {/* ── Intro / endpoint ─────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-2xl lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4 text-primary" /> Server MCP della piattaforma
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Collega Claude (o qualsiasi client MCP) direttamente a Edilizia in Cloud: crea contatti,
              opportunità, attività, invia email e leggi commesse e statistiche — con chiavi emesse e
              revocate da qui, senza token esterni.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded-md border bg-muted/40 px-2 py-1 text-xs">{MCP_ENDPOINT}</code>
              <CopyButton text={MCP_ENDPOINT} label="Copia endpoint" />
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="flex h-full flex-col justify-center gap-1 p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Chiavi attive</p>
            <p className="text-3xl font-bold tabular-nums">{keysQ.isLoading ? "…" : activeCount}</p>
            <p className="text-[11px] text-muted-foreground">
              La chiave in chiaro non è mai salvata: solo hash SHA-256.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Chiavi ───────────────────────────────────────────────────────── */}
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4" /> Chiavi API
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Piattaforma = tutte le aziende (da super admin). Azienda = limitata a quella sola.
            </p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Nuova chiave
          </Button>
        </CardHeader>
        <CardContent>
          {keysQ.isLoading ? (
            <Skeleton className="h-32 w-full rounded-xl" />
          ) : (keysQ.data ?? []).length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nessuna chiave ancora. Creane una per collegare Claude alla piattaforma.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Nome</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Prefisso</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Ambito</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Permessi</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Ultimo uso</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Stato</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {(keysQ.data ?? []).map((k) => (
                    <tr key={k.id} className="border-t">
                      <td className="px-3 py-2 font-medium">{k.name}</td>
                      <td className="px-3 py-2"><code className="text-xs">{k.key_prefix}…</code></td>
                      <td className="px-3 py-2">
                        {k.company_id
                          ? <Badge variant="outline">{companyName.get(k.company_id) ?? "Azienda"}</Badge>
                          : <Badge className="bg-primary/10 text-primary hover:bg-primary/10">Piattaforma</Badge>}
                      </td>
                      <td className="max-w-[220px] px-3 py-2">
                        {(k.scopes ?? []).includes(ALL_SCOPES_VALUE)
                          ? <Badge variant="secondary">Tutti</Badge>
                          : <span className="text-xs text-muted-foreground">{(k.scopes ?? []).join(", ") || "—"}</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {k.last_used_at ? formatDate(k.last_used_at) : "mai"}
                      </td>
                      <td className="px-3 py-2">
                        {k.is_active
                          ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Attiva</Badge>
                          : <Badge variant="outline" className="text-muted-foreground">Revocata</Badge>}
                        {k.expires_at && (
                          <span className="ml-1 text-[10px] text-muted-foreground">scade {formatDate(k.expires_at)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost" size="sm" className="h-7 gap-1 text-xs"
                            disabled={revokeMutation.isPending}
                            onClick={() => revokeMutation.mutate({ id: k.id, active: !k.is_active })}
                          >
                            {k.is_active
                              ? <><Ban className="h-3.5 w-3.5" /> Revoca</>
                              : <><RotateCcw className="h-3.5 w-3.5" /> Riattiva</>}
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            className="h-7 gap-1 text-xs text-rose-600 hover:text-rose-700"
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              if (window.confirm(`Eliminare definitivamente la chiave "${k.name}"? Chi la usa perderà l'accesso.`)) {
                                deleteMutation.mutate(k.id);
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Guida collegamento ───────────────────────────────────────────── */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Terminal className="h-4 w-4" /> Come collegare Claude
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Crea una chiave qui sopra, poi usa uno di questi metodi sostituendo <code>eic_live_…</code> con la tua chiave.
          </p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="code">
            <TabsList>
              <TabsTrigger value="code">Claude Code</TabsTrigger>
              <TabsTrigger value="desktop">Claude Desktop</TabsTrigger>
              <TabsTrigger value="curl">curl / altri</TabsTrigger>
            </TabsList>
            <TabsContent value="code" className="mt-3 space-y-2">
              <CodeBlock text={claudeCodeCommand("eic_live_LA_TUA_CHIAVE")} />
              <p className="text-xs text-muted-foreground">
                Da quel momento Claude Code vede i tool della piattaforma (crea contatti, opportunità, email…).
                Verifica con <code>/mcp</code> dentro Claude Code.
              </p>
            </TabsContent>
            <TabsContent value="desktop" className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                In Claude Desktop → Impostazioni → Sviluppatore → <em>Modifica configurazione</em>, aggiungi:
              </p>
              <CodeBlock text={claudeDesktopConfig("eic_live_LA_TUA_CHIAVE")} />
            </TabsContent>
            <TabsContent value="curl" className="mt-3 space-y-2">
              <CodeBlock text={curlExample("eic_live_LA_TUA_CHIAVE")} />
              <p className="text-xs text-muted-foreground">
                Protocollo: MCP Streamable HTTP (JSON-RPC 2.0) — <code>initialize</code>, <code>tools/list</code>, <code>tools/call</code>.
                Funziona con qualsiasi client/agente MCP, non solo Claude.
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ── Log utilizzo ─────────────────────────────────────────────────── */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" /> Ultime chiamate
          </CardTitle>
        </CardHeader>
        <CardContent>
          {usageQ.isLoading ? (
            <Skeleton className="h-20 w-full rounded-xl" />
          ) : (usageQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Ancora nessuna chiamata registrata.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Quando</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Chiave</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Azione</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Esito</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">ms</th>
                  </tr>
                </thead>
                <tbody>
                  {(usageQ.data ?? []).map((u) => (
                    <tr key={u.id} className="border-t">
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">
                        {new Date(u.created_at).toLocaleString("it-IT")}
                      </td>
                      <td className="px-3 py-1.5 text-xs">{u.api_key_id ? keyNameById.get(u.api_key_id) ?? "—" : "—"}</td>
                      <td className="px-3 py-1.5"><code className="text-xs">{u.endpoint}</code></td>
                      <td className="px-3 py-1.5 text-right">
                        <Badge
                          variant="outline"
                          className={
                            (u.status_code ?? 0) < 300
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : (u.status_code ?? 0) === 429
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : "border-rose-200 bg-rose-50 text-rose-700"
                          }
                        >
                          {u.status_code ?? "—"}
                        </Badge>
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
                        {u.response_time_ms ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Dialog: crea chiave ──────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuova chiave API</DialogTitle>
            <DialogDescription>
              La chiave verrà mostrata una sola volta dopo la creazione.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                placeholder="es. Claude di Florin"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ambito</Label>
              <Select value={ambito} onValueChange={setAmbito}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="platform">🌐 Piattaforma — tutte le aziende</SelectItem>
                  {(companiesQ.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Permessi</Label>
              <Select value={scopeMode} onValueChange={(v) => setScopeMode(v as "all" | "custom")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i permessi</SelectItem>
                  <SelectItem value="custom">Personalizzati…</SelectItem>
                </SelectContent>
              </Select>
              {scopeMode === "custom" && (
                <div className="mt-2 grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
                  {API_SCOPES.map((s) => (
                    <label key={s.value} className="flex items-start gap-2 text-sm">
                      <Checkbox
                        checked={selectedScopes.includes(s.value)}
                        onCheckedChange={(checked) =>
                          setSelectedScopes((cur) =>
                            checked ? [...cur, s.value] : cur.filter((x) => x !== s.value),
                          )
                        }
                        className="mt-0.5"
                      />
                      <span>
                        {s.label}
                        <span className="block text-[11px] text-muted-foreground">{s.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Scadenza</Label>
              <Select value={expiry} onValueChange={setExpiry}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Mai</SelectItem>
                  <SelectItem value="30">30 giorni</SelectItem>
                  <SelectItem value="90">90 giorni</SelectItem>
                  <SelectItem value="365">1 anno</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Annulla</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="gap-1.5"
            >
              <ShieldCheck className="h-4 w-4" />
              {createMutation.isPending ? "Creazione…" : "Crea chiave"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: chiave creata (mostrata una sola volta) ──────────────── */}
      <Dialog open={!!createdKey} onOpenChange={(o) => { if (!o) setCreatedKey(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Chiave creata — copiala ORA</DialogTitle>
            <DialogDescription>
              Per sicurezza non è salvata da nessuna parte in chiaro: chiusa questa finestra, non potrà più essere mostrata.
            </DialogDescription>
          </DialogHeader>
          {createdKey && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs">{createdKey}</code>
                <CopyButton text={createdKey} label="Copia" />
              </div>
              <Tabs defaultValue="code">
                <TabsList>
                  <TabsTrigger value="code">Claude Code</TabsTrigger>
                  <TabsTrigger value="desktop">Claude Desktop</TabsTrigger>
                  <TabsTrigger value="curl">curl</TabsTrigger>
                </TabsList>
                <TabsContent value="code" className="mt-3 space-y-2">
                  <CodeBlock text={claudeCodeCommand(createdKey)} />
                  <CopyButton text={claudeCodeCommand(createdKey)} label="Copia comando" />
                </TabsContent>
                <TabsContent value="desktop" className="mt-3 space-y-2">
                  <CodeBlock text={claudeDesktopConfig(createdKey)} />
                  <CopyButton text={claudeDesktopConfig(createdKey)} label="Copia config" />
                </TabsContent>
                <TabsContent value="curl" className="mt-3 space-y-2">
                  <CodeBlock text={curlExample(createdKey)} />
                  <CopyButton text={curlExample(createdKey)} label="Copia comando" />
                </TabsContent>
              </Tabs>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCreatedKey(null)}>Ho copiato la chiave</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
