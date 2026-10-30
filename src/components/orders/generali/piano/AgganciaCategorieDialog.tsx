// src/components/orders/generali/piano/AgganciaCategorieDialog.tsx
// Aggancia a una voce di costo le categorie di spesa che l'azienda usa già («Calcestruzzo»,
// «Ponteggi e opere provvisionali»…): le spese con quelle categorie finiscono in questa voce
// prima di ogni altra regola, così il reale si classifica da solo.
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { normalizzaCategoria } from "@/lib/controlloGestione/vociCassa";
import { CATEGORIE_PIANO } from "@/lib/orders/generali/pianoCategorie";
import type { VocePiano } from "@/lib/orders/generali/pianoConti";
import type { CategoriaAzienda } from "@/lib/orders/generali/pianoLettura";

/** «materiali_edili» → «Materiali edili». */
const leggibile = (t: string) => {
  const s = t.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export function AgganciaCategorieDialog({ voce, categorie, onClose, onSalva }: {
  voce: VocePiano;
  categorie: CategoriaAzienda[];
  onClose: () => void;
  onSalva: (categorie: string[]) => void;
}) {
  const [scelte, setScelte] = useState<Set<string>>(new Set(voce.categorieCosto));
  const [cerca, setCerca] = useState("");
  // Anche le categorie agganciate che l'azienda non usa più restano visibili, per poterle togliere.
  const elenco = useMemo(() => {
    const note = new Map(categorie.map((c) => [c.chiave, leggibile(c.etichetta)]));
    for (const c of voce.categorieCosto) if (!note.has(c)) note.set(c, leggibile(c));
    const filtro = normalizzaCategoria(cerca);
    return [...note.entries()]
      .filter(([chiave, nome]) => !filtro || chiave.includes(filtro) || normalizzaCategoria(nome).includes(filtro))
      .sort((a, b) => a[1].localeCompare(b[1], "it"));
  }, [categorie, voce.categorieCosto, cerca]);

  const cambia = (chiave: string, si: boolean) =>
    setScelte((prima) => {
      const dopo = new Set(prima);
      if (si) dopo.add(chiave); else dopo.delete(chiave);
      return dopo;
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Categorie di costo per «{voce.descrizione || CATEGORIE_PIANO[voce.categoria].nome}»</DialogTitle>
          <DialogDescription>
            Le spese registrate con queste categorie, sulla generale e sulle sue commesse, finiscono in questa voce.
          </DialogDescription>
        </DialogHeader>
        {categorie.length === 0 && voce.categorieCosto.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            L'azienda non ha ancora categorie di spesa. Le voci raccolgono comunque il reale per tipo (materiali, manodopera…).
          </p>
        ) : (
          <>
            <Input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca una categoria" aria-label="Cerca una categoria" />
            <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
              {elenco.map(([chiave, nome]) => (
                <li key={chiave}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
                    <Checkbox checked={scelte.has(chiave)} onCheckedChange={(v) => cambia(chiave, v === true)} />
                    <span>{nome}</span>
                  </label>
                </li>
              ))}
              {elenco.length === 0 && <li className="px-2 py-1.5 text-sm text-muted-foreground">Nessuna categoria con questo nome.</li>}
            </ul>
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={() => onSalva([...scelte])}>Salva</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
