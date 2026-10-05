/**
 * «Scansiona» dall'ufficio: si inquadra l'etichetta di un attrezzo o di un
 * mezzo e si apre la sua scheda. Un'etichetta vuota (codice riservato, nessun
 * attrezzo collegato) apre il modulo del nuovo attrezzo con quel codice.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BarcodeScanner } from "@/components/warehouse/BarcodeScanner";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { cercaCodiceMezzo } from "@/hooks/useMezzi";
import { leggiCodiceScansionato } from "@/types/mezzi";
import { cn } from "@/lib/utils";

interface Props {
  /** Etichetta vuota letta: chi chiama apre il modulo del nuovo attrezzo con il codice. */
  onLibero?: (codice: string) => void;
  className?: string;
}

export function ScansionaMezzoButton({ onLibero, className }: Props) {
  const navigate = useNavigate();
  const companyId = useEffectiveCompanyId();
  const [aperto, setAperto] = useState(false);
  const [cercando, setCercando] = useState(false);

  const letto = useCallback(
    async (testo: string) => {
      const c = leggiCodiceScansionato(testo);
      if (!c) {
        toast.error("Non riconosco questo codice.");
        return;
      }
      setCercando(true);
      try {
        const r = await cercaCodiceMezzo(c.codice, c.companyId ?? companyId);
        if (r.esito === "trovato") {
          navigate(`/azienda/mezzi/${r.id}?da=qr`);
        } else if (r.esito === "libero") {
          if (r.posso_registrare && onLibero) onLibero(r.codice);
          else toast.info(`L'etichetta ${r.codice} non è ancora collegata a nessun attrezzo.`);
        } else {
          toast.error(`Nessun attrezzo con il codice ${c.codice}.`);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Non sono riuscito a leggere il codice.");
      } finally {
        setCercando(false);
      }
    },
    [companyId, navigate, onLibero],
  );

  // Allo scanner una funzione stabile: cambiandola, la fotocamera ripartirebbe.
  const lettoRef = useRef<(testo: string) => Promise<void>>(letto);
  useEffect(() => {
    lettoRef.current = letto;
  }, [letto]);
  const suLettura = useCallback((t: string): void => {
    void lettoRef.current(t);
  }, []);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setAperto(true)}
        disabled={cercando}
        className={cn("gap-2 max-sm:h-9 max-sm:w-9 max-sm:p-0", className)}
        aria-label="Scansiona un'etichetta"
        title="Scansiona un'etichetta QR"
      >
        {cercando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4 text-orange-600" />}
        <span className="max-sm:hidden">Scansiona</span>
      </Button>
      <BarcodeScanner open={aperto} onOpenChange={setAperto} onScan={suLettura} />
    </>
  );
}
