import { useMemo } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { Trash2, Pencil } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

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
  bulkActions?: React.ReactNode;
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

export function ContactsTable({
  contacts, totalCount, selectedIds, onToggleSelect, onToggleAll,
  onEdit, onDelete, page, pageSize, onPageChange, onPageSizeChange, bulkActions,
}: ContactsTableProps) {
  const navigate = useNavigate();
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const allSelected = contacts.length > 0 && contacts.every((c) => selectedIds.has(c.id));

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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox checked={allSelected} onCheckedChange={onToggleAll} />
              </TableHead>
              <TableHead>Nome del Contatto</TableHead>
              <TableHead>Telefono</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Azienda</TableHead>
              <TableHead>Creato</TableHead>
              <TableHead>Ultima Attività</TableHead>
              <TableHead>Tag</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                  Nessun contatto trovato
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((c) => {
                const fullName = `${c.first_name} ${c.last_name || ""}`.trim();
                return (
                  <TableRow key={c.id} className="group">
                    <TableCell>
                      <Checkbox checked={selectedIds.has(c.id)} onCheckedChange={() => onToggleSelect(c.id)} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 ${getAvatarColor(fullName)}`}>
                          {getInitials(c.first_name, c.last_name)}
                        </div>
                        <span
                          className="font-medium text-primary hover:underline cursor-pointer"
                          onClick={() => navigate(`/azienda/marketing/contatti/${c.id}`)}
                        >
                          {fullName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.phone || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{c.email || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{c.company_name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatDate(c.created_at)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatDate(c.last_activity_at)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {c.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                        ))}
                      </div>
                    </TableCell>
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
