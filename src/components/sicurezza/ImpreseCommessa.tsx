import { useState } from "react";
import { VerificaItpImpresa } from "./VerificaItpImpresa";
import { DpiEsterni } from "./DpiEsterni";
import { Link } from "react-router-dom";
import {
  useImpreseCommessa,
  useEvidenzeFascicolo,
  apriFileFascicolo,
} from "@/hooks/useFascicoloCantiere";
import { usePermissions } from "@/hooks/usePermissions";
import {
  evidenzaPertinente,
  esitoEvidenza,
  nelPeriodo,
  oggiSicurezza,
} from "@/lib/sicurezza/fascicolo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export function ImpreseCommessa({
  companyId,
  orderId,
  dataRiferimento,
  faseRiferimento,
  contestoNonDisponibile = false,
}: {
  companyId: string;
  orderId: string;
  dataRiferimento?: string;
  faseRiferimento?: string;
  contestoNonDisponibile?: boolean;
}) {
  const p = usePermissions();
  const q = useImpreseCommessa(companyId, orderId);
  const comuni = useEvidenzeFascicolo({ companyId, orderId });
  const [giornoLocale, setGiorno] = useState(oggiSicurezza);
  const giorno = dataRiferimento || giornoLocale;
  if (!p.canViewSicurezzaCantiere) return null;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Imprese e addetti esterni</CardTitle>
          {dataRiferimento ? (
            <Badge variant="outline">Data di riferimento: {giorno}</Badge>
          ) : (
            <label className="flex items-center gap-2 text-sm">
              Giorno di lavoro
              <Input
                className="w-40"
                type="date"
                value={giorno}
                onChange={(e) => setGiorno(e.target.value || oggiSicurezza())}
              />
            </label>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Documenti recuperati dal fascicolo dell’impresa. Gli operai compaiono
          solo nel periodo assegnato; un POS di un altro cantiere resta escluso.
          I contratti non assegnano automaticamente l’intero organico.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isError || comuni.isError ? (
          <p role="alert">
            Imprese o fascicoli non disponibili.{" "}
            <Button variant="link" onClick={() => void q.refetch()}>
              Riprova
            </Button>
          </p>
        ) : q.isLoading || comuni.isLoading ? (
          <p>Caricamento imprese…</p>
        ) : !q.data?.imprese.length ? (
          <p className="text-sm text-muted-foreground">
            Nessuna impresa collegata tramite contratto, anagrafica di cantiere
            o assegnazione operai.
          </p>
        ) : (
          q.data.imprese.map((sub) => {
            const assegnati = q.data.assegnazioni.filter(
              (a) =>
                a.subappaltatore_id === sub.id &&
                nelPeriodo(a.dal, a.al, giorno) &&
                (!faseRiferimento ||
                  !a.fase_id ||
                  a.fase_id === faseRiferimento),
            );
            const ids = [...new Set(assegnati.map((a) => a.operaio_id))];
            const documenti = q.data.evidenze.filter(
              (e) =>
                e.subappaltatore_id === sub.id &&
                e.stato !== "superato" &&
                evidenzaPertinente(e, orderId, ids, {
                  data: giorno,
                  faseId: faseRiferimento,
                }),
            );
            return (
              <section
                id={`impresa-sicurezza-${sub.id}`}
                className="rounded-lg border p-4 scroll-mt-4"
                key={sub.id}
              >
                <Link
                  className="font-semibold text-primary"
                  to={`/azienda/subappaltatori/${sub.id}`}
                >
                  {sub.ragione_sociale}
                </Link>
                <div className="mt-3 grid gap-4 lg:grid-cols-2">
                  <div>
                    <h4 className="text-sm font-medium">
                      Addetti assegnati · {ids.length}
                    </h4>
                    {!assegnati.length && (
                      <p className="mt-2 text-sm text-amber-700">
                        Nessun addetto assegnato per questa data. Completa
                        l’organico dalla scheda impresa.
                      </p>
                    )}
                    {assegnati.map((a) => {
                      const o = q.data.operai.find(
                        (o) => o.id === a.operaio_id,
                      );
                      return (
                        <div className="mt-2 text-sm" key={a.id}>
                          <p>
                            {o
                              ? `${o.nome} ${o.cognome}`
                              : "Operaio non disponibile"}{" "}
                            {o && !o.attivo && (
                              <Badge variant="outline">
                                Cessato nell’organico
                              </Badge>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {o?.mansione} · {a.attivita}
                            {a.area ? ` · ${a.area}` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {a.dal} → {a.al ?? "fine da definire"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <div>
                    <h4 className="text-sm font-medium">
                      Evidenze pertinenti · {documenti.length}
                    </h4>
                    {!documenti.some((d) => d.tipo === "pos") && (
                      <p className="mt-2 text-sm text-amber-700">
                        POS di questa impresa per questo cantiere non presente
                        nel nuovo fascicolo.
                      </p>
                    )}
                    {documenti.map((d) => (
                      <div
                        key={d.id}
                        className="mt-2 flex items-center justify-between gap-2 text-sm"
                      >
                        <div>
                          <p>{d.titolo}</p>
                          <p className="text-xs text-muted-foreground">
                            {esitoEvidenza(d, giorno)}
                            {d.data_scadenza
                              ? ` · scadenza ${d.data_scadenza}`
                              : ""}
                            {d.operaio_id ? " · personale" : " · impresa"}
                          </p>
                        </div>
                        {d.file_path && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              void apriFileFascicolo(d.file_path!).catch(() =>
                                toast.error("Documento non disponibile"),
                              )
                            }
                          >
                            Apri
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <DpiEsterni
                  ambito={{
                    companyId,
                    subId: sub.id,
                    orderId,
                    data: giorno,
                    faseId: faseRiferimento,
                  }}
                  contestoNonDisponibile={contestoNonDisponibile}
                />
                {contestoNonDisponibile ? (
                  <p role="alert" className="mt-3 text-sm text-destructive">
                    Attendi il contesto delle fasi prima di registrare una
                    verifica.
                  </p>
                ) : (
                  <VerificaItpImpresa
                    companyId={companyId}
                    orderId={orderId}
                    subId={sub.id}
                    evidenze={[
                      ...new Map(
                        [
                          ...q.data.evidenze.filter(
                            (e) => e.subappaltatore_id === sub.id,
                          ),
                          ...(comuni.data ?? []).filter(
                            (e) => !e.subappaltatore_id,
                          ),
                        ].map((e) => [e.id, e]),
                      ).values(),
                    ]}
                    giorno={giorno}
                    faseId={faseRiferimento}
                  />
                )}
              </section>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
