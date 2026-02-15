import { Link } from "react-router-dom";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
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
import { type OrderWithDetails, getPendingPayments, getAmountDue, getAmountCollected } from "@/lib/orderUtils";

export interface OrderCosts {
  variableCosts: number;
  grossMargin: number;
}

interface OrdersTableProps {
  orders: OrderWithDetails[];
  onDelete: (orderId: string) => void;
  isDeleting: boolean;
  orderCosts: Map<string, OrderCosts>;
}

export function OrdersTable({ orders, onDelete, isDeleting, orderCosts }: OrdersTableProps) {
  return (
    <Card>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Codice</TableHead>
              <TableHead>Descrizione</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Tot. Ivato</TableHead>
              <TableHead className="text-right">Imponibile</TableHead>
              <TableHead className="text-right">Incassato</TableHead>
              <TableHead className="text-right">Da Ricevere</TableHead>
              <TableHead className="text-right">Costi Var.</TableHead>
              <TableHead className="text-right">Margine</TableHead>
              <TableHead>Pagamenti</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => {
              const due = getAmountDue(order);
              const collected = getAmountCollected(order);
              const pending = getPendingPayments(order);
              const vatRate = order.vat_rate ?? 22;
              const totalIvato = order.total_amount * (1 + vatRate / 100);
              const costs = orderCosts.get(order.id);
              const variableCosts = costs?.variableCosts ?? 0;
              const grossMargin = costs?.grossMargin ?? order.total_amount;
              const marginPercent = order.total_amount > 0 
                ? (grossMargin / order.total_amount) * 100 
                : 0;

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
                    {formatCurrency(totalIvato)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(order.total_amount)}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={collected > 0 ? "text-emerald-600 dark:text-emerald-400" : ""}>
                      {formatCurrency(collected)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={due > 0 ? "text-orange-600 dark:text-orange-400 font-medium" : "text-emerald-600 dark:text-emerald-400"}>
                      {formatCurrency(due)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-muted-foreground">
                      {formatCurrency(variableCosts)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={grossMargin >= 0 ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-destructive font-medium"}>
                      {formatCurrency(grossMargin)} - {marginPercent.toFixed(1)}%
                    </span>
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
