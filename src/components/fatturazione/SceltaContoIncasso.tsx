/**
 * «Dove c'è la banca vorrei che mi uscissero anche le altre, così da poter scegliere e non
 * rischiare di sbagliare nell'inserimento manuale degli altri IBAN» (26/11/2026, Impresa Vulcano).
 *
 * In fattura l'IBAN si compila da solo con quello principale delle impostazioni. Dal 19/11/2026 gli
 * altri conti si possono scegliere da una tendina — ma stava solo dentro «Dettagli bancari» della
 * sezione Pagamento, chiusa, e appariva **solo** quando l'azienda aveva già scritto più di un
 * conto. Chi apre «Fatturazione elettronica → Dati pagamento per XML», che è dove si guarda l'IBAN
 * prima di mandare allo SdI, aveva tre campi liberi e basta: l'unico modo di usare un'altra banca
 * era ribattere 27 caratteri a mano, su un dato che finisce nell'XML e che il cliente userà per
 * pagare.
 *
 * Qui la scelta c'è sempre, nel posto dove si guarda, e il conto scritto a mano una volta si salva
 * fra quelli dell'azienda con un clic: la seconda volta è in tendina. I conti della Tesoreria non
 * entrano: l'Open Banking ne manda l'IBAN mascherato («•••• 1717»), che su una fattura non si può
 * scrivere.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { contiDellAzienda, contoDellIban, ibanValido, nomeConto, pulisciIbanConto } from "@/lib/fatturazione/contiAzienda";
import type { AnagraficaAzienda, ContoFatturazione } from "@/types/fatturazione";
import { toast } from "sonner";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { messaggioErrore } from "@/lib/messaggioErrore";

const A_MANO = "__a_mano__";

export interface CampiConto {
  iban_pagamento?: string;
  bic_pagamento?: string;
  nome_banca?: string;
  intestatario_conto?: string;
}

export function SceltaContoIncasso({ azienda, iban, nomeBanca, intestatario, onCambia, disabled }: {
  azienda: Partial<AnagraficaAzienda> | null | undefined;
  iban: string | null | undefined;
  nomeBanca: string | null | undefined;
  intestatario: string | null | undefined;
  onCambia: (campi: CampiConto) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [salvando, setSalvando] = useState(false);

  const conti = contiDellAzienda(azienda);
  const scelto = contoDellIban(conti, iban);
  const ibanPulito = pulisciIbanConto(iban);
  const valido = !ibanPulito || ibanValido(ibanPulito);
  // Un conto buono che l'azienda non ha ancora in elenco: si può mettere lì una volta per tutte.
  const daSalvare = !!ibanPulito && valido && !scelto;

  function scegli(valore: string) {
    if (valore === A_MANO) return;
    const c = contoDellIban(conti, valore);
    if (!c) return;
    onCambia({
      iban_pagamento: c.iban,
      bic_pagamento: String(c.bic ?? "").trim(),
      nome_banca: String(c.banca ?? c.nome ?? "").trim(),
      intestatario_conto: String(intestatario ?? "").trim()
        || String(azienda?.intestatario_conto ?? azienda?.ragione_sociale ?? "").trim(),
    });
  }

  async function salvaFraIConti() {
    if (!azienda?.company_id || !daSalvare) return;
    setSalvando(true);
    try {
      const altri: ContoFatturazione[] = Array.isArray(azienda.conti_fatturazione) ? azienda.conti_fatturazione : [];
      const nuovo: ContoFatturazione = {
        nome: String(nomeBanca ?? "").trim(),
        iban: ibanPulito,
        banca: String(nomeBanca ?? "").trim(),
      };
      const { data, error } = await supabase
        .from("anagrafica_azienda" as never)
        .update({ conti_fatturazione: [...altri, nuovo] } as never)
        .eq("company_id", azienda.company_id)
        .select("company_id");
      if (error) throw error;
      if (!data || data.length === 0) {
        toast.error(t("Il conto non è stato salvato"), {
          description: t("Il tuo accesso non permette di cambiare la scheda dell'azienda: chiedi a chi gestisce le impostazioni di aggiungerlo in Impostazioni → Fatturazione."),
        });
        return;
      }
      void qc.invalidateQueries({ queryKey: queryKeys.anagraficaAzienda.all });
      toast.success(t("Conto salvato fra quelli dell'azienda"), {
        description: t("Dalla prossima fattura lo scegli dalla tendina, senza riscriverlo."),
      });
    } catch (e) {
      toast.error(t("Il conto non è stato salvato"), { description: messaggioErrore(e) });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <Label className="text-[10px] text-muted-foreground" htmlFor="conto-incasso-xml">{t("Conto su cui incassare")}</Label>
          <select
            id="conto-incasso-xml"
            className="h-7 w-full rounded-md border bg-background px-2 text-xs"
            value={scelto?.iban ?? A_MANO}
            onChange={(e) => scegli(e.target.value)}
            disabled={disabled}
          >
            {conti.map((c) => (
              <option key={c.iban} value={c.iban}>
                {nomeConto(c)} · ···{c.ultime}{c.principale ? ` ${t("· principale")}` : ""}
              </option>
            ))}
            <option value={A_MANO}>{t("Altro IBAN, lo scrivo io")}</option>
          </select>
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground" htmlFor="iban-xml">IBAN</Label>
          <Input
            id="iban-xml"
            value={iban ?? ""}
            onChange={(e) => onCambia({ iban_pagamento: pulisciIbanConto(e.target.value) })}
            className={`h-7 font-mono text-xs ${!valido ? "border-destructive" : ""}`}
            placeholder={t("IT60X0542811101...")}
            disabled={disabled}
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground" htmlFor="banca-xml">{t("Nome istituto di credito")}</Label>
          <Input
            id="banca-xml"
            value={nomeBanca ?? ""}
            onChange={(e) => onCambia({ nome_banca: e.target.value })}
            className="h-7 text-xs"
            placeholder={t("Banca Esempio")}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-1">
          <Label className="text-[10px] text-muted-foreground" htmlFor="intestatario-xml">{t("Intestatario conto")}</Label>
          <Input
            id="intestatario-xml"
            value={intestatario ?? ""}
            onChange={(e) => onCambia({ intestatario_conto: e.target.value })}
            className="h-7 text-xs"
            placeholder={azienda?.ragione_sociale ?? ""}
            disabled={disabled}
          />
        </div>
        <div className="sm:col-span-2 sm:self-end">
          {!valido && (
            <p role="alert" className="text-[10px] text-destructive">
              {t("IBAN non valido: IT, 2 cifre, 1 lettera e 22 fra cifre e lettere. Così com'è, lo SdI lo rifiuta.")}
            </p>
          )}
          {valido && daSalvare && !disabled && (
            <Button type="button" variant="outline" size="sm" className="h-7 text-[10px]" disabled={salvando} onClick={() => void salvaFraIConti()}>
              {salvando ? t("Lo salvo…") : t("Salva fra i conti dell'azienda")}
            </Button>
          )}
          {valido && !daSalvare && conti.length < 2 && (
            <p className="text-[10px] text-muted-foreground">
              {t("Incassi su più banche? Scrivile una volta sola e poi le scegli da qui.")}{" "}
              <Link to="/azienda/impostazioni/fatturazione" className="underline">
                {t("Impostazioni → Fatturazione")}
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
