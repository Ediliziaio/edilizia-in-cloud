import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Shield, Loader2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

export default function AdminSettingsIPAllowlist() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newIp, setNewIp] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: allowlist = [], isLoading } = useQuery({
    queryKey: queryKeys.admin.ipAllowlist,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_ip_allowlist")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("admin_ip_allowlist")
        .insert({
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
    onError: (e: any) => {
      if (e.message?.includes("duplicate")) {
        toast.error("Questo IP è già nella whitelist");
      } else {
        toast.error("Errore nell'aggiunta dell'IP");
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
      setDeleteId(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.ipAllowlist });
    },
    onError: () => toast.error("Errore nella rimozione"),
  });

  const isValidIp = (ip: string) => {
    // IPv4 or CIDR
    const ipv4 = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    return ipv4.test(ip.trim());
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">IP Allowlist - Admin Panel</h1>
        <p className="text-sm text-muted-foreground">
          Limita l'accesso al pannello di amministrazione solo agli IP autorizzati
        </p>
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
            <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/20">
              <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
              <p className="text-sm text-yellow-700">
                La whitelist IP è vuota. Aggiungi almeno un IP per abilitare la protezione.
                Quando la lista è vuota, tutti gli IP possono accedere.
              </p>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (isValidIp(newIp)) addMutation.mutate();
            }}
            className="flex gap-3 items-end"
          >
            <div className="flex-1 space-y-1">
              <Label>Indirizzo IP</Label>
              <Input
                value={newIp}
                onChange={(e) => setNewIp(e.target.value)}
                placeholder="192.168.1.1 o 10.0.0.0/24"
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label>Etichetta (opzionale)</Label>
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Ufficio principale"
              />
            </div>
            <Button type="submit" disabled={!isValidIp(newIp) || addMutation.isPending}>
              {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Aggiungi
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
                {allowlist.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">{item.ip_address}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.label || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(item.created_at), "dd/MM/yyyy HH:mm", { locale: it })}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteId(item.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rimuovere IP dalla whitelist?</AlertDialogTitle>
            <AlertDialogDescription>
              L'IP non potrà più accedere al pannello admin se la whitelist contiene altri indirizzi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground"
            >
              Rimuovi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
