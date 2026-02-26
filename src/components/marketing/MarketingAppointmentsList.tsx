import { useState, useMemo } from "react";
import { format, parseISO, isAfter } from "date-fns";
import { it } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import type { MarketingAppointment } from "@/types/marketingCalendar";

interface Props {
  appointments: MarketingAppointment[];
  onRefresh: () => void;
  onClickAppointment: (apt: MarketingAppointment) => void;
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  confermato: { label: "Confermato", variant: "default" },
  annullato: { label: "Annullato", variant: "destructive" },
  riprogrammato: { label: "Riprogrammato", variant: "secondary" },
  completato: { label: "Completato", variant: "outline" },
};

const ROWS_OPTIONS = [10, 25, 50];

export default function MarketingAppointmentsList({ appointments, onRefresh, onClickAppointment }: Props) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [subTab, setSubTab] = useState<"prossimo" | "annullato" | "tutti">("prossimo");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const filtered = useMemo(() => {
    let list = appointments;

    if (subTab === "prossimo") {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      list = list.filter(
        (a) => a.status !== "annullato" && isAfter(parseISO(a.appointment_date), todayStart)
      );
    } else if (subTab === "annullato") {
      list = list.filter((a) => a.status === "annullato");
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.contact_name && a.contact_name.toLowerCase().includes(q))
      );
    }

    return list.sort(
      (a, b) => new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime()
    );
  }, [appointments, subTab, search]);

  const totalPages = Math.ceil(filtered.length / rowsPerPage);
  const paged = filtered.slice(page * rowsPerPage, (page + 1) * rowsPerPage);

  const handleStatusChange = async (id: string, newStatus: string) => {
    const { error } = await supabase.from("appointments").update({ status: newStatus } as any).eq("id", id).eq("company_id", companyId);
    if (error) {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Stato aggiornato" });
      onRefresh();
    }
  };

  const subTabs = [
    { key: "prossimo" as const, label: "Prossimo" },
    { key: "annullato" as const, label: "Annullato" },
    { key: "tutti" as const, label: "Tutti" },
  ];

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex items-center gap-4 border-b">
        {subTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setSubTab(t.key); setPage(0); }}
            className={cn(
              "pb-2 text-sm font-medium border-b-2 transition-colors",
              subTab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cerca per titolo o contatto..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Titolo</TableHead>
              <TableHead>Contatto</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Data / Ora</TableHead>
              <TableHead>Calendario</TableHead>
              <TableHead>Titolare</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Nessun appuntamento trovato
                </TableCell>
              </TableRow>
            ) : (
              paged.map((apt, idx) => (
                <TableRow
                  key={apt.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onClickAppointment(apt)}
                >
                  <TableCell className="text-muted-foreground text-xs">
                    {page * rowsPerPage + idx + 1}
                  </TableCell>
                  <TableCell className="font-medium">{apt.title}</TableCell>
                  <TableCell className="text-sm">{apt.contact_name || "—"}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={apt.status}
                      onValueChange={(v) => handleStatusChange(apt.id, v)}
                    >
                      <SelectTrigger className="h-7 text-xs w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_MAP).map(([val, meta]) => (
                          <SelectItem key={val} value={val}>
                            <Badge variant={meta.variant} className="text-[10px]">
                              {meta.label}
                            </Badge>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {format(parseISO(apt.appointment_date), "dd/MM/yyyy", { locale: it })}
                    {apt.appointment_time && (
                      <span className="text-muted-foreground ml-1">
                        {apt.appointment_time.slice(0, 5)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{apt.calendar_name || "—"}</TableCell>
                  <TableCell className="text-sm">{apt.assigned_name || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Mostra da {page * rowsPerPage + 1} a{" "}
            {Math.min((page + 1) * rowsPerPage, filtered.length)} di {filtered.length} risultati
          </span>
          <div className="flex items-center gap-2">
            <Select
              value={String(rowsPerPage)}
              onValueChange={(v) => { setRowsPerPage(Number(v)); setPage(0); }}
            >
              <SelectTrigger className="h-8 w-20 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROWS_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} righe
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs">
              {page + 1} / {totalPages || 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
