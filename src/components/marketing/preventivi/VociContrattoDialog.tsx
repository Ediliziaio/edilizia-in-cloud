/**
 * «Dal contratto» nel preventivo classico (10/11/2026): le voci del listino concordato col committente — la
 * giornata uomo, il viaggio, il metro quadro di posa — entrano nel preventivo in un clic. Il prezzo lo propone il
 * contratto e si cambia riga per riga; la nota di riga va nella descrizione, che il PDF stampa sotto la voce.
 * Le voci libere e quelle del listino aziendale restano dove erano.
 */
import { useMemo, useState } from "react";
import { parseDecimalIT, formatDecimalIT } from "@/lib/parseDecimalIT";
import { sceltaIniziale, unitaVoce, type SceltaVoce, type TariffaContratto } from "@/lib/preventivi/preventiviCommittente";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Riga { scelta: boolean; quantita: string; prezzo: string; nota: string }

export function VociContrattoDialog({ open, onClose, contratto, tariffe, onAggiungi }: {
  open: boolean;
  onClose: () => void;
  contratto: { nome: string } | null;
  tariffe: TariffaContratto[];
  onAggiungi: (scelte: SceltaVoce[]) => void;
}) {
  const iniziali = useMemo(() => Object.fromEntries(tariffe.map((t) => {
    const s = sceltaIniziale(t);
    return [t.id, { scelta: false, quantita: "1", prezzo: formatDecimalIT(s.prezzo), nota: "" } satisfies Riga];
  })), [tariffe]);
  const [righe, setRighe] = useState<Record<string, Riga>>(iniziali);
  const riga = (id: string): Riga => righe[id] ?? iniziali[id];
  const cambia = (id: string, parte: Partial<Riga>) => setRighe((r) => ({ ...r, [id]: { ...riga(id), ...parte } }));
  const scelte = tariffe.filter((t) => riga(t.id)?.scelta);

  const conferma = () => {
    onAggiungi(scelte.map((t) => {
      const r = riga(t.id);
      return { tariffa: t, quantita: parseDecimalIT(r.quantita) || 1, prezzo: parseDecimalIT(r.prezzo) || 0, nota: r.nota };
    }));
    setRighe(iniziali);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Voci dal contratto{contratto ? ` · ${contratto.nome}` : ""}</DialogTitle>
        </DialogHeader>
        {tariffe.length === 0 ? (
          <p className="text-sm text-muted-foreground">Il contratto non ha voci in listino.</p>
        ) : (
          <ul className="divide-y" aria-label="Voci del contratto">
            {tariffe.map((t) => {
              const r = riga(t.id);
              return (
                <li key={t.id} className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1.5 py-2 sm:grid-cols-[auto_1fr_5rem_7rem]">
                  <Checkbox className="mt-0.5" checked={r.scelta} onCheckedChange={(v) => cambia(t.id, { scelta: v === true })} aria-label={`Scegli ${t.descrizione}`} />
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium">{t.descrizione}</p>
                    <p className="text-xs text-muted-foreground">
                      {[unitaVoce(t.unita_misura), t.qualifica, t.codice, `contratto ${formatDecimalIT(t.prezzo_unitario)} €`].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Input className="h-8 max-sm:col-start-2" inputMode="decimal" aria-label={`Quantità di ${t.descrizione}`} disabled={t.unita_misura === "corpo"}
                    value={t.unita_misura === "corpo" ? "1" : r.quantita} onChange={(e) => cambia(t.id, { quantita: e.target.value, scelta: true })} />
                  <Input className="h-8 max-sm:col-start-2" inputMode="decimal" aria-label={`Prezzo di ${t.descrizione}`}
                    value={r.prezzo} onChange={(e) => cambia(t.id, { prezzo: e.target.value, scelta: true })}
                    onBlur={() => cambia(t.id, { prezzo: formatDecimalIT(parseDecimalIT(r.prezzo)) })} />
                  <Input className="col-start-2 h-8 sm:col-span-3" placeholder="Nota di riga (facoltativa)" aria-label={`Nota di ${t.descrizione}`}
                    value={r.nota} onChange={(e) => cambia(t.id, { nota: e.target.value })} />
                </li>
              );
            })}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button disabled={scelte.length === 0} onClick={conferma}>
            {scelte.length <= 1 ? "Aggiungi la voce" : `Aggiungi ${scelte.length} voci`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
