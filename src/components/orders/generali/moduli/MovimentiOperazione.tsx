/**
 * «Tutta l'operazione» nella scheda Cantiere della commessa generale (lotto B, 14/11/2026).
 *
 * Elenchi unici di rapportini, ordini, DDT e costi registrati sulla generale e sulle sue
 * figlie, con la colonna «Commessa». Sola lettura: il codice della commessa porta sulla
 * commessa, dove si registra e si modifica come sempre.
 */
import { BookOpen, Building2, ClipboardList, Clock, ListTree, PackageCheck, ReceiptText, Truck } from "lucide-react";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/formatters";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { LIMITE_MOVIMENTI, useMovimentiOperazione, type VistaOperazione } from "@/hooks/useMovimentiOperazione";
import { DDTStatusBadge, DDT_STATO_META } from "@/components/ddt/DDTStatusBadge";
import type { DDTStato } from "@/hooks/useDDTRicezione";
import { dataBreve } from "../piano/formato";
import { CronoprogrammaOperazione } from "./CronoprogrammaOperazione";
import { DaSeguireOperazione } from "./DaSeguireOperazione";
import { cn } from "@/lib/utils";
import { faseCompletata } from "@/lib/orders/schedaCommessa";

const ora = (t: string | null) => (t ? new Date(t).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

/** 31/12/9999 è la convenzione per «pagamento non noto»: non è una data da mostrare. */
const ignoto = (d: string | null) => !!d && d.startsWith("9999");
const dataVera = (d: string | null) => (d && !ignoto(d) ? d : null);

const parola = (s: string | null) => (s ? (s.charAt(0).toUpperCase() + s.slice(1)).replace(/_/g, " ") : "—");
const nomePersona = (a: { first_name: string | null; last_name: string | null } | null) =>
  a ? [a.first_name, a.last_name].filter(Boolean).join(" ") || "—" : "—";

export function MovimentiOperazione({
  riepilogo,
  vista,
  onApri,
  commessaId,
  onApriRapportini,
}: {
  riepilogo: RiepilogoGenerale;
  vista: VistaOperazione;
  /** Porta la scheda su quella commessa (generale o figlia). */
  onApri: (orderId: string, faseId?: string) => void;
  commessaId?: string;
  onApriRapportini: (orderId: string) => void;
}) {
  const g = riepilogo.generale;
  const { data, isLoading, isError, refetch } = useMovimentiOperazione(riepilogo, vista, commessaId);
  const commesse = new Map<string, { codice: string | null; nome: string | null; generale: boolean }>([
    [g.id, { codice: g.codice, nome: g.nome, generale: true }],
    ...riepilogo.figlie.map((f) => [f.id, { codice: f.codice, nome: f.nome, generale: false }] as const),
  ]);
  const Commessa = ({ id }: { id: string }) => {
    const c = commesse.get(id);
    return (
      <button type="button" onClick={() => onApri(id)} className="flex min-w-0 flex-col items-start text-left hover:underline" title="Apri il cantiere di questa commessa">
        <span className="flex items-center gap-1.5 whitespace-nowrap font-mono text-xs">
          {c?.codice ?? "—"}
          {c?.generale && <span className="rounded bg-sky-50 px-1 text-[10px] font-medium text-sky-800">Generale</span>}
        </span>
        {!c?.generale && <span className="max-w-[12rem] truncate text-xs text-muted-foreground">{c?.nome}</span>}
      </button>
    );
  };

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError || !data)
    return (
      <div role="status" className="rounded-lg border p-6 text-sm">
        Movimenti dell'operazione non disponibili.{" "}
        <button type="button" className="font-medium underline" onClick={() => void refetch()}>
          Riprova
        </button>
      </div>
    );

  if (vista === "da-seguire") return <DaSeguireOperazione dati={data} commesse={commesse} apriFase={onApri} apriRapportini={onApriRapportini} />;
  if (vista === "cronoprogramma") return <CronoprogrammaOperazione riepilogo={riepilogo} fasi={data.fasi}
    rapportini={data.rapportiniCronoprogramma} onApri={onApri} />;

  const fornitore = (id: string | null) => (id ? data.fornitori[id] || "—" : "—");
  const quante = (n: number, una: string, tante: string) => `${n.toLocaleString("it-IT")} ${n === 1 ? una : tante}`;
  const v = vista;

  return (
    <section aria-label="Movimenti di tutta l'operazione" className="space-y-4">
      {data.troncati.length > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Mostro i più recenti: {data.troncati.join(", ")} oltre {LIMITE_MOVIMENTI}. Per l'elenco completo scegli una commessa.
        </p>
      )}

      {v === "rapportini" && (
        <Riquadro
          icona={ClipboardList}
          titolo="Rapportini"
          sintesi={`${quante(data.rapportini.length, "rapportino", "rapportini")} · ${data.rapportini.reduce((s, x) => s + (x.ore_lavorate ?? 0), 0).toLocaleString("it-IT", { maximumFractionDigits: 1 })} ore`}
          vuoto="Nessun rapportino sull'operazione."
          righe={data.rapportini.length}
        >
          <thead>
            <tr><Th>Data</Th><Th>Commessa</Th><Th>Chi</Th><Th className="text-right">Ore</Th><Th>Lavori</Th><Th>Stato</Th></tr>
          </thead>
          <tbody>
            {data.rapportini.map((x) => (
              <tr key={x.id} className="border-t">
                <Td className="whitespace-nowrap">{dataBreve(x.data_lavoro)}</Td>
                <Td><Commessa id={x.order_id} /></Td>
                <Td>{nomePersona(x.autore)}</Td>
                <Td className="text-right tabular-nums">{(x.ore_lavorate ?? 0).toLocaleString("it-IT", { maximumFractionDigits: 1 })}</Td>
                <Td className="max-w-[22rem] truncate" title={x.descrizione_lavori ?? undefined}>{x.descrizione_lavori || "—"}</Td>
                <Td>{x.approvato ? "Approvato" : parola(x.stato)}</Td>
              </tr>
            ))}
          </tbody>
        </Riquadro>
      )}

      {v === "rapportini" && (
        <Riquadro
          icona={BookOpen}
          titolo="Giornale dei lavori"
          sintesi={quante(data.giornale.length, "giornata", "giornate")}
          vuoto="Nessuna giornata nel giornale dei lavori."
          righe={data.giornale.length}
        >
          <thead>
            <tr><Th>Data</Th><Th>Commessa</Th><Th>Lavorazioni</Th><Th className="text-right">Persone</Th><Th>Stato</Th></tr>
          </thead>
          <tbody>
            {data.giornale.map((x) => (
              <tr key={x.id} className="border-t">
                <Td className="whitespace-nowrap">{dataBreve(x.data_lavori)}</Td>
                <Td><Commessa id={x.order_id} /></Td>
                <Td className="max-w-[26rem] truncate" title={x.lavorazioni_eseguite ?? undefined}>{x.lavorazioni_eseguite || "—"}</Td>
                <Td className="text-right tabular-nums">{x.personale_presente ?? "—"}</Td>
                <Td>{parola(x.stato)}</Td>
              </tr>
            ))}
          </tbody>
        </Riquadro>
      )}

      {v === "squadre" && (
        <>
          <Riquadro
            icona={Clock}
            titolo="Timbrature"
            sintesi={quante(data.timbrature.length, "timbratura", "timbrature")}
            vuoto="Nessuna timbratura sull'operazione."
            righe={data.timbrature.length}
          >
            <thead>
              <tr><Th>Quando</Th><Th>Commessa</Th><Th>Chi</Th><Th>Tipo</Th></tr>
            </thead>
            <tbody>
              {data.timbrature.map((x) => (
                <tr key={x.id} className="border-t">
                  <Td className="whitespace-nowrap">{ora(x.timestamp_evento)}</Td>
                  <Td><Commessa id={x.order_id} /></Td>
                  <Td>{nomePersona(x.persona)}</Td>
                  <Td>{parola(x.tipo)}</Td>
                </tr>
              ))}
            </tbody>
          </Riquadro>
          <Riquadro
            icona={Truck}
            titolo="Mezzi in cantiere"
            sintesi={`${quante(data.mezzi.filter((x) => x.usato !== false).length, "giornata", "giornate")} di lavoro`}
            vuoto="Nessuna giornata dei mezzi sull'operazione."
            righe={data.mezzi.length}
          >
            <thead>
              <tr><Th>Giorno</Th><Th>Commessa</Th><Th>Mezzo</Th><Th>Usato</Th><Th className="text-right">Contatore</Th></tr>
            </thead>
            <tbody>
              {data.mezzi.map((x) => (
                <tr key={x.id} className="border-t">
                  <Td className="whitespace-nowrap">{dataBreve(x.giorno)}</Td>
                  <Td><Commessa id={x.order_id} /></Td>
                  <Td>{[x.mezzo?.nome, x.mezzo?.targa].filter(Boolean).join(" · ") || "—"}</Td>
                  <Td>{x.usato === false ? "Fermo" : "Sì"}</Td>
                  <Td className="text-right tabular-nums">{x.contatore ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Riquadro>
          {riepilogo.permessi.costi && <Riquadro
            icona={Building2} titolo="Ditte e subappalti"
            sintesi={quante(data.subappalti.length, "contratto", "contratti")}
            vuoto="Nessun subappalto registrato." righe={data.subappalti.length}>
            <thead><tr><Th>Commessa</Th><Th>Ditta</Th><Th>Contratto</Th><Th>Lavori</Th><Th>Stato</Th></tr></thead>
            <tbody>
              {data.subappalti.map(x => <tr key={x.id} className="border-t">
                <Td><Commessa id={x.order_id} /></Td>
                <Td>{x.subappaltatori_sicurezza?.ragione_sociale ?? "—"}</Td>
                <Td>{x.numero_contratto ?? "—"}</Td>
                <Td className="max-w-xs truncate" title={x.descrizione_lavori ?? undefined}>{x.descrizione_lavori ?? "—"}</Td>
                <Td>{parola(x.stato)}</Td>
              </tr>)}
            </tbody>
          </Riquadro>}
        </>
      )}

      {v === "lavorazioni" && <Riquadro
        icona={ListTree} titolo="Fasi e avanzamento"
        sintesi={`${data.fasi.filter(faseCompletata).length} completate su ${data.fasi.length}`}
        vuoto="Nessuna fase registrata. Scegli una commessa per importare un computo o creare le fasi."
        righe={data.fasi.length}>
        <thead><tr><Th>Commessa</Th><Th>Fase</Th><Th>Stato</Th><Th>Avanzamento</Th><Th>Inizio previsto</Th><Th>Fine prevista</Th></tr></thead>
        <tbody>
          {data.fasi.map(fase => {
            const completata = faseCompletata(fase);
            const progresso = completata ? 100 : Math.max(0, Math.min(100, Number(fase.percentuale) || 0));
            return <tr key={fase.id} className="border-t">
              <Td><Commessa id={fase.order_id} /></Td>
              <Td><button type="button" className="text-left font-medium text-primary hover:underline"
                onClick={() => onApri(fase.order_id, fase.id)}>{fase.name}</button></Td>
              <Td>{completata ? "Completata" : parola(fase.status)}</Td>
              <Td><div className="flex items-center gap-2">
                <Progress className="h-1.5 w-20" aria-label={`Avanzamento ${fase.name}`} value={progresso}
                  indicatorClassName={cn("motion-reduce:transition-none", completata && "bg-emerald-600")} />
                <span className="tabular-nums">{progresso}%</span>
              </div></Td>
              <Td className="whitespace-nowrap">{dataBreve(fase.start_date)}</Td>
              <Td className="whitespace-nowrap">{dataBreve(fase.end_date)}</Td>
            </tr>;
          })}
        </tbody>
      </Riquadro>}

      {v === "acquisti" && (
          <Riquadro
            icona={PackageCheck}
            titolo="Ordini ai fornitori"
            sintesi={`${quante(data.ordini.length, "ordine", "ordini")}`}
            vuoto="Nessun ordine sull'operazione."
            righe={data.ordini.length}
          >
            <thead>
              <tr><Th>Data</Th><Th>Commessa</Th><Th>Numero</Th><Th>Fornitore</Th>{riepilogo.permessi.importi && <Th className="text-right">Totale</Th>}<Th>Stato</Th></tr>
            </thead>
            <tbody>
              {data.ordini.map((x) => (
                <tr key={x.id} className="border-t">
                  <Td className="whitespace-nowrap">{dataBreve(x.issue_date)}</Td>
                  <Td><Commessa id={x.order_id} /></Td>
                  <Td className="font-mono text-xs"><Link className="text-primary hover:underline"
                    to={`/azienda/ordini-acquisto/${x.id}`}>{x.oda_number ?? "Apri ordine"}</Link></Td>
                  <Td>{fornitore(x.supplier_id)}</Td>
                  {riepilogo.permessi.importi && <Td className="text-right tabular-nums">{x.total != null ? formatCurrency(x.total) : "—"}</Td>}
                  <Td>{parola(x.status)}</Td>
                </tr>
              ))}
            </tbody>
          </Riquadro>
      )}
      {v === "ddt" && (
          <Riquadro icona={PackageCheck} titolo="DDT ricevuti" sintesi={quante(data.ddt.length, "DDT", "DDT")} vuoto="Nessun DDT sull'operazione." righe={data.ddt.length}>
            <thead>
              <tr><Th>Arrivato il</Th><Th>Commessa</Th><Th>Numero</Th><Th>Fornitore</Th><Th>Ordine</Th><Th>Stato</Th></tr>
            </thead>
            <tbody>
              {data.ddt.map((x) => (
                <tr key={x.id} className="border-t">
                  <Td className="whitespace-nowrap">{dataBreve(x.data_ricezione)}</Td>
                  <Td><Commessa id={x.order_id} /></Td>
                  <Td className="font-mono text-xs"><Link className="text-primary hover:underline"
                    to={`/azienda/ddt/${x.id}`}>{x.numero_ddt ?? "Apri DDT"}</Link></Td>
                  <Td>{fornitore(x.supplier_id)}</Td>
                  <Td>{x.purchase_order_id ? <Link className="text-primary hover:underline"
                    to={`/azienda/ordini-acquisto/${x.purchase_order_id}`}>{x.purchase_orders?.oda_number ?? "Apri OdA"}</Link> : "Senza ordine"}</Td>
                  <Td>{x.stato && x.stato in DDT_STATO_META
                    ? <DDTStatusBadge stato={x.stato as DDTStato} size="sm" /> : parola(x.stato)}</Td>
                </tr>
              ))}
            </tbody>
          </Riquadro>
      )}

      {v === "fatture" && data.costi && (
        <Riquadro
          icona={ReceiptText}
          titolo="Costi e fatture dei fornitori"
          sintesi={`${quante(data.costi.length, "costo registrato", "costi registrati")}`}
          vuoto="Nessun costo sull'operazione."
          righe={data.costi.length}
        >
          <thead>
            <tr><Th>Data</Th><Th>Commessa</Th><Th>Fornitore</Th><Th>Descrizione</Th><Th className="text-right">Importo</Th><Th>Pagamento</Th></tr>
          </thead>
          <tbody>
            {data.costi.map((x) => (
              <tr key={x.id} className="border-t">
                <Td className="whitespace-nowrap">{dataVera(x.documento_data) ? dataBreve(x.documento_data) : "—"}</Td>
                <Td><Commessa id={x.order_id} /></Td>
                <Td>{fornitore(x.supplier_id)}</Td>
                <Td className="max-w-[20rem] truncate" title={x.name ?? undefined}>{x.name || "—"}</Td>
                <Td className="whitespace-nowrap text-right tabular-nums">{x.amount != null ? formatCurrency(x.amount) : "—"}</Td>
                <Td className={cn("whitespace-nowrap", !x.is_paid && "text-amber-700")}>
                  {x.is_paid
                    ? `Pagato${dataVera(x.paid_date) ? ` il ${dataBreve(x.paid_date)}` : ""}`
                    : ignoto(x.due_date)
                      ? "Da confermare"
                      : x.due_date
                        ? `Scade il ${dataBreve(x.due_date)}`
                        : "Da pagare"}
                </Td>
              </tr>
            ))}
          </tbody>
        </Riquadro>
      )}
    </section>
  );
}

function Riquadro({
  icona: Icona,
  titolo,
  sintesi,
  vuoto,
  righe,
  children,
}: {
  icona: typeof ClipboardList;
  titolo: string;
  sintesi: string;
  vuoto: string;
  righe: number;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icona className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {titolo}
        </h3>
        <span className="text-xs text-muted-foreground">{sintesi}</span>
      </header>
      {righe === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{vuoto}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">{children}</table>
        </div>
      )}
    </div>
  );
}

const Th = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <th className={cn("bg-muted/60 px-3 py-2 text-left text-xs font-medium text-muted-foreground", className)}>{children}</th>
);
const Td = ({ children, className, title }: { children?: React.ReactNode; className?: string; title?: string }) => (
  <td className={cn("px-3 py-2 align-top", className)} title={title}>
    {children}
  </td>
);
