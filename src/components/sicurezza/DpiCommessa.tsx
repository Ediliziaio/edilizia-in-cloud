import { UniformSelect } from "@/components/ui/uniform-select";
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
import { useT } from "@/lib/campo/lingua/LinguaCampo";
const dataGrezza = (s: string) => s.split("-").reverse().join("/");
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
  const t = useT();
  const dataIt = (s: string | null) => (s ? dataGrezza(s) : t("Non indicata"));
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
            {t("DPI previsti e consegne agli addetti")}
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
                {t("Registra consegna")}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={q.isFetching || contestoNonDisponibile}
              onClick={() => void q.refetch()}
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              {t("Aggiorna consegne")}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("Consegne DPI della tua impresa, collegate agli addetti della commessa.")}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            {t("DPI indicati nelle lavorazioni dei POS")}
          </summary>
          {posNonDisponibili ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {t("POS non disponibili: impossibile consultare le previsioni.")}
            </p>
          ) : !corrente ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("Nessun POS disponibile per questa commessa.")}
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              <label className="block text-sm">
                {t("POS da consultare")}
                <UniformSelect
                  aria-label={t("POS da consultare")}
                  className="ml-2 max-w-full rounded border p-2"
                  value={corrente.id}
                  onChange={(e) => setPosScelto(e.target.value)}
                >
                  {pos.map((p) => (
                    <option key={p.id} value={p.id}>{t("Rev. {revisione} · {status} · {valore} · rif. {id}", { revisione: String(p.revisione ?? ""), status: String(p.status ?? ""), valore: String(dataIt(p.created_at.slice(0, 10)) ?? ""), id: p.id.slice(0, 8) })}</option>
                  ))}
                </UniformSelect>
              </label>
              <p className="text-xs text-muted-foreground">
                {t("Testi della versione selezionata, anche se in bozza. Le lavorazioni non sono abbinate automaticamente alle fasi o ai tipi del registro consegne.")}
              </p>
              {corrente.contenuto.lavorazioni.length ? (
                corrente.contenuto.lavorazioni.map((l, i) => (
                  <div key={l.id || i} className="rounded border p-2 text-sm">
                    <p className="font-medium">
                      {l.titolo || t("Lavorazione {i}", { i: i + 1 })}
                    </p>
                    <p className="whitespace-pre-wrap">
                      {l.dpi || t("DPI da definire nella lavorazione")}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("Nessuna lavorazione compilata.")}
                </p>
              )}
            </div>
          )}
        </details>
        {contestoNonDisponibile ? (
          <p role="alert" className="text-sm text-destructive">
            {t("Fasi della commessa non disponibili o in caricamento: attendi il contesto prima di consultare le consegne.")}
          </p>
        ) : q.isLoading ? (
          <p role="status" className="text-sm">
            {t("Caricamento delle consegne…")}
          </p>
        ) : q.isError || !quadro ? (
          <p role="alert" className="text-sm text-destructive">
            {t("Consegne non disponibili: il quadro non è completo. Riprova con Aggiorna consegne.")}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">{t("{addetti} addetti collegati", { addetti: String(riepilogo!.addetti ?? "") })}</Badge>
              <Badge variant="outline">{t("{senzaConsegne} senza DPI registrati in uso", { senzaConsegne: String(riepilogo!.senzaConsegne ?? "") })}</Badge>
              <Badge variant="outline">{t("{criticita} registrazioni da controllare", { criticita: String(riepilogo!.criticita ?? "") })}</Badge>
              <Badge variant="outline">{t("{senzaModulo} in uso senza riferimento al modulo", { senzaModulo: String(riepilogo!.senzaModulo ?? "") })}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{t("Data: {data} · Lettura dello stato attuale del registro.", { data: String(dataIt(quadro.data) ?? "") })}</p>
            {quadro.campo_senza_dipendente > 0 && (
              <p
                role="alert"
                className="rounded border border-amber-300 p-2 text-sm"
              >{t("{campo_senza_dipendente} addetti Campo senza collegamento al registro dipendenti: le loro consegne non sono verificabili qui.", { campo_senza_dipendente: String(quadro.campo_senza_dipendente ?? "") })}</p>
            )}
            {!!quadro.esterni_legacy && (
              <p
                role="alert"
                className="rounded border border-amber-300 p-2 text-sm"
              >{t("{esterni_legacy} anagrafiche storiche di subappaltatori tra le assegnazioni: escluse dal registro interno. Riconciliale con il fascicolo dell’impresa esterna.", { esterni_legacy: String(quadro.esterni_legacy ?? "") })}</p>
            )}
            {!quadro.addetti.length ? (
              <p className="text-sm text-muted-foreground">
                {t("Nessun dipendente collegato nel contesto selezionato. Questo non attesta l’assenza di lavoratori o la completezza delle dotazioni.")}
              </p>
            ) : (
              quadro.addetti.map((a) => (
                <details key={a.id} className="rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm">
                    <span className="font-medium">
                      {a.nome} {a.cognome}
                    </span>{" "}
                    · {a.qualifica || t("Qualifica da indicare")} ·{" "}
                    {t("{n} consegne · rif. {rif}", { n: a.consegne.length, rif: a.id.slice(0, 8) })}
                    {a.attivo !== true && ` ${t("· Stato addetto da controllare")}`}
                  </summary>
                  {a.assegnazioni.some((s) => s.fonte === "commessa") && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t("Assegnazione di commessa senza periodo: conferma la presenza prevista.")}
                    </p>
                  )}
                  {!a.consegne.length ? (
                    <p className="mt-2 text-sm text-amber-800">
                      {t("Nessuna consegna registrata per questo addetto.")}
                    </p>
                  ) : (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b">
                            <th className="p-2">{t("Dispositivo")}</th>
                            <th className="p-2">{t("Date")}</th>
                            <th className="p-2">{t("Stato")}</th>
                            <th className="p-2">{t("Modulo")}</th>
                            <th className="p-2">{t("Azioni")}</th>
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
                                    t("Marca e matricola non indicate")}
                                </div>
                              </td>
                              <td className="p-2">
                                {t("Consegna {data}", { data: dataIt(d.consegnato_il) })}
                                <div>{t("Scadenza {data}", { data: String(dataIt(d.scade_il) ?? "") })}</div>
                                {d.restituito_il && (
                                  <div>{t("Reso {restituito_il}", { restituito_il: String(dataIt(d.restituito_il) ?? "") })}</div>
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
                                    {t("Scadenza non registrata")}
                                  </div>
                                )}
                              </td>
                              <td className="p-2">
                                {d.modulo_registrato
                                  ? t("Riferimento registrato, da verificare")
                                  : t("Nessun riferimento")}
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
                                          ? t("Aggiorna il registro prima di rettificare")
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
                                      {t("Rettifica")}
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() =>
                                      setStorico({ addetto: a, consegna: d })
                                    }
                                  >
                                    {t("Storico")}
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
                {t("Ambito e limiti del registro DPI")}
              </summary>
              <div className="mt-2 space-y-2">
                <p>
                  {t("Consegne della propria impresa, lette dal registro esistente per gli addetti collegati alla commessa. Le imprese esterne mantengono i propri verbali nel fascicolo nominativo. La disponibilità di un DPI non conferma adeguatezza, manutenzione, addestramento o tutti i requisiti del POS.")}
                </p>
                <p>
                  {t("Lo stato del registro è quello attuale: questa vista non ricostruisce la disponibilità passata. Le assegnazioni generali senza periodo non dimostrano la presenza nel giorno; quelle Campo sono filtrate per data e valgono per tutte le fasi.")}
                </p>
                <p>
                  {t("Le registrazioni restano nel registro DPI d’origine. Il riferimento a un modulo non prova che il file sia presente, firmato o verificato. Nessun conteggio equivale a una verifica positiva del cantiere.")}
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
