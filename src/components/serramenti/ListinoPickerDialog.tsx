/**
 * ListinoPickerDialog — sceglie un articolo dal listino aziendale.
 *
 * Flusso nuovo (2 step):
 *  1. Scegli FAMIGLIA dal listino (con filtro/ricerca)
 *  2. Inserisci MISURE LIBERE (larghezza × altezza × quantità). Il sistema
 *     calcola il prezzo in base a `modalita_prezzo_base` della famiglia:
 *       - 'pz'           → prezzo_base × quantita
 *       - 'mq'           → prezzo_base × (l×h/10⁶) × quantita
 *       - 'misura_libera'→ prezzo_base × quantita (misure indicative)
 *       - 'griglia'      → lookup nella listino_griglia con misure
 *                          più vicine (≤ alle misure richieste)
 *
 *  La manodopera/posa configurata sulla famiglia (FamilyEditor) è
 *  AUTOMATICAMENTE INCLUSA nel prezzo della posizione, non separata.
 */
import { useState, useEffect, useMemo } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Loader2, Search, Package, ArrowLeft, Ruler, HardHat, Calculator,
} from "lucide-react";
import { useListinoFamilies, useListinoGriglia, useTariffeManodopera } from "@/lib/serramenti/queries";
import type { ListinoFamily } from "@/lib/serramenti/api";

export interface ListinoPickResult {
  family_id: string;
  family_nome: string;
  larghezza_mm: number | null;
  altezza_mm: number | null;
  quantita: number;
  /** Prezzo unitario FINALE — include eventuale posa configurata sul prodotto */
  prezzo_unitario: number | null;
  /** Subtotali per trasparenza */
  prezzo_prodotto: number | null;
  prezzo_posa: number | null;
  griglia_id?: string | null;
  note?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: ListinoPickResult) => void;
}

// ─── Helpers calcolo prezzo ─────────────────────────────────────────────────

function calcolaPrezzoProdotto(
  family: ListinoFamily,
  larghezza: number | null,
  altezza: number | null,
  quantita: number,
  griglia: Array<{ id: string; valore_x: number | null; valore_y: number | null; prezzo_vendita: number | null }>,
): { prezzo: number; matchedGrigliaId: string | null; note: string | null } {
  const base = Number(family.prezzo_base_vendita ?? 0);
  const modalita = family.modalita_prezzo_base ?? "pz";

  switch (modalita) {
    case "pz":
      return { prezzo: base * quantita, matchedGrigliaId: null, note: null };

    case "mq": {
      if (!larghezza || !altezza) {
        return { prezzo: 0, matchedGrigliaId: null, note: "Inserisci larghezza e altezza per calcolo m²" };
      }
      const mq = (larghezza * altezza) / 1_000_000;
      return { prezzo: base * mq * quantita, matchedGrigliaId: null, note: `${mq.toFixed(2)} m² × €${base.toFixed(2)}/m²` };
    }

    case "misura_libera":
      return { prezzo: base * quantita, matchedGrigliaId: null, note: "Prezzo a corpo, misure indicative" };

    case "griglia": {
      // Lookup: trovo la riga con valore_x e valore_y ≥ misure richieste
      // (regola standard listini serramenti: si pagano le misure superiori).
      if (!larghezza || !altezza) {
        return { prezzo: base * quantita, matchedGrigliaId: null, note: "Inserisci misure per leggere griglia" };
      }
      const candidates = griglia.filter((g) =>
        g.valore_x != null && g.valore_y != null && g.prezzo_vendita != null
        && g.valore_x >= larghezza && g.valore_y >= altezza
      );
      if (candidates.length === 0) {
        // Misure fuori griglia: usa il prezzo massimo della griglia come fallback
        const maxPrezzo = griglia.reduce((m, g) => Math.max(m, Number(g.prezzo_vendita ?? 0)), 0);
        return {
          prezzo: maxPrezzo * quantita,
          matchedGrigliaId: null,
          note: `Misure fuori griglia — applicato prezzo max €${maxPrezzo.toFixed(2)}`,
        };
      }
      // Prendi la combo "più piccola che copre" (cioè la più economica fra le ≥)
      const best = candidates.reduce((min, g) =>
        Number(g.prezzo_vendita ?? Infinity) < Number(min.prezzo_vendita ?? Infinity) ? g : min,
      );
      const prezzoBest = Number(best.prezzo_vendita ?? 0);
      return {
        prezzo: prezzoBest * quantita,
        matchedGrigliaId: best.id,
        note: `Griglia ${best.valore_x}×${best.valore_y}mm @ €${prezzoBest.toFixed(2)}`,
      };
    }

    default:
      return { prezzo: base * quantita, matchedGrigliaId: null, note: null };
  }
}

function calcolaPosaInclusa(
  family: ListinoFamily,
  quantita: number,
  tariffePrezzi: Map<string, number>,
): { prezzoPosa: number; descrizione: string | null } {
  const modalita = family.manodopera_modalita;
  if (!modalita || modalita === "nessuna") return { prezzoPosa: 0, descrizione: null };

  const qtyDefault = Number(family.posa_quantita_default ?? 1);
  const qtyTotale = quantita * qtyDefault;

  if (modalita === "tariffa" && family.posa_tariffa_default_id) {
    const prezzoTariffa = tariffePrezzi.get(family.posa_tariffa_default_id) ?? 0;
    return {
      prezzoPosa: prezzoTariffa * qtyTotale,
      descrizione: `Posa: ${qtyTotale} × €${prezzoTariffa.toFixed(2)} = €${(prezzoTariffa * qtyTotale).toFixed(2)}`,
    };
  }

  if (modalita === "manuale") {
    const prezzo = Number(family.manodopera_prezzo_vendita ?? 0);
    return {
      prezzoPosa: prezzo * qtyTotale,
      descrizione: `Posa (manuale): ${qtyTotale} × €${prezzo.toFixed(2)} = €${(prezzo * qtyTotale).toFixed(2)}`,
    };
  }

  return { prezzoPosa: 0, descrizione: null };
}

const MODALITA_LABEL: Record<string, string> = {
  pz: "a pezzo",
  mq: "a m²",
  misura_libera: "a corpo (misure indicative)",
  griglia: "da griglia misure",
};

// ─── Component ──────────────────────────────────────────────────────────────

export function ListinoPickerDialog({ open, onOpenChange, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selectedFamily, setSelectedFamily] = useState<ListinoFamily | null>(null);
  const [larghezza, setLarghezza] = useState<string>("");
  const [altezza, setAltezza] = useState<string>("");
  const [quantita, setQuantita] = useState<string>("1");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setDebounced("");
      setSelectedFamily(null);
      setLarghezza("");
      setAltezza("");
      setQuantita("1");
    }
  }, [open]);

  const { data: families = [], isLoading: loadingFam } = useListinoFamilies(debounced);
  const { data: griglia = [], isLoading: loadingGriglia } = useListinoGriglia(selectedFamily?.id);
  const { data: tariffe = [] } = useTariffeManodopera();

  // Map id→prezzo_vendita per lookup veloce
  const tariffePrezzi = useMemo(() => {
    const m = new Map<string, number>();
    tariffe.forEach((t) => {
      if (t.prezzo_vendita != null) m.set(t.id, Number(t.prezzo_vendita));
    });
    return m;
  }, [tariffe]);

  // Calcolo prezzo dinamico mentre l'utente digita
  const calcolo = useMemo(() => {
    if (!selectedFamily) return null;
    const l = larghezza ? Number(larghezza) : null;
    const h = altezza ? Number(altezza) : null;
    const q = Math.max(1, Number(quantita) || 1);

    const { prezzo: prezzoProdotto, matchedGrigliaId, note: noteCalcolo } =
      calcolaPrezzoProdotto(selectedFamily, l, h, q, griglia);
    const { prezzoPosa, descrizione: descPosa } =
      calcolaPosaInclusa(selectedFamily, q, tariffePrezzi);

    const totale = prezzoProdotto + prezzoPosa;
    const unitario = q > 0 ? totale / q : 0;

    return {
      larghezza: l,
      altezza: h,
      quantita: q,
      prezzo_prodotto: prezzoProdotto,
      prezzo_posa: prezzoPosa,
      totale,
      unitario,
      matchedGrigliaId,
      note: noteCalcolo,
      desc_posa: descPosa,
    };
  }, [selectedFamily, larghezza, altezza, quantita, griglia, tariffePrezzi]);

  const richiedeMisure = selectedFamily && (
    selectedFamily.modalita_prezzo_base === "mq" ||
    selectedFamily.modalita_prezzo_base === "griglia"
  );

  const handleConferma = () => {
    if (!selectedFamily || !calcolo) return;
    onSelect({
      family_id: selectedFamily.id,
      family_nome: selectedFamily.nome,
      larghezza_mm: calcolo.larghezza,
      altezza_mm: calcolo.altezza,
      quantita: calcolo.quantita,
      prezzo_unitario: calcolo.unitario,
      prezzo_prodotto: calcolo.prezzo_prodotto / calcolo.quantita,
      prezzo_posa: calcolo.prezzo_posa / calcolo.quantita,
      griglia_id: calcolo.matchedGrigliaId,
      note: [calcolo.note, calcolo.desc_posa].filter(Boolean).join(" · ") || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {selectedFamily ? (
              <span className="flex items-center gap-2">
                <Button size="icon" variant="ghost" onClick={() => setSelectedFamily(null)} className="h-7 w-7">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Ruler className="h-4 w-4 text-emerald-700" />
                <span className="truncate">{selectedFamily.nome}</span>
              </span>
            ) : (
              "Seleziona dal listino"
            )}
          </DialogTitle>
          <DialogDescription>
            {selectedFamily
              ? "Inserisci le misure: il prezzo viene calcolato automaticamente dal listino."
              : "Scegli una tipologia di serramento dal listino della tua azienda."}
          </DialogDescription>
        </DialogHeader>

        {!selectedFamily ? (
          // ─── STEP 1: Scegli famiglia ───────────────────────────────────────
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca tipologia (es. 'Finestra', 'Porta-finestra', codice produttore)…"
                className="pl-9 h-10"
                autoFocus
              />
            </div>
            <div className="max-h-[55vh] overflow-y-auto -mx-2 px-2 space-y-1">
              {loadingFam ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                  Caricamento listino…
                </div>
              ) : families.length === 0 ? (
                <div className="py-8 text-center">
                  <Package className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {debounced.length >= 2
                      ? "Nessuna famiglia trovata."
                      : "Nessun articolo nel listino. Configuralo in Impostazioni → Listino prodotti."}
                  </p>
                </div>
              ) : (
                <ul className="divide-y">
                  {families.map((f) => (
                    <li key={f.id}>
                      <button
                        onClick={() => setSelectedFamily(f)}
                        className="w-full text-left p-3 rounded-md hover:bg-emerald-50/60 focus:bg-emerald-50 focus:outline-none transition"
                      >
                        <p className="text-sm font-semibold text-slate-900">{f.nome}</p>
                        <div className="flex flex-wrap gap-2 mt-1 text-[10px]">
                          {f.vertical && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">📦 {f.vertical}</span>
                          )}
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                            💰 {MODALITA_LABEL[f.modalita_prezzo_base ?? "pz"]}
                          </span>
                          {f.prezzo_base_vendita != null && Number(f.prezzo_base_vendita) > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                              base €{Number(f.prezzo_base_vendita).toFixed(2)}
                            </span>
                          )}
                          {f.manodopera_modalita && f.manodopera_modalita !== "nessuna" && (
                            <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
                              🔧 posa inclusa
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          // ─── STEP 2: Misure libere + calcolo live ──────────────────────────
          <div className="space-y-3">
            <Card className="bg-emerald-50/30 border-emerald-200 p-3">
              <p className="text-[11px] uppercase tracking-wide text-emerald-700 font-semibold mb-1">
                Listino: {MODALITA_LABEL[selectedFamily.modalita_prezzo_base ?? "pz"]}
              </p>
              <p className="text-xs text-emerald-900">
                {selectedFamily.modalita_prezzo_base === "pz" && "Prezzo fisso a pezzo. Le misure sono solo descrittive."}
                {selectedFamily.modalita_prezzo_base === "mq" && "Il prezzo si calcola sui m² → larghezza × altezza × prezzo/m²."}
                {selectedFamily.modalita_prezzo_base === "griglia" && "Listino a griglia: viene letto il prezzo della misura ≥ inserita."}
                {selectedFamily.modalita_prezzo_base === "misura_libera" && "Prezzo a corpo, misure solo informative."}
              </p>
            </Card>

            <div className="grid grid-cols-12 gap-3">
              <div className={richiedeMisure ? "col-span-4" : "col-span-6"}>
                <Label className="text-xs">Larghezza (mm)</Label>
                <Input
                  type="number"
                  min={0}
                  value={larghezza}
                  onChange={(e) => setLarghezza(e.target.value)}
                  placeholder="es. 1200"
                  className="h-9"
                />
              </div>
              <div className={richiedeMisure ? "col-span-4" : "col-span-6"}>
                <Label className="text-xs">Altezza (mm)</Label>
                <Input
                  type="number"
                  min={0}
                  value={altezza}
                  onChange={(e) => setAltezza(e.target.value)}
                  placeholder="es. 1400"
                  className="h-9"
                />
              </div>
              <div className="col-span-4">
                <Label className="text-xs">Quantità</Label>
                <Input
                  type="number"
                  min={1}
                  value={quantita}
                  onChange={(e) => setQuantita(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>

            {loadingGriglia && selectedFamily.modalita_prezzo_base === "griglia" && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Caricamento griglia prezzi…
              </p>
            )}

            {/* Riepilogo calcolo live */}
            {calcolo && (
              <Card className="border-emerald-300 bg-emerald-50/50 p-4">
                <p className="text-[11px] uppercase tracking-wide text-emerald-700 font-semibold mb-2 flex items-center gap-1">
                  <Calculator className="h-3.5 w-3.5" /> Calcolo prezzo
                </p>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span>Prodotto ({calcolo.quantita}×)</span>
                    <span className="font-semibold tabular-nums">€ {calcolo.prezzo_prodotto.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</span>
                  </div>
                  {calcolo.note && (
                    <p className="text-[10px] text-muted-foreground italic pl-2">{calcolo.note}</p>
                  )}
                  {calcolo.prezzo_posa > 0 && (
                    <>
                      <div className="flex justify-between text-violet-700">
                        <span className="flex items-center gap-1"><HardHat className="h-3 w-3" /> Posa inclusa</span>
                        <span className="font-semibold tabular-nums">€ {calcolo.prezzo_posa.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</span>
                      </div>
                      {calcolo.desc_posa && (
                        <p className="text-[10px] text-violet-600 italic pl-2">{calcolo.desc_posa}</p>
                      )}
                    </>
                  )}
                  <div className="border-t border-emerald-300 pt-2 mt-2 flex justify-between items-center">
                    <span className="font-bold text-emerald-900">Totale posizione</span>
                    <span className="text-xl font-bold text-emerald-800 tabular-nums">
                      € {calcolo.totale.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground text-right">
                    Unitario: € {calcolo.unitario.toLocaleString("it-IT", { minimumFractionDigits: 2 })} × {calcolo.quantita}
                  </p>
                </div>
              </Card>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annulla</Button>
          {selectedFamily && (
            <Button
              onClick={handleConferma}
              className="bg-emerald-700 hover:bg-emerald-800"
              disabled={
                (richiedeMisure && (!larghezza || !altezza))
                || !calcolo
                || calcolo.totale <= 0
              }
            >
              Aggiungi al preventivo
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
