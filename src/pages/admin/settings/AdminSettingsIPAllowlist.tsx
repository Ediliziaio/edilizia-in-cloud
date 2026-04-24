import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  Plus, Trash2, Shield, Loader2, AlertTriangle, Crosshair, CheckCircle2,
  ShieldAlert, Globe,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface IpAllowlistRow {
  id: string;
  ip_address: string;
  label: string | null;
  created_at: string;
  created_by: string;
}

/**
 * Valida IP v4/v4-CIDR o v6/v6-CIDR.
 * Rispetto alla versione precedente: niente falsi positivi su numeri invalidi (>255).
 */
function validateIp(ip: string): { ok: boolean; kind?: "v4" | "v6" | "v4-cidr" | "v6-cidr"; error?: string } {
  const trimmed = ip.trim();
  if (!trimmed) return { ok: false, error: "IP richiesto" };

  // Split CIDR
  const [addr, cidr] = trimmed.split("/");
  const cidrNum = cidr !== undefined ? parseInt(cidr, 10) : undefined;

  // IPv4 check con range per octet
  const ipv4Match = addr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1, 5).map(Number);
    if (octets.some((o) => o > 255)) return { ok: false, error: "Octet IPv4 > 255" };
    if (cidrNum !== undefined) {
      if (isNaN(cidrNum) || cidrNum < 0 || cidrNum > 32) {
        return { ok: false, error: "CIDR IPv4 deve essere 0–32" };
      }
      return { ok: true, kind: "v4-cidr" };
    }
    return { ok: true, kind: "v4" };
  }

  // IPv6 semplificato (gruppi esadecimali + eventuale CIDR 0-128)
  const ipv6Re = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  if (ipv6Re.test(addr)) {
    if (cidrNum !== undefined) {
      if (isNaN(cidrNum) || cidrNum < 0 || cidrNum > 128) {
        return { ok: false, error: "CIDR IPv6 deve essere 0–128" };
      }
      return { ok: true, kind: "v6-cidr" };
    }
    return { ok: true, kind: "v6" };
  }

  return { ok: false, error: "Formato IP non valido" };
}

export default function AdminSettingsIPAllowlist() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newIp, setNewIp] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<IpAllowlistRow | null>(null);
  const [detectingIp, setDetectingIp] = useState(false);
  const [myIp, setMyIp] = useState<string | null>(null);

  const {
    data: allowlist = [], isLoading,
  } = useQuery<IpAllowlistRow[]>({
    queryKey: queryKeys.admin.ipAllowlist,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_ip_allowlist")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as IpAllowlistRow[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const validation = validateIp(newIp);
      if (!validation.ok) throw new Error(validation.error ?? "IP non valido");
      const { error } = await supabase.from("admin_ip_allowlist").insert({
        ip_address: newIp.trim(),
        label: newLabel.trim() || null,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("IP aggiunto alla whitelist");
      setNewIp("");
      setNewLabel("");
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.ipAllowlist });
    },
    onError: (e: Error) => {
      if (e.message?.toLowerCase().includes("duplicate")) {
        toast.error("Questo IP è già nella whitelist");
      } else {
        toast.error(e.message || "Errore nell'aggiunta dell'IP");
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("admin_ip_allowlist")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("IP rimosso dalla whitelist");
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.ipAllowlist });
    },
    onError: (e: Error) => toast.error(e.message || "Errore nella rimozione"),
  });

  const ipValidation = useMemo(() => validateIp(newIp), [newIp]);

  const detectMyIp = async () => {
    setDetectingIp(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await fetch("https://api.ipify.org?format=json", {
        signal: controller.signal,
      });
      const data = await res.json();
      if (data?.ip) {
        setNewIp(data.ip);
        setMyIp(data.ip);
        if (!newLabel.trim()) setNewLabel("Il mio IP");
        toast.success(`IP rilevato: ${data.ip}`);
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") {
        toast.error("Timeout rilevamento IP (8s)");
      } else {
        toast.error("Impossibile rilevare l'IP corrente");
      }
    } finally {
      clearTimeout(timeoutId);
      setDetectingIp(false);
    }
  };

  // FIX sicurezza: warning se l'utente sta per rimuovere l'ultimo IP che contiene
  // il suo IP corrente — rischio self-lockout.
  const myIpCoveredByRows = useMemo(() => {
    if (!myIp) return null;
    // Per semplicità: match esatto IP o IP in CIDR /32 uguale. CIDR check completo
    // richiederebbe parser subnet; qui diamo solo warning su exact match.
    const hits = allowlist.filter(
      (r) => r.ip_address === myIp || r.ip_address.startsWith(myIp + "/"),
    );
    return hits;
  }, [myIp, allowlist]);

  const isSelfLockRisk =
    deleteTarget &&
    myIpCoveredByRows !== null &&
    myIpCoveredByRows.some((r) => r.id === deleteTarget.id) &&
    myIpCoveredByRows.length === 1 &&
    allowlist.length > 1;

  // KPI
  const stats = useMemo(
    () => ({
      total: allowlist.length,
      v4: allowlist.filter((r) => /^\d+\.\d+\.\d+\.\d+(\/\d+)?$/.test(r.ip_address))
        .length,
      v6: allowlist.filter((r) => r.ip_address.includes(":")).length,
    }),
    [allowlist],
  );

  const protectionActive = allowlist.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">IP Allowlist</h1>
        <p className="text-muted-foreground">
          Limita l'accesso al pannello di amministrazione solo agli IP autorizzati
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <div
              className={cn(
                "rounded-lg p-2 shrink-0",
                protectionActive
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
              )}
            >
              {protectionActive ? (
                <ShieldAlert className="h-4 w-4" />
              ) : (
                <Globe className="h-4 w-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                Protezione
              </p>
              <p className="text-xl font-bold leading-tight mt-0.5">
                {protectionActive ? "Attiva" : "Disattivata"}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {protectionActive
                  ? "solo IP autorizzati"
                  : "tutti gli IP possono accedere"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <div className="rounded-lg p-2 shrink-0 bg-primary/10 text-primary">
              <Shield className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                IP autorizzati
              </p>
              <p className="text-xl font-bold leading-tight mt-0.5">{stats.total}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {stats.v4} IPv4 · {stats.v6} IPv6
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <div className="rounded-lg p-2 shrink-0 bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              <Crosshair className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                Il mio IP
              </p>
              <p className="text-sm font-mono font-bold leading-tight mt-0.5 truncate">
                {myIp ?? "—"}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {myIp
                  ? myIpCoveredByRows && myIpCoveredByRows.length > 0
                    ? "coperto dalla whitelist"
                    : "NON nella whitelist"
                  : "rileva per verificare"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Indirizzi IP Autorizzati
          </CardTitle>
          <CardDescription>
            {allowlist.length === 0
              ? "Nessuna restrizione attiva — tutti gli IP possono accedere al pannello admin"
              : `${allowlist.length} IP autorizzati. Solo questi IP potranno accedere al pannello admin.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {allowlist.length === 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                La whitelist IP è vuota. Aggiungi almeno un IP per abilitare la
                protezione. Quando la lista è vuota, tutti gli IP possono accedere.
                <strong className="block mt-1">
                  Importante: assicurati di aggiungere prima il TUO IP, altrimenti
                  perderai l'accesso.
                </strong>
              </AlertDescription>
            </Alert>
          )}

          {/* Warning se il mio IP non è coperto */}
          {allowlist.length > 0 &&
            myIp &&
            myIpCoveredByRows !== null &&
            myIpCoveredByRows.length === 0 && (
              <Alert variant="destructive">
                <ShieldAlert className="h-4 w-4" />
                <AlertDescription>
                  Il tuo IP <code className="font-mono">{myIp}</code> <strong>non è</strong>{" "}
                  nella whitelist. Aggiungilo ora — se ti disconnetti non potrai
                  più accedere.
                </AlertDescription>
              </Alert>
            )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (ipValidation.ok) addMutation.mutate();
            }}
            className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto] gap-3 items-end"
          >
            <div className="space-y-1">
              <Label>Indirizzo IP</Label>
              <Input
                value={newIp}
                onChange={(e) => setNewIp(e.target.value)}
                placeholder="192.168.1.1 o 10.0.0.0/24"
                className={cn(
                  newIp && !ipValidation.ok &&
                    "border-destructive focus-visible:ring-destructive",
                )}
              />
              {newIp && !ipValidation.ok && ipValidation.error && (
                <p className="text-xs text-destructive">{ipValidation.error}</p>
              )}
              {ipValidation.ok && ipValidation.kind && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3 inline mr-0.5" />
                  {ipValidation.kind.toUpperCase()}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Etichetta (opzionale)</Label>
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Ufficio principale"
              />
            </div>
            <Button
              type="submit"
              disabled={!ipValidation.ok || addMutation.isPending}
            >
              {addMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-1" />
              )}
              Aggiungi
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={detectMyIp}
              disabled={detectingIp}
            >
              {detectingIp ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Crosshair className="h-4 w-4 mr-1" />
              )}
              Il mio IP
            </Button>
          </form>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : allowlist.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IP</TableHead>
                  <TableHead>Etichetta</TableHead>
                  <TableHead>Aggiunto il</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {allowlist.map((item) => {
                  const isMyIp = myIp && (item.ip_address === myIp || item.ip_address.startsWith(myIp + "/"));
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono">
                            {item.ip_address}
                          </Badge>
                          {isMyIp && (
                            <Badge
                              variant="secondary"
                              className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            >
                              il mio IP
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.label || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(item.created_at), "dd/MM/yyyy HH:mm", {
                          locale: it,
                        })}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(item)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rimuovere IP dalla whitelist?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  Stai per rimuovere{" "}
                  <code className="font-mono">{deleteTarget.ip_address}</code>
                  {deleteTarget.label && (
                    <>
                      {" "}
                      <em>({deleteTarget.label})</em>
                    </>
                  )}
                  .
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {isSelfLockRisk && (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>
                <strong>Attenzione:</strong> questo è l'unico IP in whitelist che copre
                il tuo indirizzo attuale (<code className="font-mono">{myIp}</code>).
                Rimuovendolo <strong>perderai l'accesso</strong> al pannello admin.
              </AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground"
            >
              {isSelfLockRisk ? "Rimuovi comunque" : "Rimuovi"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
