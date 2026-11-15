// Modifica dei dati del cliente per la fattura: tipo (Privato / Azienda / PA) e campi
// del tipo (lotto 1, 15/11/2026). Usata dalla scheda cliente e dalla scheda anagrafica.

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { CampiClienteFiscale, SceltaTipoCliente } from "@/components/clients/CampiClienteFiscale";
import { etichettaTipoCliente, problemiClienteFiscale, type ClienteFiscaleForm } from "@/lib/clienti/clienteFiscale";
import { salvaClienteFiscale } from "@/lib/clienti/salvaClienteFiscale";
import { queryKeys } from "@/lib/queryKeys";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  iniziale: ClienteFiscaleForm;
  clienteId?: string | null;
  anagraficaId?: string | null;
  /** La PA non ha ancora uffici: chiedi il primo. */
  chiediUfficio?: boolean;
  onSaved?: (anagraficaId: string) => void;
}

export function DatiFiscaliClienteDialog(props: Props) {
  // Il corpo si monta a ogni apertura: il form riparte dai dati salvati.
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {props.open && <Corpo {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function Corpo({ onOpenChange, iniziale, clienteId, anagraficaId, chiediUfficio, onSaved }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<ClienteFiscaleForm>(iniziale);
  const [provato, setProvato] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const errori = problemiClienteFiscale(form);
  const cambiaTipo = iniziale.tipo !== form.tipo;

  const salva = async () => {
    setProvato(true);
    if (Object.keys(errori).length) return;
    setSalvo(true);
    try {
      const id = await salvaClienteFiscale({
        clienteId,
        anagraficaId,
        form,
        conUfficio: chiediUfficio,
        aggiornaProfilo: !!clienteId,
      });
      qc.invalidateQueries({ queryKey: queryKeys.anagraficheNative.all });
      qc.invalidateQueries({ queryKey: ["anagrafica-cliente"] });
      qc.invalidateQueries({ queryKey: ["uffici-pa"] });
      qc.invalidateQueries({ queryKey: ["anagrafiche-pa-da-confermare"] });
      if (clienteId) qc.invalidateQueries({ queryKey: queryKeys.customersList.all });
      toast({ title: "Dati per la fattura salvati" });
      onSaved?.(id);
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Non salvato", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSalvo(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Dati per la fattura</DialogTitle>
        <DialogDescription>Il tipo decide il formato della fattura elettronica e i campi obbligatori.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <SceltaTipoCliente value={form.tipo} onChange={(tipo) => setForm({ ...form, tipo })} />
        {cambiaTipo && (
          <Alert>
            <AlertDescription className="text-sm">
              Da {etichettaTipoCliente(iniziale.tipo).toLowerCase()} a {etichettaTipoCliente(form.tipo).toLowerCase()}: le
              fatture già emesse restano come sono, le prossime usano il tipo nuovo.
            </AlertDescription>
          </Alert>
        )}
        <CampiClienteFiscale value={form} onChange={setForm} errori={provato ? errori : {}} conUfficio={chiediUfficio && form.tipo === "PA"} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Annulla
        </Button>
        <Button onClick={salva} disabled={salvo}>
          {salvo && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Salva
        </Button>
      </DialogFooter>
    </>
  );
}
