import { useState, useMemo } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarClock, Plus, Loader2, Search } from "lucide-react";
import { useScadenzario } from "@/hooks/useScadenzario";
import ScadenzarioKPIs from "@/components/scadenzario/ScadenzarioKPIs";
import ScadenzarioTable from "@/components/scadenzario/ScadenzarioTable";
import MarkPaidDialog from "@/components/scadenzario/MarkPaidDialog";
import NewScadenzaDialog from "@/components/scadenzario/NewScadenzaDialog";
import type { Scadenza } from "@/hooks/useScadenzario";
import { isPast, isToday } from "date-fns";

export default function Scadenzario() {
  const { scadenze, isLoading, summary, isSummaryLoading, markPaid, create, cancel } = useScadenzario();
  const [tab, setTab] = useState("tutte");
  const [search, setSearch] = useState("");
  const [payDialog, setPayDialog] = useState<Scadenza | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const filtered = useMemo(() => {
    let list = scadenze;

    // Tab filter
    if (tab === "da_incassare") list = list.filter((s) => s.direction === "entrata" && s.status !== "pagata" && s.status !== "annullata");
    else if (tab === "da_pagare") list = list.filter((s) => s.direction === "uscita" && s.status !== "pagata" && s.status !== "annullata");
    else if (tab === "scadute") list = list.filter((s) => {
      const d = new Date(s.due_date);
      return isPast(d) && !isToday(d) && s.status !== "pagata" && s.status !== "annullata";
    });
    else if (tab === "pagate") list = list.filter((s) => s.status === "pagata");

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) =>
        s.description.toLowerCase().includes(q) ||
        s.suppliers?.name?.toLowerCase().includes(q) ||
        s.invoices?.client_company_name?.toLowerCase().includes(q) ||
        s.invoices?.invoice_number?.toLowerCase().includes(q) ||
        s.marketing_contacts?.company_name?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [scadenze, tab, search]);

  // Counts for tabs
  const counts = useMemo(() => {
    const active = scadenze.filter((s) => s.status !== "pagata" && s.status !== "annullata");
    const overdue = scadenze.filter((s) => {
      const d = new Date(s.due_date);
      return isPast(d) && !isToday(d) && s.status !== "pagata" && s.status !== "annullata";
    });
    return {
      tutte: scadenze.length,
      da_incassare: active.filter((s) => s.direction === "entrata").length,
      da_pagare: active.filter((s) => s.direction === "uscita").length,
      scadute: overdue.length,
      pagate: scadenze.filter((s) => s.status === "pagata").length,
    };
  }, [scadenze]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold">Scadenzario</h1>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nuova Scadenza
        </Button>
      </div>

      {/* KPIs */}
      <ScadenzarioKPIs summary={summary} isLoading={isSummaryLoading} />

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Tabs value={tab} onValueChange={setTab} className="flex-1">
          <TabsList>
            <TabsTrigger value="tutte">Tutte ({counts.tutte})</TabsTrigger>
            <TabsTrigger value="da_incassare">Da Incassare ({counts.da_incassare})</TabsTrigger>
            <TabsTrigger value="da_pagare">Da Pagare ({counts.da_pagare})</TabsTrigger>
            <TabsTrigger value="scadute">
              Scadute {counts.scadute > 0 && <span className="ml-1 text-destructive font-bold">({counts.scadute})</span>}
            </TabsTrigger>
            <TabsTrigger value="pagate">Pagate</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ScadenzarioTable
          scadenze={filtered}
          onMarkPaid={(s) => setPayDialog(s)}
          onCancel={(id) => cancel.mutate(id)}
        />
      )}

      {/* Dialogs */}
      <MarkPaidDialog
        scadenza={payDialog}
        open={!!payDialog}
        onOpenChange={(o) => !o && setPayDialog(null)}
        onConfirm={(p) => {
          markPaid.mutate(p, { onSuccess: () => setPayDialog(null) });
        }}
        isPending={markPaid.isPending}
      />
      <NewScadenzaDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onConfirm={(p) => {
          create.mutate(p, { onSuccess: () => setNewOpen(false) });
        }}
        isPending={create.isPending}
      />
    </div>
  );
}
