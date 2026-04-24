import { useState, useMemo } from "react";
import { format, parseISO, isAfter } from "date-fns";
import { it } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, ChevronRight, Search, CalendarX, Inbox, User, UserCircle2 } from "lucide-react";
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
    const current = appointments.find((a) => a.id === id);
    if (current?.status === newStatus) return; // early return se lo status non cambia

    const { error } = await supabase.from("appointments").update({ status: newStatus } as any).eq("id", id).eq("company_id", companyId);
    if (error) {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Stato aggiornato" });
      onRefresh();
    }
  };

  // Count per tab — evita re-eseguire il filter multiple volte
  const counts = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const prossimo = appointments.filter(
      (a) => a.status !== "annullato" && isAfter(parseISO(a.appointment_date), todayStart)
    ).length;
    const annullato = appointments.filter((a) => a.status === "annullato").length;
    return { prossimo, annullato, tutti: appointments.length };
  }, [appointments]);

  const subTabs = [
    { key: "prossimo" as const, label: "Prossimi", count: counts.prossimo },
    { key: "annullato" as const, label: "Annullati", count: counts.annullato },
    { key: "tutti" as const, label: "Tutti", count: counts.tutti },
  ];

  return (
    <div className="space-y-4">
      {/* Sub-tabs con count badge */}
      <div className="flex items-center gap-1 border-b">
        {subTabs.map((t) => {
          const active = subTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => {
                setSubTab(t.key);
                setPage(0);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 pb-2 pt-1 px-3 text-sm font-medium border-b-2 transition-colors",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
              <span
                className={cn(
                  "inline-flex items-center justify-center text-[10px] rounded px-1.5 py-0.5 tabular-nums font-semibold",
                  active
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {t.count}
              </span>
            </button>
          );
        })}
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
              <TableHead>
                <span className="inline-flex items-center gap-1">
                  <User className="h-3 w-3 text-muted-foreground" />
                  Cliente
                </span>
              </TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Data / Ora</TableHead>
              <TableHead>Calendario</TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1">
                  <UserCircle2 className="h-3 w-3 text-primary" />
                  Venditore assegnato
                </span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    {search.trim() ? (
                      <Search className="h-10 w-10 opacity-40" />
                    ) : subTab === "annullato" ? (
                      <CalendarX className="h-10 w-10 opacity-40" />
                    ) : (
                      <Inbox className="h-10 w-10 opacity-40" />
                    )}
                    <p className="font-medium text-foreground">
                      {search.trim()
                        ? "Nessun risultato"
                        : subTab === "annullato"
                        ? "Nessun appuntamento annullato"
                        : subTab === "prossimo"
                        ? "Nessun appuntamento imminente"
                        : "Nessun appuntamento"}
                    </p>
                    <p className="text-xs">
                      {search.trim()
                        ? "Prova con un altro termine di ricerca"
                        : "Crea un nuovo appuntamento dal calendario"}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paged.map((apt, idx) => (
                <TableRow
                  key={apt.id}
                  className={cn(
                    "cursor-pointer transition-colors",
                    idx % 2 === 1 ? "bg-muted/30 hover:bg-muted/60" : "hover:bg-muted/40"
                  )}
                  onClick={() => onClickAppointment(apt)}
                >
                  <TableCell className="text-muted-foreground text-xs">
                    {page * rowsPerPage + idx + 1}
                  </TableCell>
                  <TableCell className="font-medium">{apt.title}</TableCell>
                  <TableCell className="text-sm">
                    {apt.contact_name ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold">
                          {apt.contact_name.charAt(0).toUpperCase()}
                        </span>
                        {apt.contact_name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </TableCell>
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
                  <TableCell className="text-sm">
                    {apt.assigned_name ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary/15 text-primary text-[10px] font-semibold">
                          {apt.assigned_name.charAt(0).toUpperCase()}
                        </span>
                        {apt.assigned_name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60 italic text-xs">non assegnato</span>
                    )}
                  </TableCell>
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
