/**
 * Impostazioni → Approvazioni e avvisi: l'interruttore del collegamento automatico.
 * Vale per tutti i collegamenti fra documenti (acquisti, tesoreria, subappalti).
 * Spento di base. Lo cambia solo l'amministratore dell'azienda.
 */
import { Link2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useCollegamentoAutomatico, useSalvaCollegamentoAutomatico } from "@/hooks/useCollegamentoAutomatico";

export function CollegamentoAutomaticoCard({ companyId, puoModificare }: { companyId: string; puoModificare: boolean }) {
  const { data: acceso = false, isLoading } = useCollegamentoAutomatico(companyId);
  const salva = useSalvaCollegamentoAutomatico(companyId);
  return (
    <Card className="max-w-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" />
          Collegamento automatico dei documenti
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <Switch
            checked={acceso}
            disabled={!puoModificare || isLoading || salva.isPending}
            onCheckedChange={(v) => salva.mutate(v)}
            aria-label="Collegamento automatico dei documenti"
          />
          <span className="text-sm font-medium">
            {acceso ? "Acceso: i collegamenti certi si fanno da soli" : "Spento: i collegamenti certi si propongono, li confermi con un clic"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Vale per fatture, bolle, ordini, commesse, pagamenti e subappalti. «Certo» vuol dire un solo documento
          possibile e tutti i dati che tornano (es. stesso fornitore, stesso numero di bolla, data vicina). Quando il
          gestionale ha un dubbio — più documenti possibili, dati che non tornano, niente da collegare — ti chiede
          sempre, con l&apos;interruttore acceso o spento. Ogni collegamento resta nello storico con il perché e
          si può annullare.
        </p>
        {!puoModificare && <p className="text-xs text-muted-foreground">Lo può cambiare solo l&apos;amministratore dell&apos;azienda.</p>}
      </CardContent>
    </Card>
  );
}
