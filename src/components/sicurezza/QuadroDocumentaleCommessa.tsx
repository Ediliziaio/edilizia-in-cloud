import { type ReactNode, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  riepilogoQuadro,
  type RigaQuadroDocumentale,
  STATI_QUADRO,
} from "@/lib/sicurezza/quadroDocumentale";
const dataIt = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split("-").reverse().join("/") : s;
export function QuadroDocumentaleCommessa({
  righe,
  caricamento,
  parziale,
  imprese,
  persone,
  fasi,
  azione,
  onFascicolo,
  filtroIniziale = "tutti",
}: {
  righe: RigaQuadroDocumentale[];
  caricamento: boolean;
  parziale: boolean;
  imprese: Record<string, string>;
  persone: Record<string, string>;
  fasi: Record<string, string>;
  azione: (r: RigaQuadroDocumentale) => ReactNode;
  onFascicolo: () => void;
  filtroIniziale?: "tutti" | "registrati";
}) {
  const [cerca, setCerca] = useState("");
  const [filtro, setFiltro] = useState<string>(filtroIniziale);
  const [titolare, setTitolare] = useState("tutti");
  const [pagina, setPagina] = useState(0);
  const conta = riepilogoQuadro(righe);
  const titolareRiga = (r: RigaQuadroDocumentale) =>
    [
      r.personaId ? persone[r.personaId] || "Addetto esterno collegato" : null,
      r.subId
        ? imprese[r.subId] || "Impresa collegata"
        : !r.personaId
          ? "Cantiere / propria impresa"
          : null,
    ]
      .filter(Boolean)
      .join(" · ");
  const filtrate = righe.filter(
    (r) =>
      (filtro === "tutti" ||
        (filtro === "registrati" && r.origine === "fascicolo") ||
        (filtro === "archivio" && r.origine === "archivio") ||
        (filtro === "ricevere" && r.stato === "da_ricevere") ||
        (filtro === "verificare" &&
          ["da_verificare", "integrazione"].includes(r.stato)) ||
        (filtro === "scadenze" &&
          ["scaduto", "in_scadenza"].includes(r.stato))) &&
      (titolare === "tutti" ||
        (titolare === "propria" && !r.subId) ||
        r.subId === titolare) &&
      `${r.titolo} ${r.tipo} ${titolareRiga(r)} ${r.referente || ""}`
        .toLocaleLowerCase("it")
        .includes(cerca.trim().toLocaleLowerCase("it")),
  );
  const ultima = Math.max(0, Math.ceil(filtrate.length / 20) - 1);
  const attuale = Math.min(pagina, ultima);
  const visibili = filtrate.slice(attuale * 20, (attuale + 1) * 20);
  const voci = [
    { id: "registrati", titolo: "Requisiti registrati", n: conta.registrati },
    { id: "ricevere", titolo: "Da ricevere", n: conta.daRicevere },
    {
      id: "verificare",
      titolo: "Verifiche / integrazioni",
      n: conta.daVerificare,
    },
    { id: "scadenze", titolo: "Scadenze da gestire", n: conta.scadenze },
    { id: "archivio", titolo: "Archivio da riconciliare", n: conta.archivio },
  ];
  return (
    <Card id="quadro-documentale">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            Quadro documentale della commessa
          </CardTitle>
          <Button size="sm" variant="outline" onClick={onFascicolo}>
            Gestisci fascicolo
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Documenti e richieste già registrati per i soggetti, la fase e la data
          selezionati. Il quadro non rappresenta tutti gli obblighi del cantiere
          e non attesta idoneità, firme o autorizzazioni.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {parziale && (
          <p
            role="alert"
            className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          >
            Fonti parziali o non disponibili: i conteggi non confermano la
            completezza. Consulta gli avvisi e riprova il caricamento della
            fonte.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {voci.map((v) => (
            <button
              key={v.id}
              type="button"
              disabled={caricamento}
              aria-pressed={filtro === v.id}
              className={`rounded-lg border p-3 text-left ${
                filtro === v.id
                  ? "border-primary bg-primary/5"
                  : "bg-slate-50/60 hover:bg-slate-100"
              }`}
              onClick={() => {
                setFiltro(filtro === v.id ? "tutti" : v.id);
                setPagina(0);
              }}
            >
              <span className="block text-xs text-muted-foreground">
                {v.titolo}
              </span>
              <strong className="mt-1 block text-xl">
                {caricamento ? "…" : parziale ? "—" : v.n}
              </strong>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={filtro === "tutti" ? "default" : "outline"}
            onClick={() => {
              setFiltro("tutti");
              setPagina(0);
            }}
          >
            Tutti i record
          </Button>
          <Input
            className="min-w-48 flex-1"
            aria-label="Cerca nel quadro documentale"
            placeholder="Documento, impresa, persona o referente…"
            value={cerca}
            onChange={(e) => {
              setCerca(e.target.value);
              setPagina(0);
            }}
          />
          <select
            aria-label="Titolare nel quadro documentale"
            className="h-10 max-w-full rounded-md border bg-background px-2 text-sm"
            value={titolare}
            onChange={(e) => {
              setTitolare(e.target.value);
              setPagina(0);
            }}
          >
            <option value="tutti">Tutti i titolari</option>
            <option value="propria">Cantiere / propria impresa</option>
            {Object.entries(imprese).map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </select>
        </div>
        {caricamento ? (
          <p role="status" className="py-4 text-sm">
            Lettura delle fonti documentali…
          </p>
        ) : !righe.length ? (
          <div className="rounded-lg border border-dashed p-4 text-sm">
            <p>Nessun requisito o documento disponibile in questo contesto.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Definisci l’applicabilità con il responsabile competente e
              registra le richieste nel fascicolo. Un quadro vuoto non indica
              che il cantiere sia completo.
            </p>
          </div>
        ) : !filtrate.length ? (
          <p className="py-4 text-sm text-muted-foreground">
            Nessun record con questi filtri.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Documenti e richieste nel contesto della commessa
              </caption>
              <thead className="bg-slate-50 text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">Documento / titolare</th>
                  <th className="p-3">Stato / fonte</th>
                  <th className="p-3">Fase / periodo / scadenza</th>
                  <th className="p-3 text-right">Prossima azione</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibili.map((r) => (
                  <tr key={r.chiave}>
                    <td className="p-3 align-top">
                      <p className="font-medium">{r.titolo}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {titolareRiga(r)}
                      </p>
                      {r.referente && (
                        <p className="text-xs text-muted-foreground">
                          Referente: {r.referente}
                        </p>
                      )}
                    </td>
                    <td className="p-3 align-top">
                      <Badge
                        variant="outline"
                        className={
                          ["scaduto", "integrazione"].includes(r.stato)
                            ? "border-amber-300 text-amber-900"
                            : ""
                        }
                      >
                        {STATI_QUADRO[r.stato]}
                      </Badge>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.origine === "fascicolo"
                          ? "Fascicolo e richieste"
                          : "Archivio precedente"}
                      </p>
                      {r.origineDaChiarire && (
                        <p className="mt-1 text-xs text-amber-800">
                          Origine / applicabilità da verificare
                        </p>
                      )}
                      {r.origine === "archivio" && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          La presenza del file non documenta una verifica nel
                          fascicolo.
                        </p>
                      )}
                    </td>
                    <td className="p-3 align-top text-xs text-muted-foreground">
                      <p>
                        {r.faseId
                          ? fasi[r.faseId] || "Fase collegata"
                          : r.origine === "archivio"
                            ? "Fase / periodo da verificare"
                            : "Non limitato a una fase"}
                      </p>
                      {(r.dal || r.al) && (
                        <p>
                          Applicabilità:{" "}
                          {r.dal ? dataIt(r.dal) : "inizio non delimitato"} –{" "}
                          {r.al ? dataIt(r.al) : "fine non delimitata"}
                        </p>
                      )}
                      {r.scadenza && (
                        <p>Scadenza documento: {dataIt(r.scadenza)}</p>
                      )}
                      {r.termine && (
                        <p>Termine richiesta: {dataIt(r.termine)}</p>
                      )}
                      {!r.haFile && r.stato !== "non_applicabile" && (
                        <p>Originale da acquisire</p>
                      )}
                    </td>
                    <td className="p-3 text-right align-top">{azione(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!caricamento && filtrate.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {attuale * 20 + 1}–{Math.min((attuale + 1) * 20, filtrate.length)}{" "}
              di {filtrate.length} record con i filtri attuali
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={attuale === 0}
                onClick={() => setPagina(attuale - 1)}
              >
                Precedenti
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={attuale === ultima}
                onClick={() => setPagina(attuale + 1)}
              >
                Successivi
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
