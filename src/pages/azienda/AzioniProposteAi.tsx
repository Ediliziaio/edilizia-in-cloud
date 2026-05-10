/**
 * AzioniProposteAi — pagina dedicata full-screen per gestire le azioni
 * proposte da Silvio + 18 personas che richiedono OK utente.
 *
 * Differenza vs Sheet del badge in header:
 *   - più spazio per drill-down + filtri
 *   - link permanente bookmark-able (es. da email notifica)
 *   - layout consistente col resto della /azienda
 *
 * MP-AIE-03 — chiude il GAP "i componenti UI esistono ma non sono mai mountati".
 */
import { Sparkles } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ActionProposalsList } from "@/components/ai/ActionProposals/ActionProposalsList";

export default function AzioniProposteAi() {
  return (
    <div className="p-4 md:p-6 max-w-screen-xl mx-auto space-y-4">
      <div className="flex items-start gap-3">
        <div className="shrink-0 h-10 w-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
          <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Azioni proposte da AI</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Silvio e le personas AI propongono azioni che richiedono il tuo OK.
            Approva o rifiuta dal pannello qui sotto. Le azioni rifiutate
            alimentano il self-learning loop per migliorare i prossimi suggerimenti.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Come funzionano</CardTitle>
          <CardDescription className="text-xs">
            Quando l'AI propone un'azione marcata come <strong>yellow</strong> (rischio medio)
            o <strong>red</strong> (rischio alto) — ad esempio inviare un'email a un cliente o
            modificare una fattura — non viene eseguita immediatamente. Viene creata una
            proposta che vedi qui, con TTL (es. 60 minuti). Se confermi entro il TTL,
            viene applicata. Se ignori o rifiuti, l'AI impara dal tuo feedback.
          </CardDescription>
        </CardHeader>
      </Card>

      <ActionProposalsList />
    </div>
  );
}
