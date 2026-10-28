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

const tipi: Record<string, string> = {
  revisione: "Revisione",
  verifica_periodica: "Verifica periodica",
  libretto: "Libretto",
  taratura: "Taratura",
  manuale_ce: "Manuale / dichiarazione CE",
  pimus: "PiMUS",
  autorizzazione_ministeriale: "Autorizzazione ministeriale",
};
const dataIt = (s: string | null) =>
  s ? s.split("-").reverse().join("/") : "Non indicata";
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
            Mezzi e attrezzature · documenti tecnici
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            aria-expanded={aperto}
            onClick={() => setAperto((v) => !v)}
          >
            {aperto ? "Chiudi attrezzature" : "Consulta attrezzature"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Assegnazioni, documenti e controlli dall’inventario già usato dal POS.
          La collocazione di una macchina non ne attesta idoneità, presenza
          effettiva o impiego in una lavorazione.
        </p>
      </CardHeader>
      {aperto && (
        <CardContent className="space-y-3">
          <div className="rounded-md bg-muted p-3 text-xs">
            Data di riferimento: {dataIt(dataRiferimento)}. Sono letti i dati
            correnti; non è una ricostruzione storica.{" "}
            {faseRiferimento
              ? "Le assegnazioni dell’inventario non identificano una fase: il filtro fase non ne prova l’impiego nella lavorazione selezionata."
              : "Le assegnazioni dell’inventario non identificano una fase o una specifica lavorazione."}
          </div>
          {contestoNonDisponibile && (
            <p role="alert" className="text-sm text-amber-800">
              Contesto della commessa parziale: verifica fase e periodo prima di
              riesaminare i documenti.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-44 flex-1"
              aria-label="Cerca attrezzature della commessa"
              placeholder="Nome, codice, matricola o targa…"
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
              Aggiorna fonti
            </Button>
          </div>
          {q.isLoading || q.isFetching ? (
            <p role="status">Lettura delle attrezzature…</p>
          ) : q.isError ? (
            <p role="alert">
              Attrezzature non disponibili. Riprova il caricamento: l’errore non
              indica assenza di mezzi.
            </p>
          ) : !mezzi.length ? (
            <p className="text-sm">
              Nessuna attrezzatura restituita per questa data. Verifica
              assegnazioni, noleggi e mezzi delle imprese esterne: un elenco
              vuoto non conferma la completezza.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {filtrati.length} attrezzature con i filtri attuali ·{" "}
                {mezzi.filter((m) => !m.periodoDocumentato).length} senza un
                inizio di assegnazione documentato
              </p>
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
                          "Identificativo descrittivo non indicato"}
                      </span>
                      <span className="mt-1 block text-xs">
                        Stato inventario: {m.fonte.stato.replaceAll("_", " ")}
                      </span>
                      {!m.periodoDocumentato && (
                        <span className="mt-1 block text-xs text-amber-800">
                          Periodo di presenza da verificare
                        </span>
                      )}
                    </button>
                  ))}
                  {!filtrati.length && (
                    <p className="text-sm">
                      Nessuna attrezzatura corrisponde alla ricerca.
                    </p>
                  )}
                  {filtrati.length > limite && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLimite((v) => v + 20)}
                    >
                      Mostra altre attrezzature
                    </Button>
                  )}
                </div>
                <div className="min-w-0 rounded-lg border p-3 space-y-3">
                  {!selezionata ? (
                    <p className="text-sm text-muted-foreground">
                      Seleziona un’attrezzatura per leggere originali,
                      manutenzioni e segnalazioni.
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
                              Scheda inventario
                            </Link>
                          </Button>
                        )}
                      </div>
                      {selezionata.fonte.stato !== "in_servizio" && (
                        <p role="alert" className="text-sm text-amber-800">
                          La macchina non risulta in servizio nell’inventario.
                          Riesamina lo stato prima dell’utilizzo.
                        </p>
                      )}
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        {selezionata.collegamenti.map((f) => (
                          <li key={`${f.fonte_tipo}:${f.fonte_id}`}>
                            {
                              {
                                assegnazione: "Assegnazione",
                                allocazione: "Allocazione a quantità",
                                corrente: "Collocazione corrente",
                                su_mezzo_corrente:
                                  "Su mezzo collocato in cantiere",
                              }[f.fonte_tipo]
                            }{" "}
                            · dal {dataIt(f.dal)} al {dataIt(f.al)}
                            {f.fonte_tipo === "allocazione"
                              ? ` · quantità registrata ${f.quantita} ${f.unita || ""}`
                              : ""}
                          </li>
                        ))}
                      </ul>
                      {doc.isLoading || doc.isFetching ? (
                        <p role="status">Lettura documenti e controlli…</p>
                      ) : doc.isError ? (
                        <p role="alert">
                          Documenti e controlli non disponibili. Nessuna
                          verifica di completezza è possibile; aggiorna le
                          fonti.
                        </p>
                      ) : doc.data ? (
                        <>
                          <h5 className="text-sm font-medium">
                            Originali tecnici nell’archivio
                          </h5>
                          {!doc.data.documenti.length ? (
                            <p className="text-sm text-amber-800">
                              Nessun originale tecnico disponibile nella
                              proiezione POS. Verifica i documenti pertinenti
                              nell’inventario.
                            </p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs">
                                <caption className="sr-only">
                                  Documenti tecnici della macchina selezionata
                                </caption>
                                <thead className="bg-muted">
                                  <tr>
                                    {[
                                      "Documento",
                                      "Date / stato",
                                      "Originale",
                                    ].map((t) => (
                                      <th className="p-2" key={t} scope="col">
                                        {t}
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
                                          {tipi[d.categoria] || d.categoria}
                                        </p>
                                        <p className="break-all text-muted-foreground">
                                          {d.file_name}
                                        </p>
                                      </td>
                                      <td className="p-2">
                                        <p>Dal {dataIt(d.data_inizio)}</p>
                                        <p>
                                          Scadenza {dataIt(d.data_scadenza)}
                                        </p>
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
                                          aria-label={`Apri originale ${d.titolo}`}
                                          onClick={() => {
                                            void apriDocumentoMezzoPos(
                                              companyId,
                                              orderId,
                                              d,
                                            ).catch((e) =>
                                              toast.error(
                                                e instanceof Error
                                                  ? e.message
                                                  : "Originale non disponibile: aggiorna le fonti.",
                                              ),
                                            );
                                          }}
                                        >
                                          Apri
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
                              Controlli registrati
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
                            <p className="text-xs">
                              {doc.data.controlli.manutenzioni.length}{" "}
                              manutenzioni ·{" "}
                              {
                                doc.data.controlli.segnalazioni.filter(
                                  (s) => s.stato !== "chiusa",
                                ).length
                              }{" "}
                              segnalazioni aperte
                            </p>
                            {!doc.data.controlli.manutenzioni.length && (
                              <p className="text-xs text-muted-foreground">
                                Nessuna manutenzione restituita; l’assenza di
                                registrazioni non dimostra regolarità.
                              </p>
                            )}
                            <ul className="space-y-1 text-xs">
                              {doc.data.controlli.manutenzioni.map((m) => (
                                <li key={m.id}>
                                  {m.tipo.replaceAll("_", " ")} ·{" "}
                                  {dataIt(m.data)} · prossima data{" "}
                                  {dataIt(m.prossima_data)}
                                  {m.prossimo_contatore
                                    ? ` · soglia ${m.prossimo_contatore} ${selezionata.fonte.contatore_unita}`
                                    : ""}
                                </li>
                              ))}
                            </ul>
                            {doc.data.controlli.segnalazioni.some(
                              (s) => s.stato !== "chiusa",
                            ) && (
                              <ul
                                aria-label="Segnalazioni aperte dell’attrezzatura"
                                className="space-y-1 text-xs text-amber-800"
                              >
                                {doc.data.controlli.segnalazioni
                                  .filter((s) => s.stato !== "chiusa")
                                  .map((s) => (
                                    <li key={s.id}>
                                      {s.tipo.replaceAll("_", " ") ||
                                        "Segnalazione"}{" "}
                                      · {s.stato.replaceAll("_", " ")} ·{" "}
                                      {s.creata_il
                                        ? new Date(
                                            s.creata_il,
                                          ).toLocaleDateString("it-IT", {
                                            timeZone: "Europe/Rome",
                                          })
                                        : "Data non disponibile"}
                                    </li>
                                  ))}
                              </ul>
                            )}
                            <p className="text-xs text-muted-foreground">
                              Contatore corrente:{" "}
                              {selezionata.fonte.contatore ?? "non disponibile"}{" "}
                              {selezionata.fonte.contatore
                                ? selezionata.fonte.contatore_unita
                                : ""}
                              . Le soglie a contatore non possono essere
                              valutate senza una lettura corrente.
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Le registrazioni e le soglie richiedono un riesame
                              tecnico. Nessun esito di utilizzabilità viene
                              attribuito dal conteggio.
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
