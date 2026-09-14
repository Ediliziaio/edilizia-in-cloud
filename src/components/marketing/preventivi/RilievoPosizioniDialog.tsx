/**
 * "Rilievo per posizioni": l'elenco delle finestre di una casa, in una schermata.
 *
 * Chi misura non compila un preventivo, compila un elenco — P1 cucina 1200×1400,
 * P2 bagno 600×800 — e decide una volta sola che è tutto Salamander bianco con
 * doppio vetro. Il wizard a quattro passi chiede invece tutto da capo per ogni
 * finestra: su venti posizioni sono ottanta passi, ed è il punto in cui il
 * preventivo si ferma.
 *
 * Qui le scelte comuni stanno in testa, ogni riga può derogare, e il totale si
 * aggiorna mentre si scrive. Alla fine ogni posizione diventa una riga del
 * preventivo, con il suo riferimento davanti.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Ruler, Trash2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/formatters";
import { calcolaPrezzoFamiglia, type GridPoint } from "@/hooks/useFamilyPricing";
import type { FamilyWithAxes } from "@/types/articleFamily";
import type { QuoteItemPro } from "@/types/quoteItem";
import {
  descrizionePosizione, mqPosizione, posizioneCompleta, riferimentoSuccessivo,
  selezioniEffettive, totaliRilievo,
  type PosizioneRilievo,
} from "@/lib/preventivo/posizioni";

interface Props {
  open: boolean;
  onClose: () => void;
  onAddItems: (items: QuoteItemPro[], nextSortOrder: number) => void;
  currentSortOrder: number;
  /** Le tipologie del listino: qui si usano quelle del verticale serramenti. */
  famiglie: FamilyWithAxes[];
}

const nuovaPosizione = (riferimento: string, familyId: string | null): PosizioneRilievo => ({
  id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  riferimento,
  familyId,
  larghezza_mm: null,
  altezza_mm: null,
  quantita: 1,
  selezioni: {},
});

/** Numero da campo di testo: vuoto è "non ancora misurato", non zero. */
const numero = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export function RilievoPosizioniDialog({
  open, onClose, onAddItems, currentSortOrder, famiglie,
}: Props) {
  const serramenti = useMemo(
    () => famiglie.filter((f) => (f.vertical ?? "").startsWith("serrament")),
    [famiglie],
  );

  const [posizioni, setPosizioni] = useState<PosizioneRilievo[]>(() => [
    nuovaPosizione("P1", serramenti[0]?.id ?? null),
  ]);
  const [comuni, setComuni] = useState<Record<string, string>>({});

  /**
   * Gli assi su cui si decide una volta per tutte. Si prendono dalla prima
   * tipologia in elenco: colore e vetro si chiamano allo stesso modo ovunque,
   * perché nascono tutte dallo stesso modello.
   */
  const assiComuni = useMemo(() => {
    const base = serramenti.find((f) => f.axes.length > 0);
    return base?.axes ?? [];
  }, [serramenti]);

  const famiglia = (id: string | null) => serramenti.find((f) => f.id === id) ?? null;

  // Le tipologie a griglia hanno bisogno della loro griglia: senza, il prezzo
  // veniva zero e restavano le sole maggiorazioni fisse. Si caricano solo quelle
  // usate nelle posizioni, a pagine da mille celle.
  const idGriglia = useMemo(
    () => Array.from(new Set(posizioni
      .map((p) => p.familyId)
      .filter((id): id is string => !!id && serramenti.some((f) => f.id === id && f.modalita_prezzo_base === "griglia"))))
      .sort(),
    [posizioni, serramenti],
  );
  const { data: griglie = {} } = useQuery({
    queryKey: ["rilievo-griglie", idGriglia],
    enabled: open && idGriglia.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Record<string, GridPoint[]>> => {
      const perFamiglia: Record<string, GridPoint[]> = {};
      const PAGINA = 1000;
      for (let da = 0; ; da += PAGINA) {
        const { data, error } = await (supabase as never as typeof supabase)
          .from("listino_griglia" as never)
          .select("family_id, valore_x, valore_y, prezzo_vendita, prezzo_acquisto")
          .in("family_id" as never, idGriglia)
          .order("id" as never)
          .range(da, da + PAGINA - 1);
        if (error) throw error;
        const celle = (data ?? []) as Array<{
          family_id: string; valore_x: number; valore_y: number; prezzo_vendita: number; prezzo_acquisto: number | null;
        }>;
        for (const c of celle) {
          (perFamiglia[c.family_id] ??= []).push({
            valore_x: Number(c.valore_x),
            valore_y: Number(c.valore_y),
            prezzo_vendita: Number(c.prezzo_vendita),
            prezzo_acquisto_netto: c.prezzo_acquisto != null ? Number(c.prezzo_acquisto) : 0,
          });
        }
        if (celle.length < PAGINA) break;
      }
      return perFamiglia;
    },
  });

  /** Il prezzo di ogni posizione, con le scelte comuni e le sue deroghe. */
  const righe = useMemo(
    () =>
      posizioni.map((p) => {
        const f = famiglia(p.familyId);
        const mq = mqPosizione(p.larghezza_mm, p.altezza_mm);
        if (!f || mq == null) {
          return { posizione: p, prezzo: { unitario_vendita: 0, unitario_acquisto: 0, mq } };
        }
        const scelte = selezioniEffettive(comuni, p);
        // Le scelte comuni arrivano per codice asse: qui diventano gli id dei
        // valori di QUESTA tipologia, che sono diversi riga per riga.
        const selections: Record<string, string> = {};
        for (const asse of f.axes) {
          const chiesto = scelte[asse.codice];
          const valore =
            asse.values.find((v) => v.id === chiesto) ??
            asse.values.find((v) => v.valore === chiesto) ??
            asse.values.find((v) => v.is_default) ??
            asse.values[0];
          if (valore) selections[asse.codice] = valore.id;
        }
        const risultato = calcolaPrezzoFamiglia({
          family: f,
          selections,
          larghezza_mm: p.larghezza_mm ?? undefined,
          altezza_mm: p.altezza_mm ?? undefined,
          quantita: p.quantita,
        }, griglie[f.id]);
        return {
          posizione: p,
          prezzo: {
            unitario_vendita: risultato.unit_price_vendita,
            unitario_acquisto: risultato.unit_price_acquisto,
            mq,
          },
          selections,
        };
      }),
    [posizioni, comuni, serramenti, griglie],
  );

  const totali = useMemo(() => totaliRilievo(righe), [righe]);

  const cambia = (id: string, patch: Partial<PosizioneRilievo>) =>
    setPosizioni((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const aggiungi = () =>
    setPosizioni((prev) => [
      ...prev,
      nuovaPosizione(
        riferimentoSuccessivo(prev.map((p) => p.riferimento)),
        prev.at(-1)?.familyId ?? serramenti[0]?.id ?? null,
      ),
    ]);

  const duplicaUltima = () =>
    setPosizioni((prev) => {
      const ultima = prev.at(-1);
      if (!ultima) return prev;
      return [
        ...prev,
        {
          ...ultima,
          id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          riferimento: riferimentoSuccessivo(prev.map((p) => p.riferimento)),
        },
      ];
    });

  const conferma = () => {
    const items: QuoteItemPro[] = [];
    const senzaPrezzo: string[] = [];
    let ordine = currentSortOrder;

    for (const riga of righe) {
      const p = riga.posizione;
      const f = famiglia(p.familyId);
      if (!f || !posizioneCompleta(p)) continue;
      // Una finestra a 0 € in un preventivo non si nota: senza prezzo (griglia
      // ancora in arrivo, misura fuori griglia) la posizione non entra.
      if (!(riga.prezzo.unitario_vendita > 0)) {
        senzaPrezzo.push(p.riferimento);
        continue;
      }

      const etichette = f.axes
        .map((asse) => asse.values.find((v) => v.id === riga.selections?.[asse.codice])?.label)
        .filter((x): x is string => Boolean(x));

      items.push({
        item_type: "product",
        item_category: "prodotto",
        name: f.nome,
        description: descrizionePosizione(p, f.nome, etichette),
        quantity: p.quantita,
        unit_price: riga.prezzo.unitario_vendita,
        discount_percent: 0,
        vat_rate: f.vat_rate,
        unit_of_measure: f.unit_of_measure,
        sort_order: ordine,
        article_template_id: null,
        tariffa_id: null,
        prezzo_acquisto: riga.prezzo.unitario_acquisto,
        mostra_nel_pdf: true,
        is_optional: false,
        misura_x: p.larghezza_mm,
        misura_y: p.altezza_mm,
        family_id: f.id,
        axis_selections: riga.selections ?? {},
        supplier_catalog_id: null,
        supplier_product_line_id: null,
      });
      ordine += 1;
    }

    if (senzaPrezzo.length > 0) {
      toast.warning(`Senza prezzo, non aggiunte: ${senzaPrezzo.join(", ")}`, {
        description: "Controlla le misure rispetto alla griglia del listino, o riprova tra un attimo.",
      });
    }
    if (items.length === 0) return;
    onAddItems(items, ordine);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ruler className="h-5 w-5 text-primary" aria-hidden="true" />
            Rilievo per posizioni
          </DialogTitle>
          <DialogDescription>
            Elenca le finestre come le hai misurate. Le scelte qui sopra valgono
            per tutte; su una singola riga puoi cambiarle.
          </DialogDescription>
        </DialogHeader>

        {serramenti.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nel listino non ci sono ancora tipologie di serramento. Aggiungile dal
            Listino con "Aggiungi una serie".
          </p>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              {assiComuni.map((asse) => (
                <div key={asse.id} className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    {asse.nome} · per tutte
                  </Label>
                  <Select
                    value={comuni[asse.codice] ?? ""}
                    onValueChange={(v) => setComuni((prev) => ({ ...prev, [asse.codice]: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="predefinito" />
                    </SelectTrigger>
                    <SelectContent>
                      {asse.values.map((v) => (
                        <SelectItem key={v.id} value={v.valore}>
                          {v.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </section>

            <Separator />

            <ScrollArea className="flex-1 -mx-6 px-6">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                  <tr className="[&>th]:pb-2 [&>th]:text-left [&>th]:font-medium">
                    <th className="w-20">Rif.</th>
                    <th>Tipologia</th>
                    <th className="w-24 text-right">Largh. mm</th>
                    <th className="w-24 text-right">Alt. mm</th>
                    <th className="w-16 text-right">Qtà</th>
                    <th className="w-28 text-right">Prezzo</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {righe.map(({ posizione: p, prezzo }) => (
                    <tr key={p.id} className="border-t [&>td]:py-1.5 [&>td]:pr-2">
                      <td>
                        <Input
                          value={p.riferimento}
                          onChange={(e) => cambia(p.id, { riferimento: e.target.value })}
                          className="h-9"
                          aria-label="Riferimento posizione"
                        />
                      </td>
                      <td>
                        <Select
                          value={p.familyId ?? ""}
                          onValueChange={(v) => cambia(p.id, { familyId: v })}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="scegli" />
                          </SelectTrigger>
                          <SelectContent>
                            {serramenti.map((f) => (
                              <SelectItem key={f.id} value={f.id}>
                                {f.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td>
                        <Input
                          inputMode="numeric"
                          className="h-9 text-right"
                          value={p.larghezza_mm ?? ""}
                          onChange={(e) => cambia(p.id, { larghezza_mm: numero(e.target.value) })}
                          aria-label="Larghezza in millimetri"
                        />
                      </td>
                      <td>
                        <Input
                          inputMode="numeric"
                          className="h-9 text-right"
                          value={p.altezza_mm ?? ""}
                          onChange={(e) => cambia(p.id, { altezza_mm: numero(e.target.value) })}
                          aria-label="Altezza in millimetri"
                        />
                      </td>
                      <td>
                        <Input
                          inputMode="numeric"
                          className="h-9 text-right"
                          value={p.quantita}
                          onChange={(e) => cambia(p.id, { quantita: numero(e.target.value) ?? 0 })}
                          aria-label="Quantità"
                        />
                      </td>
                      <td className="text-right tabular-nums">
                        {posizioneCompleta(p) ? (
                          <>
                            <span className="font-medium">
                              {formatCurrency(prezzo.unitario_vendita * p.quantita)}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {(prezzo.mq ?? 0).toLocaleString("it-IT", { maximumFractionDigits: 2 })} m²
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">da misurare</span>
                        )}
                      </td>
                      <td>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          onClick={() => setPosizioni((prev) => prev.filter((x) => x.id !== p.id))}
                          aria-label={`Togli la posizione ${p.riferimento}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex gap-2 py-3">
                <Button variant="outline" size="sm" onClick={aggiungi}>
                  <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" /> Posizione
                </Button>
                <Button variant="ghost" size="sm" onClick={duplicaUltima}>
                  Ripeti l'ultima
                </Button>
              </div>
            </ScrollArea>

            <div className="rounded-lg border bg-muted/40 px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span>
                <strong>{totali.posizioni}</strong> posizioni · <strong>{totali.pezzi}</strong> pezzi
              </span>
              <span>
                {totali.mq.toLocaleString("it-IT", { maximumFractionDigits: 2 })} m²
              </span>
              <span className="ml-auto text-base font-semibold tabular-nums">
                {formatCurrency(totali.vendita)}
              </span>
              {totali.marginePct != null && (
                <span className="text-xs text-muted-foreground">
                  margine {totali.marginePct.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%
                </span>
              )}
            </div>
          </>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={conferma} disabled={totali.posizioni === 0}>
            Aggiungi {totali.posizioni > 0 ? `${totali.posizioni} righe` : "al preventivo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
