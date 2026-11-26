import { COLUMNS, DEFAULT_VISIBLE } from "./colonneContatti";
import { memo, useMemo, useState } from "react";
import { BarraScorrimentoOrizzontale } from "@/components/common/BarraScorrimentoOrizzontale";
import { Link, useNavigate } from "react-router-dom";
import { useMarketingRoutePrefix } from "@/hooks/useMarketingRoutePrefix";
import { Trash2, Pencil, ChevronUp, ChevronDown, ListChecks, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { LeadTemperatureBadge } from "./LeadTemperatureBadge";
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
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

export interface MarketingContact {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  company_name: string | null;
  fiscal_code?: string | null;
  vat_number?: string | null;
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
  ai_next_action?: string | null;
  ai_score?: number | null;
  ai_score_reasoning?: string | null;
  ai_score_tier?: string | null;
  icp_score?: number | null;
  lead_score?: number | null;
  opt_out?: boolean | null;
  optout_email?: boolean | null;
  optout_sms?: boolean | null;
  optout_whatsapp?: boolean | null;
  optout_call?: boolean | null;
  preferred_channel?: string | null;
  score?: number | null;
  unsubscribed?: boolean | null;
  unsubscribed_at?: string | null;
  updated_at?: string | null;
}

export type SortField = "first_name" | "phone" | "email" | "company_name" | "created_at" | "last_activity_at";
export type SortDirection = "asc" | "desc";

export { COLUMNS, DEFAULT_VISIBLE } from "./colonneContatti";
export type { ColumnKey } from "./colonneContatti";
const STORAGE_KEY_PREFIX = "contacts-visible-columns";

export function getStorageKey(userId?: string, companyId?: string): string {
  if (userId && companyId) return `${STORAGE_KEY_PREFIX}:${userId}:${companyId}`;
  return STORAGE_KEY_PREFIX;
}

export function loadVisibleColumns(storageKey?: string): Set<string> {
  const key = storageKey || STORAGE_KEY_PREFIX;
  try {
    const stored = localStorage.getItem(key);
    if (stored) return new Set(JSON.parse(stored) as string[]);
    // Migration: try legacy global key if scoped key not found
    if (key !== STORAGE_KEY_PREFIX) {
      const legacy = localStorage.getItem(STORAGE_KEY_PREFIX);
      if (legacy) return new Set(JSON.parse(legacy) as string[]);
    }
  } catch { /* storage non disponibile — silenzioso */ }
  return new Set(DEFAULT_VISIBLE);
}

export function saveVisibleColumns(cols: Set<string>, storageKey?: string) {
  try { localStorage.setItem(storageKey || STORAGE_KEY_PREFIX, JSON.stringify(Array.from(cols))); } catch { /* Safari Private Browsing */ }
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
  /** Seleziona tutti i contatti che passano i filtri, non solo la pagina. */
  onSelezionaTuttiIRisultati?: () => void;
  selezionandoTutti?: boolean;
  onAnnullaSelezione?: () => void;
  visibleColumns: Set<string>;
  columnOrder?: string[];
  customFields?: CustomFieldDef[];
  customFieldValues?: Record<string, Record<string, string>>;
  canEdit?: boolean;
  onOpenPreview?: (contact: MarketingContact) => void;
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

function renderStaticCell(col: { key: string; label: string }, c: MarketingContact, cls: string, routePrefix: string) {
  const fullName = `${c.first_name} ${c.last_name || ""}`.trim();
  switch (col.key) {
    case "name":
      return (
        <TableCell key={col.key} className={cls}>
          <div className="flex items-center gap-2">
            <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0 ${getAvatarColor(fullName)}`}>
              {getInitials(c.first_name, c.last_name)}
            </div>
            <Link
              to={`${routePrefix}/contatti/${c.id}`}
              className="block max-w-[160px] truncate font-medium text-sm text-primary 2xl:max-w-[240px] hover:underline cursor-pointer"
              title={fullName}
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              {fullName}
            </Link>
          </div>
        </TableCell>
      );
    case "phone":
      return <TableCell key={col.key} className={`text-muted-foreground text-sm ${cls}`}>{c.phone || "—"}</TableCell>;
    case "email":
      return <TableCell key={col.key} className={`max-w-[180px] truncate text-muted-foreground text-sm 2xl:max-w-[280px] ${cls}`} title={c.email || undefined}>{c.email || "—"}</TableCell>;
    case "company_name":
      return <TableCell key={col.key} className={`max-w-[170px] truncate text-muted-foreground text-sm 2xl:max-w-[240px] ${cls}`} title={c.company_name || undefined}>{c.company_name || "—"}</TableCell>;
    case "created_at":
      return <TableCell key={col.key} className={`text-muted-foreground text-xs ${cls}`}>{formatContactDate(c.created_at)}</TableCell>;
    case "last_activity_at":
      return <TableCell key={col.key} className={`text-muted-foreground text-xs ${cls}`}>{formatContactDate(c.last_activity_at)}</TableCell>;
    case "tags":
      return (
        <TableCell key={col.key} className={cls}>
          {/* Una etichetta in vista, le altre col numero (tutte nel tooltip): riga sempre alta uguale. */}
          <div className="flex gap-1" title={c.tags.join(", ")}>
            {c.tags.slice(0, 1).map((tag) => (
              <Badge key={tag} variant="secondary" className="max-w-[110px] truncate text-[10px] px-1.5 py-0">{tag}</Badge>
            ))}
            {c.tags.length > 1 && <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{c.tags.length - 1}</Badge>}
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
    case "temperature":
      return (
        <TableCell key={col.key} className={cls}>
          <LeadTemperatureBadge
            lastActivityAt={c.last_activity_at}
            hasOpenOpportunity={!!c.opp_status && c.opp_status === 'open'}
            createdAt={c.created_at}
            compact
          />
        </TableCell>
      );
    default:
      return null;
  }
}

export const ContactsTable = memo(function ContactsTable({
  contacts, totalCount, selectedIds, onToggleSelect, onToggleAll,
  onEdit, onDelete, page, pageSize, onPageChange, onPageSizeChange,
  sortField, sortDirection, onSort, bulkActions,
  onSelezionaTuttiIRisultati, selezionandoTutti = false, onAnnullaSelezione,
  visibleColumns, columnOrder,
  customFields = [], customFieldValues = {}, canEdit = true, onOpenPreview,
}: ContactsTableProps) {
  const t = useT();
  const navigate = useNavigate();
  const routePrefix = useMarketingRoutePrefix();
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

  const indiceColonne = new Map((columnOrder ?? []).map((key, i) => [key, i]));
  const visibleCols = allCols.filter((c) => isVisible(c.key)).sort((a, b) =>
    (indiceColonne.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (indiceColonne.get(b.key) ?? Number.MAX_SAFE_INTEGER));
  const [scorrimento, setScorrimento] = useState<HTMLDivElement | null>(null);
  const borderClass = "border-r border-border/30";
  // La tabella si vede da 1024: con le colonne di serie era larga 1032px e a
  // 1024 scorreva di lato per 300px. Azienda da 1280, Creato da 1536 (se
  // scelte nel menu Colonne); sotto, celle più strette e email tagliata.
  const perLarghezza: Record<string, string> = {};

  return (
    <div className="space-y-3">
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
          <span className="font-medium tabular-nums">{t("{size} selezionati", { size: selectedIds.size.toLocaleString(intlCampo()) })}</span>
          {/* La casella in testa alla tabella prende solo la pagina: qui si
              prendono tutti i contatti che passano i filtri, anche quelli
              delle altre pagine. */}
          {onSelezionaTuttiIRisultati && allSelected && selectedIds.size < totalCount && (
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              disabled={selezionandoTutti}
              onClick={onSelezionaTuttiIRisultati}
            >
              {selezionandoTutti
                ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                : <ListChecks className="mr-1 h-3.5 w-3.5" />}
              {t("Seleziona tutti i {n}", { n: totalCount.toLocaleString(intlCampo()) })}
            </Button>
          )}
          {onAnnullaSelezione && (
            <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" onClick={onAnnullaSelezione}>
              {t("Annulla")}
            </Button>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {bulkActions}
            {canEdit && (
              <Button size="sm" variant="destructive" onClick={() => onDelete(Array.from(selectedIds))}>
                <Trash2 className="h-4 w-4 mr-1" /> {t("Elimina")}
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="rounded-md border">
        {/* 26/11/2026: ogni contatto su una riga (nomi, aziende e titoli andavano a capo). */}
        <BarraScorrimentoOrizzontale contenitore={scorrimento} className="mx-3 my-2" />
        <Table wrapperRef={setScorrimento} className="[&_td]:whitespace-nowrap [&_th]:whitespace-nowrap [&_td]:px-2 [&_th]:px-2 2xl:[&_td]:px-4 2xl:[&_th]:px-4">
          <TableHeader>
            <TableRow>
              <TableHead className={`w-[40px] ${borderClass}`}>
                <Checkbox aria-label={t("Seleziona i contatti di questa pagina")} checked={allSelected} onCheckedChange={onToggleAll} />
              </TableHead>
              {visibleCols.map((col, i) => {
                const isLast = i === visibleCols.length - 1;
                const sortable = !!col.sortField;
                return (
                  <TableHead
                    key={col.key}
                    className={`py-2 ${!isLast ? borderClass : ""} ${sortable ? "cursor-pointer select-none hover:bg-muted/50" : ""} ${perLarghezza[col.key] ?? ""}`}
                    aria-sort={col.sortField === sortField ? (sortDirection === "asc" ? "ascending" : "descending") : undefined}
                  >
                    {sortable ? <button type="button" onClick={() => handleSort(col)} className="flex w-full items-center text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {col.key.startsWith("cf_") ? col.label : t(col.label)}
                      {col.sortField && <SortIcon field={col.sortField} currentField={sortField} direction={sortDirection} />}
                    </button> : <div className="flex items-center text-xs">
                      {col.key.startsWith("cf_") ? col.label : t(col.label)}
                    </div>}
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
                  {t("Nessun contatto trovato")}
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((c) => (
                <TableRow
                  key={c.id}
                  className="group cursor-pointer"
                  onClick={() => {
                    if (onOpenPreview) onOpenPreview(c);
                    else navigate(`${routePrefix}/contatti/${c.id}`);
                  }}
                >
                  <TableCell className={`py-1.5 ${borderClass}`}>
                    <Checkbox
                      aria-label={t("Seleziona {valore}", { valore: `${c.first_name} ${c.last_name || ""}`.trim() })}
                      checked={selectedIds.has(c.id)}
                      onClick={(event) => event.stopPropagation()}
                      onCheckedChange={() => onToggleSelect(c.id)}
                    />
                  </TableCell>
                  {visibleCols.map((col, i) => {
                    const isLast = i === visibleCols.length - 1;
                    const cls = `py-1.5 ${!isLast ? borderClass : ""} ${perLarghezza[col.key] ?? ""}`;

                    // Custom field
                    if (col.key.startsWith("cf_")) {
                      const fieldId = col.key.replace("cf_", "");
                      const val = customFieldValues[c.id]?.[fieldId] || "—";
                      return <TableCell key={col.key} className={`text-muted-foreground text-sm ${cls}`}>{val}</TableCell>;
                    }

                    return renderStaticCell(col, c, cls, routePrefix);
                  })}
                  <TableCell className="py-1.5">
                    {canEdit && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label={t("Modifica contatto: {valore}", { valore: `${c.first_name} ${c.last_name || ""}`.trim() })}
                      onClick={(event) => {
                        event.stopPropagation();
                        onEdit(c);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    )}
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
          <span>{t("Righe per pagina")}</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger aria-label={t("Contatti per pagina")} className="w-[70px] h-8">
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
          <span className="text-muted-foreground">{t("Pagina {page} di {totalPages}", { page: String(page ?? ""), totalPages: String(totalPages ?? "") })}</span>
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>{t("Precedenti")}</Button>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>{t("Successive")}</Button>
        </div>
      </div>
    </div>
  );
});
