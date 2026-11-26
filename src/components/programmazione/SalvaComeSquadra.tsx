/**
 * «Salva queste persone come squadra» (Programmazione, 26/11/2026): una
 * combinazione del giorno che funziona diventa una squadra di Manodopera.
 * Cambia le squadre vere, quindi chiede conferma e dice chi lascia la sua.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { COLORI_SQUADRA, messaggioErroreOperai, useSalvaSquadra } from "@/hooks/useOperai";
import type { Intervento, PersonaGiorno, SquadraGiorno } from "@/lib/programmazione/giornata";

export default function SalvaComeSquadra({ intervento, personaDi, squadraDellaPersona, onChiudi }: {
  intervento: Intervento;
  personaDi: Map<string, PersonaGiorno>;
  squadraDellaPersona: Map<string, SquadraGiorno>;
  onChiudi: () => void;
}) {
  const [nome, setNome] = useState("");
  const [colore, setColore] = useState<string>(COLORI_SQUADRA[1]);
  const salva = useSalvaSquadra();
  const persone = intervento.persone.map((id) => personaDi.get(id)).filter((p): p is PersonaGiorno => !!p);
  const lasciano = persone.filter((p) => squadraDellaPersona.get(p.id));
  const responsabile = intervento.capoId ?? null;

  const conferma = () => {
    if (!nome.trim()) { toast.error("Dai un nome alla squadra."); return; }
    salva.mutate(
      { id: null, dati: { nome: nome.trim(), colore, responsabile_id: responsabile, componenti: persone.map((p) => p.id) } },
      {
        onSuccess: () => { toast.success(`Squadra «${nome.trim()}» creata`, { description: "La trovi in Manodopera e Mezzi e da domani nella proposta." }); onChiudi(); },
        onError: (e) => toast.error(messaggioErroreOperai(e, "Squadra non salvata.")),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onChiudi()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Salva come squadra</DialogTitle>
          <DialogDescription>Le {persone.length} persone di «{intervento.titolo}» diventano una squadra di Manodopera e Mezzi.</DialogDescription>
        </DialogHeader>
        <Input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => e.key === "Enter" && conferma()} placeholder="Nome della squadra (es. Squadra Posa 2)" aria-label="Nome della squadra" />
        <div className="flex items-center gap-1.5">
          {COLORI_SQUADRA.map((c) => (
            <button key={c} type="button" aria-label={`Colore ${c}`} onClick={() => setColore(c)}
              className={cn("h-6 w-6 rounded-full ring-offset-2", colore === c && "ring-2 ring-slate-900")} style={{ backgroundColor: c }} />
          ))}
        </div>
        <ul className="space-y-0.5 text-xs">
          {persone.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2">
              <span>{p.nome} {p.cognome}{p.id === responsabile && <span className="ml-1 text-orange-600">· responsabile</span>}</span>
              {squadraDellaPersona.get(p.id) && <span className="text-[10px] text-amber-700">lascia «{squadraDellaPersona.get(p.id)!.nome}»</span>}
            </li>
          ))}
        </ul>
        {lasciano.length > 0 && (
          <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
            Un operaio sta in una squadra sola: {lasciano.length === 1 ? "una persona lascia" : `${lasciano.length} persone lasciano`} la squadra di adesso, e con essa gli accessi ai cantieri dati dalla squadra.
          </p>
        )}
        {!responsabile && <p className="text-[11px] text-slate-500">Nessun responsabile: mettine uno con la corona prima di salvare, oppure sceglilo dopo in Manodopera.</p>}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onChiudi}>Annulla</Button>
          <Button size="sm" className="bg-orange-500 hover:bg-orange-600" disabled={salva.isPending} onClick={conferma}>
            {salva.isPending ? "Salvo…" : "Crea la squadra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
