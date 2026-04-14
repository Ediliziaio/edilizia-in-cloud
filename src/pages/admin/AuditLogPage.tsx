import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuditLogGlobal, type AuditLogEntry } from "@/hooks/superadmin/useAuditLog";

/** Abbrevia un UUID mostrando solo gli ultimi 8 caratteri */
function shortId(id: string): string {
  return `…${id.slice(-8)}`;
}

/** Formatta un valore unknown come stringa leggibile */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "Sì" : "No";
  return String(value);
}

/** Righe skeleton durante il caricamento */
function TableSkeleton() {
  return (
    <>
      {[...Array(6)].map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

/** Singola riga della tabella */
function AuditRow({ entry }: { entry: AuditLogEntry }) {
  return (
    <TableRow>
      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
        {format(new Date(entry.created_at), "d MMM yyyy HH:mm", { locale: it })}
      </TableCell>
      <TableCell>
        <span className="font-mono text-xs" title={entry.company_id}>
          {shortId(entry.company_id)}
        </span>
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className="font-mono text-xs">
          {entry.field_name}
        </Badge>
      </TableCell>
      <TableCell className="text-sm">
        <span className="text-muted-foreground">{formatValue(entry.old_value)}</span>
        {" → "}
        <span className="font-medium">{formatValue(entry.new_value)}</span>
      </TableCell>
      <TableCell className="text-sm">
        {entry.profile_name ?? <span className="text-muted-foreground italic">sconosciuto</span>}
      </TableCell>
    </TableRow>
  );
}

/** Pagina standalone — audit log globale di tutte le modifiche ai flag aziende */
export default function AuditLogPage() {
  const { data: entries, isLoading, error } = useAuditLogGlobal();

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="hidden md:flex items-center gap-3">
        <Shield className="h-6 w-6 text-blue-500" />
        <div>
          <h1 className="text-xl font-semibold">Audit Log — Modifiche Flag Aziende</h1>
          <p className="text-sm text-muted-foreground">
            Storico completo delle modifiche ai flag di tutte le aziende
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Ultime modifiche
            {!isLoading && entries && (
              <span className="ml-2 text-muted-foreground font-normal text-sm">
                ({entries.length} record)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {error && (
            <p className="text-sm text-destructive p-6">
              Errore nel caricamento: {(error as Error).message}
            </p>
          )}

          <Table className="min-w-[600px]">
            <TableHeader>
              <TableRow>
                <TableHead>Data/Ora</TableHead>
                <TableHead>Azienda</TableHead>
                <TableHead>Campo</TableHead>
                <TableHead>Da → A</TableHead>
                <TableHead>Operatore</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableSkeleton />}

              {!isLoading && !error && entries?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                    Nessuna modifica registrata
                  </TableCell>
                </TableRow>
              )}

              {!isLoading &&
                !error &&
                entries?.map((entry) => <AuditRow key={entry.id} entry={entry} />)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
