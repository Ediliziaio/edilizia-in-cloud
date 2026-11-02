// src/components/orders/generali/RaggruppaDialog.tsx
// Dalla lista commesse: mettere commesse che esistono già dentro una generale nuova (piano, F8).
// Prima di creare si vede cosa entra, di quale cliente e per quale importo.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScegliCliente } from "@/components/orders/generali/ScegliCliente";
import { messaggioGenerale, useRaggruppaCommesse, type MappaGenerali } from "@/hooks/useCommesseGenerali";
import { leggiImporto } from "@/lib/controlloGestione/formatCG";
import { DEFINIZIONI_MODELLI, formattaEuro, type ModelloGenerale } from "@/lib/orders/commesseGenerali";
import { controllaRaggruppo, type RigaRaggruppo } from "@/lib/orders/listaGenerali";

interface Props {
  righe: RigaRaggruppo[];
  modelli: ModelloGenerale[];
  mappa: MappaGenerali;
  mostraImporti: boolean;
  onClose: () => void;
}

export function RaggruppaDialog({ righe, modelli, mappa, mostraImporti, onClose }: Props) {
  const navigate = useNavigate();
  const raggruppa = useRaggruppaCommesse();
  const c = controllaRaggruppo(righe, mappa);
  const [modello, setModello] = useState<ModelloGenerale | undefined>(modelli[0]);
  const [nome, setNome] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(c.clienteUnico);
  const [valoreTesto, setValoreTesto] = useState("");
  const def = modello ? DEFINIZIONI_MODELLI[modello] : null;
  const valore = valoreTesto.trim() === "" ? null : leggiImporto(valoreTesto);
  const valoreSbagliato = valoreTesto.trim() !== "" && (valore === null || valore < 0);
  const puoCreare = !!modello && nome.trim().length > 0 && c.commesse.length > 0 && !valoreSbagliato && !raggruppa.isPending;

  const conferma = () => {
    if (!modello || !puoCreare) return;
    raggruppa.mutate({ nuova: { modello, nome: nome.trim(), clienteId, valore }, commesse: c.commesse }, {
      onSuccess: ({ id, collegate }) => {
        if (collegate) toast.success(c.commesse.length === 1 ? "1 commessa raggruppata" : `${c.commesse.length} commesse raggruppate`);
        else toast.error("Commessa generale creata, ma le commesse non sono entrate: collegale dalla sua pagina.");
        onClose();
        navigate(`/azienda/ordini/${id}`);
      },
      onError: (e) => toast.error(messaggioGenerale(e, "la commessa generale")),
    });
  };

  return (
    <Dialog open onOpenChange={(aperta) => { if (!aperta) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Raggruppa in una commessa generale</DialogTitle>
          <DialogDescription>
            {c.commesse.length === 1 ? "1 commessa" : `${c.commesse.length} commesse`}
            {mostraImporti ? ` per ${formattaEuro(c.totale)}` : ""}. Restano commesse normali: cantiere, costi e fatture non cambiano.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); conferma(); }}>
          {c.generaliEscluse > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {c.generaliEscluse === 1 ? "Una delle scelte è già una generale: resta fuori." : `${c.generaliEscluse} delle scelte sono già generali: restano fuori.`}
            </p>
          )}
          {c.giaInUnaGenerale > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {c.giaInUnaGenerale === 1 ? "Una commessa è già in un'altra generale: verrà spostata qui." : `${c.giaInUnaGenerale} commesse sono già in un'altra generale: verranno spostate qui.`}
            </p>
          )}
          {c.clientiDiversi && (
            <p className="text-xs text-amber-700 dark:text-amber-400">Le commesse hanno clienti diversi: scegli il cliente della generale, o lascialo vuoto.</p>
          )}
          {modelli.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="raggruppa-tipo">Tipo</Label>
              <Select value={modello} onValueChange={(v) => setModello(v as ModelloGenerale)}>
                <SelectTrigger id="raggruppa-tipo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {modelli.map((m) => <SelectItem key={m} value={m}>{DEFINIZIONI_MODELLI[m].nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="raggruppa-nome">Nome</Label>
            <Input id="raggruppa-nome" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="raggruppa-cliente">{def?.cliente.etichetta ?? "Cliente"}</Label>
            <ScegliCliente id="raggruppa-cliente" valore={clienteId} onCambia={setClienteId} />
          </div>
          {mostraImporti && (
            <div className="space-y-1.5">
              <Label htmlFor="raggruppa-valore">{def?.valore.etichetta ?? "Valore"} (facoltativo)</Label>
              <Input id="raggruppa-valore" inputMode="decimal" value={valoreTesto} onChange={(e) => setValoreTesto(e.target.value)} aria-invalid={valoreSbagliato} />
            </div>
          )}
        </form>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={onClose}>Annulla</Button>
          <Button onClick={conferma} disabled={!puoCreare}>
            {raggruppa.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Raggruppa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
