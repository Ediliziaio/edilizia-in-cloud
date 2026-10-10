/**
 * ListinoManutenzione — StandardListinoDialog (cataloghi pronti)
 * Estratto da ListinoManutenzione.tsx (MP-IMP-001 Fase 5).
 *
 * Finestra «Importa un catalogo pronto» speculare a StandardTariffeDialog di
 * SettingsTariffe. Permette all'admin di:
 *  - scegliere uno o più cataloghi (card cliccabili) → importa in blocco tutti
 *    i prezzi coerenti con quel catalogo.
 *  - oppure accedere alla lista fine di tutti i ~70 prezzi standard e
 *    selezionare con checkbox quelli di interesse.
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
      toast.info("Scegli almeno un catalogo o un prezzo");
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
            <Sparkles className="h-5 w-5 text-primary" aria-hidden />
            Importa un catalogo pronto
          </DialogTitle>
          <DialogDescription>
            Scegli uno o più cataloghi per riempire il listino in un colpo solo,
            oppure scegli i singoli prezzi dalla lista. Quello che c'è già non
            viene duplicato.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          {/* ── Cataloghi pronti ── */}
          <div>
            <h3 className="text-sm font-semibold mb-2">
              Cataloghi pronti
              {existingCount === 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  (consigliato se parti da zero)
                </span>
              )}
            </h3>
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
                    aria-pressed={active}
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
                          {countPreset} {countPreset === 1 ? "prezzo" : "prezzi"}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Lista fine dei prezzi ── */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="text-sm font-semibold">
                Scegli i singoli prezzi
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  (facoltativo — vale al posto dei cataloghi scelti sopra)
                </span>
              </h3>
              <div className="relative w-full sm:w-60">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cerca impianto o intervento..."
                  aria-label="Cerca impianto o intervento"
                  className="pl-8 h-8 text-xs max-md:h-11"
                />
              </div>
            </div>
            <div className="rounded-md border overflow-hidden">
              <div className="max-h-[280px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-10"><span className="sr-only">Scelta</span></TableHead>
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
                          Nessun prezzo trovato con la ricerca
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
                              aria-label={`Scegli ${t.impianto} · ${t.intervento}`}
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
              ? `${countTotal} ${countTotal === 1 ? "prezzo da importare" : "prezzi da importare"}${existingCount > 0 ? " (quelli già presenti vengono saltati)" : ""}`
              : "Nessun prezzo scelto"}
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
