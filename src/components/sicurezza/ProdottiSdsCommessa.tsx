import { useState } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useProdottiSds,
  apriSdsProdotto,
  type AmbitoProdottiSds,
} from "@/hooks/useProdottiSds";
import {
  avvisiProdottoSds,
  type QuadroProdottiSds,
  type ImpiegoProdottoSds,
  type MaterialeSds,
} from "@/lib/sicurezza/prodottiSds";
import type { FaseFascicolo } from "@/lib/sicurezza/fascicolo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ModuloProdotto, StoricoProdotto } from "./ProdottoSdsDialog";
export function ProdottiSdsCommessa({
  companyId,
  orderId,
  dataRiferimento,
  faseRiferimento,
  fasi,
  contestoNonDisponibile = false,
  inizialmenteAperto = false,
}: {
  companyId: string;
  orderId: string;
  dataRiferimento: string;
  faseRiferimento?: string;
  fasi: FaseFascicolo[];
  contestoNonDisponibile?: boolean;
  inizialmenteAperto?: boolean;
}) {
  const p = usePermissions();
  const [aperto, setAperto] = useState(inizialmenteAperto);
  const [cerca, setCerca] = useState("");
  const [altri, setAltri] = useState(false);
  const ambito: AmbitoProdottiSds = {
    companyId,
    orderId,
    data: dataRiferimento,
    faseId: faseRiferimento || undefined,
  };
  const q = useProdottiSds(ambito, aperto && !contestoNonDisponibile);
  const [modulo, setModulo] = useState<{
    ambito: AmbitoProdottiSds;
    quadro: QuadroProdottiSds;
    prodotto?: ImpiegoProdottoSds;
    materiale?: MaterialeSds;
    fasi: FaseFascicolo[];
  } | null>(null);
  const [storico, setStorico] = useState<{
    ambito: AmbitoProdottiSds;
    prodotto: ImpiegoProdottoSds;
  } | null>(null);
  if (!p.canViewSicurezzaCantiere) return null;
  const r = q.data;
  const scrive = !p.solaLettura && !q.isError && !contestoNonDisponibile;
  const prepara = (prodotto?: ImpiegoProdottoSds, materiale?: MaterialeSds) => {
    if (!r || !scrive) return;
    setModulo(
      structuredClone({ ambito, quadro: r, prodotto, materiale, fasi }),
    );
  };
  const righe = (r?.impieghi || []).filter(
    (v) =>
      (altri || (v.pertinente && !v.annullato)) &&
      `${v.nome} ${v.codice || ""} ${v.produttore || ""} ${v.impiego}`
        .toLowerCase()
        .includes(cerca.toLowerCase()),
  );
  const materialiDaValutare = (r?.materiali || []).filter(
    (m) =>
      (!faseRiferimento || !m.fase_id || m.fase_id === faseRiferimento) &&
      !(r?.impieghi || []).some(
        (v) => v.materiale_id === m.id && !v.annullato && v.pertinente,
      ),
  );
  const nomeFase = (id: string | null) =>
    fasi.find((f) => f.id === id)?.name ||
    (id ? "Fase non disponibile" : "Comune a più fasi");
  return (
    <section
      className="rounded-lg border bg-card p-4"
      id={`prodotti-sds-${orderId}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <a
          href="/azienda/sicurezza-cantiere?tab=sds"
          className="text-sm text-primary underline"
        >
          Libreria SDS aziendali
        </a>
        <Button
          variant="ghost"
          className="h-auto p-0 font-semibold"
          aria-expanded={aperto}
          onClick={() => setAperto((v) => !v)}
        >
          Prodotti e schede di sicurezza {aperto ? "−" : "+"}
        </Button>
        {aperto && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={q.isFetching || contestoNonDisponibile}
              onClick={() => void q.refetch()}
            >
              Aggiorna prodotti
            </Button>
            {scrive && (
              <Button
                size="sm"
                disabled={!r || q.isFetching}
                onClick={() => prepara()}
              >
                Registra prodotto
              </Button>
            )}
          </div>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Materiali e prodotti effettivamente impiegati, SDS per singolo prodotto
        e revisioni da riesaminare.
      </p>
      {aperto && (
        <div className="mt-3 space-y-3">
          {contestoNonDisponibile ? (
            <p role="alert">
              Contesto della fase non disponibile: attendi prima di consultare i
              prodotti.
            </p>
          ) : q.isLoading ? (
            <p role="status">Caricamento prodotti e SDS…</p>
          ) : q.isError || !r ? (
            <p role="alert" className="text-sm text-destructive">
              Inventario prodotti non disponibile: non è possibile confermare
              assenza o completezza delle SDS.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  {
                    r.impieghi.filter((v) => v.pertinente && !v.annullato)
                      .length
                  }{" "}
                  impieghi nel contesto
                </Badge>
                <Badge variant="outline">
                  {materialiDaValutare.length} materiali ancora da esaminare
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                La distinta propone i materiali; non stabilisce quali richiedano
                una SDS. Aggiungi anche i prodotti consumabili non presenti
                nella distinta. La data/fase limita gli impieghi mostrati; gli
                stati documentali sono quelli attualmente conosciuti.
              </p>
              <div className="flex flex-wrap gap-3">
                <Input
                  className="max-w-md"
                  aria-label="Cerca prodotto"
                  placeholder="Cerca prodotto, codice, produttore o impiego…"
                  value={cerca}
                  onChange={(e) => setCerca(e.target.value)}
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={altri}
                    onChange={(e) => setAltri(e.target.checked)}
                  />
                  Includi altri periodi, fasi e annullati
                </label>
                <Button
                  variant="link"
                  size="sm"
                  onClick={() =>
                    document
                      .getElementById(`fascicolo-documenti-${orderId}`)
                      ?.scrollIntoView({ behavior: "smooth" })
                  }
                >
                  Vai al fascicolo per caricare una SDS
                </Button>
              </div>
              {righe.length === 0 ? (
                <p className="rounded border border-dashed p-4 text-sm text-muted-foreground">
                  Nessun impiego registrato con questi filtri. Questo non
                  conferma che non siano usati prodotti pericolosi.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        {[
                          "Prodotto e impiego",
                          "Impresa / fase",
                          "Periodo",
                          "SDS e riesame",
                          "Azioni",
                        ].map((t) => (
                          <th key={t} className="p-3 font-medium">
                            {t}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {righe.map((v) => {
                        const avvisi = avvisiProdottoSds(v, r.data);
                        return (
                          <tr key={v.id} className="border-t align-top">
                            <td className="min-w-48 p-3">
                              <p className="font-medium">{v.nome}</p>
                              <p className="text-xs text-muted-foreground">
                                {v.produttore || "Produttore non indicato"}
                                {v.codice ? ` · ${v.codice}` : ""}
                              </p>
                              <p>{v.impiego}</p>
                              {v.area && <p className="text-xs">{v.area}</p>}
                            </td>
                            <td className="p-3">
                              {r.imprese.find(
                                (s) => s.id === v.subappaltatore_id,
                              )?.ragione_sociale ||
                                (v.subappaltatore_id
                                  ? "Impresa non più collegata"
                                  : "La propria impresa")}
                              <p className="text-xs text-muted-foreground">
                                {nomeFase(v.fase_id)}
                              </p>
                            </td>
                            <td className="whitespace-nowrap p-3">
                              {v.dal}
                              <br />
                              {v.al || "Senza fine indicata"}
                              {!v.pertinente && (
                                <p className="text-xs">Fuori contesto</p>
                              )}
                            </td>
                            <td className="min-w-56 p-3">
                              {avvisi.length ? (
                                <ul className="space-y-1 text-xs text-amber-800">
                                  {avvisi.map((a) => (
                                    <li key={a}>{a}</li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-xs">
                                  SDS collegata e corrispondenza riesaminata
                                </p>
                              )}
                              {v.motivo_non_necessaria && (
                                <p className="mt-1 text-xs">
                                  {v.motivo_non_necessaria}
                                </p>
                              )}
                              {v.documento_corrente && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {v.documento_corrente.titolo} · rev.{" "}
                                  {v.documento_corrente.revisione ||
                                    "non indicata"}
                                </p>
                              )}
                            </td>
                            <td className="p-2">
                              <div className="flex flex-col items-start gap-1">
                                {scrive && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => prepara(v)}
                                  >
                                    Rettifica prodotto
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setStorico({
                                      ambito: structuredClone(ambito),
                                      prodotto: structuredClone(v),
                                    })
                                  }
                                >
                                  Storico prodotto
                                </Button>
                                {v.documento_pertinente &&
                                  v.documento_corrente && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        void apriSdsProdotto(
                                          ambito,
                                          v.id,
                                          v.documento_corrente!.impronta,
                                        ).catch((e) =>
                                          toast.error(
                                            e instanceof Error
                                              ? e.message
                                              : "Apertura SDS non riuscita",
                                          ),
                                        )
                                      }
                                    >
                                      Apri SDS corrente
                                    </Button>
                                  )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {materialiDaValutare.length > 0 && (
                <details className="rounded border p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Materiali della distinta da esaminare (
                    {materialiDaValutare.length})
                  </summary>
                  <div className="mt-2 max-h-72 divide-y overflow-auto">
                    {materialiDaValutare.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between gap-2 py-2 text-sm"
                      >
                        <div>
                          <p>
                            {m.nome}
                            {m.codice ? ` · ${m.codice}` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {nomeFase(m.fase_id)} · origine {m.id.slice(0, 8)}
                          </p>
                        </div>
                        {scrive && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => prepara(undefined, m)}
                          >
                            Valuta prodotto
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
              <p className="text-xs text-muted-foreground">
                Il collegamento alla SDS non valuta esposizione, compatibilità o
                misure di prevenzione e non aggiorna automaticamente i POS già
                salvati o emessi.
              </p>
            </>
          )}
        </div>
      )}
      {modulo && <ModuloProdotto {...modulo} onClose={() => setModulo(null)} />}
      {storico && (
        <StoricoProdotto {...storico} onClose={() => setStorico(null)} />
      )}
    </section>
  );
}
