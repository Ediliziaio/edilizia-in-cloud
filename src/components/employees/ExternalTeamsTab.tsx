import { Plus, Pencil, Trash2, Phone, Mail, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import type { ExternalTeam } from "@/types/employees";

interface ExternalTeamsTabProps {
  teams: ExternalTeam[];
  isLoading: boolean;
  onNew: () => void;
  onEdit: (team: ExternalTeam) => void;
  onDelete: (id: string) => void;
  onViewAttachments: (team: ExternalTeam) => void;
}

export function ExternalTeamsTab({
  teams,
  isLoading,
  onNew,
  onEdit,
  onDelete,
  onViewAttachments,
}: ExternalTeamsTabProps) {
  const activeTeams = teams.filter((t) => t.is_active);
  const inactiveTeams = teams.filter((t) => !t.is_active);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          {activeTeams.length} attive, {inactiveTeams.length} inattive
        </div>
        <Button onClick={onNew}>
          <Plus className="h-4 w-4 mr-2" />
          Nuova Squadra
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-[140px]" />
                  <Skeleton className="h-5 w-[120px]" />
                  <Skeleton className="h-5 w-[160px]" />
                  <Skeleton className="h-5 w-[60px]" />
                </div>
              ))}
            </div>
          ) : teams.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              Nessuna squadra esterna registrata. Aggiungi la prima squadra per iniziare.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome Ditta</TableHead>
                  <TableHead>Referente</TableHead>
                  <TableHead>Contatti</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teams.map((team) => (
                  <TableRow key={team.id}>
                    <TableCell className="font-medium">{team.name}</TableCell>
                    <TableCell>{team.contact_name || "-"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                        {team.email && (
                          <div className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {team.email}
                          </div>
                        )}
                        {team.phone && (
                          <div className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {team.phone}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {team.notes || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={team.is_active ? "default" : "secondary"}>
                        {team.is_active ? "Attiva" : "Inattiva"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onViewAttachments(team)}
                          title="Documenti"
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEdit(team)}
                          title="Modifica"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" title="Elimina">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Eliminare la squadra?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Questa azione è irreversibile. Se la squadra è assegnata a ordini,
                                considera invece di impostarla come "Inattiva".
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annulla</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => onDelete(team.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Elimina
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
