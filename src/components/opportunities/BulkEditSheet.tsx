import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ChevronRight, Loader2 } from "lucide-react";
import { useBulkUpdateOpportunities, useCompanyStaff } from "@/hooks/useOpportunitiesData";

interface BulkEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  stages: { id: string; name: string }[];
  onDone: () => void;
}

type Field = "stage_id" | "status" | "value" | "assigned_to" | "follower_id" | "source";

const FIELDS: { key: Field; label: string }[] = [
  { key: "stage_id", label: "Fase" },
  { key: "status", label: "Stato" },
  { key: "value", label: "Valore" },
  { key: "assigned_to", label: "Titolare" },
  { key: "follower_id", label: "Follower" },
  { key: "source", label: "Fonte" },
];

export function BulkEditSheet({ open, onOpenChange, selectedIds, stages, onDone }: BulkEditSheetProps) {
  const [selectedField, setSelectedField] = useState<Field | null>(null);
  const [fieldValue, setFieldValue] = useState("");
  const [search, setSearch] = useState("");
  const { data: staff = [] } = useCompanyStaff();
  const bulkUpdate = useBulkUpdateOpportunities();

  const filteredFields = search
    ? FIELDS.filter((f) => f.label.toLowerCase().includes(search.toLowerCase()))
    : FIELDS;

  const handleApply = () => {
    if (!selectedField || !fieldValue) return;

    let data: Record<string, any> = {};

    if (selectedField === "value") {
      data.value = parseFloat(fieldValue) || 0;
    } else if (selectedField === "assigned_to" || selectedField === "follower_id") {
      data[selectedField] = fieldValue === "none" ? null : fieldValue;
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
      <SheetContent className="w-[360px] sm:w-[400px]">
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
                      <SelectItem value="open">Aperta</SelectItem>
                      <SelectItem value="won">Vinta</SelectItem>
                      <SelectItem value="lost">Persa</SelectItem>
                      <SelectItem value="abandoned">Abbandonata</SelectItem>
                    </SelectContent>
                  </Select>
                )}

                {selectedField === "value" && (
                  <Input
                    type="number"
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

                <Button
                  onClick={handleApply}
                  disabled={!fieldValue || bulkUpdate.isPending}
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
