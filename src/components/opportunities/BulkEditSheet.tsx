import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ChevronRight, Loader2 } from "lucide-react";
import { useBulkUpdateOpportunities, useCompanyStaff } from "@/hooks/useOpportunitiesData";
import { STATUS_OPTIONS } from "@/types/opportunities";
import { toast } from "sonner";

interface BulkEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  stages: { id: string; name: string; auto_status?: string | null }[];
  onDone: () => void;
  canEdit?: boolean;
}

type Field = "stage_id" | "status" | "value" | "assigned_to" | "follower_id" | "source" | "expected_close_date" | "next_action";

const FIELDS: { key: Field; label: string }[] = [
  { key: "stage_id", label: "Fase" },
  { key: "status", label: "Stato" },
  { key: "value", label: "Valore" },
  { key: "assigned_to", label: "Venditore" },
  { key: "follower_id", label: "Follower" },
  { key: "source", label: "Fonte" },
  { key: "expected_close_date", label: "Data chiusura prevista" },
  { key: "next_action", label: "Prossima azione" },
];

export function BulkEditSheet({ open, onOpenChange, selectedIds, stages, onDone, canEdit = true }: BulkEditSheetProps) {
  const [selectedField, setSelectedField] = useState<Field | null>(null);
  const [fieldValue, setFieldValue] = useState("");
  const [search, setSearch] = useState("");
  const { data: staff = [] } = useCompanyStaff();
  const bulkUpdate = useBulkUpdateOpportunities();

  const filteredFields = search
    ? FIELDS.filter((f) => f.label.toLowerCase().includes(search.toLowerCase()))
    : FIELDS;

  const handleApply = () => {
    if (!canEdit) {
      toast.error("Non hai i permessi per modificare opportunità");
      return;
    }
    if (!selectedField || !fieldValue) return;

    const data: Record<string, any> = {};

    if (selectedField === "value") {
      const numericValue = Number(fieldValue);
      if (!Number.isFinite(numericValue) || numericValue < 0) {
        toast.error("Il valore economico deve essere un numero positivo");
        return;
      }
      data.value = numericValue;
    } else if (selectedField === "status" && fieldValue === "lost") {
      toast.error("Per segnare opportunità perse serve indicare il motivo dal dettaglio opportunità");
      return;
    } else if (selectedField === "assigned_to" || selectedField === "follower_id") {
      data[selectedField] = fieldValue === "none" ? null : fieldValue;
    } else if (selectedField === "source") {
      data.source = fieldValue.trim();
    } else if (selectedField === "expected_close_date") {
      data.expected_close_date = fieldValue; // input date → YYYY-MM-DD
    } else if (selectedField === "next_action") {
      data.next_action = fieldValue.trim();
    } else if (selectedField === "stage_id") {
      // Coerenza col drag kanban e il quick-move lista: la fase può derivare
      // lo status (auto_status). PRIMA il bulk spostava in una colonna
      // "Vinta"/"Persa" lasciando le opportunità "open" → KPI e colori
      // divergevano dalla colonna. Verso una fase "persa" vale la stessa
      // regola del bulk-lost: serve il motivo, quindi si blocca.
      const targetStage = stages.find((st) => st.id === fieldValue);
      if (targetStage?.auto_status === "lost") {
        toast.error("La fase scelta segna le opportunità come perse: serve il motivo, fallo dal dettaglio");
        return;
      }
      data.stage_id = fieldValue;
      if (targetStage?.auto_status) data.status = targetStage.auto_status;
    } else {
      data[selectedField] = fieldValue;
    }

    bulkUpdate.mutate({ ids: selectedIds, data }, {
      onSuccess: () => {
        onDone();
        onOpenChange(false);
        setSelectedField(null);
        setFieldValue("");
      },
    });
  };

  const handleBack = () => {
    setSelectedField(null);
    setFieldValue("");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:w-[400px]">
        <SheetHeader>
          <SheetTitle>Modifica in blocco ({selectedIds.length})</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {!selectedField ? (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cerca campo..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="space-y-1">
                {filteredFields.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => { setSelectedField(f.key); setFieldValue(""); }}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-muted transition-colors text-sm"
                  >
                    {f.label}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={handleBack} className="text-xs">
                ← Torna alla lista
              </Button>

              <div className="space-y-3">
                <Label className="text-sm font-medium">
                  {FIELDS.find((f) => f.key === selectedField)?.label}
                </Label>

                {selectedField === "stage_id" && (
                  <Select value={fieldValue} onValueChange={setFieldValue}>
                    <SelectTrigger><SelectValue placeholder="Seleziona fase..." /></SelectTrigger>
                    <SelectContent>
                      {stages.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {selectedField === "status" && (
                  <Select value={fieldValue} onValueChange={setFieldValue}>
                    <SelectTrigger><SelectValue placeholder="Seleziona stato..." /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {selectedField === "value" && (
                  <Input
                    type="number"
                    min="0"
                    placeholder="Nuovo valore..."
                    value={fieldValue}
                    onChange={(e) => setFieldValue(e.target.value)}
                  />
                )}

                {(selectedField === "assigned_to" || selectedField === "follower_id") && (
                  <Select value={fieldValue} onValueChange={setFieldValue}>
                    <SelectTrigger><SelectValue placeholder="Seleziona persona..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nessuno</SelectItem>
                      {staff.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {selectedField === "source" && (
                  <Input
                    placeholder="Nuova fonte..."
                    value={fieldValue}
                    onChange={(e) => setFieldValue(e.target.value)}
                  />
                )}

                {selectedField === "expected_close_date" && (
                  <Input
                    type="date"
                    value={fieldValue}
                    onChange={(e) => setFieldValue(e.target.value)}
                  />
                )}

                {selectedField === "next_action" && (
                  <Input
                    placeholder="Es. Richiamare, inviare preventivo..."
                    value={fieldValue}
                    onChange={(e) => setFieldValue(e.target.value)}
                  />
                )}

                <Button
                  onClick={handleApply}
                  disabled={!fieldValue || bulkUpdate.isPending || !canEdit}
                  className="w-full"
                >
                  {bulkUpdate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Applica a {selectedIds.length} opportunità
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
