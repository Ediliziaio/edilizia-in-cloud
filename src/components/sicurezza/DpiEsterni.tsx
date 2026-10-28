import { useState } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useDpiEsterni,
  leggiDpiEsterni,
  useSalvaDpiEsterni,
  useStoricoDpiEsterni,
  apriVerbaleDpiEsterno,
  type AmbitoDpiEsterni,
  type ConsegnaDpiEsterno,
} from "@/hooks/useDpiEsterni";
import {
  TIPI_DPI,
  ETICHETTE_CONSEGNA,
  statoConsegnaDpi,
  type AddettoDpi,
  type ConsegnaDpi,
  type VerbaleDpi,
} from "@/lib/sicurezza/dpiCommessa";
import {
  ModuloConsegnaDpi,
  StoricoDpiDialogBase,
  type ContestoGestioneDpi,
} from "./GestioneDpiDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
function ModificaDpiEsterno({
  ambito,
  contesto,
  addettoId,
  consegna,
  evidenze,
  onClose,
}: {
  ambito: AmbitoDpiEsterni;
  contesto: ContestoGestioneDpi;
  addettoId?: string;
  consegna?: ConsegnaDpi;
  evidenze: VerbaleDpi[];
  onClose: () => void;
}) {
  const [b] = useState(() => structuredClone(ambito));
  const salva = useSalvaDpiEsterni(b);
  return (
    <ModuloConsegnaDpi
      contesto={contesto}
      addettoId={addettoId}
      consegna={consegna}
      salva={salva}
      esterno={{
        subId: b.subId,
        evidenze,
        rileggi: async () => (await leggiDpiEsterni(b)).evidenze,
      }}
      onClose={onClose}
    />
  );
}
function StoricoDpiEsterno({
  ambito,
  addetto,
  consegna,
  onClose,
}: {
  ambito: AmbitoDpiEsterni;
  addetto: AddettoDpi;
  consegna: ConsegnaDpi;
  onClose: () => void;
}) {
  const q = useStoricoDpiEsterni(
    ambito.companyId,
    ambito.subId,
    addetto.id,
    consegna.id,
  );
  return (
    <StoricoDpiDialogBase
      addetto={addetto}
      consegna={consegna}
      q={q}
      onClose={onClose}
    />
  );
}
const dataIt = (d: string | null) =>
  d ? d.split("-").reverse().join("/") : "non indicata";
export function DpiEsterni({
  ambito,
  apertoIniziale = false,
  contestoNonDisponibile = false,
}: {
  ambito: AmbitoDpiEsterni;
  apertoIniziale?: boolean;
  contestoNonDisponibile?: boolean;
}) {
  const [aperto, setAperto] = useState(apertoIniziale);
  const p = usePermissions();
  const q = useDpiEsterni(ambito, aperto && !contestoNonDisponibile);
  const [modifica, setModifica] = useState<{
    ambito: AmbitoDpiEsterni;
    contesto: ContestoGestioneDpi;
    addettoId?: string;
    consegna?: ConsegnaDpi;
    evidenze: VerbaleDpi[];
  } | null>(null);
  const [storico, setStorico] = useState<{
    addetto: AddettoDpi;
    consegna: ConsegnaDpi;
  } | null>(null);
  if (!p.canViewSicurezzaCantiere) return null;
  const r = q.data;
  const scrive = !p.solaLettura && !q.isError && !contestoNonDisponibile;
  const prepara = (a?: AddettoDpi, d?: ConsegnaDpi) => {
    if (!r) return;
    setModifica({
      ambito: structuredClone(ambito),
      contesto: {
        companyId: ambito.companyId,
        orderId: ambito.orderId || "",
        data: r.data,
        faseId: r.fase_id || undefined,
        addetti: a ? [a] : r.addetti,
      },
      addettoId: a?.id,
      consegna: d,
      evidenze: r.evidenze,
    });
  };
  const consegne = r?.addetti.flatMap((a) => a.consegne) ?? [];
  return (
    <section className="mt-4 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-auto p-0 font-medium"
          aria-expanded={aperto}
          onClick={() => setAperto((v) => !v)}
        >
          Dotazioni DPI dell’impresa esterna {aperto ? "−" : "+"}
        </Button>
        {aperto && (
          <div className="flex flex-wrap gap-2">
            {scrive && (
              <Button
                size="sm"
                disabled={q.isFetching || !r?.addetti.some((a) => a.attivo)}
                onClick={() => prepara()}
              >
                Registra dotazione esterna
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={q.isFetching || contestoNonDisponibile}
              onClick={() => void q.refetch()}
            >
              Aggiorna dotazioni
            </Button>
          </div>
        )}
      </div>
      {aperto && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Registro degli operai di questa impresa, distinto dai tuoi
            dipendenti. Le consegne restano del titolare e vengono ritrovate
            nelle sue commesse pertinenti. I verbali sono collegamenti al
            fascicolo originale; non attestano automaticamente firma, consegna
            effettiva o adeguatezza.
          </p>
          {contestoNonDisponibile ? (
            <p role="alert" className="text-sm text-destructive">
              Contesto della fase non disponibile: attendi prima di consultare
              le dotazioni.
            </p>
          ) : q.isLoading ? (
            <p role="status">Caricamento delle dotazioni esterne…</p>
          ) : q.isError || !r ? (
            <p role="alert" className="text-sm text-destructive">
              Dotazioni non disponibili: non è possibile confermare completezza
              o assenza di registrazioni.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  {r.addetti.length} operai nel contesto
                </Badge>
                <Badge variant="outline">{consegne.length} registrazioni</Badge>
                <Badge variant="outline">
                  {
                    consegne.filter(
                      (d) =>
                        d.evidenza_id &&
                        (d.verbale_cambiato || d.verbale_pertinente !== true),
                    ).length
                  }{" "}
                  riferimenti da riesaminare
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Riferimento: {dataIt(r.data)}.{" "}
                {ambito.orderId
                  ? "Sono inclusi gli operai assegnati in questa data/fase."
                  : "Organico dell’impresa, incluse le registrazioni storiche."}{" "}
                Gli stati attuali non ricostruiscono il possesso passato dei
                DPI.
              </p>
              {!r.addetti.length ? (
                <p className="text-sm text-muted-foreground">
                  Nessun operaio nel contesto selezionato. Completa l’organico e
                  le assegnazioni dalla scheda impresa; non vengono creati
                  dipendenti interni.
                </p>
              ) : (
                r.addetti.map((a) => (
                  <details key={a.id} className="rounded border p-3">
                    <summary className="cursor-pointer text-sm font-medium">
                      {a.nome} {a.cognome} ·{" "}
                      {a.qualifica || "Mansione da indicare"} ·{" "}
                      {a.consegne.length} consegne · rif. {a.id.slice(0, 8)}
                      {!a.attivo ? " · cessato nell’organico" : ""}
                    </summary>
                    {!a.consegne.length ? (
                      <p className="mt-2 text-sm text-amber-800">
                        Nessuna dotazione registrata per questo operaio.
                      </p>
                    ) : (
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b">
                              <th className="p-2">DPI</th>
                              <th className="p-2">Date e stato</th>
                              <th className="p-2">Verbale nel fascicolo</th>
                              <th className="p-2">Azioni</th>
                            </tr>
                          </thead>
                          <tbody>
                            {a.consegne.map((d) => (
                              <tr key={d.id} className="border-b">
                                <td className="p-2">
                                  {TIPI_DPI[d.tipo] || d.tipo}
                                  <p>
                                    {[d.marca, d.taglia, d.matricola]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </p>
                                </td>
                                <td className="p-2">
                                  Consegna {dataIt(d.consegnato_il)}
                                  <p>Scadenza {dataIt(d.scade_il)}</p>
                                  {d.restituito_il && (
                                    <p>Reso {dataIt(d.restituito_il)}</p>
                                  )}
                                  <p>
                                    {
                                      ETICHETTE_CONSEGNA[
                                        statoConsegnaDpi(d, r.data)
                                      ]
                                    }
                                  </p>
                                </td>
                                <td className="p-2">
                                  <RiferimentoVerbale
                                    d={d}
                                    onApri={(v) =>
                                      void apriVerbaleDpiEsterno(
                                        ambito,
                                        a.id,
                                        v,
                                      ).catch((e) =>
                                        toast.error(
                                          e instanceof Error
                                            ? e.message
                                            : "Verbale non disponibile",
                                        ),
                                      )
                                    }
                                  />
                                </td>
                                <td className="p-2">
                                  <div className="flex flex-wrap gap-1">
                                    {scrive && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={q.isFetching || !d.versione}
                                        onClick={() => prepara(a, d)}
                                      >
                                        Rettifica dotazione
                                      </Button>
                                    )}
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() =>
                                        setStorico({ addetto: a, consegna: d })
                                      }
                                    >
                                      Storico dotazione
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
            </>
          )}
        </div>
      )}
      {modifica && (
        <ModificaDpiEsterno {...modifica} onClose={() => setModifica(null)} />
      )}
      {storico && (
        <StoricoDpiEsterno
          ambito={ambito}
          {...storico}
          onClose={() => setStorico(null)}
        />
      )}
    </section>
  );
}
function RiferimentoVerbale({
  d,
  onApri,
}: {
  d: ConsegnaDpiEsterno;
  onApri: (v: VerbaleDpi) => void;
}) {
  if (!d.evidenza_id) return <span>Nessun verbale collegato</span>;
  return (
    <div className="space-y-1">
      {d.verbale_cambiato && (
        <p className="text-amber-800">
          Verbale modificato: collegamento da riesaminare.
        </p>
      )}
      {d.verbale_pertinente !== true ? (
        <p className="text-amber-800">
          Verbale non disponibile o non pertinente a questo contesto.
        </p>
      ) : (
        d.verbale_corrente && (
          <>
            <p>{d.verbale_corrente.titolo}</p>
            <p>
              Stato documentale: {d.verbale_corrente.stato}
              {d.verbale_corrente.data_scadenza
                ? ` · scadenza ${dataIt(d.verbale_corrente.data_scadenza)}`
                : ""}
            </p>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => onApri(d.verbale_corrente!)}
            >
              Apri verbale corrente
            </Button>
          </>
        )
      )}
    </div>
  );
}
