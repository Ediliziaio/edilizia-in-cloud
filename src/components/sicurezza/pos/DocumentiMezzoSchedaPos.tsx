import { UniformSelect } from "@/components/ui/uniform-select";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useDocumentiMezzoPos,
  apriDocumentoMezzoPos,
} from "@/hooks/useDocumentiMezziPos";
import {
  normalizzaDocumentazioneMezzo,
  erroriDocumentazioneMezzo,
  avvisiControlliMezzo,
  type DocumentazioneMezzoPos,
} from "../../../../supabase/functions/_shared/posDocumentiMezzi";
import type { SceltaMezzoPos } from "../../../../supabase/functions/_shared/posMezzi";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function DocumentiMezzoSchedaPos({
  companyId,
  orderId,
  id,
  value,
  anagrafica,
  onChange,
  ro,
}: {
  companyId: string;
  orderId: string;
  id: string;
  value: DocumentazioneMezzoPos | undefined;
  anagrafica: SceltaMezzoPos | undefined;
  onChange: (v: DocumentazioneMezzoPos) => void;
  ro: boolean;
}) {
  const t = useT();
  const p = usePermissions();
  const [aperto, setAperto] = useState(false);
  const [scelto, setScelto] = useState("");
  const [errore, setErrore] = useState("");
  const mezzo =
    anagrafica?.modalita === "inventario"
      ? anagrafica.fonte?.mezzo_id || null
      : null;
  const q = useDocumentiMezzoPos(companyId, orderId, mezzo, aperto);
  const v = value || normalizzaDocumentazioneMezzo(null);
  const sola = ro || p.solaLettura || !p.canViewSicurezzaCantiere;
  const edit = (patch: Partial<DocumentazioneMezzoPos>) => {
    if (!sola) onChange({ ...v, confermata: false, ...patch });
  };
  if (!p.canViewSicurezzaCantiere) return null;
  const letta = aperto && !q.isFetching && !q.isError && !!q.data;
  const cambiati =
    letta && v.controlli && q.data!.controlli.impronta !== v.controlli.impronta;
  const fonteCambiata =
    letta &&
    v.documenti.some(
      (d) =>
        !q.data!.documenti.some(
          (x) => x.id === d.id && x.impronta === d.impronta,
        ),
    );
  const sceltoDoc = q.data?.documenti.find((d) => d.id === scelto);
  const errori = erroriDocumentazioneMezzo(
    v,
    mezzo,
    anagrafica?.utilizzo_dal || "",
    anagrafica?.utilizzo_al || "",
  );
  const avvisi = v.controlli
    ? avvisiControlliMezzo(
        v.controlli,
        anagrafica?.utilizzo_dal || "",
        anagrafica?.fonte?.contatore || null,
      )
    : [];
  return (
    <section
      aria-label={t("Documenti e controlli dell’attrezzatura")}
      className="space-y-3 rounded-md border bg-slate-50 p-3"
    >
      <Label htmlFor={`${id}-modo`}>
        {t("Documentazione della specifica attrezzatura")}
      </Label>
      <UniformSelect
        id={`${id}-modo`}
        className="h-10 w-full rounded border bg-background px-2 text-sm"
        disabled={sola}
        value={v.modalita}
        onChange={(e) =>
          edit({
            modalita: e.target.value as DocumentazioneMezzoPos["modalita"],
          })
        }
      >
        <option value="da_verificare">{t("Da scegliere e riesaminare")}</option>
        <option value="documenti">
          {t("Originali tecnici dell’attrezzatura in inventario")}
        </option>
        <option value="altra_gestione">
          {t("Altra gestione documentale, da motivare")}
        </option>
      </UniformSelect>
      {v.modalita === "altra_gestione" && (
        <>
          <Label htmlFor={`${id}-motivo`}>
            {t("Motivazione e fonti della diversa gestione documentale")}
          </Label>
          <Textarea
            id={`${id}-motivo`}
            value={v.motivazione}
            readOnly={sola}
            onChange={(e) => edit({ motivazione: e.target.value })}
          />
          <p className="text-xs text-amber-900">
            {t("È una dichiarazione del compilatore: indica gli originali pertinenti e dove sono conservati. Non attesta un’esenzione o la disponibilità di file non collegati.")}
          </p>
        </>
      )}
      {mezzo ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setAperto((x) => !x)}
        >
          {aperto
            ? t("Chiudi documenti e controlli")
            : t("Leggi documenti e controlli della macchina")}
        </Button>
      ) : (
        <p className="text-xs">
          {t("Collega prima l’attrezzatura nell’inventario per leggerne i documenti nativi e i controlli registrati.")}
        </p>
      )}
      {aperto && mezzo && (
        <div className="space-y-2">
          {q.isLoading && <p role="status">{t("Lettura documenti e controlli…")}</p>}
          {q.isError && (
            <p role="alert">
              {t("Documenti o controlli non disponibili. I riferimenti già selezionati restano conservati.")}
            </p>
          )}
          {q.data && !q.isError && (
            <>
              <p className="text-xs">{t("{n} documenti tecnici nell’archivio della macchina. Documenti economici e allegati delle manutenzioni non vengono importati automaticamente.", { n: q.data.documenti.length })}</p>
              {!sola && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={q.isFetching}
                  onClick={() =>
                    edit({ controlli: structuredClone(q.data!.controlli) })
                  }
                >
                  {t("Acquisisci quadro dei controlli da riesaminare")}
                </Button>
              )}
              {v.modalita === "documenti" && (
                <>
                  <Label htmlFor={`${id}-documento`}>
                    {t("Documento tecnico della macchina")}
                  </Label>
                  <UniformSelect
                    id={`${id}-documento`}
                    className="h-10 w-full rounded border bg-background px-2 text-sm"
                    value={scelto}
                    disabled={sola || q.isFetching}
                    onChange={(e) => setScelto(e.target.value)}
                  >
                    <option value="">{t("Seleziona un originale tecnico")}</option>
                    {q.data.documenti.map((d) => (
                      <option
                        key={d.id}
                        value={d.id}
                        disabled={
                          !d.disponibile ||
                          v.documenti.some((x) => x.id === d.id)
                        }
                      >
                        {d.titolo || d.file_name || d.categoria} · {d.categoria}{" "}
                        ·{" "}
                        {d.data_scadenza
                          ? t("scadenza {data}", { data: String(d.data_scadenza ?? "") })
                          : t("scadenza non indicata")}
                        {!d.disponibile ? ` ${t("· originale non disponibile")}` : ""}
                      </option>
                    ))}
                  </UniformSelect>
                  {!sola && (
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        !sceltoDoc ||
                        !sceltoDoc.disponibile ||
                        v.documenti.length >= 20 ||
                        v.documenti.some((d) => d.id === scelto) ||
                        q.isFetching
                      }
                      onClick={() => {
                        if (sceltoDoc)
                          edit({
                            documenti: [
                              ...v.documenti,
                              {
                                ...sceltoDoc,
                                confermata: false,
                                revisione_dichiarata: "",
                              },
                            ],
                          });
                      }}
                    >
                      {t("Collega originale della macchina")}
                    </Button>
                  )}
                </>
              )}
            </>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={q.isFetching}
            onClick={() => void q.refetch()}
          >
            {t("Rileggi documenti e controlli")}
          </Button>
          {(cambiati || fonteCambiata) && (
            <p role="alert" className="text-xs text-amber-900">
              {t("Documenti o controlli cambiati. Rileggi e acquisisci esplicitamente le nuove fonti: il riesame precedente non vale per la situazione aggiornata.")}
            </p>
          )}
        </div>
      )}
      {v.documenti.map((d, i) => (
        <div
          key={d.id}
          className="space-y-2 rounded border bg-white p-3 text-xs"
        >
          <p className="font-medium">
            {d.titolo || d.file_name} · {d.categoria}
          </p>
          <p>
            {d.file_name} {t("· dal {dal} · scadenza {scadenza}", { dal: d.data_inizio || t("non indicato"), scadenza: d.data_scadenza || t("non indicata") })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={async () => {
                setErrore("");
                try {
                  await apriDocumentoMezzoPos(companyId, orderId, d);
                } catch (e) {
                  setErrore(
                    e instanceof Error
                      ? e.message
                      : t("Originale non disponibile"),
                  );
                }
              }}
            >{t("Apri originale {i}", { i: i + 1 })}</Button>
            {!sola && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  edit({ documenti: v.documenti.filter((x) => x.id !== d.id) })
                }
              >{t("Rimuovi originale {i}", { i: i + 1 })}</Button>
            )}
          </div>
          <Label htmlFor={`${id}-rev-${i}`}>{t("Revisione letta nell’originale {i}", { i: i + 1 })}</Label>
          <Input
            id={`${id}-rev-${i}`}
            value={d.revisione_dichiarata}
            readOnly={sola}
            placeholder={t("Revisione, data/versione o non riportata")}
            onChange={(e) =>
              edit({
                documenti: v.documenti.map((x, j) =>
                  j === i
                    ? {
                        ...x,
                        revisione_dichiarata: e.target.value,
                        confermata: false,
                      }
                    : x,
                ),
              })
            }
          />
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={d.confermata}
              disabled={sola}
              onChange={(e) =>
                edit({
                  documenti: v.documenti.map((x, j) =>
                    j === i ? { ...x, confermata: e.target.checked } : x,
                  ),
                })
              }
            />
            {t("Ho letto l’originale {i} e verificato revisione e pertinenza alla macchina e all’uso dichiarati", { i: i + 1 })}
          </label>
        </div>
      ))}
      {v.controlli && (
        <div className="space-y-2 rounded border bg-white p-3 text-xs">
          <p className="font-medium">{t("Quadro registrato da riesaminare: {n} manutenzioni · {n2} segnalazioni", { n: v.controlli.manutenzioni.length, n2: v.controlli.segnalazioni.length })}</p>
          <details>
            <summary className="cursor-pointer">
              {t("Date, contatori e stati registrati")}
            </summary>
            <ul className="mt-2 space-y-1">
              {v.controlli.manutenzioni.map((m) => (
                <li key={m.id}>
                  {m.tipo} · {m.data} {t("· prossimo controllo {data} · soglia contatore {soglia}", { data: m.prossima_data || t("data non indicata"), soglia: m.prossimo_contatore || t("non indicata") })}
                </li>
              ))}
              {v.controlli.segnalazioni.map((s) => (
                <li key={s.id}>
                  {s.tipo} · {s.stato} · {s.creata_il.slice(0, 10)}
                </li>
              ))}
            </ul>
          </details>
          {avvisi.map((a) => (
            <p key={a} className="text-amber-900">
              {a}
            </p>
          ))}
          {!sola && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => edit({ controlli: null })}
            >
              {t("Rimuovi quadro dei controlli")}
            </Button>
          )}
          <p>
            {t("Questi dati non costituiscono un esito di idoneità. Consulta nell’inventario gli interventi e le segnalazioni prima di formulare il riesame.")}
          </p>
        </div>
      )}
      {v.modalita !== "da_verificare" && (
        <>
          <Label htmlFor={`${id}-riesame`}>
            {t("Riesame dei controlli, criticità e azioni necessarie")}
          </Label>
          <Textarea
            id={`${id}-riesame`}
            value={v.riesame_controlli}
            readOnly={sola}
            onChange={(e) => edit({ riesame_controlli: e.target.value })}
          />
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={v.confermata}
              disabled={sola || !!cambiati || !!fonteCambiata}
              onChange={(e) => edit({ confermata: e.target.checked })}
            />
            {t("Ho riesaminato i documenti e i controlli selezionati per questa attrezzatura e questo impiego")}
          </label>
        </>
      )}
      {errore && (
        <p role="alert" className="text-xs text-red-700">
          {errore}
        </p>
      )}
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
