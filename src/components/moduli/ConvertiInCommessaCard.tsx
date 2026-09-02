/**
 * "Il cliente ha accettato? Crea la commessa" per i moduli Fotovoltaico e
 * Ristrutturazione, sullo stesso modello che Serramenti ha da maggio 2026.
 *
 * Prima il preventivo di modulo finiva firmato e poi la commessa si rifaceva a
 * mano, riscrivendo cliente, importi e righe. Qui nasce con le voci del
 * computo (o dei componenti) già dentro, e i due record restano legati: il
 * bottone sparisce e lascia il posto al collegamento alla commessa.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, HardHat, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { convertiFvInCommessa, convertiRstInCommessa } from "@/lib/moduli/convertiInCommessa";

interface Props {
  modulo: "fv" | "rst";
  progettoId: string;
  /** Commessa già creata da questo preventivo: se c'è, si mostra il collegamento. */
  ordineId?: string | null;
  /** Motivo per cui non si può ancora convertire (computo vuoto, cliente mancante…). */
  bloccoMotivo?: string | null;
  /** Chiamata dopo la conversione, per ricaricare la pagina del modulo. */
  onConvertito?: (orderId: string) => void;
}

export function ConvertiInCommessaCard({ modulo, progettoId, ordineId, bloccoMotivo, onConvertito }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [inCorso, setInCorso] = useState(false);

  const converti = async () => {
    if (!user?.id) { toast.error("Sessione scaduta: accedi di nuovo"); return; }
    setInCorso(true);
    try {
      const esito = modulo === "fv"
        ? await convertiFvInCommessa(progettoId, user.id)
        : await convertiRstInCommessa(progettoId, user.id);
      toast.success("Commessa creata", {
        description: esito.righe > 0
          ? `${esito.righe} rig${esito.righe === 1 ? "a" : "he"} portate dal preventivo.`
          : "Il dettaglio delle righe si aggiunge dalla commessa.",
      });
      onConvertito?.(esito.orderId);
      navigate(`/azienda/ordini/${esito.orderId}`);
    } catch (e) {
      toast.error("Conversione non riuscita", { description: e instanceof Error ? e.message : "Riprova." });
    } finally {
      setInCorso(false);
    }
  };

  if (ordineId) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/20">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <HardHat className="h-5 w-5 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">Commessa già aperta</p>
            <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80">
              Questo preventivo è diventato una commessa: i lavori si seguono da lì.
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate(`/azienda/ordini/${ordineId}`)}>
            Apri la commessa
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-orange-200 bg-orange-50/60 dark:border-orange-900/50 dark:bg-orange-950/20">
      <CardContent className="flex flex-wrap items-center gap-3 p-4">
        <HardHat className="h-5 w-5 shrink-0 text-orange-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-orange-900 dark:text-orange-200">Il cliente ha accettato?</p>
          <p className="text-xs text-orange-800/80 dark:text-orange-300/80">
            {bloccoMotivo ?? "La commessa nasce con cliente, importi e righe già dentro. Acconto e saldo si impostano dopo."}
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5 bg-orange-500 text-white hover:bg-orange-600"
          disabled={inCorso || !!bloccoMotivo}
          onClick={() => { void converti(); }}
          title={bloccoMotivo ?? undefined}
        >
          {inCorso ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <HardHat className="h-3.5 w-3.5" />}
          Crea la commessa
        </Button>
      </CardContent>
    </Card>
  );
}
