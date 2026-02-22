import { useState, useEffect } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { Trash2, Pencil, ChevronUp, ChevronDown, Settings2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";

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
}

export type SortField = "first_name" | "phone" | "email" | "company_name" | "created_at" | "last_activity_at";
export type SortDirection = "asc" | "desc";

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
}

const COLUMNS = [
  { key: "name", label: "Nome del Contatto", sortField: "first_name" as SortField, fixed: true },
  { key: "phone", label: "Telefono", sortField: "phone" as SortField },
  { key: "email", label: "Email", sortField: "email" as SortField },
  { key: "company_name", label: "Azienda", sortField: "company_name" as SortField },
  { key: "created_at", label: "Creato", sortField: "created_at" as SortField },
  { key: "last_activity_at", label: "Ultima Attività", sortField: "last_activity_at" as SortField },
  { key: "tags", label: "Tag" },
  { key: "source", label: "Fonte" },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];

const DEFAULT_VISIBLE: ColumnKey[] = ["name", "phone", "email", "company_name", "created_at", "last_activity_at", "tags"];

const STORAGE_KEY = "contacts-visible-columns";

function loadVisibleColumns(): Set<ColumnKey> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return new Set(JSON.parse(stored) as ColumnKey[]);
  } catch {}
  return new Set(DEFAULT_VISIBLE);
}

const AVATAR_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500",
  "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-orange-500",
];

function getInitials(first: string, last?: string | null) {
  const f = first?.[0]?.toUpperCase() || "";
  const l = last?.[0]?.toUpperCase() || "";
  return f + l || "?";
}

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  try {
    return format(new Date(dateStr), "dd MMM yyyy", { locale: it });
  } catch {
    return "—";
  }
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

export function ContactsTable({
  contacts, totalCount, selectedIds, onToggleSelect, onToggleAll,
  onEdit, onDelete, page, pageSize, onPageChange, onPageSizeChange,
  sortField, sortDirection, onSort, bulkActions,
}: ContactsTableProps) {
  const navigate = useNavigate();
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const allSelected = contacts.length > 0 && contacts.every((c) => selectedIds.has(c.id));

  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(loadVisibleColumns);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(visibleColumns)));
  }, [visibleColumns]);

  const toggleColumn = (key: ColumnKey) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleSort = (col: typeof COLUMNS[number]) => {
    if (!("sortField" in col) || !col.sortField) return;
    const sf = col.sortField;
    if (sortField === sf) {
      onSort(sf, sortDirection === "asc" ? "desc" : "asc");
    } else {
      onSort(sf, "asc");
    }
  };

  const isVisible = (key: ColumnKey) => key === "name" || visibleColumns.has(key);
  const visibleCols = COLUMNS.filter((c) => isVisible(c.key));
  const borderClass = "border-r border-border/30";

  return (
    <div className="space-y-3">
      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-muted/50 rounded-lg px-4 py-2 text-sm">
          <span className="font-medium">{selectedIds.size} selezionati</span>
          {bulkActions}
          <Button size="sm" variant="destructive" onClick={() => onDelete(Array.from(selectedIds))}>
            <Trash2 className="h-4 w-4 mr-1" /> Elimina
          </Button>
        </div>
      )}

      {/* Manage columns */}
      <div className="flex justify-end">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="text-muted-foreground gap-1.5">
              <Settings2 className="h-4 w-4" /> Gestisci campi
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-3">
            <p className="text-sm font-medium mb-3">Colonne visibili</p>
            <div className="space-y-2.5">
              {COLUMNS.map((col) => {
                const isFixed = col.key === "name";
                return (
                  <label key={col.key} className="flex items-center justify-between text-sm">
                    <span className={isFixed ? "text-muted-foreground" : ""}>{col.label}</span>
                    <Switch
                      checked={isVisible(col.key)}
                      disabled={isFixed}
                      onCheckedChange={() => toggleColumn(col.key)}
                      className="scale-75"
                    />
                  </label>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={`w-[40px] ${borderClass}`}>
                <Checkbox checked={allSelected} onCheckedChange={onToggleAll} />
              </TableHead>
              {visibleCols.map((col, i) => {
                const isLast = i === visibleCols.length - 1;
                const sortable = "sortField" in col && !!col.sortField;
                return (
                  <TableHead
                    key={col.key}
                    className={`${!isLast ? borderClass : ""} ${sortable ? "cursor-pointer select-none hover:bg-muted/50" : ""}`}
                    onClick={() => sortable && handleSort(col)}
                  >
                    <div className="flex items-center">
                      {col.label}
                      {sortable && col.sortField && (
                        <SortIcon field={col.sortField} currentField={sortField} direction={sortDirection} />
                      )}
                    </div>
                  </TableHead>
                );
              })}
              <TableHead className="w-[60px]" />
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
              contacts.map((c) => {
                const fullName = `${c.first_name} ${c.last_name || ""}`.trim();
                return (
                  <TableRow key={c.id} className="group">
                    <TableCell className={borderClass}>
                      <Checkbox checked={selectedIds.has(c.id)} onCheckedChange={() => onToggleSelect(c.id)} />
                    </TableCell>
                    {visibleCols.map((col, i) => {
                      const isLast = i === visibleCols.length - 1;
                      const cls = !isLast ? borderClass : "";
                      switch (col.key) {
                        case "name":
                          return (
                            <TableCell key={col.key} className={cls}>
                              <div className="flex items-center gap-2.5">
                                <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 ${getAvatarColor(fullName)}`}>
                                  {getInitials(c.first_name, c.last_name)}
                                </div>
                                <span className="font-medium text-primary hover:underline cursor-pointer" onClick={() => navigate(`/azienda/marketing/contatti/${c.id}`)}>
                                  {fullName}
                                </span>
                              </div>
                            </TableCell>
                          );
                        case "phone":
                          return <TableCell key={col.key} className={`text-muted-foreground ${cls}`}>{c.phone || "—"}</TableCell>;
                        case "email":
                          return <TableCell key={col.key} className={`text-muted-foreground ${cls}`}>{c.email || "—"}</TableCell>;
                        case "company_name":
                          return <TableCell key={col.key} className={`text-muted-foreground ${cls}`}>{c.company_name || "—"}</TableCell>;
                        case "created_at":
                          return <TableCell key={col.key} className={`text-muted-foreground text-sm ${cls}`}>{formatDate(c.created_at)}</TableCell>;
                        case "last_activity_at":
                          return <TableCell key={col.key} className={`text-muted-foreground text-sm ${cls}`}>{formatDate(c.last_activity_at)}</TableCell>;
                        case "tags":
                          return (
                            <TableCell key={col.key} className={cls}>
                              <div className="flex flex-wrap gap-1">
                                {c.tags.map((tag) => (
                                  <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                                ))}
                              </div>
                            </TableCell>
                          );
                        case "source":
                          return <TableCell key={col.key} className={`text-muted-foreground text-sm ${cls}`}>{c.source || "—"}</TableCell>;
                        default:
                          return null;
                      }
                    })}
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => onEdit(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
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
}
