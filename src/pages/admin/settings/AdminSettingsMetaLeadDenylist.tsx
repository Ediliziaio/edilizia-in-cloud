import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { Plus, Trash2, Filter, Loader2, Ban, CheckCircle2, Info } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface DenylistRow {
  id: string;
  pattern: string;
  label: string | null;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
}

export default function AdminSettingsMetaLeadDenylist() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newPattern, setNewPattern] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DenylistRow | null>(null);

  // meta_lead_import_denylist è una tabella nuova non ancora nei tipi generati:
  // accesso via client non tipato, i risultati sono validati da DenylistRow.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  const { data: rows = [], isLoading } = useQuery<DenylistRow[]>({
    queryKey: queryKeys.admin.metaLeadDenylist,
    queryFn: async () => {
      const { data, error } = await sb
        .from("meta_lead_import_denylist")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DenylistRow[];
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.metaLeadDenylist });

  const addMutation = useMutation({
    mutationFn: async () => {
      const pattern = newPattern.trim().toLowerCase();
      if (!pattern) throw new Error("Pattern richiesto");
      if (pattern.length < 3) throw new Error("Pattern troppo corto (min 3 caratteri): rischi di escludere lead legittimi");
      const { error } = await sb.from("meta_lead_import_denylist").insert({
        pattern,
        label: newLabel.trim() || null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pattern aggiunto alla denylist");
      setNewPattern("");
      setNewLabel("");
      invalidate();
    },
    onError: (e: Error) => {
      if (e.message?.toLowerCase().includes("duplicate")) {
        toast.error("Questo pattern è già in denylist");
      } else {
        toast.error(e.message || "Errore nell'aggiunta");
      }
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await sb
        .from("meta_lead_import_denylist")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message || "Errore nell'aggiornamento"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("meta_lead_import_denylist")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pattern rimosso dalla denylist");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Errore nella rimozione"),
  });

  const stats = useMemo(
    () => ({ total: rows.length, active: rows.filter((r) => r.is_active).length }),
    [rows],
  );

  const canAdd = newPattern.trim().length >= 3;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Filtro Lead Meta</h1>
        <p className="text-muted-foreground">
          Campagne Facebook/Instagram Lead Ads da NON importare nel CRM (es. campagne di
          reclutamento venditori). Un lead è scartato se nome campagna, adset o annuncio
          contiene uno di questi pattern.
        </p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-start gap-3 p-4">
            <div className="shrink-0 rounded-lg bg-primary/10 p-2 text-primary">
              <Filter className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Pattern totali</p>
              <p className="mt-0.5 text-xl font-bold leading-tight">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-start gap-3 p-4">
            <div className="shrink-0 rounded-lg bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <Ban className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Attivi</p>
              <p className="mt-0.5 text-xl font-bold leading-tight">{stats.active}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">applicati all'import</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Pattern esclusi dall'import
          </CardTitle>
          <CardDescription>
            Il confronto è per sottostringa, senza distinzione maiuscole/minuscole. La modifica
            è attiva sui prossimi lead entro pochi minuti (webhook e recupero storico).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Usa parole chiave brevi e specifiche del reclutamento (es. <code>venditor</code>,{" "}
              <code>candidat</code>, <code>lavora con noi</code>). Evita pattern generici che
              potrebbero combaciare con campagne clienti reali.
            </AlertDescription>
          </Alert>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (canAdd) addMutation.mutate();
            }}
            className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_1fr_auto]"
          >
            <div className="space-y-1">
              <Label>Pattern (parola chiave)</Label>
              <Input
                value={newPattern}
                onChange={(e) => setNewPattern(e.target.value)}
                placeholder="es. venditor"
              />
            </div>
            <div className="space-y-1">
              <Label>Etichetta (opzionale)</Label>
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="es. Reclutamento venditori"
              />
            </div>
            <Button type="submit" disabled={!canAdd || addMutation.isPending}>
              {addMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-1 h-4 w-4" />
              )}
              Aggiungi
            </Button>
          </form>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pattern</TableHead>
                  <TableHead>Etichetta</TableHead>
                  <TableHead className="w-24">Attivo</TableHead>
                  <TableHead>Aggiunto il</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((item) => (
                  <TableRow key={item.id} className={item.is_active ? "" : "opacity-60"}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">{item.pattern}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{item.label || "—"}</TableCell>
                    <TableCell>
                      <Switch
                        checked={item.is_active}
                        onCheckedChange={(v) => toggleMutation.mutate({ id: item.id, is_active: v })}
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(item.created_at), "dd/MM/yyyy HH:mm", { locale: it })}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(item)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
              Nessun pattern. Con la lista vuota l'import applica comunque i pattern di reclutamento
              di default (fallback nel codice dell'edge).
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rimuovere il pattern dalla denylist?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  Stai per rimuovere <code className="font-mono">{deleteTarget.pattern}</code>
                  {deleteTarget.label && <> <em>({deleteTarget.label})</em></>}. I lead che lo
                  contengono torneranno a essere importati.
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
              Rimuovi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
