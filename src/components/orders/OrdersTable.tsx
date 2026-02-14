import { Link } from "react-router-dom";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Card } from "@/components/ui/card";

interface OrderWithDetails {
  id: string;
  order_code: string | null;
  description: string;
  total_amount: number;
  deposit_amount: number;
  deposit_paid: boolean | null;
  deposit_2_amount: number | null;
  deposit_2_paid: boolean | null;
  balance_amount: number;
  balance_paid: boolean | null;
  expected_date: string | null;
  warehouse_arrival_date: string | null;
  created_at: string;
  current_status_id: string | null;
  customer: {
    first_name: string;
    last_name: string;
    email: string;
  } | null;
  status: {
    name: string;
    color: string;
  } | null;
}

function getPendingPayments(order: OrderWithDetails): string[] {
  const pending: string[] = [];
  if (order.deposit_amount > 0 && !order.deposit_paid) pending.push("Acc. 1");
  if (order.deposit_2_amount && order.deposit_2_amount > 0 && !order.deposit_2_paid) pending.push("Acc. 2");
  if (order.balance_amount > 0 && !order.balance_paid) pending.push("Saldo");
  return pending;
}

function getAmountDue(order: OrderWithDetails): number {
  let due = 0;
  if (!order.deposit_paid) due += order.deposit_amount || 0;
  if (!order.deposit_2_paid) due += (order.deposit_2_amount || 0);
  if (!order.balance_paid) due += order.balance_amount || 0;
  return due;
}

interface OrdersTableProps {
  orders: OrderWithDetails[];
  onDelete: (orderId: string) => void;
  isDeleting: boolean;
}

export function OrdersTable({ orders, onDelete, isDeleting }: OrdersTableProps) {
  return (
    <Card>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Codice</TableHead>
              <TableHead>Descrizione</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Totale</TableHead>
              <TableHead className="text-right">Da Ricevere</TableHead>
              <TableHead className="hidden md:table-cell">Data Contratto</TableHead>
              <TableHead className="hidden lg:table-cell">Arrivo Merce</TableHead>
              <TableHead className="hidden lg:table-cell">Data Posa</TableHead>
              <TableHead>Pagamenti</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => {
              const due = getAmountDue(order);
              const pending = getPendingPayments(order);
              return (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">
                    {order.order_code || "—"}
                  </TableCell>
                  <TableCell className="max-w-[150px] truncate">
                    {order.description}
                  </TableCell>
                  <TableCell>
                    {order.customer
                      ? `${order.customer.first_name} ${order.customer.last_name}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(order.total_amount)}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={due > 0 ? "text-orange-600 dark:text-orange-400 font-medium" : "text-emerald-600 dark:text-emerald-400"}>
                      {formatCurrency(due)}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {formatDateShort(order.created_at)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {order.warehouse_arrival_date ? formatDateShort(order.warehouse_arrival_date) : "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {order.expected_date ? formatDateShort(order.expected_date) : "—"}
                  </TableCell>
                  <TableCell>
                    {pending.length === 0 ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-0">
                        OK
                      </Badge>
                    ) : (
                      <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 border-0">
                        {pending.join(", ")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {order.status ? (
                      <Badge
                        variant="outline"
                        style={{
                          borderColor: order.status.color,
                          color: order.status.color,
                        }}
                      >
                        {order.status.name}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/azienda/ordini/${order.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/azienda/ordini/${order.id}/modifica`}>
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" disabled={isDeleting}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Elimina Ordine</AlertDialogTitle>
                            <AlertDialogDescription>
                              Sei sicuro di voler eliminare l'ordine{" "}
                              <strong>{order.order_code || order.description}</strong>?
                              <br />
                              Verranno eliminati anche tutti i dati collegati (articoli, allegati, storico stati, ecc.).
                              <br />
                              Questa azione non può essere annullata.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annulla</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => onDelete(order.id)}
                            >
                              Elimina
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
