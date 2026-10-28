import { useState } from "react";
import { HardHat, RefreshCw } from "lucide-react";
import { useDpiCommessa } from "@/hooks/useDpiCommessa";
import { usePermissions } from "@/hooks/usePermissions";
import {
  GestioneDpiDialog,
  StoricoDpiDialog,
  type ContestoGestioneDpi,
} from "./GestioneDpiDialog";
import type { AddettoDpi, ConsegnaDpi } from "@/lib/sicurezza/dpiCommessa";
import {
  TIPI_DPI,
  ETICHETTE_CONSEGNA,
  statoConsegnaDpi,
  riepilogoDpi,
} from "@/lib/sicurezza/dpiCommessa";
import type { PosRiga } from "@/hooks/usePos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
const dataIt = (s: string | null) =>
  s ? s.split("-").reverse().join("/") : "Non indicata";
export function DpiCommessa({
  companyId,
  orderId,
  dataRiferimento,
  faseRiferimento,
  pos,
  posNonDisponibili = false,
  contestoNonDisponibile = false,
}: {
  companyId: string;
  orderId: string;
  dataRiferimento: string;
  faseRiferimento?: string;
  pos: PosRiga[];
  posNonDisponibili?: boolean;
  contestoNonDisponibile?: boolean;
}) {
  const q = useDpiCommessa(
    companyId,
    orderId,
    dataRiferimento,
    faseRiferimento,
    !contestoNonDisponibile,
  );
  const [posScelto, setPosScelto] = useState("");
  const p = usePermissions();
  const [gestione, setGestione] = useState<{
    contesto: ContestoGestioneDpi;
    addettoId?: string;
    consegna?: ConsegnaDpi;
  } | null>(null);
  const [storico, setStorico] = useState<{
    addetto: AddettoDpi;
    consegna: ConsegnaDpi;
  } | null>(null);
  if (!p.canViewSicurezzaCantiere) return null;
  const scrivibile =
    p.canViewSicurezzaCantiere &&
    !p.solaLettura &&
    !contestoNonDisponibile &&
    !q.isError;
  const quadro = q.data;
  const riepilogo = quadro ? riepilogoDpi(quadro) : null;
  const corrente = pos.find((p) => p.id === posScelto) ?? pos[0];
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <HardHat className="h-5 w-5" />
            DPI previsti e consegne agli addetti
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            {scrivibile && (
              <Button
                size="sm"
                disabled={
                  q.isFetching ||
                  !q.data?.addetti.some((a) => a.attivo === true)
                }
                onClick={() => {
                  if (quadro)
                    setGestione({
                      contesto: {
                        companyId,
                        orderId,
                        data: quadro.data,
                        faseId: quadro.fase_id || undefined,
                        addetti: quadro.addetti,
                      },
                    });
                }}
              >
                Registra consegna
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={q.isFetching || contestoNonDisponibile}
              onClick={() => void q.refetch()}
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              Aggiorna consegne
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Consegne DPI della tua impresa, collegate agli addetti della commessa.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            DPI indicati nelle lavorazioni dei POS
          </summary>
          {posNonDisponibili ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              POS non disponibili: impossibile consultare le previsioni.
            </p>
          ) : !corrente ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Nessun POS disponibile per questa commessa.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              <label className="block text-sm">
                POS da consultare
                <select
                  aria-label="POS da consultare"
                  className="ml-2 max-w-full rounded border p-2"
                  value={corrente.id}
                  onChange={(e) => setPosScelto(e.target.value)}
                >
                  {pos.map((p) => (
                    <option key={p.id} value={p.id}>
                      Rev. {p.revisione} · {p.status} ·{" "}
                      {dataIt(p.created_at.slice(0, 10))} · rif.{" "}
                      {p.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-muted-foreground">
                Testi della versione selezionata, anche se in bozza. Le
                lavorazioni non sono abbinate automaticamente alle fasi o ai
                tipi del registro consegne.
              </p>
              {corrente.contenuto.lavorazioni.length ? (
                corrente.contenuto.lavorazioni.map((l, i) => (
                  <div key={l.id || i} className="rounded border p-2 text-sm">
                    <p className="font-medium">
                      {l.titolo || `Lavorazione ${i + 1}`}
                    </p>
                    <p className="whitespace-pre-wrap">
                      {l.dpi || "DPI da definire nella lavorazione"}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nessuna lavorazione compilata.
                </p>
              )}
            </div>
          )}
        </details>
        {contestoNonDisponibile ? (
          <p role="alert" className="text-sm text-destructive">
            Fasi della commessa non disponibili o in caricamento: attendi il
            contesto prima di consultare le consegne.
          </p>
        ) : q.isLoading ? (
          <p role="status" className="text-sm">
            Caricamento delle consegne…
          </p>
        ) : q.isError || !quadro ? (
          <p role="alert" className="text-sm text-destructive">
            Consegne non disponibili: il quadro non è completo. Riprova con
            Aggiorna consegne.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">
                {riepilogo!.addetti} addetti collegati
              </Badge>
              <Badge variant="outline">
                {riepilogo!.senzaConsegne} senza DPI registrati in uso
              </Badge>
              <Badge variant="outline">
                {riepilogo!.criticita} registrazioni da controllare
              </Badge>
              <Badge variant="outline">
                {riepilogo!.senzaModulo} in uso senza riferimento al modulo
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Data: {dataIt(quadro.data)} · Lettura dello stato attuale del
              registro.
            </p>
            {quadro.campo_senza_dipendente > 0 && (
              <p
                role="alert"
                className="rounded border border-amber-300 p-2 text-sm"
              >
                {quadro.campo_senza_dipendente} addetti Campo senza collegamento
                al registro dipendenti: le loro consegne non sono verificabili
                qui.
              </p>
            )}
            {!!quadro.esterni_legacy && (
              <p
                role="alert"
                className="rounded border border-amber-300 p-2 text-sm"
              >
                {quadro.esterni_legacy} anagrafiche storiche di subappaltatori
                tra le assegnazioni: escluse dal registro interno. Riconciliale
                con il fascicolo dell’impresa esterna.
              </p>
            )}
            {!quadro.addetti.length ? (
              <p className="text-sm text-muted-foreground">
                Nessun dipendente collegato nel contesto selezionato. Questo non
                attesta l’assenza di lavoratori o la completezza delle
                dotazioni.
              </p>
            ) : (
              quadro.addetti.map((a) => (
                <details key={a.id} className="rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm">
                    <span className="font-medium">
                      {a.nome} {a.cognome}
                    </span>{" "}
                    · {a.qualifica || "Qualifica da indicare"} ·{" "}
                    {a.consegne.length} consegne · rif. {a.id.slice(0, 8)}
                    {a.attivo !== true && " · Stato addetto da controllare"}
                  </summary>
                  {a.assegnazioni.some((s) => s.fonte === "commessa") && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Assegnazione di commessa senza periodo: conferma la
                      presenza prevista.
                    </p>
                  )}
                  {!a.consegne.length ? (
                    <p className="mt-2 text-sm text-amber-800">
                      Nessuna consegna registrata per questo addetto.
                    </p>
                  ) : (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b">
                            <th className="p-2">Dispositivo</th>
                            <th className="p-2">Date</th>
                            <th className="p-2">Stato</th>
                            <th className="p-2">Modulo</th>
                            <th className="p-2">Azioni</th>
                          </tr>
                        </thead>
                        <tbody>
                          {a.consegne.map((d) => (
                            <tr key={d.id} className="border-b last:border-0">
                              <td className="p-2">
                                {TIPI_DPI[d.tipo] || d.tipo}
                                <div className="text-muted-foreground">
                                  {[d.marca, d.matricola]
                                    .filter(Boolean)
                                    .join(" · ") ||
                                    "Marca e matricola non indicate"}
                                </div>
                              </td>
                              <td className="p-2">
                                Consegna {dataIt(d.consegnato_il)}
                                <div>Scadenza {dataIt(d.scade_il)}</div>
                                {d.restituito_il && (
                                  <div>Reso {dataIt(d.restituito_il)}</div>
                                )}
                              </td>
                              <td className="p-2">
                                {
                                  ETICHETTE_CONSEGNA[
                                    statoConsegnaDpi(d, quadro.data)
                                  ]
                                }
                                {!d.scade_il && (
                                  <div className="text-muted-foreground">
                                    Scadenza non registrata
                                  </div>
                                )}
                              </td>
                              <td className="p-2">
                                {d.modulo_registrato
                                  ? "Riferimento registrato, da verificare"
                                  : "Nessun riferimento"}
                              </td>
                              <td className="p-2">
                                <div className="flex flex-wrap gap-1">
                                  {scrivibile && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={!d.versione || q.isFetching}
                                      title={
                                        !d.versione
                                          ? "Aggiorna il registro prima di rettificare"
                                          : undefined
                                      }
                                      onClick={() =>
                                        setGestione({
                                          contesto: {
                                            companyId,
                                            orderId,
                                            data: quadro.data,
                                            faseId: quadro.fase_id || undefined,
                                            addetti: [a],
                                          },
                                          addettoId: a.id,
                                          consegna: d,
                                        })
                                      }
                                    >
                                      Rettifica
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() =>
                                      setStorico({ addetto: a, consegna: d })
                                    }
                                  >
                                    Storico
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </details>
              ))
            )}
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">
                Ambito e limiti del registro DPI
              </summary>
              <div className="mt-2 space-y-2">
                <p>
                  Consegne della propria impresa, lette dal registro esistente
                  per gli addetti collegati alla commessa. Le imprese esterne
                  mantengono i propri verbali nel fascicolo nominativo. La
                  disponibilità di un DPI non conferma adeguatezza,
                  manutenzione, addestramento o tutti i requisiti del POS.
                </p>
                <p>
                  Lo stato del registro è quello attuale: questa vista non
                  ricostruisce la disponibilità passata. Le assegnazioni
                  generali senza periodo non dimostrano la presenza nel giorno;
                  quelle Campo sono filtrate per data e valgono per tutte le
                  fasi.
                </p>
                <p>
                  Le registrazioni restano nel registro DPI d’origine. Il
                  riferimento a un modulo non prova che il file sia presente,
                  firmato o verificato. Nessun conteggio equivale a una verifica
                  positiva del cantiere.
                </p>
              </div>
            </details>
          </>
        )}
      </CardContent>
      {gestione && (
        <GestioneDpiDialog {...gestione} onClose={() => setGestione(null)} />
      )}
      {storico && (
        <StoricoDpiDialog
          companyId={companyId}
          {...storico}
          onClose={() => setStorico(null)}
        />
      )}
    </Card>
  );
}
