import { Plus, Pencil, Trash2, Phone, Mail, FileText, UserPlus } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
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

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  gross_salary: number;
  net_salary: number;
  monthly_hours: number;
  is_active: boolean;
  user_id: string | null;
}

interface EmployeesTabProps {
  employees: Employee[];
  isLoading: boolean;
  onNew: () => void;
  onEdit: (employee: Employee) => void;
  onDelete: (id: string) => void;
  onViewAttachments: (employee: Employee) => void;
  onCreateUser: (employee: Employee) => void;
}

export function EmployeesTab({
  employees,
  isLoading,
  onNew,
  onEdit,
  onDelete,
  onViewAttachments,
  onCreateUser,
}: EmployeesTabProps) {
  const activeEmployees = employees.filter((e) => e.is_active);
  const inactiveEmployees = employees.filter((e) => !e.is_active);

  const calculateHourlyCost = (grossSalary: number, monthlyHours: number) => {
    return monthlyHours > 0 ? grossSalary / monthlyHours : 0;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          {activeEmployees.length} attivi, {inactiveEmployees.length} inattivi
        </div>
        <Button onClick={onNew}>
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Dipendente
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
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
              Nessun dipendente registrato. Aggiungi il primo dipendente per iniziare.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Contatti</TableHead>
                  <TableHead className="text-right">Stipendio Lordo</TableHead>
                  <TableHead className="text-right">Stipendio Netto</TableHead>
                  <TableHead className="text-right">Ore/Mese</TableHead>
                  <TableHead className="text-right">Costo Orario</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell className="font-medium">
                      {employee.first_name} {employee.last_name}
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
                      {formatCurrency(calculateHourlyCost(employee.gross_salary, employee.monthly_hours))}/h
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
                            title="Crea account"
                          >
                            <UserPlus className="h-4 w-4 text-primary" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onViewAttachments(employee)}
                          title="Documenti"
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEdit(employee)}
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
                              <AlertDialogTitle>Eliminare il dipendente?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Questa azione è irreversibile. Se il dipendente è assegnato a ordini,
                                considera invece di impostarlo come "Inattivo".
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
