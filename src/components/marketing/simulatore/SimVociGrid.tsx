/**
 * SimVociGrid — griglia editabile delle voci della simulazione.
 *
 * Le voci sono raggruppate per fase (`fase_id`): un'intestazione di gruppo per
 * ogni fase con almeno una voce, più il gruppo "Senza fase" in coda. Quando non
 * ci sono fasi, le voci stanno in un unico gruppo "Voci". Ogni riga (`SimVoceRow`)
 * espone un Select "Fase" per spostare la voce tra le fasi. Riga TOTALE in
 * fondo (somma dei totali di riga), empty-state quando vuoto.
 *
 * Pulsanti in alto:
 *   - "Riga libera" → aggiunge una `VoceSim` vuota (fonte:'libera') in coda.
 *   - "Da listino"  → apre il dialog (`onApriListino`) per listino/prezzari.
 *
 * Riordino righe con frecce ↑↓ (scambio con la riga adiacente nello stesso
 * gruppo). Ogni modifica passa per `onChange(voci)` → l'editor ricalcola i KPI
 * e autosalva.
 */
import { Fragment } from "react";
import { ListPlus, Plus, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/formatters";
import { calcolaVoce } from "@/lib/simulatore/calcoli";
import { SimVoceRow } from "./SimVoceRow";
import type { VoceSim, FaseSim, ScenariConfig } from "@/lib/simulatore/tipi";

interface SimVociGridProps {
  voci: VoceSim[];
  onChange: (voci: VoceSim[]) => void;
  onApriListino: () => void;
  /** Fasi correnti, per il raggruppamento e il Select "Fase" di riga. */
  fasi?: FaseSim[];
  /** Modalità IVA: in 'mista' le righe mostrano i controlli "bene significativo". */
  ivaMode?: ScenariConfig["iva_mode"];
}

/** Prossimo `ordine` libero (coda): max(ordine)+1, o 0 se vuoto. */
function nextOrdine(voci: VoceSim[]): number {
  return voci.length ? Math.max(...voci.map((v) => v.ordine)) + 1 : 0;
}

/** Crea una riga libera vuota con default sensati. */
function makeRigaLibera(voci: VoceSim[]): VoceSim {
  return {
    id: crypto.randomUUID(),
    fase_id: null,
    descrizione: "",
    fonte: "libera",
    riferimento_id: null,
    codice: null,
    quantita: 1,
    unita: "pz",
    costo_unitario: 0,
    ricarico_pct: 0,
    prezzo_unitario: 0,
    vat_rate: 10,
    bene_significativo: false,
    valore_posa_associata: null,
    is_manodopera: false,
    ordine: nextOrdine(voci),
  };
}

/** Una sezione di voci (un gruppo nella griglia). `faseId=null` = "Senza fase". */
interface Gruppo {
  faseId: string | null;
  titolo: string;
  voci: VoceSim[];
}

/**
 * Raggruppa le voci per fase. Le fasi (ordinate per `ordine`) che hanno almeno
 * una voce diventano gruppi; le voci senza fase (o con `fase_id` non più
 * esistente) finiscono nel gruppo "Senza fase" in coda. Senza fasi → un unico
 * gruppo "Voci". Dentro ogni gruppo, le voci sono ordinate per `ordine`.
 */
function raggruppa(voci: VoceSim[], fasi?: FaseSim[]): Gruppo[] {
  const byOrdine = (a: VoceSim, b: VoceSim) => a.ordine - b.ordine;

  if (!fasi || fasi.length === 0) {
    return [{ faseId: null, titolo: "Voci", voci: [...voci].sort(byOrdine) }];
  }

  const faseIds = new Set(fasi.map((f) => f.id));
  const gruppi: Gruppo[] = [];

  for (const f of [...fasi].sort((a, b) => a.ordine - b.ordine)) {
    const inFase = voci.filter((v) => v.fase_id === f.id).sort(byOrdine);
    if (inFase.length > 0) {
      gruppi.push({ faseId: f.id, titolo: f.nome || "Fase senza nome", voci: inFase });
    }
  }

  const senzaFase = voci
    .filter((v) => v.fase_id === null || !faseIds.has(v.fase_id))
    .sort(byOrdine);
  if (senzaFase.length > 0) {
    gruppi.push({ faseId: null, titolo: "Senza fase", voci: senzaFase });
  }

  return gruppi;
}

export function SimVociGrid({ voci, onChange, onApriListino, fasi, ivaMode = "singola" }: SimVociGridProps) {
  const gruppi = raggruppa(voci, fasi);
  const hasFasi = !!fasi && fasi.length > 0;
  // Colonne totali (per il colspan della riga totale e delle intestazioni gruppo).
  const colCount = hasFasi ? 10 : 9;

  const totale = voci.reduce((acc, v) => acc + calcolaVoce(v).imponibile_ricavo, 0);

  const patchVoce = (id: string, patch: Partial<VoceSim>) => {
    onChange(voci.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  };

  const removeVoce = (id: string) => {
    onChange(voci.filter((v) => v.id !== id));
  };

  const addRigaLibera = () => {
    onChange([...voci, makeRigaLibera(voci)]);
  };

  // Scambia la voce con la riga adiacente NELLO STESSO GRUPPO, scambiandone `ordine`.
  const move = (groupVoci: VoceSim[], id: string, dir: -1 | 1) => {
    const idx = groupVoci.findIndex((v) => v.id === id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= groupVoci.length) return;
    const a = groupVoci[idx];
    const b = groupVoci[swapIdx];
    onChange(
      voci.map((v) => {
        if (v.id === a.id) return { ...v, ordine: b.ordine };
        if (v.id === b.id) return { ...v, ordine: a.ordine };
        return v;
      }),
    );
  };

  const isEmpty = voci.length === 0;

  return (
    <Card className="rounded-xl">
      <CardContent className="space-y-3 p-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ListPlus className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-semibold">Voci</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={addRigaLibera} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Riga libera
            </Button>
            <Button size="sm" onClick={onApriListino} className="gap-1.5">
              <Library className="h-4 w-4" />
              Da listino
            </Button>
          </div>
        </div>

        {isEmpty ? (
          <EmptyState
            icon={ListPlus}
            size="sm"
            title="Nessuna voce"
            description="Aggiungi una voce da listino o prezzari, oppure inserisci una riga libera per partire."
            action={{ label: "Da listino", onClick: onApriListino, icon: Library, primary: true }}
            secondaryAction={{ label: "Riga libera", onClick: addRigaLibera, icon: Plus }}
          />
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Descrizione</TableHead>
                  {hasFasi ? <TableHead className="w-[140px]">Fase</TableHead> : null}
                  <TableHead className="w-[88px] text-right">Q.tà</TableHead>
                  <TableHead className="w-[84px]">UM</TableHead>
                  <TableHead className="w-[112px] text-right">Costo</TableHead>
                  <TableHead className="w-[88px] text-right">Ric. %</TableHead>
                  <TableHead className="w-[76px]">IVA</TableHead>
                  <TableHead className="w-[112px] text-right">Prezzo</TableHead>
                  <TableHead className="w-[120px] text-right">Totale</TableHead>
                  <TableHead className="w-[88px] text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gruppi.map((g) => {
                  const gruppoTotale = g.voci.reduce(
                    (acc, v) => acc + calcolaVoce(v).imponibile_ricavo,
                    0,
                  );
                  return (
                    <Fragment key={g.faseId ?? "__senza__"}>
                      {hasFasi ? (
                        <TableRow className="bg-secondary/40 hover:bg-secondary/40">
                          <TableCell
                            colSpan={colCount - 1}
                            className="py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                          >
                            {g.titolo}
                          </TableCell>
                          <TableCell className="py-1.5 text-right text-xs font-semibold tabular-nums text-muted-foreground">
                            {formatCurrency(gruppoTotale)}
                          </TableCell>
                        </TableRow>
                      ) : null}
                      {g.voci.map((voce, i) => (
                        <SimVoceRow
                          key={voce.id}
                          voce={voce}
                          fasi={fasi}
                          ivaMode={ivaMode}
                          onChange={(patch) => patchVoce(voce.id, patch)}
                          onRemove={() => removeVoce(voce.id)}
                          reorder={{
                            isFirst: i === 0,
                            isLast: i === g.voci.length - 1,
                            onMoveUp: () => move(g.voci, voce.id, -1),
                            onMoveDown: () => move(g.voci, voce.id, 1),
                          }}
                        />
                      ))}
                    </Fragment>
                  );
                })}
              </TableBody>
              <tfoot>
                <TableRow className="border-t-2 bg-secondary/40 hover:bg-secondary/40">
                  <TableCell colSpan={colCount - 2} className="text-right text-sm font-semibold">
                    Totale imponibile
                  </TableCell>
                  <TableCell className="text-right text-sm font-bold tabular-nums">
                    {formatCurrency(totale)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </tfoot>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
