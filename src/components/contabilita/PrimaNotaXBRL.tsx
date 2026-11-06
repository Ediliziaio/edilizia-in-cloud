import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Info } from 'lucide-react';
import { toast } from 'sonner';

type XbrlEntry = {
  data: string;
  descrizione: string;
  importo_dare: number;
  importo_avere: number;
  conto: string;
};

interface Props {
  entries: XbrlEntry[];
  anno: number;
  /** Se fornito, l'export XBRL usa TUTTE le righe filtrate (non solo la pagina
   *  corrente). Senza, ricade su `entries` (retro-compatibile). */
  fetchAll?: () => Promise<XbrlEntry[]>;
  /** Voce di un menu «⋯» invece di un bottone (testata della Prima Nota). */
  comeVoceMenu?: boolean;
}

// BUG-94: non produrre un'istanza XBRL priva di contesto, unità e
// tassonomia validata. Il CSV della Prima Nota resta disponibile.
const spiegazione = 'Esportazione XBRL non disponibile: il formato non è ancora validato. Usa Esporta CSV per scaricare i movimenti.';

export function PrimaNotaXBRL({ comeVoceMenu = false }: Props) {
  const informa = () => toast.info(spiegazione);
  if (comeVoceMenu) {
    return (
      <DropdownMenuItem onSelect={informa} className="gap-2">
        <Info className="h-4 w-4" />
        XBRL non disponibile · usa CSV
      </DropdownMenuItem>
    );
  }
  return (
    <Button variant="outline" onClick={informa}>
      <Info className="h-4 w-4 mr-2" />
      XBRL non disponibile · usa CSV
    </Button>
  );
}
