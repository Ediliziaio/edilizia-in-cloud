/**
 * Il riquadro «Rilievo» dell'appuntamento di sopralluogo.
 * Piano: docs/piano-sopralluoghi-vendita-tecnico.md, lotto 1.
 *
 * Chi fissa il sopralluogo sceglie il modello e, salvando, il rilievo è pronto per il tecnico:
 * stesso cliente, commessa, indirizzo e ora, il tecnico è l'assegnatario dell'appuntamento e,
 * se è un operaio, lo apre dall'app. Lo stato sta in `useRilievoAppuntamento`.
 */
import { Link } from "react-router-dom";
import { ClipboardCheck } from "lucide-react";
import { SU_CARTA, type RilievoAppuntamentoStato } from "@/hooks/useRilievoAppuntamento";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function RilievoAppuntamentoCampo({ stato }: { stato: RilievoAppuntamentoStato }) {
  const t = useT();
  if (!stato.visibile) return null;
  if (stato.esistente) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-2 text-sm">
        <ClipboardCheck className="h-4 w-4 shrink-0 text-orange-600" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{t("Rilievo {codice} collegato: segue ora e tecnico dell'appuntamento", { codice: stato.esistente.code ?? "" })}</span>
        <Link to={`/azienda/sopralluoghi/${stato.esistente.id}`} className="shrink-0 text-xs font-medium text-primary hover:underline">{t("Apri")}</Link>
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-md border px-2.5 py-2">
      <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className="h-4 w-4 accent-orange-600"
          checked={stato.attivo}
          onChange={(e) => stato.setAttivo(e.target.checked)}
        />
        {stato.tipo === "commerciale" ? t("Prepara il rilievo commerciale") : t("Prepara il rilievo per il tecnico")}
      </label>
      {stato.attivo && (
        <Select value={stato.modelloId ?? undefined} onValueChange={stato.setModelloId} disabled={stato.caricaModelli}>
          <SelectTrigger className="h-9" aria-label={t("Modello del rilievo")}>
            <SelectValue placeholder={stato.caricaModelli ? t("Carico i modelli…") : t("Scegli il modello")} />
          </SelectTrigger>
          <SelectContent>
            {stato.modelli.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            <SelectItem value={SU_CARTA}>{t("Su carta: foto e PDF del foglio")}</SelectItem>
          </SelectContent>
        </Select>
      )}
      <p className="text-xs text-muted-foreground">
        {stato.tipo === "commerciale"
          ? t("Misure di massima per l'offerta. Il rilievo tecnico, preciso, si fa dopo.")
          : stato.modelloId === SU_CARTA
            ? t("Niente modulo: il tecnico fotografa il foglio dall'app, o carichi tu foto e PDF.")
            : t("Il tecnico lo trova pronto con cliente, indirizzo e ora; se è un operaio lo compila dall'app.")}
      </p>
    </div>
  );
}
