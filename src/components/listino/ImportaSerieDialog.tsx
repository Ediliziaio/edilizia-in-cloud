/**
 * "Aggiungi una serie": la libreria di piattaforma portata dentro il listino.
 *
 * Un serramentista non descrive il suo lavoro per tipologie, lo descrive per
 * serie: «monto Aluplast Ideal 5000». Qui sceglie marca e serie, dice quanto
 * costa al metro quadro e quanto si scosta dalla sua linea base, e il listino è
 * fatto. La serie diventa una LINEA dentro le tipologie che ha già: importarne
 * una seconda non raddoppia il listino, aggiunge una scelta al preventivo.
 */
import { useMemo, useState } from "react";
import { Check, Layers, PackagePlus } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  ETICHETTA_FASCIA, ETICHETTA_MATERIALE,
  useImportaSerieSerramenti, useLibreriaSerramenti,
  type SerieSerramenti,
} from "@/hooks/useSerieSerramenti";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  /** Dove finiscono le tipologie che l'azienda non ha ancora. */
  macrocategoriaId?: string | null;
  /**
   * Spunta iniziale di «Installa anche le tipologie che non ho ancora». Chi ha già
   * i suoi serramenti parte senza: con la spunta Renova avrebbe ricevuto 15
   * modelli in più (archi, sopraluce, trapezi) solo per aggiungere una serie.
   */
  installaMancantiIniziale?: boolean;
}

const eur = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);

/** Numero da campo di testo, con la virgola italiana. */
const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export function ImportaSerieDialog({ open, onOpenChange, companyId, macrocategoriaId, installaMancantiIniziale = true }: Props) {
  const { data: libreria = [], isLoading } = useLibreriaSerramenti();
  const importa = useImportaSerieSerramenti();

  const [marcaId, setMarcaId] = useState<string | null>(null);
  const [serie, setSerie] = useState<SerieSerramenti | null>(null);
  const [differenza, setDifferenza] = useState("0");
  const [vendita, setVendita] = useState("");
  const [acquisto, setAcquisto] = useState("");
  const [installaMancanti, setInstallaMancanti] = useState(installaMancantiIniziale);

  const marcaAttiva = useMemo(
    () => libreria.find((m) => m.id === marcaId) ?? null,
    [libreria, marcaId],
  );

  const scegliSerie = (s: SerieSerramenti) => {
    setSerie(s);
    setDifferenza(String(s.differenza_pct ?? 0));
  };

  const diff = num(differenza);
  const pv = vendita.trim() ? num(vendita) : null;
  const pa = acquisto.trim() ? num(acquisto) : null;
  const prezzoLinea = pv !== null ? pv * (1 + diff / 100) : null;

  const conferma = () => {
    if (!serie) return;
    importa.mutate(
      {
        serieId: serie.id,
        companyId,
        macrocategoriaId,
        prezzoVenditaMq: pv,
        prezzoAcquistoMq: pa,
        differenzaPct: diff,
        installaMancanti,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-blue-600" aria-hidden="true" />
            Aggiungi una serie al listino
          </DialogTitle>
          <DialogDescription>
            Scegli la marca e la serie di profilo che monti. Diventa una linea
            dentro le tue tipologie: le finestre che hai già non vengono
            duplicate, ti ritrovi una scelta in più nel preventivo.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-5 py-1">
            <section>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Marca
              </Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {isLoading && <p className="text-sm text-muted-foreground">Carico la libreria…</p>}
                {libreria.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setMarcaId(m.id);
                      setSerie(null);
                    }}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm transition-colors",
                      m.id === marcaId
                        ? "border-blue-500 bg-blue-50 text-blue-800 font-medium"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    {m.nome}
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {m.materiali.map((x) => ETICHETTA_MATERIALE[x] ?? x).join(" · ")}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {marcaAttiva && (
              <section>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Serie
                </Label>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {marcaAttiva.serie.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => scegliSerie(s)}
                      className={cn(
                        "flex items-start justify-between gap-2 rounded-lg border p-3 text-left transition-colors",
                        s.id === serie?.id
                          ? "border-blue-500 bg-blue-50/60"
                          : "border-border hover:bg-muted/50",
                      )}
                    >
                      <span>
                        <span className="block font-medium text-sm">{s.nome}</span>
                        <span className="block text-xs text-muted-foreground">
                          {ETICHETTA_MATERIALE[s.materiale] ?? s.materiale}
                          {s.profondita_mm ? ` · ${s.profondita_mm} mm` : ""}
                          {s.camere ? ` · ${s.camere} camere` : ""}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        {s.fascia && (
                          <Badge variant="secondary" className="text-[10px]">
                            {ETICHETTA_FASCIA[s.fascia]}
                          </Badge>
                        )}
                        {s.id === serie?.id && (
                          <Check className="h-4 w-4 text-blue-600" aria-hidden="true" />
                        )}
                      </span>
                    </button>
                  ))}
                  {marcaAttiva.serie.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Per questa marca non ci sono ancora serie in libreria.
                    </p>
                  )}
                </div>
              </section>
            )}

            {serie && (
              <>
                <Separator />
                <section className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="serie-diff">Scostamento dalla linea base</Label>
                      <div className="flex items-center gap-1.5">
                        <Input
                          id="serie-diff"
                          value={differenza}
                          onChange={(e) => setDifferenza(e.target.value)}
                          inputMode="decimal"
                          className="text-right"
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Quanto costa in più o in meno di quella base. Negativo se costa meno.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="serie-pv">Vendita al m² (base)</Label>
                      <Input
                        id="serie-pv"
                        value={vendita}
                        onChange={(e) => setVendita(e.target.value)}
                        inputMode="decimal"
                        placeholder="lascia vuoto per non toccarlo"
                        className="text-right"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="serie-pa">Acquisto al m² (base)</Label>
                      <Input
                        id="serie-pa"
                        value={acquisto}
                        onChange={(e) => setAcquisto(e.target.value)}
                        inputMode="decimal"
                        placeholder="facoltativo"
                        className="text-right"
                      />
                    </div>
                  </div>

                  {prezzoLinea !== null && (
                    <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                      <p className="font-medium">
                        Una finestra 1200 × 1400 (1,68 m²) con {serie.nome}
                      </p>
                      <p className="text-muted-foreground">
                        {eur(prezzoLinea)} al m² → <strong>{eur(prezzoLinea * 1.68)}</strong>
                        {pa !== null && diff !== 0 && (
                          <> · acquisto {eur(pa * (1 + diff / 100) * 1.68)}</>
                        )}
                      </p>
                    </div>
                  )}

                  <label className="flex items-start gap-2.5 text-sm">
                    <Checkbox
                      checked={installaMancanti}
                      onCheckedChange={(v) => setInstallaMancanti(v === true)}
                      className="mt-0.5"
                    />
                    <span>
                      Installa anche le tipologie che non ho ancora
                      <span className="block text-xs text-muted-foreground">
                        Togli la spunta per aggiungere la serie solo alle tipologie già a listino.
                      </span>
                    </span>
                  </label>
                </section>
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={conferma} disabled={!serie || importa.isPending}>
            <PackagePlus className="h-4 w-4 mr-1.5" aria-hidden="true" />
            {importa.isPending ? "Importo…" : "Aggiungi al listino"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
