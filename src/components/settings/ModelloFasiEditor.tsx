// src/components/settings/ModelloFasiEditor.tsx
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  rimuovi, sostituisci, sposta, validaBozza,
  type BozzaModello, type FaseModello, type PayloadModello, type SottofaseModello,
} from "@/lib/orders/modelliFasi";

interface ModelloFasiEditorProps {
  aperto: boolean;
  bozzaIniziale: BozzaModello | null;
  salvataggio: boolean;
  onChiudi: () => void;
  onSalva: (payload: PayloadModello) => void;
}

function Comandi({ etichetta, indice, totale, onSu, onGiu, onElimina, eliminaDisabilitato }: {
  etichetta: string; indice: number; totale: number; onSu: () => void; onGiu: () => void; onElimina: () => void; eliminaDisabilitato?: boolean;
}) {
  return (
    <>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Sposta su ${etichetta}`} disabled={indice === 0} onClick={onSu}>
        <ArrowUp className="h-4 w-4" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Sposta giù ${etichetta}`} disabled={indice === totale - 1} onClick={onGiu}>
        <ArrowDown className="h-4 w-4" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-rose-600" aria-label={`Elimina ${etichetta}`} disabled={eliminaDisabilitato} onClick={onElimina}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </>
  );
}

/** Si monta solo da aperto: ogni apertura riparte dalla sua bozza, senza un effetto che la ricopi. */
export default function ModelloFasiEditor({ aperto, bozzaIniziale, ...resto }: ModelloFasiEditorProps) {
  if (!aperto || !bozzaIniziale) return null;
  return <EditorAperto bozzaIniziale={bozzaIniziale} {...resto} />;
}

function EditorAperto({ bozzaIniziale, salvataggio, onChiudi, onSalva }: Omit<ModelloFasiEditorProps, "aperto" | "bozzaIniziale"> & { bozzaIniziale: BozzaModello }) {
  const [bozza, setBozza] = useState<BozzaModello>(bozzaIniziale);
  const fasi = bozza.fasi;
  const cambiaFasi = (nuove: FaseModello[]) => setBozza({ ...bozza, fasi: nuove });
  const cambiaFase = (i: number, patch: Partial<FaseModello>) => cambiaFasi(sostituisci(fasi, i, patch));
  const cambiaSotto = (i: number, nuove: SottofaseModello[]) => cambiaFase(i, { sottofasi: nuove });

  const salva = () => {
    const esito = validaBozza(bozza);
    // Con strictNullChecks spento `!esito.ok` non restringe il tipo: si confronta con false.
    if (esito.ok === false) { toast.error(esito.errore); return; }
    onSalva(esito.payload);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onChiudi(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{bozza.id ? "Modifica il modello" : "Nuovo modello di fasi"}</DialogTitle>
          <DialogDescription>
            Le fasi che compaiono quando scegli questo modello in una commessa. Le sottofasi misurano l'avanzamento della fase: più pesano, più contano.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="modello-nome">Nome del modello</Label>
              <Input id="modello-nome" value={bozza.nome} maxLength={80} onChange={(e) => setBozza({ ...bozza, nome: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="modello-desc">A cosa serve (facoltativo)</Label>
              <Input id="modello-desc" value={bozza.descrizione} maxLength={200} onChange={(e) => setBozza({ ...bozza, descrizione: e.target.value })} />
            </div>
          </div>

          <ol className="space-y-3">
            {fasi.map((fase, i) => (
              <li key={i} className="rounded-lg border bg-muted/20 p-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                  <Input
                    value={fase.nome} maxLength={160} placeholder="Nome della fase" aria-label={`Nome fase ${i + 1}`}
                    onChange={(e) => cambiaFase(i, { nome: e.target.value })} className="h-9 min-w-0 flex-1"
                  />
                  <Comandi
                    etichetta={`fase ${i + 1}`} indice={i} totale={fasi.length} eliminaDisabilitato={fasi.length === 1}
                    onSu={() => cambiaFasi(sposta(fasi, i, -1))} onGiu={() => cambiaFasi(sposta(fasi, i, 1))} onElimina={() => cambiaFasi(rimuovi(fasi, i))}
                  />
                </div>
                <ul className="ml-6 mt-2 space-y-1.5">
                  {fase.sottofasi.map((s, j) => (
                    <li key={j} className="flex items-center gap-1.5">
                      <Input
                        value={s.nome} maxLength={160} placeholder="Sottofase" aria-label={`Nome sottofase ${i + 1}.${j + 1}`}
                        onChange={(e) => cambiaSotto(i, sostituisci(fase.sottofasi, j, { nome: e.target.value }))} className="h-8 min-w-0 flex-1 text-sm"
                      />
                      <Input
                        type="number" min={1} max={100} value={s.peso} aria-label={`Peso sottofase ${i + 1}.${j + 1}`}
                        title="Quanto pesa nell'avanzamento della fase"
                        onChange={(e) => cambiaSotto(i, sostituisci(fase.sottofasi, j, { peso: Number(e.target.value) }))} className="h-8 w-16 shrink-0 text-sm"
                      />
                      <Comandi
                        etichetta={`sottofase ${i + 1}.${j + 1}`} indice={j} totale={fase.sottofasi.length}
                        onSu={() => cambiaSotto(i, sposta(fase.sottofasi, j, -1))} onGiu={() => cambiaSotto(i, sposta(fase.sottofasi, j, 1))}
                        onElimina={() => cambiaSotto(i, rimuovi(fase.sottofasi, j))}
                      />
                    </li>
                  ))}
                </ul>
                <Button
                  type="button" variant="ghost" size="sm" className="ml-5 mt-1.5 h-8 text-xs" aria-label={`Aggiungi sottofase alla fase ${i + 1}`}
                  onClick={() => cambiaSotto(i, [...fase.sottofasi, { nome: "", peso: 1 }])}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />Sottofase
                </Button>
              </li>
            ))}
          </ol>
          <Button type="button" variant="outline" size="sm" onClick={() => cambiaFasi([...fasi, { nome: "", sottofasi: [] }])}>
            <Plus className="mr-1 h-4 w-4" />Aggiungi fase
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onChiudi}>Annulla</Button>
          <Button onClick={salva} disabled={salvataggio}>Salva modello</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
