import { useRef } from "react";
import { useDialogFocusReturn } from "@/hooks/useDialogFocusReturn";
/**
 * Popup «Nuovo Ticket» — stesso contenuto della pagina Crea Ticket, aperto in
 * finestra come «Nuovo Impianto», così le due creazioni sono coerenti.
 */
import { useNavigate } from "react-router-dom";
import { Headset } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { NuovoTicketForm, type NuovoTicketInitial } from "@/components/tickets/NuovoTicketForm";

interface NuovoTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: NuovoTicketInitial;
  /** Dopo la creazione: default apre il ticket; passa un handler per restare in lista. */
  onCreated?: (ticketId: string) => void;
}

export function NuovoTicketDialog({ open, onOpenChange, initial, onCreated }: NuovoTicketDialogProps) {
  const navigate = useNavigate();
  const pendingRef = useRef(false);
  const focusReturn = useDialogFocusReturn();
  return (
    <Dialog open={open} onOpenChange={(next) => { if (next || !pendingRef.current) onOpenChange(next); }}>
      <DialogContent {...focusReturn} className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Headset className="h-5 w-5 text-primary" /> Nuovo ticket
          </DialogTitle>
          <DialogDescription>
            Apri un'assistenza per un cliente. Solo cliente e oggetto sono obbligatori: il resto lo aggiungi ora o dopo.
          </DialogDescription>
        </DialogHeader>
        {/* key: rimonta il form a ogni apertura così i campi ripartono puliti. */}
        <NuovoTicketForm
          key={open ? "aperto" : "chiuso"}
          initial={initial}
          variant="dialog"
          onPendingChange={(pending) => { pendingRef.current = pending; }}
          onCreated={(id) => {
            pendingRef.current = false;
            onOpenChange(false);
            if (onCreated) onCreated(id);
            else navigate(`/azienda/assistenza/${id}`);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
