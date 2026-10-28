import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldRenderer } from "@/components/surveys/engine/FieldRenderer";
import {
  reconcileSurveyDraft,
  type LocalSurveyDraft,
} from "@/lib/surveys/elementDraft";
import type { SurveyElementDraft } from "@/lib/surveys/workspace";
const show = (v: unknown) =>
  v === undefined
    ? "Non compilato"
    : typeof v === "string"
      ? v
      : JSON.stringify(v);
export function SurveyDraftRecovery({
  entry,
  current,
  schema,
  version,
  labels,
  onRecover,
  onForget,
}: {
  entry: LocalSurveyDraft;
  current: SurveyElementDraft;
  schema: string;
  version: string;
  labels: Record<string, string>;
  onRecover: (draft: SurveyElementDraft) => void;
  onForget: () => void;
}) {
  const [resolutions, setResolutions] = useState<
    Record<string, "local" | "remote">
  >({});
  const merge = reconcileSurveyDraft(
    entry.base,
    current,
    entry.draft,
    resolutions,
  );
  const differentSchema = entry.schema !== schema,
    changed = entry.baseUpdatedAt !== version;
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(entry, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "bozza-rilievo-da-verificare.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section
      aria-label="Recupero bozza del rilievo"
      className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50 p-4"
    >
      <h4 className="font-semibold text-blue-950">
        Hai una bozza da recuperare
      </h4>
      <p className="text-sm text-slate-600">
        Copia del {new Date(entry.savedAt).toLocaleString("it-IT")}, solo su
        questo browser, recuperabile per 7 giorni. Non è stata salvata nel
        gestionale.
      </p>
      {entry.annotation && (
        <p className="break-words text-sm text-slate-600">
          Nota grafica in compilazione:{" "}
          {entry.annotation.note ||
            "Punto selezionato, testo ancora da inserire"}
          . Posizione e riferimento vanno ricontrollati prima di aggiungerla.
        </p>
      )}
      {differentSchema ? (
        <p role="alert" className="text-sm text-orange-900">
          Il modello dei campi è cambiato: per evitare errori di unità o
          significato non applico la vecchia bozza. Puoi scaricarne una copia e
          ricontrollare i dati.
        </p>
      ) : (
        <>
          {changed && (
            <p className="text-sm text-orange-900">
              I dati salvati sono cambiati. Mantengo gli aggiornamenti su altri
              campi; scegli come risolvere eventuali differenze. La verifica
              d’ordine andrà riconfermata.
            </p>
          )}
          {merge.conflicts.map((conflict, i) => (
            <div
              key={conflict.key}
              className="space-y-2 rounded-xl border bg-white p-3"
            >
              <p className="text-sm font-medium">
                {labels[conflict.key] || conflict.key}
              </p>
              <p className="break-words text-xs text-slate-600">
                Bozza: {show(conflict.local)} · Salvato: {show(conflict.remote)}
              </p>
              <FieldRenderer
                field={{
                  key: `recovery_${i}`,
                  label: "Quale valore conservi?",
                  type: "select",
                  options: [
                    { value: "local", label: "Usa la bozza" },
                    { value: "remote", label: "Mantieni il salvato" },
                  ],
                }}
                value={resolutions[conflict.key]}
                allValues={{}}
                onChange={(_, v) =>
                  setResolutions({
                    ...resolutions,
                    [conflict.key]: v as "local" | "remote",
                  })
                }
              />
            </div>
          ))}
          <Button
            type="button"
            className="min-h-11 rounded-xl"
            disabled={!!merge.unresolved.length}
            onClick={() => onRecover(merge.draft)}
          >
            Riprendi bozza
          </Button>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-xl"
          onClick={download}
        >
          Scarica copia della bozza
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 rounded-xl"
          onClick={onForget}
        >
          Elimina bozza e usa i dati salvati
        </Button>
      </div>
    </section>
  );
}
