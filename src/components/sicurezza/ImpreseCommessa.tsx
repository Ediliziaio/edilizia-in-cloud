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
import { PosEsternoImpresa } from "./PosEsternoImpresa";
import { RUOLI_DITTA, useSalvaRuoloSicurezza, type AvvioSicurezza, type ConsegnaPosEsterno, type RuoloDittaSicurezza } from "@/hooks/useAvvioSicurezza";
import { UniformSelect } from "@/components/ui/uniform-select";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function ImpreseCommessa({
  companyId,
  orderId,
  dataRiferimento,
  faseRiferimento,
  contestoNonDisponibile = false,
  gestionePos,
}: {
  companyId: string;
  orderId: string;
  dataRiferimento?: string;
  faseRiferimento?: string;
  contestoNonDisponibile?: boolean;
  gestionePos?: { avvio?: AvvioSicurezza | null; ruoli: Record<string, RuoloDittaSicurezza>;
    affidataria?: { id: string; revisione: number };
    consegne: ConsegnaPosEsterno[]; disponibile: boolean; riprova: () => void };
}) {
  const t = useT();
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
          <CardTitle className="text-base">{t("Imprese e addetti esterni")}</CardTitle>
          {dataRiferimento ? (
            <Badge variant="outline">{t("Data di riferimento: {giorno}", { giorno: String(giorno ?? "") })}</Badge>
          ) : (
            <label className="flex items-center gap-2 text-sm">
              {t("Giorno di lavoro")}
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
          {t("Documenti recuperati dal fascicolo dell’impresa. Gli operai compaiono solo nel periodo assegnato; un POS di un altro cantiere resta escluso. I contratti non assegnano automaticamente l’intero organico.")}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isError || comuni.isError ? (
          <p role="alert">
            {t("Imprese o fascicoli non disponibili.")}{" "}
            <Button variant="link" onClick={() => { void q.refetch(); void comuni.refetch(); }}>
              {t("Riprova")}
            </Button>
          </p>
        ) : q.isLoading || comuni.isLoading ? (
          <p>{t("Caricamento imprese…")}</p>
        ) : !q.data?.imprese.length ? (
          <p className="text-sm text-muted-foreground">
            {t("Nessuna impresa collegata tramite contratto, anagrafica di cantiere o assegnazione operai.")}
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
                {gestionePos && (gestionePos.disponibile ? <>
                  <RuoloImpresaInCantiere companyId={companyId} orderId={orderId} subId={sub.id}
                    ruolo={gestionePos.ruoli[sub.id] ?? "da_valutare"} solaLettura={p.solaLettura} />
                  {gestionePos.ruoli[sub.id] === "esecutrice" && <PosEsternoImpresa companyId={companyId} orderId={orderId} subId={sub.id}
                    avvio={gestionePos.avvio} affidataria={gestionePos.affidataria} righe={gestionePos.consegne.filter((r) => r.subappaltatore_id === sub.id)}
                    documenti={documenti} solaLettura={p.solaLettura} />}
                </> : <p className="text-sm text-muted-foreground">{t("Ruolo e consegne non disponibili.")}
                  <Button variant="link" size="sm" onClick={gestionePos.riprova}>{t("Riprova")}</Button>
                </p>)}
                <div className="mt-3 grid gap-4 lg:grid-cols-2">
                  <div>
                    <h4 className="text-sm font-medium">{t("Addetti assegnati · {n}", { n: ids.length })}</h4>
                    {!assegnati.length && (
                      <p className="mt-2 text-sm text-amber-700">
                        {t("Nessun addetto assegnato per questa data. Completa l’organico dalla scheda impresa.")}
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
                              : t("Operaio non disponibile")}{" "}
                            {o && !o.attivo && (
                              <Badge variant="outline">
                                {t("Cessato nell’organico")}
                              </Badge>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {o?.mansione} · {a.attivita}
                            {a.area ? ` · ${a.area}` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {a.dal} → {a.al ?? t("fine da definire")}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <div>
                    <h4 className="text-sm font-medium">{t("Evidenze pertinenti · {n}", { n: documenti.length })}</h4>
                    {!gestionePos && !documenti.some((d) => d.tipo === "pos") && (
                      <p className="mt-2 text-sm text-amber-700">
                        {t("POS di questa impresa per questo cantiere non presente nel nuovo fascicolo.")}
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
                            {t(esitoEvidenza(d, giorno))}
                            {d.data_scadenza
                              ? t(" · scadenza {data_scadenza}", { data_scadenza: String(d.data_scadenza ?? "") })
                              : ""}
                            {d.operaio_id ? ` ${t("· personale")}` : ` ${t("· impresa")}`}
                          </p>
                        </div>
                        {d.file_path && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              void apriFileFascicolo(d.file_path!).catch(() =>
                                toast.error(t("Documento non disponibile")),
                              )
                            }
                          >
                            {t("Apri")}
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
                    {t("Attendi il contesto delle fasi prima di registrare una verifica.")}
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

function RuoloImpresaInCantiere({ companyId, orderId, subId, ruolo, solaLettura }: {
  companyId: string; orderId: string; subId: string; ruolo: RuoloDittaSicurezza; solaLettura: boolean;
}) {
  const t = useT();
  const salva = useSalvaRuoloSicurezza(companyId, orderId);
  return <div className="mt-2 flex flex-wrap items-center gap-2">
    <Label htmlFor={`ruolo-sicurezza-${subId}`} className="text-xs">{t("Ruolo nel cantiere")}</Label>
    <UniformSelect id={`ruolo-sicurezza-${subId}`} className="rounded-md border bg-background px-2 py-1.5 text-sm"
      value={ruolo} disabled={solaLettura || salva.isPending}
      onChange={(e) => salva.mutate({ subId, ruolo: e.target.value as RuoloDittaSicurezza })}>
      {Object.entries(RUOLI_DITTA).map(([valore, testo]) => <option key={valore} value={valore}>{testo}</option>)}
    </UniformSelect>
    {salva.error && <p role="alert" className="text-xs text-destructive">{salva.error.message}</p>}
  </div>;
}
