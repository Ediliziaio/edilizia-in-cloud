import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { useMezziPos } from "@/hooks/useMezziPos";
import {
  useDocumentiMezzoPos,
  apriDocumentoMezzoPos,
} from "@/hooks/useDocumentiMezziPos";
import {
  attrezzatureNelContesto,
  statoDocumentoAttrezzatura,
} from "@/lib/sicurezza/attrezzatureCommessa";
import { avvisiControlliMezzo } from "../../../supabase/functions/_shared/posDocumentiMezzi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const tipi: Record<string, string> = {
  revisione: "Revisione",
  verifica_periodica: "Verifica periodica",
  libretto: "Libretto",
  taratura: "Taratura",
  manuale_ce: "Manuale / dichiarazione CE",
  pimus: "PiMUS",
  autorizzazione_ministeriale: "Autorizzazione ministeriale",
};
const dataGrezza = (s: string) => s.split("-").reverse().join("/");
export function AttrezzatureCommessa({
  companyId,
  orderId,
  dataRiferimento,
  faseRiferimento,
  contestoNonDisponibile = false,
  inizialmenteAperto = false,
}: {
  companyId: string;
  orderId: string;
  dataRiferimento: string;
  faseRiferimento?: string;
  contestoNonDisponibile?: boolean;
  inizialmenteAperto?: boolean;
}) {
  const tr = useT();
  const dataIt = (s: string | null) => (s ? dataGrezza(s) : tr("Non indicata"));
  const p = usePermissions();
  const [aperto, setAperto] = useState(inizialmenteAperto);
  const [cerca, setCerca] = useState("");
  const [scelta, setScelta] = useState("");
  const [limite, setLimite] = useState(20);
  const q = useMezziPos(companyId, orderId, aperto);
  const mezzi = attrezzatureNelContesto(
    q.data?.fonti ?? [],
    orderId,
    dataRiferimento,
  );
  const filtrati = mezzi.filter((m) =>
    `${m.fonte.nome} ${m.fonte.codice || ""} ${m.fonte.matricola || ""} ${m.fonte.targa || ""}`
      .toLocaleLowerCase("it")
      .includes(cerca.trim().toLocaleLowerCase("it")),
  );
  const selezionata =
    !q.isError && !q.isFetching && filtrati.find((m) => m.id === scelta);
  const doc = useDocumentiMezzoPos(
    companyId,
    orderId,
    selezionata?.id || null,
    aperto && !!selezionata,
  );
  const avvisi =
    selezionata && doc.data && !doc.isError && !doc.isFetching
      ? avvisiControlliMezzo(
          doc.data.controlli,
          dataRiferimento,
          selezionata.fonte.contatore,
        )
      : [];
  if (!p.canViewSicurezzaCantiere) return null;
  return (
    <Card id={`attrezzature-sicurezza-${orderId}`}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            {tr("Mezzi e attrezzature · documenti tecnici")}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            aria-expanded={aperto}
            onClick={() => setAperto((v) => !v)}
          >
            {aperto ? tr("Chiudi attrezzature") : tr("Consulta attrezzature")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {tr("Assegnazioni, documenti e controlli dall’inventario già usato dal POS. La collocazione di una macchina non ne attesta idoneità, presenza effettiva o impiego in una lavorazione.")}
        </p>
      </CardHeader>
      {aperto && (
        <CardContent className="space-y-3">
          <div className="rounded-md bg-muted p-3 text-xs">
            {tr("Data di riferimento: {data}. Sono letti i dati correnti; non è una ricostruzione storica.", { data: dataIt(dataRiferimento) })}{" "}
            {faseRiferimento
              ? tr("Le assegnazioni dell’inventario non identificano una fase: il filtro fase non ne prova l’impiego nella lavorazione selezionata.")
              : tr("Le assegnazioni dell’inventario non identificano una fase o una specifica lavorazione.")}
          </div>
          {contestoNonDisponibile && (
            <p role="alert" className="text-sm text-amber-800">
              {tr("Contesto della commessa parziale: verifica fase e periodo prima di riesaminare i documenti.")}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-44 flex-1"
              aria-label={tr("Cerca attrezzature della commessa")}
              placeholder={tr("Nome, codice, matricola o targa…")}
              value={cerca}
              onChange={(e) => {
                setCerca(e.target.value);
                setLimite(20);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={q.isFetching || doc.isFetching}
              onClick={() => {
                void q.refetch();
                if (selezionata) void doc.refetch();
              }}
            >
              {tr("Aggiorna fonti")}
            </Button>
          </div>
          {q.isLoading || q.isFetching ? (
            <p role="status">{tr("Lettura delle attrezzature…")}</p>
          ) : q.isError ? (
            <p role="alert">
              {tr("Attrezzature non disponibili. Riprova il caricamento: l’errore non indica assenza di mezzi.")}
            </p>
          ) : !mezzi.length ? (
            <p className="text-sm">
              {tr("Nessuna attrezzatura restituita per questa data. Verifica assegnazioni, noleggi e mezzi delle imprese esterne: un elenco vuoto non conferma la completezza.")}
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{tr("{n} attrezzature con i filtri attuali · {n2} senza un inizio di assegnazione documentato", { n: filtrati.length, n2: mezzi.filter((m) => !m.periodoDocumentato).length })}</p>
              <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(0,2fr)]">
                <div className="space-y-2">
                  {filtrati.slice(0, limite).map((m) => (
                    <button
                      type="button"
                      key={m.id}
                      aria-pressed={selezionata?.id === m.id}
                      className={`w-full rounded-md border p-3 text-left text-sm ${selezionata?.id === m.id ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
                      onClick={() => setScelta(m.id)}
                    >
                      <strong className="block">{m.fonte.nome}</strong>
                      <span className="block text-xs text-muted-foreground">
                        {m.fonte.codice ||
                          m.fonte.matricola ||
                          m.fonte.targa ||
                          tr("Identificativo descrittivo non indicato")}
                      </span>
                      <span className="mt-1 block text-xs">{tr("Stato inventario: {stato}", { stato: String(m.fonte.stato.replaceAll("_", " ") ?? "") })}</span>
                      {!m.periodoDocumentato && (
                        <span className="mt-1 block text-xs text-amber-800">
                          {tr("Periodo di presenza da verificare")}
                        </span>
                      )}
                    </button>
                  ))}
                  {!filtrati.length && (
                    <p className="text-sm">
                      {tr("Nessuna attrezzatura corrisponde alla ricerca.")}
                    </p>
                  )}
                  {filtrati.length > limite && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLimite((v) => v + 20)}
                    >
                      {tr("Mostra altre attrezzature")}
                    </Button>
                  )}
                </div>
                <div className="min-w-0 rounded-lg border p-3 space-y-3">
                  {!selezionata ? (
                    <p className="text-sm text-muted-foreground">
                      {tr("Seleziona un’attrezzatura per leggere originali, manutenzioni e segnalazioni.")}
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap justify-between gap-2">
                        <h4 className="font-medium">
                          {selezionata.fonte.nome}
                        </h4>
                        {p.canViewMezzi && (
                          <Button asChild size="sm" variant="outline">
                            <Link to={`/azienda/mezzi/${selezionata.id}`}>
                              {tr("Scheda inventario")}
                            </Link>
                          </Button>
                        )}
                      </div>
                      {selezionata.fonte.stato !== "in_servizio" && (
                        <p role="alert" className="text-sm text-amber-800">
                          {tr("La macchina non risulta in servizio nell’inventario. Riesamina lo stato prima dell’utilizzo.")}
                        </p>
                      )}
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        {selezionata.collegamenti.map((f) => (
                          <li key={`${f.fonte_tipo}:${f.fonte_id}`}>
                            {
                              {
                                assegnazione: tr("Assegnazione"),
                                allocazione: tr("Allocazione a quantità"),
                                corrente: tr("Collocazione corrente"),
                                su_mezzo_corrente:
                                  tr("Su mezzo collocato in cantiere"),
                              }[f.fonte_tipo]
                            }{" "}
                            · {tr("dal {dal} al {al}", { dal: dataIt(f.dal), al: dataIt(f.al) })}
                            {f.fonte_tipo === "allocazione"
                              ? ` · ${tr("quantità registrata {quantita} {unita}", { quantita: String(f.quantita ?? ""), unita: f.unita || "" })}`
                              : ""}
                          </li>
                        ))}
                      </ul>
                      {doc.isLoading || doc.isFetching ? (
                        <p role="status">{tr("Lettura documenti e controlli…")}</p>
                      ) : doc.isError ? (
                        <p role="alert">
                          {tr("Documenti e controlli non disponibili. Nessuna verifica di completezza è possibile; aggiorna le fonti.")}
                        </p>
                      ) : doc.data ? (
                        <>
                          <h5 className="text-sm font-medium">
                            {tr("Originali tecnici nell’archivio")}
                          </h5>
                          {!doc.data.documenti.length ? (
                            <p className="text-sm text-amber-800">
                              {tr("Nessun originale tecnico disponibile nella proiezione POS. Verifica i documenti pertinenti nell’inventario.")}
                            </p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs">
                                <caption className="sr-only">
                                  {tr("Documenti tecnici della macchina selezionata")}
                                </caption>
                                <thead className="bg-muted">
                                  <tr>
                                    {[
                                      "Documento",
                                      "Date / stato",
                                      "Originale",
                                    ].map((t) => (
                                      <th className="p-2" key={t} scope="col">
                                        {tr(t)}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {doc.data.documenti.map((d) => (
                                    <tr
                                      key={d.id}
                                      className="border-t align-top"
                                    >
                                      <td className="p-2">
                                        <p className="font-medium">
                                          {d.titolo}
                                        </p>
                                        <p className="text-muted-foreground">
                                          {tipi[d.categoria] ? tr(tipi[d.categoria]) : d.categoria}
                                        </p>
                                        <p className="break-all text-muted-foreground">
                                          {d.file_name}
                                        </p>
                                      </td>
                                      <td className="p-2">
                                        <p>{tr("Dal {data}", { data: String(dataIt(d.data_inizio) ?? "") })}</p>
                                        <p>{tr("Scadenza {data}", { data: String(dataIt(d.data_scadenza) ?? "") })}</p>
                                        <p className="mt-1 text-amber-800">
                                          {statoDocumentoAttrezzatura(
                                            d,
                                            dataRiferimento,
                                          )}
                                        </p>
                                      </td>
                                      <td className="p-2">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          disabled={!d.disponibile}
                                          aria-label={tr("Apri originale {titolo}", { titolo: String(d.titolo ?? "") })}
                                          onClick={() => {
                                            void apriDocumentoMezzoPos(
                                              companyId,
                                              orderId,
                                              d,
                                            ).catch((e) =>
                                              toast.error(
                                                e instanceof Error
                                                  ? e.message
                                                  : tr("Originale non disponibile: aggiorna le fonti."),
                                              ),
                                            );
                                          }}
                                        >
                                          {tr("Apri")}
                                        </Button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          <div className="border-t pt-3 space-y-2">
                            <h5 className="text-sm font-medium">
                              {tr("Controlli registrati")}
                            </h5>
                            {avvisi.map((a) => (
                              <p
                                key={a}
                                role="alert"
                                className="text-xs text-amber-800"
                              >
                                {a}
                              </p>
                            ))}
                            <p className="text-xs">{tr("{n} manutenzioni · {n2} segnalazioni aperte", { n: doc.data.controlli.manutenzioni.length, n2: doc.data.controlli.segnalazioni.filter(
                                  (s) => s.stato !== "chiusa",
                                ).length })}</p>
                            {!doc.data.controlli.manutenzioni.length && (
                              <p className="text-xs text-muted-foreground">
                                {tr("Nessuna manutenzione restituita; l’assenza di registrazioni non dimostra regolarità.")}
                              </p>
                            )}
                            <ul className="space-y-1 text-xs">
                              {doc.data.controlli.manutenzioni.map((m) => (
                                <li key={m.id}>
                                  {m.tipo.replaceAll("_", " ")} ·{" "}
                                  {dataIt(m.data)} · {tr("prossima data {data}", { data: dataIt(m.prossima_data) })}
                                  {m.prossimo_contatore
                                    ? ` · ${tr("soglia {prossimo_contatore} {contatore_unita}", { prossimo_contatore: String(m.prossimo_contatore ?? ""), contatore_unita: String(selezionata.fonte.contatore_unita ?? "") })}`
                                    : ""}
                                </li>
                              ))}
                            </ul>
                            {doc.data.controlli.segnalazioni.some(
                              (s) => s.stato !== "chiusa",
                            ) && (
                              <ul
                                aria-label={tr("Segnalazioni aperte dell’attrezzatura")}
                                className="space-y-1 text-xs text-amber-800"
                              >
                                {doc.data.controlli.segnalazioni
                                  .filter((s) => s.stato !== "chiusa")
                                  .map((s) => (
                                    <li key={s.id}>
                                      {s.tipo.replaceAll("_", " ") ||
                                        tr("Segnalazione")}{" "}
                                      · {s.stato.replaceAll("_", " ")} ·{" "}
                                      {s.creata_il
                                        ? new Date(
                                            s.creata_il,
                                          ).toLocaleDateString(intlCampo(), {
                                            timeZone: "Europe/Rome",
                                          })
                                        : tr("Data non disponibile")}
                                    </li>
                                  ))}
                              </ul>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {tr("Contatore corrente:")}{" "}
                              {selezionata.fonte.contatore ?? tr("non disponibile")}{" "}
                              {selezionata.fonte.contatore
                                ? selezionata.fonte.contatore_unita
                                : ""}
                              {tr(". Le soglie a contatore non possono essere valutate senza una lettura corrente.")}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {tr("Le registrazioni e le soglie richiedono un riesame tecnico. Nessun esito di utilizzabilità viene attribuito dal conteggio.")}
                            </p>
                          </div>
                        </>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
