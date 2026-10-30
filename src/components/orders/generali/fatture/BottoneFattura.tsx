// src/components/orders/generali/fatture/BottoneFattura.tsx
// Accanto a un SAL di contratto o a un pagamento di un'unità: la fattura già nata da lì (link
// all'editor) oppure «Crea fattura». Da telefono si vede la fattura, non la si crea (piano §3.4).
import { useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFattureGenerale } from "@/hooks/useGeneraleFatture";
import { etichettaFattura, fatturaDi, type OrigineFattura } from "@/lib/orders/generali/fatture";
import { FatturaDialog } from "./FatturaDialog";

interface Props {
  generaleId: string;
  origine: OrigineFattura;
  /** id del SAL (sal_records) o del pagamento (unita_movimenti) */
  id: string;
  /** Si può creare la fattura da qui (oltre al permesso «Fatturazione», che controlla il database). */
  crea?: boolean;
  compatto?: boolean;
}

export function BottoneFattura({ generaleId, origine, id, crea = true, compatto = false }: Props) {
  const telefono = useIsMobile();
  const elenco = useFattureGenerale(generaleId);
  const [aperto, setAperto] = useState(false);
  // Senza permesso sugli importi l'elenco non si legge: non si mostra niente.
  if (!elenco.data) return null;
  const fattura = fatturaDi(elenco.data.fatture, origine === "sal" ? { salId: id } : { movimentoId: id });

  if (fattura) {
    return (
      <Link
        to={`/azienda/documenti/${fattura.documentoId}`}
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <Receipt className="h-3.5 w-3.5" /> {etichettaFattura(fattura)}
      </Link>
    );
  }
  if (!crea || telefono || !elenco.data.puoFatturare) return null;
  return (
    <>
      {compatto ? (
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setAperto(true)}>
          <FileText className="mr-1 h-3.5 w-3.5" /> Crea fattura
        </Button>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => setAperto(true)}>
          <FileText className="mr-1.5 h-3.5 w-3.5" /> Crea fattura
        </Button>
      )}
      {aperto && <FatturaDialog generaleId={generaleId} origine={origine} id={id} open={aperto} onOpenChange={setAperto} />}
    </>
  );
}
