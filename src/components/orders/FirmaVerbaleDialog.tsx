/** La firma del cliente sul verbale: col dito sullo schermo, dopo aver visto il documento. */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FirmaPad } from "@/components/campo/FirmaPad";

export interface FirmaVerbale { immagine: string; nome: string }

export function FirmaVerbaleDialog({ aperto, nomeIniziale = "", occupato, onChiudi, onConferma }: {
  aperto: boolean; nomeIniziale?: string; occupato?: boolean; onChiudi: () => void; onConferma: (firma: FirmaVerbale) => Promise<void> | void;
}) {
  const [immagine, setImmagine] = useState<string | null>(null);
  const [nome, setNome] = useState(nomeIniziale);
  return (
    <Dialog open={aperto} onOpenChange={(v) => { if (!v && !occupato) onChiudi(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Firma del cliente</DialogTitle>
          <DialogDescription>Dopo la firma il verbale non si può più modificare.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label htmlFor="firma-verbale-nome">Nome e cognome di chi firma</Label>
            <Input id="firma-verbale-nome" value={nome} maxLength={200} onChange={(e) => setNome(e.target.value)} />
          </div>
          <FirmaPad label="cliente" onChange={setImmagine} />
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={occupato} onClick={onChiudi}>Annulla</Button>
          <Button disabled={occupato || !immagine || !nome.trim()} onClick={() => immagine && void onConferma({ immagine, nome: nome.trim() })}>Conferma la firma</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
