import { UniformSelect } from "@/components/ui/uniform-select";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useDocumentiTecniciPos,
  apriDocumentoTecnicoPos,
} from "@/hooks/useDocumentiTecniciPos";
import {
  normalizzaFontiTecniche,
  erroriFontiTecniche,
  type FontiTecnicheScheda,
} from "../../../../supabase/functions/_shared/posFontiTecniche";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
export function FontiSchedaTecnicaPos({
  companyId,
  orderId,
  tipo,
  id,
  value,
  onChange,
  ro,
  faseId,
  dal,
  al,
}: {
  companyId: string;
  orderId: string;
  tipo: "rischio" | "attrezzatura";
  id: string;
  value: FontiTecnicheScheda | undefined;
  onChange: (v: FontiTecnicheScheda) => void;
  ro: boolean;
  faseId?: string | null;
  dal: string;
  al: string;
}) {
  const t = useT();
  const p = usePermissions();
  const [aperto, setAperto] = useState(false);
  const [scelto, setScelto] = useState("");
  const [errore, setErrore] = useState("");
  const q = useDocumentiTecniciPos(companyId, orderId, aperto);
  const f = value || normalizzaFontiTecniche(null);
  const sola = ro || p.solaLettura || !p.canViewSicurezzaCantiere;
  const edit = (v: FontiTecnicheScheda) => {
    if (!sola) onChange(v);
  };
  if (!p.canViewSicurezzaCantiere) return null;
  const selezionato = q.data?.documenti.find((d) => d.id === scelto);
  const aggiornato = selezionato && { ...selezionato, confermata: true };
  const errori = erroriFontiTecniche(f, tipo, orderId, faseId, dal, al);
  return (
    <div className="space-y-2 rounded-md border bg-slate-50 p-3">
      <Label htmlFor={`${id}-modo`}>{t("Fonte {tipo}: documenti o dichiarazione", { tipo: String(tipo ?? "") })}</Label>
      <UniformSelect
        id={`${id}-modo`}
        className="h-10 w-full rounded border bg-background px-2 text-sm"
        value={f.modalita}
        disabled={sola}
        onChange={(e) =>
          edit({
            ...f,
            modalita: e.target.value as FontiTecnicheScheda["modalita"],
          })
        }
      >
        <option value="da_verificare">{t("Da scegliere e verificare")}</option>
        <option value="documenti">{t("Documenti tecnici del fascicolo")}</option>
        {tipo === "rischio" ? (
          <option value="testo_pos">
            {t("Valutazione descritta nel POS, senza originale collegato")}
          </option>
        ) : (
          <option value="non_applicabile">
            {t("Documentazione non applicabile, con motivazione da verificare")}
          </option>
        )}
      </UniformSelect>
      {f.modalita !== "da_verificare" && f.modalita !== "documenti" && (
        <>
          <Label htmlFor={`${id}-motivo`}>
            {tipo === "rischio"
              ? t("Motiva la fonte della valutazione nel POS")
              : t("Motiva la documentazione non applicabile")}
          </Label>
          <Textarea
            id={`${id}-motivo`}
            value={f.motivazione}
            readOnly={sola}
            onChange={(e) => edit({ ...f, motivazione: e.target.value })}
          />
          <p className="text-xs text-amber-900">
            {t("Questa è una dichiarazione del compilatore, senza documento originale allegato; non conferma automaticamente l’adeguatezza della scelta.")}
          </p>
        </>
      )}
      {f.documenti.map((d, i) => (
        <div
          key={d.id}
          className="space-y-2 rounded border bg-white p-2 text-xs"
        >
          <p className="font-medium">
            {d.titolo} {t("· rev.")} {d.revisione || t("non indicata")} ·{" "}
            {d.data_rilascio || t("data non indicata")}
          </p>
          <p>
            {d.file_name} · {d.stato}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                setErrore("");
                try {
                  await apriDocumentoTecnicoPos(companyId, orderId, d);
                } catch (e) {
                  setErrore(
                    e instanceof Error ? e.message : t("Apertura non disponibile"),
                  );
                }
              }}
            >{t("Apri documento {i}", { i: i + 1 })}</Button>
            {!sola && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  edit({
                    ...f,
                    documenti: f.documenti.filter((x) => x.id !== d.id),
                  })
                }
              >{t("Rimuovi documento {i}", { i: i + 1 })}</Button>
            )}
          </div>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={d.confermata}
              disabled={sola}
              onChange={(e) =>
                edit({
                  ...f,
                  documenti: f.documenti.map((x) =>
                    x.id === d.id ? { ...x, confermata: e.target.checked } : x,
                  ),
                })
              }
            />
            <span>
              {t("Ho verificato la pertinenza di questo documento per la scheda e il periodo del POS.")}
            </span>
          </label>
          {q.data &&
            q.data.documenti.find((x) => x.id === d.id)?.impronta !==
              d.impronta && (
              <p className="text-amber-900">
                {t("Fonte cambiata o non più disponibile: rimuovi il collegamento e seleziona la versione riletta.")}
              </p>
            )}
        </div>
      ))}
      {f.modalita === "documenti" && !sola && (
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAperto(!aperto)}
          >
            {aperto
              ? t("Chiudi selezione documenti")
              : t("Scegli dal fascicolo tecnico")}
          </Button>
          {aperto && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {t("Solo documenti tecnici della propria impresa in questo cantiere. Le fonti personali, HR e dei subappaltatori richiedono percorsi dedicati.")}
              </p>
              {q.isLoading ? (
                <p className="text-xs">{t("Lettura documenti…")}</p>
              ) : q.isError ? (
                <p role="alert" className="text-xs text-destructive">
                  {t("Documenti non disponibili. Rileggi prima di selezionare.")}
                </p>
              ) : (
                <>
                  <UniformSelect
                    aria-label={t("Documento tecnico {id}", { id: String(id ?? "") })}
                    className="h-10 w-full rounded border bg-background px-2 text-sm"
                    value={scelto}
                    onChange={(e) => setScelto(e.target.value)}
                  >
                    <option value="">{t("Seleziona il documento effettivo")}</option>
                    {q.data?.documenti.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.titolo} {t("· rev.")} {d.revisione || t("non indicata")} ·{" "}
                        {d.stato}
                      </option>
                    ))}
                  </UniformSelect>
                  {!q.data?.documenti.length && (
                    <p className="text-xs">
                      {t("Nessun documento tecnico selezionabile: completa il fascicolo. Non viene dedotta l’assenza di rischi o obblighi.")}
                    </p>
                  )}
                </>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={q.isError || q.isFetching}
                onClick={() => q.refetch()}
              >
                {t("Rileggi documenti")}
              </Button>
              <Button
                size="sm"
                className="ml-2"
                disabled={
                  q.isError ||
                  q.isFetching ||
                  !aggiornato ||
                  !!erroriFontiTecniche(
                    {
                      modalita: "documenti",
                      motivazione: "",
                      documenti: aggiornato ? [aggiornato] : [],
                    },
                    tipo,
                    orderId,
                    faseId,
                    dal,
                    al,
                  ).length ||
                  f.documenti.some((d) => d.id === scelto) ||
                  f.documenti.length >= 20
                }
                onClick={() => {
                  if (selezionato) {
                    edit({
                      ...f,
                      documenti: [
                        ...f.documenti,
                        { ...structuredClone(selezionato), confermata: false },
                      ],
                    });
                    setScelto("");
                  }
                }}
              >
                {t("Collega versione selezionata")}
              </Button>
            </div>
          )}
        </>
      )}
      {!!errori.length && (
        <p className="text-xs text-amber-900">{errori.join("; ")}</p>
      )}
      {ro && f.documenti.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("Per i documenti originali di una revisione già emessa consulta il fascicolo dell’emissione; le fonti correnti possono essere cambiate.")}
        </p>
      )}
      {errore && (
        <p role="alert" className="text-xs text-destructive">
          {errore}
        </p>
      )}
    </div>
  );
}
