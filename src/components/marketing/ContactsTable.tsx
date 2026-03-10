import { memo, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useMarketingRoutePrefix } from "@/hooks/useMarketingRoutePrefix";
import { Trash2, Pencil, ChevronUp, ChevronDown } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { getInitials, getAvatarColor, formatContactDate, type CustomFieldDef } from "@/lib/contactUtils";

export interface MarketingContact {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  company_name: string | null;
  tags: string[];
  notes: string | null;
  source: string | null;
  last_activity_at: string | null;
  created_at: string;
  city: string | null;
  province: string | null;
  address: string | null;
  postal_code: string | null;
  country: string | null;
  contact_type: string;
  date_of_birth: string | null;
  website: string | null;
  assigned_to: string | null;
  call_center_id: string | null;
  call_center_name: string | null;
  attr_source: string | null;
  attr_campaign: string | null;
  opp_name: string | null;
  opp_value: number | null;
  opp_status: string | null;
  opp_pipeline: string | null;
  opp_stage: string | null;
}

export type SortField = "first_name" | "phone" | "email" | "company_name" | "created_at" | "last_activity_at";
export type SortDirection = "asc" | "desc";

export const COLUMNS = [
  { key: "name", label: "Nome del Contatto", sortField: "first_name" as SortField, fixed: true, group: "Contatto" },
  { key: "phone", label: "Telefono", sortField: "phone" as SortField, group: "Contatto" },
  { key: "email", label: "Email", sortField: "email" as SortField, group: "Contatto" },
  { key: "company_name", label: "Azienda", sortField: "company_name" as SortField, group: "Contatto" },
  { key: "city", label: "Città", group: "Contatto" },
  { key: "province", label: "Provincia", group: "Contatto" },
  { key: "address", label: "Indirizzo", group: "Contatto" },
  { key: "postal_code", label: "CAP", group: "Contatto" },
  { key: "country", label: "Paese", group: "Contatto" },
  { key: "contact_type", label: "Tipo contatto", group: "Contatto" },
  { key: "website", label: "Sito web", group: "Contatto" },
  { key: "notes_col", label: "Note", group: "Contatto" },
  { key: "source", label: "Fonte", group: "Contatto" },
  { key: "created_at", label: "Creato", sortField: "created_at" as SortField, group: "Date" },
  { key: "last_activity_at", label: "Ultima Attività", sortField: "last_activity_at" as SortField, group: "Date" },
  { key: "date_of_birth", label: "Data di nascita", group: "Date" },
  { key: "tags", label: "Tag", group: "Tag" },
  { key: "opp_name", label: "Opportunità", group: "Opportunità" },
  { key: "opp_value", label: "Valore opp.", group: "Opportunità" },
  { key: "opp_status", label: "Stato opp.", group: "Opportunità" },
  { key: "opp_pipeline", label: "Pipeline", group: "Opportunità" },
  { key: "opp_stage", label: "Fase pipeline", group: "Opportunità" },
  { key: "call_center", label: "Call Center", group: "Assegnazione" },
  { key: "attr_source", label: "Sorgente", group: "Attribuzione" },
  { key: "attr_campaign", label: "Campagna", group: "Attribuzione" },
] as const;

export type ColumnKey = (typeof COLUMNS)[number]["key"];

export const DEFAULT_VISIBLE: ColumnKey[] = ["name", "phone", "email", "company_name", "created_at", "last_activity_at", "tags"];

const STORAGE_KEY = "contacts-visible-columns";

export function loadVisibleColumns(): Set<string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return new Set(JSON.parse(stored) as string[]);
  } catch {}
  return new Set(DEFAULT_VISIBLE);
}

export function saveVisibleColumns(cols: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(cols)));
}

interface ContactsTableProps {
  contacts: MarketingContact[];
  totalCount: number;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: () => void;
  onEdit: (contact: MarketingContact) => void;
  onDelete: (ids: string[]) => void;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField, direction: SortDirection) => void;
  bulkActions?: React.ReactNode;
  visibleColumns: Set<string>;
  customFields?: CustomFieldDef[];
  customFieldValues?: Record<string, Record<string, string>>;
}


function SortIcon({ field, currentField, direction }: { field: string; currentField: string; direction: SortDirection }) {
  const isActive = field === currentField;
  return (
    <div className="inline-flex flex-col ml-1 -space-y-0.5">
      <ChevronUp className={`h-3 w-3 ${isActive && direction === "asc" ? "text-primary" : "text-muted-foreground/40"}`} />
      <ChevronDown className={`h-3 w-3 ${isActive && direction === "desc" ? "text-primary" : "text-muted-foreground/40"}`} />
    </div>
  );
}

function renderStaticCell(col: { key: string; label: string }, c: MarketingContact, cls: string, navigate: ReturnType<typeof useNavigate>, routePrefix: string) {
  const fullName = `${c.first_name} ${c.last_name || ""}`.trim();
  switch (col.key) {
    case "name":
      return (
        <TableCell key={col.key} className={cls}>
          <div className="flex items-center gap-2">
            <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0 ${getAvatarColor(fullName)}`}>
              {getInitials(c.first_name, c.last_name)}
            </div>
            <span className="font-medium text-sm text-primary hover:underline cursor-pointer" onClick={() => navigate(`${routePrefix}/contatti/${c.id}`)}>
              {fullName}
            </span>
          </div>
        </TableCell>
      );
    case "phone":
      return <TableCell key={col.key} className={`text-muted-foreground text-sm ${cls}`}>{c.phone || "—"}</TableCell>;
    case "email":
      return <TableCell key={col.key} className={`text-muted-foreground text-sm ${cls}`}>{c.email || "—"}</TableCell>;
    case "company_name":
      return <TableCell key={col.key} className={`text-muted-foreground text-sm ${cls}`}>{c.company_name || "—"}</TableCell>;
    case "created_at":
      return <TableCell key={col.key} className={`text-muted-foreground text-xs ${cls}`}>{formatContactDate(c.created_at)}</TableCell>;
    case "last_activity_at":
      return <TableCell key={col.key} className={`text-muted-foreground text-xs ${cls}`}>{formatContactDate(c.last_activity_at)}</TableCell>;
    case "tags":
      return (
        <TableCell key={col.key} className={cls}>
          <div className="flex flex-wrap gap-1">
            {c.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">{tag}</Badge>
            ))}
          </div>
        </TableCell>
      );
    case "source":
      return <TableCell key={col.key} className={`text-muted-foreground text-xs ${cls}`}>{c.source || "—"}</TableCell>;
    case "city":
      return <TableCell key={col.key} className={`text-muted-foreground text-sm ${cls}`}>{c.city || "—"}</TableCell>;
    case "province":
      return <TableCell key={col.key} className={`text-muted-foreground text-sm ${cls}`}>{c.province || "—"}</TableCell>;
    case "address":
      return <TableCell key={col.key} className={`text-muted-foreground text-sm ${cls}`}>{c.address || "—"}</TableCell>;
    case "postal_code":
      return <TableCell key={col.key} className={`text-muted-foreground text-sm ${cls}`}>{c.postal_code || "—"}</TableCell>;
    case "country":
      return <TableCell key={col.key} className={`text-muted-foreground text-sm ${cls}`}>{c.country || "—"}</TableCell>;
    case "contact_type":
      return (
        <TableCell key={col.key} className={cls}>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{c.contact_type || "lead"}</Badge>
        </TableCell>
      );
    case "date_of_birth":
      return <TableCell key={col.key} className={`text-muted-foreground text-xs ${cls}`}>{formatContactDate(c.date_of_birth)}</TableCell>;
    case "website":
      return <TableCell key={col.key} className={`text-muted-foreground text-sm ${cls}`}>{c.website || "—"}</TableCell>;
    case "notes_col":
      return <TableCell key={col.key} className={`text-muted-foreground text-xs max-w-[150px] truncate ${cls}`}>{c.notes || "—"}</TableCell>;
    case "opp_name":
      return <TableCell key={col.key} className={`text-sm ${cls}`}>{c.opp_name || "—"}</TableCell>;
    case "opp_value":
      return <TableCell key={col.key} className={`text-sm ${cls}`}>{c.opp_value != null ? formatCurrency(c.opp_value) : "—"}</TableCell>;
    case "opp_status":
      return (
        <TableCell key={col.key} className={cls}>
          {c.opp_status ? <Badge variant="outline" className="text-[10px] px-1.5 py-0">{c.opp_status}</Badge> : "—"}
        </TableCell>
      );
    case "opp_pipeline":
      return <TableCell key={col.key} className={`text-muted-foreground text-sm ${cls}`}>{c.opp_pipeline || "—"}</TableCell>;
    case "opp_stage":
      return <TableCell key={col.key} className={`text-muted-foreground text-sm ${cls}`}>{c.opp_stage || "—"}</TableCell>;
    case "call_center":
      return <TableCell key={col.key} className={`text-muted-foreground text-sm ${cls}`}>{c.call_center_name || "—"}</TableCell>;
    case "attr_source":
      return <TableCell key={col.key} className={`text-muted-foreground text-sm ${cls}`}>{c.attr_source || "—"}</TableCell>;
    case "attr_campaign":
      return <TableCell key={col.key} className={`text-muted-foreground text-sm ${cls}`}>{c.attr_campaign || "—"}</TableCell>;
    default:
      return null;
  }
}

export const ContactsTable = memo(function ContactsTable({
  contacts, totalCount, selectedIds, onToggleSelect, onToggleAll,
  onEdit, onDelete, page, pageSize, onPageChange, onPageSizeChange,
  sortField, sortDirection, onSort, bulkActions, visibleColumns,
  customFields = [], customFieldValues = {},
}: ContactsTableProps) {
  const navigate = useNavigate();
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const allSelected = contacts.length > 0 && contacts.every((c) => selectedIds.has(c.id));

  const isVisible = (key: string) => key === "name" || visibleColumns.has(key);

  const allCols = useMemo(() => {
    const staticCols = COLUMNS.map(c => ({ key: c.key as string, label: c.label, sortField: "sortField" in c ? c.sortField : undefined }));
    const cfCols = customFields.map(f => ({ key: `cf_${f.id}`, label: f.name, sortField: undefined as SortField | undefined }));
    return [...staticCols, ...cfCols];
  }, [customFields]);

  const handleSort = (col: { key: string; sortField?: SortField }) => {
    if (!col.sortField) return;
    const sf = col.sortField;
    if (sortField === sf) {
      onSort(sf, sortDirection === "asc" ? "desc" : "asc");
    } else {
      onSort(sf, "asc");
    }
  };

  const visibleCols = allCols.filter((c) => isVisible(c.key));
  const borderClass = "border-r border-border/30";

  return (
    <div className="space-y-3">
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-muted/50 rounded-lg px-4 py-2 text-sm">
          <span className="font-medium">{selectedIds.size} selezionati</span>
          {bulkActions}
          <Button size="sm" variant="destructive" onClick={() => onDelete(Array.from(selectedIds))}>
            <Trash2 className="h-4 w-4 mr-1" /> Elimina
          </Button>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={`w-[40px] ${borderClass}`}>
                <Checkbox checked={allSelected} onCheckedChange={onToggleAll} />
              </TableHead>
              {visibleCols.map((col, i) => {
                const isLast = i === visibleCols.length - 1;
                const sortable = !!col.sortField;
                return (
                  <TableHead
                    key={col.key}
                    className={`py-2 ${!isLast ? borderClass : ""} ${sortable ? "cursor-pointer select-none hover:bg-muted/50" : ""}`}
                    onClick={() => sortable && handleSort(col)}
                  >
                    <div className="flex items-center text-xs">
                      {col.label}
                      {sortable && col.sortField && (
                        <SortIcon field={col.sortField} currentField={sortField} direction={sortDirection} />
                      )}
                    </div>
                  </TableHead>
                );
              })}
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleCols.length + 2} className="text-center py-12 text-muted-foreground">
                  Nessun contatto trovato
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((c) => (
                <TableRow key={c.id} className="group">
                  <TableCell className={`py-1.5 ${borderClass}`}>
                    <Checkbox checked={selectedIds.has(c.id)} onCheckedChange={() => onToggleSelect(c.id)} />
                  </TableCell>
                  {visibleCols.map((col, i) => {
                    const isLast = i === visibleCols.length - 1;
                    const cls = `py-1.5 ${!isLast ? borderClass : ""}`;

                    // Custom field
                    if (col.key.startsWith("cf_")) {
                      const fieldId = col.key.replace("cf_", "");
                      const val = customFieldValues[c.id]?.[fieldId] || "—";
                      return <TableCell key={col.key} className={`text-muted-foreground text-sm ${cls}`}>{val}</TableCell>;
                    }

                    return renderStaticCell(col, c, cls, navigate);
                  })}
                  <TableCell className="py-1.5">
                    <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => onEdit(c)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>Righe per pagina</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className="w-[70px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Pagina {page} di {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Prec</Button>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Succ</Button>
        </div>
      </div>
    </div>
  );
});
