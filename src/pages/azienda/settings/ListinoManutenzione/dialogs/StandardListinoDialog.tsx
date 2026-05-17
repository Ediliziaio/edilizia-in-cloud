/**
 * ListinoManutenzione — StandardListinoDialog (template picker)
 * Estratto da ListinoManutenzione.tsx (MP-IMP-001 Fase 5).
 *
 * Dialog "Importa da template" speculare a StandardTariffeDialog di
 * SettingsTariffe. Permette all'admin di:
 *  - scegliere uno o più preset professionali (card cliccabili) → importa in
 *    blocco tutte le tariffe coerenti con quel preset.
 *  - oppure accedere alla lista fine di tutte le ~70 tariffe standard e
 *    selezionare con checkbox quelle di interesse.
 *
 * La funzione di import è idempotente: voci già presenti vengono saltate.
 */
import { useMemo, useState } from "react";
import { Sparkles, Search, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import type { Vertical } from "@/hooks/useVertical";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  STANDARD_TARIFFE_LISTINO,
  PRESET_LISTINO_CARDS,
  getDefaultPresetsForVertical,
} from "../presets";
import type { PresetListinoId } from "../types";

export function StandardListinoDialog({
  open, onClose, existingCount, onImport, importing, vertical,
}: {
  open: boolean;
  onClose: () => void;
  existingCount: number;
  onImport: (params: {
    selectedPresets: PresetListinoId[];
    selectedTariffeKeys?: Set<string>;
  }) => void | Promise<void>;
  importing: boolean;
  vertical: Vertical;
}) {
  const [selectedPresets, setSelectedPresets] = useState<Set<PresetListinoId>>(
    () => {
      if (existingCount !== 0) return new Set<PresetListinoId>();
      const presets = getDefaultPresetsForVertical(vertical);
      return new Set<PresetListinoId>(presets);
    },
  );
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");

  const togglePreset = (id: PresetListinoId) => {
    setSelectedPresets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTariffa = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = selectedPresets.size > 0
      ? STANDARD_TARIFFE_LISTINO.filter((t) =>
          t.presets.some((p) => selectedPresets.has(p)))
      : STANDARD_TARIFFE_LISTINO;
    if (!q) return base;
    return base.filter((t) =>
      t.impianto.toLowerCase().includes(q) ||
      t.intervento.toLowerCase().includes(q),
    );
  }, [selectedPresets, search]);

  const countTotal = selectedKeys.size > 0
    ? selectedKeys.size
    : STANDARD_TARIFFE_LISTINO.filter((t) =>
        t.presets.some((p) => selectedPresets.has(p))).length;

  const handleImport = () => {
    if (importing) return;
    if (countTotal === 0) {
      toast.info("Seleziona almeno un template o una tariffa");
      return;
    }
    onImport({
      selectedPresets: Array.from(selectedPresets),
      selectedTariffeKeys: selectedKeys.size > 0 ? selectedKeys : undefined,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (importing) return;
        if (!next) onClose();
      }}
    >
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        onEscapeKeyDown={(e) => { if (importing) e.preventDefault(); }}
        onPointerDownOutside={(e) => { if (importing) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Importa da template
          </DialogTitle>
          <DialogDescription>
            Scegli uno o più pacchetti professionali per popolare il listino in
            blocco, oppure seleziona singole tariffe dalla lista. Voci già
            esistenti non verranno duplicate.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          {/* ── Card preset ── */}
          <div>
            <div className="text-sm font-semibold mb-2">
              Pacchetti professionali
              {existingCount === 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  (consigliato se parti da zero)
                </span>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PRESET_LISTINO_CARDS.map((p) => {
                const active = selectedPresets.has(p.id);
                const Icon = p.icon;
                const countPreset = STANDARD_TARIFFE_LISTINO.filter((t) =>
                  t.presets.includes(p.id)).length;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePreset(p.id)}
                    className={`text-left rounded-lg border p-3 transition-colors ${
                      active
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40 hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`rounded-md p-1.5 ${p.iconClass}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold text-sm truncate">{p.nome}</div>
                          {active && (
                            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {p.descrizione}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1">
                          {countPreset} tariffe
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Lista fine tariffe ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold">
                Seleziona singole tariffe
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  (opzionale — sovrascrive la selezione dei pacchetti)
                </span>
              </div>
              <div className="relative w-60">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cerca impianto o intervento..."
                  className="pl-8 h-8 text-xs"
                />
              </div>
            </div>
            <div className="rounded-md border overflow-hidden">
              <div className="max-h-[280px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Impianto</TableHead>
                      <TableHead>Intervento</TableHead>
                      <TableHead className="w-24 text-right">Prezzo</TableHead>
                      <TableHead className="w-16">IVA</TableHead>
                      <TableHead className="w-20">Unità</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-sm">
                          Nessuna tariffa trovata con i filtri correnti
                        </TableCell>
                      </TableRow>
                    ) : rows.map((t) => {
                      const key = `${t.impianto}::${t.intervento}`;
                      return (
                        <TableRow key={key}>
                          <TableCell>
                            <Checkbox
                              checked={selectedKeys.has(key)}
                              onCheckedChange={() => toggleTariffa(key)}
                            />
                          </TableCell>
                          <TableCell className="font-medium text-sm">{t.impianto}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{t.intervento}</TableCell>
                          <TableCell className="text-right text-sm">{formatCurrency(t.prezzo)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{t.iva_pct}%</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{t.unita}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between gap-3 border-t pt-3">
          <div className="text-xs text-muted-foreground">
            {countTotal > 0
              ? `${countTotal} tariffe da importare${existingCount > 0 ? " (duplicati ignorati)" : ""}`
              : "Nessuna tariffa selezionata"}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Annulla</Button>
            <Button onClick={handleImport} disabled={importing || countTotal === 0}>
              {importing ? "Importazione..." : `Importa ${countTotal > 0 ? countTotal : ""}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
