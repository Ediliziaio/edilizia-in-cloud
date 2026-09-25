/**
 * Tab Squadre della pagina Calendari lavori: la tabella, il dialog, e per ogni
 * squadra il collegamento al suo calendario Google.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, HardHat, FileText, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ExternalTeamDialog, type ExternalTeamFormData } from "@/components/employees/ExternalTeamDialog";
import { ExternalTeamAttachments } from "@/components/employees/ExternalTeamAttachments";
import { InternalTeamRosterDialog } from "@/components/employees/InternalTeamRosterDialog";
import type { ExternalTeam } from "@/types/employees";
import { SQUADRA_KIND_LABEL, STATO_SYNC_LABEL, statoSyncSquadra, type StatoSyncSquadra } from "@/types/squadre";
import {
  useCollegaCalendarioSquadra,
  useEliminaSquadra,
  useSalvaSquadra,
  useSquadre,
  useSubappaltatoriAzienda,
} from "@/hooks/useCalendariLavori";
import { GoogleCalendarPicker } from "./GoogleCalendarPicker";

const STATO_CLASSE: Record<StatoSyncSquadra, string> = {
  non_collegata: "bg-muted text-muted-foreground",
  disattivata: "bg-amber-100 text-amber-800",
  errore: "bg-red-100 text-red-800",
  attiva: "bg-emerald-100 text-emerald-800",
};

export function SquadreTab({ canManage }: { canManage: boolean }) {
  const { effectiveCompany } = useAuth();
  const { data: squadre = [], isLoading, isError, refetch } = useSquadre();
  const { data: subappaltatori = [] } = useSubappaltatoriAzienda();
  const salva = useSalvaSquadra();
  const elimina = useEliminaSquadra();
  const collega = useCollegaCalendarioSquadra();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [inModifica, setInModifica] = useState<ExternalTeam | null>(null);
  const [daEliminare, setDaEliminare] = useState<ExternalTeam | null>(null);
  const [allegatiDi, setAllegatiDi] = useState<ExternalTeam | null>(null);
  const [composizioneDi, setComposizioneDi] = useState<ExternalTeam | null>(null);

  // Utenti dell'azienda per il capocantiere delle squadre interne.
  const { data: utenti = [] } = useQuery({
    queryKey: ["calendari-lavori", "utenti", effectiveCompany?.id],
    enabled: !!effectiveCompany?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("company_id", effectiveCompany!.id)
        .order("last_name");
      if (error) throw error;
      return (data ?? []).map((p) => ({
        id: p.id as string,
        nome: [p.first_name, p.last_name].filter(Boolean).join(" ") || (p.email as string) || "Utente",
      }));
    },
  });

  const ordinate = useMemo(
    () => [...squadre].sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name)),
    [squadre],
  );

  const onSubmit = (data: ExternalTeamFormData) => {
    salva.mutate(
      { id: inModifica?.id, ...data, kind: data.kind ?? "esterna" },
      {
        onSuccess: () => {
          setDialogOpen(false);
          setInModifica(null);
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Squadre interne di dipendenti e ditte esterne. Il calendario Google è facoltativo.
        </p>
        <Button
          disabled={!canManage}
          onClick={() => {
            setInModifica(null);
            setDialogOpen(true);
          }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" /> Nuova squadra
        </Button>
      </div>

      {isError ? (
        <div role="alert" className="space-y-2 rounded-lg border p-4 text-sm">
          <p>Impossibile caricare le squadre. Nessun dato è stato modificato.</p>
          <Button variant="outline" onClick={() => void refetch()}>Riprova</Button>
        </div>
      ) : isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : ordinate.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <HardHat className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">Nessuna squadra</p>
            <p className="mb-4 text-sm text-muted-foreground">
              Crea la prima squadra di posa: poi la assegni sulle commesse.
            </p>
            <Button disabled={!canManage} onClick={() => setDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Nuova squadra
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Squadra</TableHead>
                <TableHead className="hidden sm:table-cell">Tipo</TableHead>
                <TableHead className="hidden md:table-cell">Accesso</TableHead>
                <TableHead>Calendario Google</TableHead>
                <TableHead>Sync</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordinate.map((s) => {
                const stato = statoSyncSquadra({
                  google_calendar_id: s.google_calendar_id ?? null,
                  google_sync_enabled: !!s.google_sync_enabled,
                  google_last_error: s.google_last_error ?? null,
                });
                const accesso = subappaltatori.find((x) => x.id === s.subappaltatore_id);
                return (
                  <TableRow key={s.id} className={s.is_active ? undefined : "opacity-60"}>
                    <TableCell>
                      <span className="flex items-center gap-2 font-medium">
                        <span
                          className="inline-block h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: s.color ?? "#94a3b8" }}
                        />
                        {s.name}
                        {!s.is_active && (
                          <Badge variant="outline" className="text-xs">
                            inattiva
                          </Badge>
                        )}
                      </span>
                      {s.kind === "interna" && <Button variant="link" size="sm" className="mt-1 h-auto px-0" onClick={() => setComposizioneDi(s)}>
                        <Users className="mr-1 h-3.5 w-3.5" /> Dipendenti della squadra
                      </Button>}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{SQUADRA_KIND_LABEL[s.kind ?? "esterna"]}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {accesso ? (accesso.user_email ?? accesso.ragione_sociale) : "—"}
                    </TableCell>
                    <TableCell>
                      <GoogleCalendarPicker
                        disabled={!canManage}
                        value={{
                          google_connection_id: s.google_connection_id ?? null,
                          google_calendar_id: s.google_calendar_id ?? null,
                        }}
                        onChange={(next) => collega.mutate({ id: s.id, ...next })}
                      />
                      {s.google_last_error && <p className="mt-1 text-xs text-red-700">{s.google_last_error}</p>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge className={STATO_CLASSE[stato]}>{STATO_SYNC_LABEL[stato]}</Badge>
                        {s.google_calendar_id && (
                          <Switch
                            checked={!!s.google_sync_enabled}
                            disabled={!canManage}
                            aria-label="Sincronizzazione attiva"
                            onCheckedChange={(on) =>
                              collega.mutate({
                                id: s.id,
                                google_connection_id: s.google_connection_id ?? null,
                                google_calendar_id: s.google_calendar_id ?? null,
                                google_sync_enabled: on,
                              })
                            }
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" aria-label="Documenti" onClick={() => setAllegatiDi(s)}>
                          <FileText className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={!canManage}
                          aria-label="Modifica"
                          onClick={() => {
                            setInModifica(s);
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={!canManage}
                          aria-label="Elimina"
                          onClick={() => setDaEliminare(s)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ExternalTeamDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) setInModifica(null);
        }}
        team={
          inModifica
            ? {
                id: inModifica.id,
                name: inModifica.name,
                contact_name: inModifica.contact_name,
                phone: inModifica.phone,
                email: inModifica.email,
                notes: inModifica.notes,
                is_active: inModifica.is_active,
                vat_rate: inModifica.vat_rate,
                kind: inModifica.kind ?? "esterna",
                subappaltatore_id: inModifica.subappaltatore_id ?? null,
                leader_user_id: inModifica.leader_user_id ?? null,
                color: inModifica.color ?? null,
              }
            : null
        }
        subappaltatori={subappaltatori}
        utenti={utenti}
        onSave={onSubmit}
        isSaving={salva.isPending}
      />

      {composizioneDi && <InternalTeamRosterDialog key={`${effectiveCompany?.id}:${composizioneDi.id}`} team={composizioneDi} onClose={() => setComposizioneDi(null)} />}

      {allegatiDi && (
        <ExternalTeamAttachments
          team={{ id: allegatiDi.id, name: allegatiDi.name }}
          open={!!allegatiDi}
          onOpenChange={(v) => !v && setAllegatiDi(null)}
        />
      )}

      <AlertDialog open={!!daEliminare} onOpenChange={(v) => !v && setDaEliminare(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare «{daEliminare?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Se la squadra ha assegnazioni o uno storico delle composizioni, non si può eliminare: disattivala per non proporla nei nuovi incarichi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => {
                if (daEliminare) elimina.mutate(daEliminare.id);
                setDaEliminare(null);
              }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
