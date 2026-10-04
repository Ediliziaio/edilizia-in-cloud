/**
 * «Modelli di infissi»: scrivi i modelli che vendi (PVC Aluplast, PVC Salamander 72, Alluminio…) e il sistema crea
 * da solo, per ciascuno, tutte le tipologie col disegno: finestre, porte finestra, scorrevoli, sagome, monoblocchi
 * e le persiane. Si parte dal modello «Infissi con disegno automatico» (le tipologie di Demo Azienda 2).
 * Si può ripetere: un modello che c'è già non si duplica.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Layers, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useModelliArea, useModelliAreaMutations, useModelliDisponibili } from "@/hooks/useModelliArea";

const NOME_MODELLO = "Infissi con disegno automatico";
const SUGGERITI = ["PVC Aluplast", "PVC Salamander", "Alluminio"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  /** Linee (modelli) che l'azienda ha già, per non riscriverle. */
  giaPresenti: string[];
}

export function ModelliInfissiDialog({ open, onOpenChange, companyId, giaPresenti }: Props) {
  const { data: disponibili = [] } = useModelliDisponibili(open);
  const modello = disponibili.find((m) => m.nome === NOME_MODELLO);
  const { installa } = useModelliAreaMutations();
  const [nomi, setNomi] = useState<string[]>([]);
  const [bozza, setBozza] = useState("");
  const [inCorso, setInCorso] = useState(false);

  const aggiungi = (testo: string) => {
    const t = testo.trim();
    if (!t) return;
    setNomi((prima) => (prima.some((n) => n.toLowerCase() === t.toLowerCase()) ? prima : [...prima, t]));
    setBozza("");
  };

  const crea = async () => {
    if (!companyId || !modello) return;
    const elenco = bozza.trim() ? [...nomi, bozza.trim()] : nomi;
    setInCorso(true);
    let prodotti = 0;
    try {
      // Un modello alla volta: ogni passo è tutto o niente e l'elenco avanza.
      for (const nome of elenco) {
        const esito = await installa.mutateAsync({ modelloId: modello.id, companyId, modelli: [nome] });
        prodotti += esito.prodotti_nuovi ?? 0;
      }
      toast.success(`Creato: ${elenco.length} ${elenco.length === 1 ? "modello" : "modelli"}, ${prodotti} prodotti con disegno`);
      setNomi([]);
      setBozza("");
      onOpenChange(false);
    } catch (e) {
      toast.error("Non è andata fino in fondo", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setInCorso(false);
    }
  };

  const daCreare = nomi.length + (bozza.trim() ? 1 : 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" aria-hidden="true" /> Modelli di infissi
          </DialogTitle>
          <DialogDescription>
            Scrivi i modelli che vendi. Per ciascuno il sistema crea in automatico tutte le tipologie col disegno (finestre, porte finestra, scorrevoli, sagome, monoblocchi) e le persiane.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={bozza}
              onChange={(e) => setBozza(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  aggiungi(bozza);
                }
              }}
              placeholder="Per esempio: PVC Aluplast Ideal 5000"
              aria-label="Nome del modello"
              disabled={inCorso}
            />
            <Button type="button" variant="outline" onClick={() => aggiungi(bozza)} disabled={inCorso || !bozza.trim()}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Aggiungi
            </Button>
          </div>

          {nomi.length === 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              Per iniziare:
              {SUGGERITI.map((s) => (
                <Button key={s} type="button" size="sm" variant="ghost" className="h-7 border border-dashed px-2" onClick={() => aggiungi(s)}>
                  {s}
                </Button>
              ))}
            </div>
          )}

          {nomi.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {nomi.map((n) => (
                <li key={n} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-1 pl-3 pr-1 text-sm">
                  {n}
                  <button type="button" className="rounded-full p-1 hover:bg-muted" onClick={() => setNomi((p) => p.filter((x) => x !== n))} aria-label={`Togli ${n}`} disabled={inCorso}>
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {giaPresenti.length > 0 && (
            <p className="text-xs text-muted-foreground">Hai già: {giaPresenti.join(", ")}. Se riscrivi un nome uguale non viene duplicato.</p>
          )}
          {!modello && <p className="text-xs text-destructive">Il modello degli infissi non è ancora disponibile.</p>}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={inCorso}>
            Non ora
          </Button>
          <Button onClick={crea} disabled={inCorso || !modello || daCreare === 0}>
            {inCorso ? "Creo il listino…" : `Crea ${daCreare || ""} ${daCreare === 1 ? "modello" : "modelli"}`.replace("  ", " ")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
