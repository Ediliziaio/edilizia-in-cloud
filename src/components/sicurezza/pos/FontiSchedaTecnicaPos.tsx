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
      <Label htmlFor={`${id}-modo`}>
        Fonte {tipo}: documenti o dichiarazione
      </Label>
      <select
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
        <option value="da_verificare">Da scegliere e verificare</option>
        <option value="documenti">Documenti tecnici del fascicolo</option>
        {tipo === "rischio" ? (
          <option value="testo_pos">
            Valutazione descritta nel POS, senza originale collegato
          </option>
        ) : (
          <option value="non_applicabile">
            Documentazione non applicabile, con motivazione da verificare
          </option>
        )}
      </select>
      {f.modalita !== "da_verificare" && f.modalita !== "documenti" && (
        <>
          <Label htmlFor={`${id}-motivo`}>
            {tipo === "rischio"
              ? "Motiva la fonte della valutazione nel POS"
              : "Motiva la documentazione non applicabile"}
          </Label>
          <Textarea
            id={`${id}-motivo`}
            value={f.motivazione}
            readOnly={sola}
            onChange={(e) => edit({ ...f, motivazione: e.target.value })}
          />
          <p className="text-xs text-amber-900">
            Questa è una dichiarazione del compilatore, senza documento
            originale allegato; non conferma automaticamente l’adeguatezza della
            scelta.
          </p>
        </>
      )}
      {f.documenti.map((d, i) => (
        <div
          key={d.id}
          className="space-y-2 rounded border bg-white p-2 text-xs"
        >
          <p className="font-medium">
            {d.titolo} · rev. {d.revisione || "non indicata"} ·{" "}
            {d.data_rilascio || "data non indicata"}
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
                    e instanceof Error ? e.message : "Apertura non disponibile",
                  );
                }
              }}
            >
              Apri documento {i + 1}
            </Button>
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
              >
                Rimuovi documento {i + 1}
              </Button>
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
              Ho verificato la pertinenza di questo documento per la scheda e il
              periodo del POS.
            </span>
          </label>
          {q.data &&
            q.data.documenti.find((x) => x.id === d.id)?.impronta !==
              d.impronta && (
              <p className="text-amber-900">
                Fonte cambiata o non più disponibile: rimuovi il collegamento e
                seleziona la versione riletta.
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
              ? "Chiudi selezione documenti"
              : "Scegli dal fascicolo tecnico"}
          </Button>
          {aperto && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Solo documenti tecnici della propria impresa in questo cantiere.
                Le fonti personali, HR e dei subappaltatori richiedono percorsi
                dedicati.
              </p>
              {q.isLoading ? (
                <p className="text-xs">Lettura documenti…</p>
              ) : q.isError ? (
                <p role="alert" className="text-xs text-destructive">
                  Documenti non disponibili. Rileggi prima di selezionare.
                </p>
              ) : (
                <>
                  <select
                    aria-label={`Documento tecnico ${id}`}
                    className="h-10 w-full rounded border bg-background px-2 text-sm"
                    value={scelto}
                    onChange={(e) => setScelto(e.target.value)}
                  >
                    <option value="">Seleziona il documento effettivo</option>
                    {q.data?.documenti.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.titolo} · rev. {d.revisione || "non indicata"} ·{" "}
                        {d.stato}
                      </option>
                    ))}
                  </select>
                  {!q.data?.documenti.length && (
                    <p className="text-xs">
                      Nessun documento tecnico selezionabile: completa il
                      fascicolo. Non viene dedotta l’assenza di rischi o
                      obblighi.
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
                Rileggi documenti
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
                Collega versione selezionata
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
          Per i documenti originali di una revisione già emessa consulta il
          fascicolo dell’emissione; le fonti correnti possono essere cambiate.
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
