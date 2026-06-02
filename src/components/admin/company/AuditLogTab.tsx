import { useMemo, useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  Shield, CreditCard, ToggleLeft, Clock, User, Search, Filter,
  Download, ChevronDown, AlertCircle,
} from "lucide-react";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { escapeCsvCell } from "@/lib/csvExport";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuditLog, type AuditLogEntry } from "@/hooks/superadmin/useAuditLog";
import { toast } from "sonner";

interface AuditLogTabProps {
  companyId: string;
}

/** Mapping field_name → label leggibile in italiano (audit log umano-friendly) */
const FIELD_LABELS: Record<string, string> = {
  billing_status: "Stato fatturazione",
  subscription_plan_id: "Piano abbonamento",
  status: "Stato azienda",
  payment_method: "Metodo pagamento",
  trial_ends_at: "Scadenza trial",
  feature_overrides: "Override feature",
  whitelabel_tier: "Tier white-label",
  custom_max_orders: "Limite ordini custom",
  notes: "Note interne",
  email: "Email azienda",
  phone: "Telefono",
  vat_number: "P.IVA",
  fiscal_code: "Codice fiscale",
};

function fieldLabel(name: string): string {
  return FIELD_LABELS[name] ?? name;
}

function FieldIcon({ fieldName }: { fieldName: string }) {
  if (fieldName === "billing_status") return <Shield className="h-4 w-4 text-blue-500" />;
  if (fieldName === "subscription_plan_id") return <CreditCard className="h-4 w-4 text-purple-500" />;
  if (fieldName === "status") return <ToggleLeft className="h-4 w-4 text-green-500" />;
  return <Clock className="h-4 w-4 text-gray-400" />;
}

/**
 * Formatta un valore unknown come stringa leggibile.
 * FIX BUG: prima `String({foo:"bar"})` → "[object Object]" poco utile.
 * Ora gestisce object/array via JSON.stringify con maxLength.
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "Sì" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    try {
      const json = JSON.stringify(value);
      if (json.length > 80) return json.slice(0, 80) + "…";
      return json;
    } catch {
      return "[oggetto]";
    }
  }
  return String(value);
}

/** Singola voce della timeline */
function AuditEntry({ entry }: { entry: AuditLogEntry }) {
  const oldVal = formatValue(entry.old_value);
  const newVal = formatValue(entry.new_value);
  const isCreated = entry.old_value === null || entry.old_value === undefined;
  const isDeleted = entry.new_value === null || entry.new_value === undefined;

  return (
    <div className="flex gap-4 relative">
      {/* Linea verticale della timeline */}
      <div className="flex flex-col items-center">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted border">
          <FieldIcon fieldName={entry.field_name} />
        </div>
        <div className="w-px flex-1 bg-border mt-1" />
      </div>

      {/* Contenuto */}
      <div className="pb-6 flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <Badge variant="secondary" className="text-xs">
            {fieldLabel(entry.field_name)}
          </Badge>
          {isCreated && (
            <Badge variant="outline" className="text-[10px] h-4 px-1 bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300">
              CREATO
            </Badge>
          )}
          {isDeleted && (
            <Badge variant="outline" className="text-[10px] h-4 px-1 bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950 dark:text-rose-300">
              RIMOSSO
            </Badge>
          )}
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {format(new Date(entry.created_at), "d MMM yyyy HH:mm", { locale: it })}
          </span>
        </div>

        {/* Valore old → new con wrapping migliore per stringhe lunghe */}
        <div className="text-sm space-y-1">
          {!isCreated && (
            <div>
              <span className="text-xs text-muted-foreground">Da: </span>
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded break-all">
                {oldVal}
              </code>
            </div>
          )}
          {!isDeleted && (
            <div>
              <span className="text-xs text-muted-foreground">A: </span>
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded break-all font-medium">
                {newVal}
              </code>
            </div>
          )}
        </div>

        {entry.reason && (
          <p className="text-xs text-muted-foreground mt-2 italic">
            <span className="font-medium not-italic">Motivo:</span> {entry.reason}
          </p>
        )}

        <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1 flex-wrap">
          <User className="h-3 w-3" />
          {entry.profile_name ?? "Operatore sconosciuto"}
          {entry.ip_address && (
            <span className="ml-2 font-mono text-[10px]">IP: {entry.ip_address}</span>
          )}
        </p>
      </div>
    </div>
  );
}

/** Skeleton placeholder per il caricamento */
function AuditSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}

const PAGE_SIZE = 20;

/** Tab con la timeline verticale delle modifiche ai flag di un'azienda */
export function AuditLogTab({ companyId }: AuditLogTabProps) {
  // Aumentato limite di fetch da 50 a 500 per supportare paginazione client-side
  // ragionevole. Per audit di anni serve paginazione server-side dedicata
  // (out of scope qui, 500 entry copre 99% dei casi azienda standard).
  const { data: entries = [], isLoading, error } = useAuditLog(companyId, 500);

  const [search, setSearch] = useState("");
  const [fieldFilter, setFieldFilter] = useState<string>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Lista campi unici per il filtro (estratti dal data set)
  const fields = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => set.add(e.field_name));
    return Array.from(set).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (fieldFilter !== "all" && e.field_name !== fieldFilter) return false;
      if (q) {
        const hay = [
          e.field_name,
          fieldLabel(e.field_name),
          formatValue(e.old_value),
          formatValue(e.new_value),
          e.reason ?? "",
          e.profile_name ?? "",
          e.ip_address ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, search, fieldFilter]);

  const visible = filtered.slice(0, visibleCount);
  const hasActiveFilters = !!search || fieldFilter !== "all";

  // CSV export delle entries filtrate
  const handleExportCsv = () => {
    if (filtered.length === 0) return;
    const escape = (v: string | number | null | undefined) => escapeCsvCell(v, ",");
    const headers = [
      "Data", "Campo", "Operatore", "Vecchio valore", "Nuovo valore",
      "Motivo", "IP",
    ];
    const rows = filtered.map((e) =>
      [
        escape(format(new Date(e.created_at), "yyyy-MM-dd HH:mm:ss")),
        escape(fieldLabel(e.field_name)),
        escape(e.profile_name ?? ""),
        escape(formatValue(e.old_value)),
        escape(formatValue(e.new_value)),
        escape(e.reason ?? ""),
        escape(e.ip_address ?? ""),
      ].join(","),
    );
    const csv = [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${companyId.slice(0, 8)}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Esportate ${filtered.length} righe`);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Storico modifiche flag
            {entries.length > 0 && (
              <Badge variant="secondary" className="text-xs ml-1">
                {entries.length}
                {entries.length >= 500 && "+"}
              </Badge>
            )}
          </CardTitle>
          {filtered.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={handleExportCsv}
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Esporta CSV
            </Button>
          )}
        </div>
        {/* Toolbar filtri (visibile solo con dati) */}
        {entries.length > 5 && (
          <div className="flex items-center gap-2 flex-wrap pt-2">
            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Cerca campo, valore, operatore..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setVisibleCount(PAGE_SIZE);
                }}
                className="pl-8 h-8 text-xs"
              />
            </div>
            {fields.length > 1 && (
              <Select
                value={fieldFilter}
                onValueChange={(v) => {
                  setFieldFilter(v);
                  setVisibleCount(PAGE_SIZE);
                }}
              >
                <SelectTrigger className="w-44 h-8 text-xs">
                  <SelectValue placeholder="Campo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i campi</SelectItem>
                  {fields.map((f) => (
                    <SelectItem key={f} value={f}>
                      {fieldLabel(f)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setSearch("");
                  setFieldFilter("all");
                  setVisibleCount(PAGE_SIZE);
                }}
              >
                <Filter className="h-3 w-3 mr-1" />
                Reset
              </Button>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {hasActiveFilters
                ? `${filtered.length} di ${entries.length}`
                : `${entries.length} eventi`}
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isLoading && <AuditSkeleton />}

        {error && (
          <div className="flex items-center gap-2 text-destructive py-4">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">
              Errore nel caricamento: {(error as Error).message}
            </span>
          </div>
        )}

        {!isLoading && !error && entries.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nessuna modifica registrata
          </p>
        )}

        {!isLoading && !error && entries.length > 0 && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nessuna modifica corrisponde ai filtri correnti
          </p>
        )}

        {!isLoading && !error && visible.length > 0 && (
          <div className="mt-2">
            {visible.map((entry) => (
              <AuditEntry key={entry.id} entry={entry} />
            ))}
            {visible.length < filtered.length && (
              <div className="pt-2 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                >
                  <ChevronDown className="h-4 w-4 mr-1" />
                  Mostra altri ({filtered.length - visible.length} rimanenti)
                </Button>
              </div>
            )}
          </div>
        )}

        {entries.length >= 500 && (
          <p className="text-[10px] text-muted-foreground text-center mt-4 italic">
            Visualizzati gli ultimi 500 eventi. Per audit completo serve paginazione
            server-side dedicata (richiesta SuperAdmin team).
          </p>
        )}
      </CardContent>
    </Card>
  );
}
