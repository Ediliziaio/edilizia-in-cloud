/**
 * «Silvio AI» in testa alla commessa (31/10/2026).
 *
 * Florin: «togli il supporto AI da Lavorazioni, metti in alto Silvio AI: Silvio
 * ti aiuta e prepara tutto». Un solo punto di ingresso all'AI della commessa:
 *   · Chiedi a Silvio — la chat si apre qui, sopra la commessa (non si cambia
 *     pagina), con la commessa già detta;
 *   · Analizza la commessa — avanzamento, costi, scadenze, margine;
 *   · Suggerisci chi assegnare — l'assegnazione operai con l'AI che prima stava
 *     in fondo a Lavorazioni;
 *   · Rapportini dai documenti — apre «Scrivi rapportini» nella vista Rapportini,
 *     dove si caricano foto, PDF ed Excel e si leggono con l'AI.
 * Le azioni che scrivono restano quelle già collaudate: Silvio propone, chi
 * lavora conferma (vedi docs/silvio-commessa-piano.md).
 */
import { useState } from "react";
import { BarChart3, FileUp, MessageSquare, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AllocazioneOperaiAIDialog } from "@/components/orders/AllocazioneOperaiAIDialog";
import { cn } from "@/lib/utils";

/** Apre la chat di Silvio sopra la pagina (SilvioFAB ascolta «silvio:open-chat»). */
export function apriChatSilvio(draft: string) {
  window.dispatchEvent(new CustomEvent("silvio:open-chat", { detail: { draft } }));
}

export function SilvioCommessa({ orderId, companyId, riferimento, puoModificare, onRapportiniDaDocumenti, className }: {
  orderId: string;
  companyId: string | null | undefined;
  /** «la commessa O-0002 (Rossi, ristrutturazione bagno)»: entra in ogni domanda. */
  riferimento: string;
  puoModificare: boolean;
  onRapportiniDaDocumenti?: () => void;
  className?: string;
}) {
  const [operai, setOperai] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className={cn("h-8 gap-1.5 border-violet-200 text-violet-900", className)}>
            <Sparkles className="h-4 w-4 text-violet-600" />Silvio AI
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuItem onSelect={() => apriChatSilvio(`Sulla ${riferimento}: `)}>
            <MessageSquare className="mr-2 h-4 w-4" />Chiedi a Silvio su questa commessa
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => apriChatSilvio(`Analizza la ${riferimento}: stato di avanzamento, costi rispetto al previsto, scadenze, margine e criticità. Cosa devo sapere e quali sono le prossime mosse?`)}>
            <BarChart3 className="mr-2 h-4 w-4" />Analizza la commessa
          </DropdownMenuItem>
          {puoModificare && companyId && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setOperai(true)}>
                <Users className="mr-2 h-4 w-4" />Suggerisci chi assegnare
              </DropdownMenuItem>
              {onRapportiniDaDocumenti && (
                <DropdownMenuItem onSelect={onRapportiniDaDocumenti}>
                  <FileUp className="mr-2 h-4 w-4" />Rapportini dai documenti
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {puoModificare && companyId && <AllocazioneOperaiAIDialog orderId={orderId} companyId={companyId} open={operai} onOpenChange={setOperai} />}
    </>
  );
}
