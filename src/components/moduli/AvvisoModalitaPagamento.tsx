/**
 * AvvisoModalitaPagamento — nel preventivo dei preventivatori edili le «Modalità di pagamento» sono il testo scritto
 * nel MODELLO dell'azienda. Se nel modello non c'è niente, nel PDF il riquadro non compare, e nessuno lo vede finché il
 * cliente non lo chiede (Dimora Torino, 26/10/2026: «nel preventivo a computo non escono i pagamenti»).
 * L'avviso lo dice subito, nella schermata dell'economia, e porta al modello.
 */
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

/** Il testo senza tag e spazi: un modello con solo «<p></p>» è vuoto. */
export function testoPagamentoVuoto(testo: string | null | undefined): boolean {
  return String(testo ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").trim().length === 0;
}

export function AvvisoModalitaPagamento({ testo, caricato = true }: { testo: string | null | undefined; caricato?: boolean }) {
  const permessi = usePermissions();
  if (!caricato || !testoPagamentoVuoto(testo)) return null;
  const puoScrivere = permessi.isAdmin || permessi.canViewSettingsPricing;
  return (
    <div role="note" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p>
        <strong>Nel PDF non compaiono le modalità di pagamento</strong>: nel modello del preventivo non sono scritte.{" "}
        {puoScrivere ? (
          <>Scrivile una volta sola, valgono per tutti i preventivi: <Link to="/azienda/impostazioni/template-preventivi" className="font-semibold underline">apri il modello</Link>, scheda del tuo intervento, «Modalità di pagamento».</>
        ) : (
          "Chiedi a chi gestisce il modello di scriverle: valgono per tutti i preventivi."
        )}
      </p>
    </div>
  );
}
