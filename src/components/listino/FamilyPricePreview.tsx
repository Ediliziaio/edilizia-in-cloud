/**
 * Preventivatore Verticalizzato Serramentisti — FASE 4.6
 *
 * Preview live del prezzo di un'istanza famiglia. Versione interim (la logica
 * definitiva pura sarà in FASE 5: useFamilyPricing). Qui applichiamo una
 * formula semplice coerente con la spec:
 *
 *   prezzo_base = lookup griglia(L, H) ∨ prezzo_base_vendita ∨ 0
 *   per ogni asse selezionato:
 *     se maggiorazione.percentuale: prezzo_base *= (1 + v/100)
 *     se maggiorazione.fisso_*    : prezzo_base += v  (unità coerente con UM)
 *
 * La formula avverte l'utente che è provvisoria. Non deve essere usata al di
 * fuori dell'editor.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calculator } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FamilyWithAxes, AxisSelection } from "@/types/articleFamily";

interface GridCell {
  valore_x: number;
  valore_y: number;
  prezzo_vendita: number;
  prezzo_acquisto: number;
}

interface Props {
  family: FamilyWithAxes;
}

function formatEur(n: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n);
}

export function FamilyPricePreview({ family }: Props) {
  const companyId = useEffectiveCompanyId();

  // Selezione default dagli assi
  const initialSelection: AxisSelection = useMemo(() => {
    const sel: AxisSelection = {};
    for (const ax of family.axes) {
      const def = ax.values.find((v) => v.is_default) ?? ax.values[0];
      if (def) sel[ax.codice] = def.id;
    }
    return sel;
  }, [family.axes]);

  const [selection, setSelection] = useState<AxisSelection>(initialSelection);
  const [larghezza, setLarghezza] = useState("1200");
  const [altezza, setAltezza] = useState("1400");
  const [quantita, setQuantita] = useState("1");

  // Carica griglia se serve
  const { data: gridCells = [] } = useQuery({
    queryKey: queryKeys.articleFamilies.grid(family.id),
    enabled: !!companyId && !!family.id && family.modalita_prezzo_base === "griglia",
    queryFn: async (): Promise<GridCell[]> => {
      const { data, error } = await supabase
        .from("listino_griglia")
        .select("valore_x, valore_y, prezzo_vendita, prezzo_acquisto")
        .eq("family_id", family.id)
        .eq("company_id", companyId!);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as GridCell[];
    },
    staleTime: 60 * 1000,
  });

  // Calcolo
  const result = useMemo(() => {
    const w = parseFloat(larghezza) || 0;
    const h = parseFloat(altezza) || 0;
    const q = parseFloat(quantita) || 1;
    const warnings: string[] = [];

    // Prezzo base secondo modalità
    let base = 0;
    let baseAcquisto = 0;
    if (family.modalita_prezzo_base === "griglia") {
      const cell = gridCells.find((c) => c.valore_x === w && c.valore_y === h);
      if (cell) {
        base = Number(cell.prezzo_vendita);
        baseAcquisto = Number(cell.prezzo_acquisto);
      } else {
        warnings.push(
          `Cella ${w}×${h} non in griglia — usato fallback prezzo_base (${formatEur(family.prezzo_base_vendita)}).`,
        );
        base = Number(family.prezzo_base_vendita);
        baseAcquisto = Number(family.prezzo_base_acquisto);
      }
    } else if (family.modalita_prezzo_base === "mq") {
      const mq = (w * h) / 1_000_000; // mm² → m²
      base = Number(family.prezzo_base_vendita) * mq;
      baseAcquisto = Number(family.prezzo_base_acquisto) * mq;
    } else {
      base = Number(family.prezzo_base_vendita);
      baseAcquisto = Number(family.prezzo_base_acquisto);
    }

    // Applica maggiorazioni — prima le percentuali, poi le fisse (convenzione)
    // Ma la spec non è esplicita; scegliamo ordine: first all percentuali sui base,
    // poi fisse additive. Semplice, deterministico.
    let prezzoVendita = base;
    let prezzoAcquisto = baseAcquisto;

    const mq = (w * h) / 1_000_000;
    const ml = w / 1000; // larghezza in metri
    const mc = (w * h * 1000) / 1_000_000_000; // placeholder; la prof. non è nella famiglia

    // Pass 1: percentuali
    for (const ax of family.axes) {
      const selId = selection[ax.codice];
      if (!selId) continue;
      const v = ax.values.find((x) => x.id === selId);
      if (!v || v.maggiorazione_tipo !== "percentuale") continue;
      prezzoVendita *= 1 + Number(v.maggiorazione_valore) / 100;
      prezzoAcquisto *= 1 + Number(v.maggiorazione_acquisto) / 100;
    }

    // Pass 2: fisse
    for (const ax of family.axes) {
      const selId = selection[ax.codice];
      if (!selId) continue;
      const v = ax.values.find((x) => x.id === selId);
      if (!v || v.maggiorazione_tipo === "none" || v.maggiorazione_tipo === "percentuale") continue;
      const vendAdd = Number(v.maggiorazione_valore);
      const acqAdd = Number(v.maggiorazione_acquisto);
      switch (v.maggiorazione_tipo) {
        case "fisso_pz":
          prezzoVendita += vendAdd;
          prezzoAcquisto += acqAdd;
          break;
        case "fisso_mq":
          prezzoVendita += vendAdd * mq;
          prezzoAcquisto += acqAdd * mq;
          break;
        case "fisso_ml":
          prezzoVendita += vendAdd * ml;
          prezzoAcquisto += acqAdd * ml;
          break;
        case "fisso_mc":
          prezzoVendita += vendAdd * mc;
          prezzoAcquisto += acqAdd * mc;
          break;
      }
    }

    const totVendita = prezzoVendita * q;
    const totAcquisto = prezzoAcquisto * q;
    const margine = totVendita - totAcquisto;
    const marginePerc = totVendita > 0 ? (margine / totVendita) * 100 : 0;

    return {
      base,
      prezzoVendita,
      prezzoAcquisto,
      totVendita,
      totAcquisto,
      margine,
      marginePerc,
      warnings,
      mq,
    };
  }, [family, gridCells, selection, larghezza, altezza, quantita]);

  const showDims =
    family.modalita_prezzo_base === "griglia" || family.modalita_prezzo_base === "mq";

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calculator className="h-4 w-4" aria-hidden="true" />
          Simulatore prezzo
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Preview indicativa — il motore di calcolo definitivo è in FASE 5.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {showDims ? (
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Larghezza (mm)</label>
              <Input
                type="number"
                value={larghezza}
                onChange={(e) => setLarghezza(e.target.value)}
                className="h-8"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Altezza (mm)</label>
              <Input
                type="number"
                value={altezza}
                onChange={(e) => setAltezza(e.target.value)}
                className="h-8"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Quantità</label>
              <Input
                type="number"
                value={quantita}
                onChange={(e) => setQuantita(e.target.value)}
                className="h-8"
              />
            </div>
          </div>
        ) : (
          <div>
            <label className="text-xs text-muted-foreground">Quantità</label>
            <Input
              type="number"
              value={quantita}
              onChange={(e) => setQuantita(e.target.value)}
              className="h-8 w-24"
            />
          </div>
        )}

        {family.axes.length > 0 ? (
          <div className="space-y-2">
            {family.axes.map((ax) => (
              <div key={ax.id}>
                <label className="text-xs text-muted-foreground">{ax.nome}</label>
                <Select
                  value={selection[ax.codice] ?? ""}
                  onValueChange={(v) =>
                    setSelection({ ...selection, [ax.codice]: v })
                  }
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Seleziona…" />
                  </SelectTrigger>
                  <SelectContent>
                    {ax.values
                      .filter((v) => v.attivo)
                      .map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.label}
                          {v.maggiorazione_tipo !== "none"
                            ? v.maggiorazione_tipo === "percentuale"
                              ? ` (+${v.maggiorazione_valore}%)`
                              : ` (+${v.maggiorazione_valore} €)`
                            : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        ) : null}

        {result.warnings.length > 0 ? (
          <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-md p-2 space-y-0.5">
            {result.warnings.map((w, i) => (
              <div key={i}>⚠ {w}</div>
            ))}
          </div>
        ) : null}

        <div className="border-t pt-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Prezzo base</span>
            <span className="font-mono">{formatEur(result.base)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Vendita unitario</span>
            <span className="font-mono">{formatEur(result.prezzoVendita)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Acquisto unitario</span>
            <span className="font-mono text-muted-foreground">{formatEur(result.prezzoAcquisto)}</span>
          </div>
          <div className="flex justify-between font-semibold border-t pt-1">
            <span>Totale vendita ({quantita} pz)</span>
            <span className="font-mono text-primary">{formatEur(result.totVendita)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">
              Margine: {formatEur(result.margine)} ({result.marginePerc.toFixed(1)}%)
            </span>
            {showDims ? (
              <span className="text-muted-foreground">
                {result.mq.toFixed(2)} m²
              </span>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
