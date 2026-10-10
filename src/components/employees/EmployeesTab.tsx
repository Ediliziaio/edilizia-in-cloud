import { Plus, Pencil, Trash2, Phone, Mail, FileText, UserPlus } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { costoOrarioDipendente } from "@/lib/costoOrarioDipendente";
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

import type { Employee } from "@/types/employees";

interface EmployeesTabProps {
  employees: Employee[];
  isLoading: boolean;
  onNew: () => void;
  onEdit: (employee: Employee) => void;
  onDelete: (id: string) => void;
  onViewAttachments: (employee: Employee) => void;
  onCreateUser: (employee: Employee) => void;
  roleType?: 'operaio' | 'staff_interno';
  /** Chi guarda e basta: niente «Nuovo», «Modifica», «Elimina», «Crea l'accesso». */
  soloLettura?: boolean;
}

export function EmployeesTab({
  employees,
  isLoading,
  onNew,
  onEdit,
  onDelete,
  onViewAttachments,
  onCreateUser,
  roleType = 'operaio',
  soloLettura = false,
}: EmployeesTabProps) {
  const activeEmployees = employees.filter((e) => e.is_active);
  const inactiveEmployees = employees.filter((e) => !e.is_active);

  // Lo stesso costo orario che finisce nelle commesse (tariffa scritta a mano, se
  // c'è; altrimenti lordo più contributi diviso le ore del mese). Prima qui si
  // mostrava il lordo diviso le ore, senza contributi: circa un quarto in meno di
  // quello che il sistema usa davvero.
  const calculateHourlyCost = (employee: Employee) => costoOrarioDipendente(employee);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          {activeEmployees.length} attivi, {inactiveEmployees.length} inattivi
        </div>
        <Button onClick={onNew} disabled={soloLettura}>
          <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
          Nuovo dipendente
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3" role="status" aria-busy="true" aria-label="Caricamento dei dipendenti">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-[150px]" />
                  <Skeleton className="h-5 w-[180px]" />
                  <Skeleton className="h-5 w-[80px]" />
                  <Skeleton className="h-5 w-[80px]" />
                  <Skeleton className="h-5 w-[60px]" />
                </div>
              ))}
            </div>
          ) : employees.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {roleType === 'staff_interno'
                ? "Nessun membro dello staff interno ancora. Aggiungi il primo per cominciare."
                : "Nessun operaio ancora. Aggiungi il primo per cominciare."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Contatti</TableHead>
                  <TableHead className="text-right">Stipendio lordo</TableHead>
                  <TableHead className="text-right">Stipendio netto</TableHead>
                  <TableHead className="text-right">Ore al mese</TableHead>
                  <TableHead
                    className="text-right"
                    title="Tariffa scritta a mano nella scheda; altrimenti lordo più contributi diviso le ore del mese. È il costo che finisce nelle commesse."
                  >
                    Costo orario
                  </TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right"><span className="sr-only">Azioni</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell className="font-medium">
                      {employee.first_name} {employee.last_name}
                    </TableCell>
                    <TableCell>
                      {employee.area ? (
                        <Badge
                          variant="outline"
                          className={
                            employee.area === "cantiere"
                              ? "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-900/20 dark:text-orange-300"
                              : employee.area === "commerciale"
                              ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                              : employee.area === "amministrazione"
                              ? "border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-600 dark:bg-gray-800/40 dark:text-gray-300"
                              : employee.area === "tecnico"
                              ? "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-900/20 dark:text-purple-300"
                              : ""
                          }
                        >
                          {employee.area === "cantiere" ? "Cantiere"
                            : employee.area === "commerciale" ? "Commerciale"
                            : employee.area === "amministrazione" ? "Amministrazione"
                            : employee.area === "tecnico" ? "Tecnico"
                            : employee.area}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                        {employee.email && (
                          <div className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {employee.email}
                          </div>
                        )}
                        {employee.phone && (
                          <div className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {employee.phone}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(employee.gross_salary)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(employee.net_salary)}
                    </TableCell>
                    <TableCell className="text-right">
                      {employee.monthly_hours}h
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(calculateHourlyCost(employee))}/h
                    </TableCell>
                    <TableCell>
                      <Badge variant={employee.is_active ? "default" : "secondary"}>
                        {employee.is_active ? "Attivo" : "Inattivo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        {!employee.user_id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onCreateUser(employee)}
                            disabled={soloLettura}
                            title="Crea l'accesso"
                            aria-label={`Crea l'accesso per ${employee.first_name} ${employee.last_name}`}
                          >
                            <UserPlus className="h-4 w-4 text-primary" aria-hidden="true" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onViewAttachments(employee)}
                          title="Documenti"
                          aria-label={`Documenti di ${employee.first_name} ${employee.last_name}`}
                        >
                          <FileText className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEdit(employee)}
                          disabled={soloLettura}
                          title="Modifica"
                          aria-label={`Modifica ${employee.first_name} ${employee.last_name}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={soloLettura}
                              title="Elimina"
                              aria-label={`Elimina ${employee.first_name} ${employee.last_name}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Eliminare {employee.first_name} {employee.last_name}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Non si può annullare. Se è assegnato a delle commesse, meglio impostarlo come «Inattivo».
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annulla</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => onDelete(employee.id)}
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
