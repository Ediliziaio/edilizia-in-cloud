import { useState, useRef, type ReactNode } from "react";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { it } from "date-fns/locale";
import { ArrowUpRight, FileText, ShieldCheck, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { euroSub } from "@/lib/subappaltatori/lavoriMisure";
import type {
  SALSubappaltatore,
  RitenutaGaranzia,
  StatoSALSub,
} from "@/types/subappaltatori";

const pagatoSal = (s: SALSubappaltatore) => Number(s.pagato_registrato ?? (s.stato === 'pagato' ? s.importo_netto : 0));
const residuoSal = (s: SALSubappaltatore) => Math.max(0,Number(s.importo_netto)-pagatoSal(s));
const statiSAL: Record<StatoSALSub, string> = {
  ricevuto: "Ricevuto",
  verificato: "Verificato",
  pagato: "Pagato",
  contestato: "Contestato",
};
const statiRitenuta = {
  trattenuta: "Trattenuta",
  svincolata: "Svincolata",
  persa: "Persa",
  annullata: "Annullata",
};
const data = (valore: string | null) =>
  valore
    ? format(parseISO(valore), "dd MMM yyyy", { locale: it })
    : "Da indicare";

function Stato({ stato, children }: { stato: string; children: ReactNode }) {
  return (
    <Badge
      variant="outline"
      className={`shrink-0 ${stato === "pagato" || stato === "svincolata" ? "border-green-200 bg-green-50 text-green-800" : stato === "contestato" || stato === "persa" ? "border-red-200 bg-red-50 text-red-800" : "bg-muted/50"}`}
    >
      {children}
    </Badge>
  );
}

function Importo({
  titolo,
  valore,
  nota,
}: {
  titolo: string;
  valore: number;
  nota?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border bg-background p-3">
      <p className="text-xs text-muted-foreground">{titolo}</p>
      <p className="mt-1 break-words text-lg font-semibold tabular-nums">
        {euroSub(valore)}
      </p>
      {nota && <p className="mt-1 text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}

function Filtri({
  ricerca,
  onRicerca,
  stato,
  onStato,
  stati,
}: {
  ricerca: string;
  onRicerca: (v: string) => void;
  stato: string;
  onStato: (v: string) => void;
  stati: Record<string, string>;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-background p-3 sm:flex-row">
      <div className="relative min-w-0 flex-1">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          aria-label="Cerca nella contabilità"
          placeholder="Cerca numero, data o note…"
          className="pl-9"
          value={ricerca}
          onChange={(e) => onRicerca(e.target.value)}
        />
      </div>
      <select
        aria-label="Filtra per stato"
        className="h-10 rounded-md border bg-background px-3 text-sm"
        value={stato}
        onChange={(e) => onStato(e.target.value)}
      >
        <option value="tutti">Tutti gli stati</option>
        {Object.entries(stati).map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

function NessunRisultato({ onReset }: { onReset: () => void }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <p className="text-sm text-muted-foreground">
        Nessun risultato con questi filtri.
      </p>
      <Button variant="link" onClick={onReset}>
        Reimposta filtri
      </Button>
    </div>
  );
}

export function SALContabilita({
  sal,
  contratto,
  canWrite,
  approvazioneInCorso,
  onVerbale,
  onApprova,
  onContesta,
  onPagamento,
}: {
  sal: SALSubappaltatore[];
  contratto: string;
  canWrite: boolean;
  approvazioneInCorso: boolean;
  onVerbale: (sal: SALSubappaltatore) => void;
  onApprova: (id: string) => void;
  onContesta: (id: string) => void;
  onPagamento: (sal: SALSubappaltatore) => void;
}) {
  const [selezionato, setSelezionato] = useState<string | null>(null);
  const apertura = useRef<HTMLButtonElement | null>(null);
  const [ricerca, setRicerca] = useState("");
  const [stato, setStato] = useState("tutti");
  const corrente = sal.find((s) => s.id === selezionato);
  const validi = sal.filter((s) => s.stato !== "contestato");
  const somma = (
    righe: SALSubappaltatore[],
    campo: "importo_lordo" | "ritenuta_importo" | "importo_netto",
  ) => righe.reduce((acc, r) => acc + Number(r[campo] || 0), 0);
  const filtrati = sal
    .filter(
      (s) =>
        (stato === "tutti" || s.stato === stato) &&
        `${s.numero_sal} ${s.data_emissione} ${data(s.data_emissione)} ${s.note ?? ""}`
          .toLowerCase()
          .includes(ricerca.trim().toLowerCase()),
    )
    .sort(
      (a, b) =>
        b.data_emissione.localeCompare(a.data_emissione) ||
        b.numero_sal - a.numero_sal,
    );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Importo
          titolo="Lordo SAL"
          valore={somma(validi, "importo_lordo")}
          nota="Esclusi i contestati"
        />
        <Importo
          titolo="Ritenute nei SAL"
          valore={somma(validi, "ritenuta_importo")}
          nota="Da confrontare con il registro"
        />
        <Importo
          titolo="Netto SAL non pagati"
          valore={validi.reduce((sum,s)=>sum+residuoSal(s),0)}
          nota="Non attesta l’esigibilità"
        />
        <Importo
          titolo="Netto SAL pagati"
          valore={validi.reduce((sum,s)=>sum+pagatoSal(s),0)}
          nota="Pagamenti registrati"
        />
      </div>
      <Filtri
        ricerca={ricerca}
        onRicerca={setRicerca}
        stato={stato}
        onStato={setStato}
        stati={statiSAL}
      />
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {filtrati.length} di {sal.length} SAL
        </span>
        <span>Seleziona un SAL per dettagli e operazioni</span>
      </div>
      {filtrati.length === 0 ? (
        <NessunRisultato
          onReset={() => {
            setRicerca("");
            setStato("tutti");
          }}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtrati.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Apri SAL ${s.numero_sal}`}
              onClick={(event) => {
                apertura.current = event.currentTarget;
                setSelezionato(s.id);
              }}
              className="rounded-xl border bg-background p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">SAL #{s.numero_sal}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {data(s.data_emissione)}
                  </p>
                </div>
                <Stato stato={s.stato}>{statiSAL[s.stato]}</Stato>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t pt-3">
                <div>
                  <p className="text-xs text-muted-foreground">Lordo</p>
                  <p className="mt-1 text-sm tabular-nums">
                    {euroSub(Number(s.importo_lordo))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Ritenuta {s.ritenuta_pct}%
                  </p>
                  <p className="mt-1 text-sm tabular-nums">
                    {euroSub(Number(s.ritenuta_importo))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Netto</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums">
                    {euroSub(Number(s.importo_netto))}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {s.stato === "pagato"
                    ? `Pagato · ${data(s.data_pagamento)}`
                    : s.stato === "ricevuto"
                      ? "In attesa di verifica"
                      : s.stato === "contestato"
                        ? "Verifica la contestazione"
                        : pagatoSal(s)>0 ? `Parziale · residuo ${euroSub(residuoSal(s))}` : "Verificato · pagamento non registrato"}
                </span>
                <ArrowUpRight className="h-4 w-4 shrink-0" />
              </div>
            </button>
          ))}
        </div>
      )}
      <Dialog
        open={!!corrente}
        onOpenChange={(open) => {
          if (!open) setSelezionato(null);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            apertura.current?.focus();
          }}
          className="flex max-h-[90dvh] max-w-2xl flex-col gap-0 overflow-hidden p-0"
        >
          <DialogHeader className="border-b p-5 pr-12">
            <DialogTitle>SAL #{corrente?.numero_sal}</DialogTitle>
            <DialogDescription>
              {contratto} · {corrente && data(corrente.data_emissione)}
            </DialogDescription>
          </DialogHeader>
          {corrente && (
            <>
              <div className="space-y-5 overflow-y-auto p-5">
                <Stato stato={corrente.stato}>{statiSAL[corrente.stato]}</Stato>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Importo
                    titolo="Lordo"
                    valore={Number(corrente.importo_lordo)}
                  />
                  <Importo
                    titolo={`Ritenuta di garanzia (${corrente.ritenuta_pct}%)`}
                    valore={Number(corrente.ritenuta_importo)}
                  />
                  <Importo
                    titolo="Netto SAL"
                    valore={Number(corrente.importo_netto)}
                  />
                </div>
                {pagatoSal(corrente)>0 && corrente.stato!=="pagato" && <p className="rounded-lg border bg-blue-50 p-3 text-sm">Pagato {euroSub(pagatoSal(corrente))} · Residuo {euroSub(residuoSal(corrente))}</p>}
                {corrente.stato === "pagato" ? (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
                    <p className="font-medium">
                      Pagamento registrato · {data(corrente.data_pagamento)}
                    </p>
                    <dl className="mt-3 space-y-2">
                      <div>
                        <dt className="text-xs">Modalità</dt>
                        <dd>
                          {corrente.payment_method?.replaceAll("_", " ") ||
                            "Non indicata"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs">Riferimento</dt>
                        <dd className="break-words">
                          {corrente.payment_reference || "Non indicato"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ) : (
                  <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                    {corrente.stato === "contestato"
                      ? "SAL contestato: escluso dai totali del maturato e del netto non pagato."
                      : "Il netto SAL è distinto da fatture, esigibilità e pagamento. Registra soltanto pagamenti già eseguiti."}
                  </p>
                )}
                {corrente.note && (
                  <section>
                    <h3 className="text-sm font-medium">Note</h3>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {corrente.note}
                    </p>
                  </section>
                )}
              </div>
              <DialogFooter className="flex-wrap gap-2 border-t bg-background p-4 sm:justify-between">
                <Button variant="outline" onClick={() => setSelezionato(null)}>
                  Torna ai SAL
                </Button>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => onVerbale(corrente)}>
                    <FileText className="mr-2 h-4 w-4" />
                    Verbale e allegati
                  </Button>
                  {canWrite && corrente.stato === "ricevuto" && (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => onContesta(corrente.id)}
                      >
                        Contesta
                      </Button>
                      <Button
                        disabled={approvazioneInCorso}
                        onClick={() => onApprova(corrente.id)}
                      >
                        {approvazioneInCorso ? "Verifica…" : "Approva SAL"}
                      </Button>
                    </>
                  )}
                  {canWrite && corrente.stato === "verificato" && (
                    <Button onClick={() => onPagamento(corrente)}>
                      Registra pagamento
                    </Button>
                  )}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function RitenuteContabilita({
  ritenute,
  sal,
  contratto,
  canRelease,
  onSvincola,
  onVerbale,
}: {
  ritenute: RitenutaGaranzia[];
  sal: SALSubappaltatore[];
  contratto: string;
  canRelease: boolean;
  onSvincola: (id: string) => void;
  onVerbale: (sal: SALSubappaltatore) => void;
}) {
  const [selezionato, setSelezionato] = useState<string | null>(null);
  const apertura = useRef<HTMLButtonElement | null>(null);
  const [ricerca, setRicerca] = useState("");
  const [stato, setStato] = useState("tutti");
  const corrente = ritenute.find((r) => r.id === selezionato);
  const salCollegato = corrente && sal.find((s) => s.id === corrente.sal_id);
  const trattenute = ritenute.filter((r) => r.stato === "trattenuta");
  const imminenti = trattenute.filter(
    (r) =>
      r.data_svincolo_prevista &&
      differenceInCalendarDays(
        parseISO(r.data_svincolo_prevista),
        new Date(),
      ) <= 30,
  );
  const filtrate = ritenute.filter(
    (r) =>
      (stato === "tutti" || r.stato === stato) &&
      `${sal.find((s) => s.id === r.sal_id)?.numero_sal ?? ""} ${r.data_svincolo_prevista ?? ""} ${r.note ?? ""} ${euroSub(Number(r.importo))}`
        .toLowerCase()
        .includes(ricerca.trim().toLowerCase()),
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Importo
          titolo="Registro: trattenute"
          valore={trattenute.reduce((a, r) => a + Number(r.importo), 0)}
          nota={`${trattenute.length} registrazioni`}
        />
        <Importo
          titolo="Registro: svincolate"
          valore={ritenute
            .filter((r) => r.stato === "svincolata")
            .reduce((a, r) => a + Number(r.importo), 0)}
          nota="Lo svincolo non è un pagamento"
        />
        <div className="rounded-lg border bg-background p-3">
          <p className="text-xs text-muted-foreground">
            Date previste da verificare
          </p>
          <p className="mt-1 text-lg font-semibold">{imminenti.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Entro 30 giorni o già trascorse · nessun automatismo
          </p>
        </div>
      </div>
      <Filtri
        ricerca={ricerca}
        onRicerca={setRicerca}
        stato={stato}
        onStato={setStato}
        stati={statiRitenuta}
      />
      <p className="text-xs text-muted-foreground">
        {filtrate.length} di {ritenute.length} registrazioni · seleziona una
        ritenuta per i dettagli
      </p>
      {filtrate.length === 0 ? (
        <NessunRisultato
          onReset={() => {
            setRicerca("");
            setStato("tutti");
          }}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtrate.map((r) => {
            const collegato = sal.find((s) => s.id === r.sal_id);
            const scaduta =
              r.stato === "trattenuta" &&
              r.data_svincolo_prevista &&
              differenceInCalendarDays(
                parseISO(r.data_svincolo_prevista),
                new Date(),
              ) < 0;
            return (
              <button
                type="button"
                key={r.id}
                aria-label={`Apri ritenuta ${collegato ? `SAL ${collegato.numero_sal}` : euroSub(Number(r.importo))}`}
                onClick={(event) => {
                  apertura.current = event.currentTarget;
                  setSelezionato(r.id);
                }}
                className="rounded-xl border bg-background p-4 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-lg font-semibold tabular-nums">
                    {euroSub(Number(r.importo))}
                  </p>
                  <Stato stato={r.stato}>{statiRitenuta[r.stato]}</Stato>
                </div>
                <p className="mt-2 text-sm">
                  {collegato
                    ? `SAL #${collegato.numero_sal} · ${data(collegato.data_emissione)}`
                    : "SAL di origine non disponibile"}
                </p>
                <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3 text-xs">
                  <span
                    className={
                      scaduta ? "text-amber-800" : "text-muted-foreground"
                    }
                  >
                    {r.stato === "svincolata"
                      ? `Svincolata · ${data(r.data_svincolo_effettiva)}`
                      : `Data prevista · ${data(r.data_svincolo_prevista)}${scaduta ? " · da verificare" : ""}`}
                  </span>
                  <ArrowUpRight className="h-4 w-4 shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
      )}
      <Dialog
        open={!!corrente}
        onOpenChange={(open) => {
          if (!open) setSelezionato(null);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            apertura.current?.focus();
          }}
          className="flex max-h-[90dvh] max-w-xl flex-col gap-0 overflow-hidden p-0"
        >
          <DialogHeader className="border-b p-5 pr-12">
            <DialogTitle>Ritenuta di garanzia</DialogTitle>
            <DialogDescription>
              {contratto}
              {salCollegato ? ` · SAL #${salCollegato.numero_sal}` : ""}
            </DialogDescription>
          </DialogHeader>
          {corrente && (
            <>
              <div className="space-y-4 overflow-y-auto p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-2xl font-semibold tabular-nums">
                    {euroSub(Number(corrente.importo))}
                  </p>
                  <Stato stato={corrente.stato}>
                    {statiRitenuta[corrente.stato]}
                  </Stato>
                </div>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Data di svincolo prevista
                    </dt>
                    <dd className="mt-1 text-sm">
                      {data(corrente.data_svincolo_prevista)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Data di svincolo effettiva
                    </dt>
                    <dd className="mt-1 text-sm">
                      {data(corrente.data_svincolo_effettiva)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Registrata il
                    </dt>
                    <dd className="mt-1 text-sm">
                      {data(corrente.created_at)}
                    </dd>
                  </div>
                </dl>
                {corrente.note && (
                  <section>
                    <h3 className="text-sm font-medium">Note e riferimenti</h3>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {corrente.note}
                    </p>
                  </section>
                )}
                <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                  Lo svincolo richiede la verifica dei presupposti e un
                  riferimento documentale. La data prevista non autorizza lo
                  svincolo e non registra un pagamento.
                </p>
              </div>
              <DialogFooter className="flex-wrap gap-2 border-t p-4 sm:justify-between">
                <Button variant="outline" onClick={() => setSelezionato(null)}>
                  Torna alle ritenute
                </Button>
                <div className="flex flex-wrap gap-2">
                  {salCollegato && (
                    <Button
                      variant="outline"
                      onClick={() => onVerbale(salCollegato)}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Verbale SAL
                    </Button>
                  )}
                  {canRelease && corrente.stato === "trattenuta" && (
                    <Button onClick={() => onSvincola(corrente.id)}>
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      Gestisci svincolo
                    </Button>
                  )}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
