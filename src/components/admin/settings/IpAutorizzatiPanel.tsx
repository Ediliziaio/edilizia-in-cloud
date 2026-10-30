/**
 * IpAutorizzatiPanel — la lista degli IP autorizzati al pannello admin (tabella `admin_ip_allowlist`).
 *
 * ONESTÀ (30/10/2026): nessuna parte del sistema applica la lista. Nessuna edge function né funzione del
 * database legge `admin_ip_allowlist`: l'accesso NON viene filtrato per IP. Prima la pagina diceva
 * «Protezione attiva» e «perderai l'accesso»: falso. Ora lo dice in chiaro in alto, e la lista resta
 * solo un elenco pronto per quando il filtro verrà fatto.
 *
 * L'IP di chi guarda si chiede a api.ipify.org solo su clic («Il mio IP»), mai all'apertura.
 *
 * Usato dalla pagina /admin/impostazioni/ip-allowlist e dalla scheda «IP autorizzati» di Sicurezza.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Crosshair, CheckCircle2, Info } from "lucide-react";
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

export function IpAutorizzatiPanel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newIp, setNewIp] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<IpAllowlistRow | null>(null);
  const [detectingIp, setDetectingIp] = useState(false);
  const [myIp, setMyIp] = useState<string | null>(null);

  const { data: allowlist = [], isLoading } = useQuery<IpAllowlistRow[]>({
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
      toast.success("IP aggiunto alla lista");
      setNewIp("");
      setNewLabel("");
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.ipAllowlist });
    },
    onError: (e: Error) => {
      if (e.message?.toLowerCase().includes("duplicate")) {
        toast.error("Questo IP è già nella lista");
      } else {
        toast.error(e.message || "Non sono riuscito ad aggiungere l'IP");
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("admin_ip_allowlist").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("IP tolto dalla lista");
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.ipAllowlist });
    },
    onError: (e: Error) => toast.error(e.message || "Non sono riuscito a togliere l'IP"),
  });

  const ipValidation = useMemo(() => validateIp(newIp), [newIp]);

  // Solo su clic: chiede l'IP a un servizio esterno (api.ipify.org).
  const detectMyIp = async () => {
    setDetectingIp(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await fetch("https://api.ipify.org?format=json", { signal: controller.signal });
      const data = await res.json();
      if (data?.ip) {
        setNewIp(data.ip);
        setMyIp(data.ip);
        if (!newLabel.trim()) setNewLabel("Il mio IP");
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") {
        toast.error("Il servizio che legge l'IP non ha risposto in 8 secondi");
      } else {
        toast.error("Non riesco a leggere il tuo IP");
      }
    } finally {
      clearTimeout(timeoutId);
      setDetectingIp(false);
    }
  };

  return (
    <div className="space-y-4">
      <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <Info className="h-4 w-4" />
        <AlertTitle>La lista non è ancora applicata</AlertTitle>
        <AlertDescription>
          Oggi l'accesso non viene filtrato per IP: chiunque abbia le credenziali entra da qualsiasi indirizzo,
          anche se è fuori da questa lista. Puoi preparare l'elenco, ma non protegge niente finché il filtro non verrà fatto.
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="space-y-4 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (ipValidation.ok) addMutation.mutate();
            }}
            className="grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]"
          >
            <div className="space-y-1">
              <Label htmlFor="ip-nuovo">Indirizzo IP</Label>
              <Input
                id="ip-nuovo"
                value={newIp}
                onChange={(e) => setNewIp(e.target.value)}
                placeholder="192.168.1.1 o 10.0.0.0/24"
                className={cn(newIp && !ipValidation.ok && "border-destructive focus-visible:ring-destructive")}
              />
              {newIp && !ipValidation.ok && ipValidation.error && (
                <p className="text-xs text-destructive">{ipValidation.error}</p>
              )}
              {ipValidation.ok && ipValidation.kind && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="mr-0.5 inline h-3 w-3" />
                  {ipValidation.kind.toUpperCase()}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="ip-etichetta">Etichetta (facoltativa)</Label>
              <Input
                id="ip-etichetta"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Ufficio principale"
              />
            </div>
            <div className="flex gap-2 md:contents">
              <Button type="submit" className="flex-1 md:flex-none" disabled={!ipValidation.ok || addMutation.isPending}>
                {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
                Aggiungi
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={detectMyIp}
                disabled={detectingIp}
                title="Chiede il tuo IP a api.ipify.org e lo scrive nel campo"
              >
                {detectingIp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="mr-1 h-4 w-4" />}
                Il mio IP
              </Button>
            </div>
          </form>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : allowlist.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nessun IP nella lista.</p>
          ) : (
            <>
              {/* Telefono: righe compatte al posto della tabella. */}
              <ul className="divide-y rounded-md border sm:hidden">
                {allowlist.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-sm">{item.ip_address}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.label || "—"}</p>
                    </div>
                    <Button variant="ghost" size="icon" aria-label={`Togli ${item.ip_address}`} onClick={() => setDeleteTarget(item)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </li>
                ))}
              </ul>
              <Table className="max-sm:hidden">
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
                            <Badge variant="outline" className="font-mono">{item.ip_address}</Badge>
                            {isMyIp && <Badge variant="secondary" className="text-xs">il mio IP</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{item.label || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(item.created_at), "dd/MM/yyyy HH:mm", { locale: it })}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" aria-label={`Togli ${item.ip_address}`} onClick={() => setDeleteTarget(item)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Togliere l'IP dalla lista?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  Stai per togliere <code className="font-mono">{deleteTarget.ip_address}</code>
                  {deleteTarget.label && <> <em>({deleteTarget.label})</em></>}.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground"
            >
              Togli
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
