/**
 * Interventi brevi dal telefono (26/11/2026): le due scelte dell'azienda.
 *  - Firma del cliente a fine intervento: facoltativa (di partenza) o obbligatoria.
 *  - Dove va la richiesta quando il tecnico preme «Intervento finito»: Risolto (di partenza, poi controlla l'ufficio),
 *    Da fatturare, o Chiuso.
 * Si salva subito. Il server applica le stesse scelte (campo_intervento_chiudi), non solo lo schermo.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";
import { Label } from "@/components/ui/label";
import { UniformSelect } from "@/components/ui/uniform-select";
import { motivoDelRifiuto } from "@/lib/impostazioni/erroriPerUtente";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

type Rpc = "campo_avvisi_azienda_leggi" | "campo_avvisi_azienda_salva_interventi";
const db = () => supabase as unknown as {
  rpc: (nome: Rpc, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
type Firma = "facoltativa" | "obbligatoria";
type StatoFine = "risolto" | "da_fatturare" | "chiuso";
// Chiave sua: la stessa RPC alimenta AvvisoDomaniConfig con un'altra forma dei dati (mai condividere la chiave).
const chiave = (companyId: string) => ["campo-avvisi-interventi", companyId];

export function InterventiCampoConfig({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const [salvo, setSalvo] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: chiave(companyId),
    queryFn: async (): Promise<{ firma: Firma; stato: StatoFine }> => {
      const { data: d, error } = await db().rpc("campo_avvisi_azienda_leggi", { p_company_id: companyId });
      if (error) throw error;
      const r = d as { intervento_firma?: string; intervento_stato_fine?: string } | null;
      return {
        firma: r?.intervento_firma === "obbligatoria" ? "obbligatoria" : "facoltativa",
        stato: r?.intervento_stato_fine === "da_fatturare" || r?.intervento_stato_fine === "chiuso" ? r.intervento_stato_fine : "risolto",
      };
    },
  });

  const salva = async (prossimo: { firma: Firma; stato: StatoFine }) => {
    setSalvo(true);
    try {
      const { error } = await db().rpc("campo_avvisi_azienda_salva_interventi", { p_company_id: companyId, p_firma: prossimo.firma, p_stato_fine: prossimo.stato });
      if (error) throw error;
      qc.setQueryData(chiave(companyId), prossimo);
      toast.success(t("Impostazione salvata"));
    } catch (e) {
      toast.error(motivoDelRifiuto(e, t("Non sono riuscito a salvare: riprova.")));
    } finally { setSalvo(false); }
  };
  const attuale = data ?? { firma: "facoltativa" as Firma, stato: "risolto" as StatoFine };
  const fermo = !canEdit || isLoading || salvo;

  return (
    <SezioneImpostazione id="interventi-brevi" titolo={t("Interventi e manutenzioni dal telefono")}
      descrizione={t("Per le richieste di assistenza con tecnico e data: il tecnico le vede nell'app, le inizia e le chiude. Si salva subito.")}>
      {isError ? (
        <div className="p-4 text-sm text-muted-foreground">
          {t("Non riesco a leggere questa impostazione.")}{" "}
          <button type="button" className="underline" onClick={() => void refetch()}>{t("Riprova")}</button>
        </div>
      ) : (
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label htmlFor="intervento-firma" className="text-sm font-medium">{t("Firma del cliente a fine intervento")}</Label>
            <UniformSelect id="intervento-firma" className="h-10 w-full rounded-md border bg-background px-3 text-sm" disabled={fermo}
              value={attuale.firma} onChange={e => void salva({ ...attuale, firma: e.target.value as Firma })}>
              <option value="facoltativa">{t("Facoltativa: se il cliente c'è")}</option>
              <option value="obbligatoria">{t("Obbligatoria: senza firma non si chiude")}</option>
            </UniformSelect>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="intervento-stato" className="text-sm font-medium">{t("Quando il tecnico finisce, la richiesta va in")}</Label>
            <UniformSelect id="intervento-stato" className="h-10 w-full rounded-md border bg-background px-3 text-sm" disabled={fermo}
              value={attuale.stato} onChange={e => void salva({ ...attuale, stato: e.target.value as StatoFine })}>
              <option value="risolto">{t("Risolto: poi controlla l'ufficio")}</option>
              <option value="da_fatturare">{t("Da fatturare")}</option>
              <option value="chiuso">{t("Chiuso subito")}</option>
            </UniformSelect>
          </div>
          {!canEdit && <p className="text-xs text-muted-foreground sm:col-span-2">{t("La cambia chi può modificare la configurazione delle commesse.")}</p>}
        </div>
      )}
    </SezioneImpostazione>
  );
}
