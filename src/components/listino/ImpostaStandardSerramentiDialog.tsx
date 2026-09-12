/**
 * "Imposta il listino infissi": lo standard applicato a tutte le tipologie in
 * un colpo solo.
 *
 * Il serramentista dichiara le sue linee (il modello di profilo: PVC Salamander
 * 76, PVC Aluplast Ideal 5000, alluminio…), il prezzo al metro quadro della
 * configurazione base e quanto costano in più colore e vetro. Da lì il listino
 * è pronto: prima ogni tipologia andava aperta e compilata a mano, ed è il
 * motivo per cui quasi nessuno arrivava in fondo.
 */
import { useMemo, useState } from "react";
import { Plus, Trash2, TriangleAlert, Wand2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  anteprima, avvisiStandard, margine, validaStandard,
  type LineaStandard, type StandardSerramenti,
} from "@/lib/listino/standardSerramenti";
import { useStandardSerramenti } from "@/hooks/useStandardSerramenti";

/** Accessori: hanno prezzi loro, non seguono il €/mq del serramento. */
const ACCESSORIO = /^(Tapparella|Zanzariera|Cassonetto|Persiana|Scuro)/i;

export interface TipologiaSelezionabile {
  id: string;
  nome: string;
  vertical?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  /** Tutte le tipologie del listino: qui si filtra sul verticale serramenti. */
  famiglie: TipologiaSelezionabile[];
}

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);

export function ImpostaStandardSerramentiDialog({ open, onOpenChange, companyId, famiglie }: Props) {
  const serramenti = useMemo(
    () => famiglie.filter((f) => (f.vertical ?? "").startsWith("serrament")),
    [famiglie],
  );

  const [linee, setLinee] = useState<LineaStandard[]>([
    { nome: "", materiale: "PVC", differenzaPct: 0 },
  ]);
  const [prezzoAcquistoMq, setAcquisto] = useState(0);
  const [prezzoVenditaMq, setVendita] = useState(0);
  const [coloreStandard, setColoreStandard] = useState(0);
  const [coloreFuori, setColoreFuori] = useState(0);
  const [antisonoro, setAntisonoro] = useState(0);
  const [antisfondamento, setAntisfondamento] = useState(0);
  const [selezionate, setSelezionate] = useState<Set<string> | null>(null);

  const applica = useStandardSerramenti();

  // Preselezione: i serramenti veri, non gli accessori.
  const scelte = selezionate ?? new Set(serramenti.filter((f) => !ACCESSORIO.test(f.nome)).map((f) => f.id));

  const standard: StandardSerramenti = {
    linee,
    prezzoAcquistoMq,
    prezzoVenditaMq,
    colore: { standardPct: coloreStandard, fuoriStandardPct: coloreFuori },
    vetro: { antisonoroPct: antisonoro, antisfondamentoPct: antisfondamento },
  };

  const errori = validaStandard(standard);
  const avvisi = avvisiStandard(standard);
  const righe = errori.length === 0 ? anteprima(standard, 1200, 1400) : [];
  const m = margine(prezzoAcquistoMq, prezzoVenditaMq);

  const cambiaLinea = (i: number, patch: Partial<LineaStandard>) =>
    setLinee((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const salva = () => {
    applica.mutate(
      { companyId, familyIds: [...scelte], standard },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4" aria-hidden="true" />
            Imposta il listino infissi
          </DialogTitle>
          <DialogDescription>
            Il prezzo si dichiara una volta per la configurazione base — bianco, vetro standard, posa inclusa —
            e vale per tutte le tipologie scelte. Le altre linee e le opzioni si scostano in percentuale.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6">
            {/* Linee */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Le tue linee</h3>
                  <p className="text-xs text-muted-foreground">
                    Il modello di profilo. La prima è la base: le altre si scostano in percentuale (una linea più
                    economica va con il meno, es. −8).
                  </p>
                </div>
                <Button
                  type="button" variant="outline" size="sm"
                  onClick={() => setLinee((p) => [...p, { nome: "", materiale: p[0]?.materiale ?? "", differenzaPct: 0 }])}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> Aggiungi linea
                </Button>
              </div>
              {linee.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_140px_110px_40px] gap-2 items-end">
                  <div>
                    {i === 0 && <Label className="text-xs">Nome</Label>}
                    <Input
                      value={l.nome}
                      placeholder={i === 0 ? "es. Salamander 76" : "es. Aluplast Ideal 5000"}
                      onChange={(e) => cambiaLinea(i, { nome: e.target.value })}
                    />
                  </div>
                  <div>
                    {i === 0 && <Label className="text-xs">Materiale</Label>}
                    <Input
                      value={l.materiale ?? ""}
                      placeholder="PVC"
                      onChange={(e) => cambiaLinea(i, { materiale: e.target.value })}
                    />
                  </div>
                  <div>
                    {i === 0 && <Label className="text-xs">Differenza %</Label>}
                    <Input
                      type="number" step="0.5"
                      value={i === 0 ? 0 : l.differenzaPct}
                      disabled={i === 0}
                      title={i === 0 ? "La prima linea è il riferimento" : undefined}
                      onChange={(e) => cambiaLinea(i, { differenzaPct: Number(e.target.value) })}
                    />
                  </div>
                  <Button
                    type="button" variant="ghost" size="icon"
                    disabled={linee.length === 1}
                    aria-label={`Togli la linea ${l.nome || i + 1}`}
                    onClick={() => setLinee((p) => p.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </section>

            <Separator />

            {/* Prezzo base */}
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">Prezzo al metro quadro della linea base</h3>
                <p className="text-xs text-muted-foreground">Configurazione bianco, vetro standard, posa inclusa.</p>
              </div>
              <div className="grid grid-cols-3 gap-3 items-end">
                <div>
                  <Label className="text-xs">Acquisto €/mq</Label>
                  <Input type="number" step="0.01" value={prezzoAcquistoMq || ""} placeholder="180"
                    onChange={(e) => setAcquisto(Number(e.target.value))} />
                </div>
                <div>
                  <Label className="text-xs">Vendita €/mq</Label>
                  <Input type="number" step="0.01" value={prezzoVenditaMq || ""} placeholder="600"
                    onChange={(e) => setVendita(Number(e.target.value))} />
                </div>
                <div className="text-sm pb-2">
                  Margine <span className="font-semibold">{prezzoVenditaMq > 0 ? `${(m * 100).toFixed(0)}%` : "—"}</span>
                </div>
              </div>
            </section>

            <Separator />

            {/* Opzioni */}
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">Quanto costano in più le opzioni</h3>
                <p className="text-xs text-muted-foreground">
                  In percentuale sul prezzo. Lasciandole a zero, in preventivo risultano gratis.
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">Colore standard %</Label>
                  <Input type="number" step="0.5" value={coloreStandard || ""} placeholder="0"
                    onChange={(e) => setColoreStandard(Number(e.target.value))} />
                </div>
                <div>
                  <Label className="text-xs">Colore fuori standard %</Label>
                  <Input type="number" step="0.5" value={coloreFuori || ""} placeholder="15"
                    onChange={(e) => setColoreFuori(Number(e.target.value))} />
                </div>
                <div>
                  <Label className="text-xs">Vetro antisonoro %</Label>
                  <Input type="number" step="0.5" value={antisonoro || ""} placeholder="0"
                    onChange={(e) => setAntisonoro(Number(e.target.value))} />
                </div>
                <div>
                  <Label className="text-xs">Vetro antisfondamento %</Label>
                  <Input type="number" step="0.5" value={antisfondamento || ""} placeholder="0"
                    onChange={(e) => setAntisfondamento(Number(e.target.value))} />
                </div>
              </div>
            </section>

            <Separator />

            {/* Tipologie */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">
                Tipologie a cui applicarlo <span className="font-normal text-muted-foreground">({scelte.size} su {serramenti.length})</span>
              </h3>
              <p className="text-xs text-muted-foreground">
                Tapparelle, zanzariere e cassonetti restano fuori: hanno prezzi loro.
              </p>
              <div className="grid sm:grid-cols-2 gap-1.5 max-h-56 overflow-y-auto border rounded-md p-2">
                {serramenti.map((f) => (
                  <label key={f.id} className="flex items-center gap-2 text-sm py-0.5">
                    <Checkbox
                      checked={scelte.has(f.id)}
                      onCheckedChange={(v) =>
                        setSelezionate(() => {
                          const next = new Set(scelte);
                          if (v) next.add(f.id); else next.delete(f.id);
                          return next;
                        })
                      }
                    />
                    <span className="truncate" title={f.nome}>{f.nome}</span>
                  </label>
                ))}
              </div>
            </section>

            {/* Anteprima */}
            {righe.length > 0 && (
              <section className="rounded-lg border bg-muted/30 p-3">
                <h3 className="text-sm font-semibold mb-2">Come viene una finestra 1200 × 1400 (1,68 mq)</h3>
                <div className="space-y-1 text-sm">
                  {righe.map((r) => (
                    <div key={r.linea} className="flex justify-between gap-3">
                      <span className="truncate">{r.linea}</span>
                      <span className="tabular-nums">
                        {eur(r.vendita)} <span className="text-muted-foreground">· costo {eur(r.acquisto)} · margine {r.marginePct.toFixed(0)}%</span>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {(errori.length > 0 || avvisi.length > 0) && (
              <section className="space-y-1.5">
                {errori.map((e) => (
                  <p key={e} className="flex items-start gap-2 text-sm text-destructive">
                    <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />{e}
                  </p>
                ))}
                {errori.length === 0 && avvisi.map((a) => (
                  <p key={a} className="flex items-start gap-2 text-xs text-amber-700">
                    <TriangleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />{a}
                  </p>
                ))}
              </section>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button
            onClick={salva}
            disabled={errori.length > 0 || scelte.size === 0 || applica.isPending}
          >
            {applica.isPending ? "Applico…" : `Applica a ${scelte.size} tipologie`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
