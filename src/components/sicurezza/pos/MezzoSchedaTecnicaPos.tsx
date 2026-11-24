import { UniformSelect } from "@/components/ui/uniform-select";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/hooks/usePermissions";
import { useMezziPos } from "@/hooks/useMezziPos";
import {
  normalizzaSceltaMezzo,
  chiaveFonteMezzo,
  etichettaFonteMezzo,
  erroriSceltaMezzo,
  type SceltaMezzoPos,
} from "../../../../supabase/functions/_shared/posMezzi";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function MezzoSchedaTecnicaPos({
  companyId,
  orderId,
  id,
  value,
  onChange,
  ro,
  dal,
  al,
}: {
  companyId: string;
  orderId: string;
  id: string;
  value: SceltaMezzoPos | undefined;
  onChange: (v: SceltaMezzoPos) => void;
  ro: boolean;
  dal: string;
  al: string;
}) {
  const t = useT();
  const p = usePermissions();
  const [aperto, setAperto] = useState(false);
  const [scelta, setScelta] = useState("");
  const q = useMezziPos(companyId, orderId, aperto);
  const v = value || normalizzaSceltaMezzo(null);
  const sola = ro || p.solaLettura || !p.canViewSicurezzaCantiere;
  const modifica = (patch: Partial<SceltaMezzoPos>) => {
    if (!sola) onChange({ ...v, confermata: false, ...patch });
  };
  if (!p.canViewSicurezzaCantiere) return null;
  const fonti = q.data?.fonti || [];
  const selezionata = fonti.find((f) => chiaveFonteMezzo(f) === scelta);
  const attuale =
    v.fonte &&
    fonti.find((f) => chiaveFonteMezzo(f) === chiaveFonteMezzo(v.fonte!));
  const cambiata =
    aperto &&
    !q.isFetching &&
    !q.isError &&
    q.data &&
    v.fonte &&
    (!attuale || attuale.impronta !== v.fonte.impronta);
  const errori = erroriSceltaMezzo(v, dal, al, orderId);
  return (
    <section
      className="space-y-3 rounded-md border bg-slate-50 p-3"
      aria-label={t("Identità e impiego dell’attrezzatura")}
    >
      <Label htmlFor={`${id}-modo`}>
        {t("Anagrafica dell’attrezzatura effettiva")}
      </Label>
      <UniformSelect
        id={`${id}-modo`}
        className="h-10 w-full rounded border bg-background px-2 text-sm"
        value={v.modalita}
        disabled={sola}
        onChange={(e) =>
          modifica({ modalita: e.target.value as SceltaMezzoPos["modalita"] })
        }
      >
        <option value="da_verificare">{t("Da identificare e verificare")}</option>
        <option value="inventario">{t("Attrezzatura assegnata alla commessa")}</option>
        <option value="non_censita">
          {t("Attrezzatura non censita, con motivazione")}
        </option>
      </UniformSelect>
      {v.fonte && (
        <div className="space-y-2 rounded border bg-white p-2 text-xs">
          <p className="break-words font-medium">
            {etichettaFonteMezzo(v.fonte)}
          </p>
          <p>{t("Stato inventario: {stato}. Identificativo: {mezzo_id}.", { stato: String(v.fonte.stato ?? ""), mezzo_id: String(v.fonte.mezzo_id ?? "") })}</p>
          {(v.fonte.fonte_tipo === "corrente" ||
            v.fonte.fonte_tipo === "su_mezzo_corrente") && (
            <p className="text-amber-900">
              {t("È nota la collocazione corrente. Il periodo d’uso resta dichiarato dal compilatore e non è provato da uno storico di assegnazione.")}
            </p>
          )}
          {!sola && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => modifica({ fonte: null })}
            >
              {t("Rimuovi collegamento inventario")}
            </Button>
          )}
        </div>
      )}
      {v.modalita === "inventario" && (
        <>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setAperto((x) => !x)}
          >
            {aperto
              ? t("Chiudi inventario")
              : t("Scegli dall’inventario della commessa")}
          </Button>
          {aperto && (
            <div className="space-y-2">
              {q.isLoading && <p role="status">{t("Caricamento assegnazioni…")}</p>}
              {q.isError && (
                <p role="alert">
                  {t("Impossibile leggere l’inventario. Il collegamento già scelto resta conservato.")}
                </p>
              )}
              {!q.isLoading && !q.isError && q.data && fonti.length === 0 && (
                <p>
                  {t("Nessuna assegnazione disponibile. Verifica l’inventario oppure motiva l’attrezzatura non censita.")}
                </p>
              )}
              <Label htmlFor={`${id}-fonte`}>{t("Attrezzatura e assegnazione")}</Label>
              <UniformSelect
                id={`${id}-fonte`}
                className="h-10 w-full rounded border bg-background px-2 text-sm"
                value={scelta}
                disabled={sola || q.isFetching || q.isError}
                onChange={(e) => setScelta(e.target.value)}
              >
                <option value="">{t("Seleziona identità e assegnazione")}</option>
                {fonti.map((f) => (
                  <option
                    key={chiaveFonteMezzo(f)}
                    value={chiaveFonteMezzo(f)}
                    disabled={f.stato !== "in_servizio"}
                  >
                    {etichettaFonteMezzo(f)}
                  </option>
                ))}
              </UniformSelect>
              <div className="flex flex-wrap gap-2">
                {!sola && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={
                      !selezionata ||
                      q.isFetching ||
                      q.isError ||
                      selezionata.stato !== "in_servizio"
                    }
                    onClick={() => {
                      if (selezionata) modifica({ fonte: { ...selezionata } });
                    }}
                  >
                    {t("Collega assegnazione selezionata")}
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={q.isFetching}
                  onClick={() => void q.refetch()}
                >
                  {t("Rileggi inventario")}
                </Button>
              </div>
              {cambiata && (
                <p role="alert" className="text-amber-900">
                  {t("Attrezzatura o assegnazione cambiata o non più disponibile. Seleziona e conferma nuovamente la fonte; i dati precedenti non sono sostituiti automaticamente.")}
                </p>
              )}
            </div>
          )}
        </>
      )}
      {v.modalita === "non_censita" && (
        <>
          <Label htmlFor={`${id}-motivo`}>
            {t("Motivo della mancata anagrafica e titolare da verificare")}
          </Label>
          <Textarea
            id={`${id}-motivo`}
            value={v.motivazione}
            readOnly={sola}
            onChange={(e) => modifica({ motivazione: e.target.value })}
          />
          <p className="text-xs text-amber-900">
            {t("Indica identità e titolare anche nella scheda. Questa dichiarazione non prova disponibilità, manutenzione o idoneità dell’attrezzatura.")}
          </p>
        </>
      )}
      {v.modalita !== "da_verificare" && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor={`${id}-dal`}>{t("Inizio uso attrezzatura")}</Label>
              <Input
                id={`${id}-dal`}
                type="date"
                value={v.utilizzo_dal}
                readOnly={sola}
                min={dal || undefined}
                max={al || undefined}
                onChange={(e) => modifica({ utilizzo_dal: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor={`${id}-al`}>{t("Fine uso attrezzatura")}</Label>
              <Input
                id={`${id}-al`}
                type="date"
                value={v.utilizzo_al}
                readOnly={sola}
                min={v.utilizzo_dal || dal || undefined}
                max={al || undefined}
                onChange={(e) => modifica({ utilizzo_al: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor={`${id}-qty`}>{t("Quantità impiegata")}</Label>
              <Input
                id={`${id}-qty`}
                type="number"
                min="0"
                step="any"
                value={v.quantita_usata ?? ""}
                readOnly={sola}
                onChange={(e) =>
                  modifica({
                    quantita_usata:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={v.confermata}
              disabled={sola || !!cambiata}
              onChange={(e) => modifica({ confermata: e.target.checked })}
            />
            {t("Ho verificato identità, assegnazione e periodo d’uso dichiarati")}
          </label>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        {t("Il collegamento d’inventario identifica l’attrezzatura. Documentazione, controlli tecnici e formazione richiedono verifiche separate.")}
      </p>
      {errori.length > 0 && (
        <ul className="list-disc space-y-1 pl-4 text-xs text-amber-900">
          {errori.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
