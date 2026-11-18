import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCommercialiCommessa, type OrderSalesperson } from "@/hooks/useCommercialiCommessa";
import { useRitenuteBonificiCommessa } from "@/hooks/useRitenuteBonifici";
import { useRitenuteGaranzia } from "@/hooks/useRitenuteGaranzia";
import { useRitenuteClienteCommessa } from "@/components/ritenute/RitenuteClienteCommessa";
import { calculateStoredCommissionNet } from "@/lib/commissions";
import { formatCurrency } from "@/lib/formatters";
import { isDocumentoEmesso, isNotaCredito, isTipoVendita } from "@/lib/fatturazione/registroVendite";
import { saldiIvaCommessa, type saldoIva } from "@/lib/orders/ivaCommessa";
import { quadraturaCassaCommessa, riepilogoBonificiCommessa } from "@/lib/orders/quadraturaCassaCommessa";
import type { FatturaCommessa } from "@/lib/orders/fattureCommessa";
import type { OrderDetailSection } from "@/lib/orders/detailNavigation";
import type { Installment } from "@/lib/orderUtils";
import { useIvaCommessa } from "./IvaCommessa";

interface Props {
  orderId: string;
  rate: Installment[];
  documenti: FatturaCommessa[];
  statoIncassi: "pronto" | "in_caricamento" | "errore";
  residuoContratto: number;
  incassato: number;
  conCommerciali: boolean;
  conRitenuteBancarie: boolean;
  apriRegistroBancario: boolean;
  vaiA: (section: OrderDetailSection) => void;
}

function Importo({ voce, children }: { voce: string; children: ReactNode }) {
  return <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
    <dt className="text-muted-foreground">{voce}</dt>
    <dd className="font-medium tabular-nums">{children}</dd>
  </div>;
}

function testoSaldo(saldo: ReturnType<typeof saldoIva>) {
  if (saldo.verso === "pari") return "In pari";
  return `${formatCurrency(saldo.importo)} ${saldo.verso === "credito" ? "a credito" : "da versare"}`;
}

export function IncassiMarginiCommessa({
  orderId, rate, documenti, statoIncassi, residuoContratto, incassato, conCommerciali, conRitenuteBancarie,
  apriRegistroBancario, vaiA,
}: Props) {
  const iva = useIvaCommessa(orderId);
  const garanzia = useRitenuteClienteCommessa(orderId);
  const subappalti = useRitenuteGaranzia(orderId);
  const commerciali = useCommercialiCommessa(conCommerciali ? orderId : undefined).data ?? [];
  const fattureNative = documenti.filter(doc => doc.origine !== "importata" && isTipoVendita(doc.tipo) &&
    !isNotaCredito(doc.tipo) && isDocumentoEmesso(doc.stato) && doc.stato !== "stornata");
  const bancarie = useRitenuteBonificiCommessa(fattureNative.map(doc => doc.id), conRitenuteBancarie && statoIncassi === "pronto");
  const ivaCommessa = !iva.isError ? iva.data : null;
  const importiGaranzia = garanzia.permissions.isAdmin && garanzia.q.isSuccess;
  const statoBonifici = !conRitenuteBancarie ? "riservato"
    : statoIncassi === "errore" || bancarie.isError ? "errore"
      : statoIncassi === "in_caricamento" || bancarie.isLoading ? "in_caricamento" : "pronto";

  return <QuadroIncassiMargini
    saldi={ivaCommessa ? saldiIvaCommessa(ivaCommessa) : null}
    aliquota={ivaCommessa?.aliquota ?? null} ivaInCaricamento={iva.isPending}
    trattenuteSal={importiGaranzia ? garanzia.trattenuteSal : 0}
    trattenuteCliente={importiGaranzia ? formatCurrency(garanzia.trattenute)
      : !garanzia.permissions.isAdmin ? "Riservate all’amministrazione" : garanzia.q.isError ? "Dati non disponibili" : "Caricamento…"}
    trattenuteSubappalti={subappalti.isError ? "Dati non disponibili"
      : subappalti.isLoading ? "Caricamento…" : formatCurrency(subappalti.totaleRitenuto)}
    bonifici={riepilogoBonificiCommessa(fattureNative, bancarie.data ?? [])} statoBonifici={statoBonifici}
    commerciali={commerciali} apriRegistroBancario={apriRegistroBancario && conRitenuteBancarie}
    rate={rate} documenti={documenti} statoIncassi={statoIncassi}
    residuoContratto={residuoContratto} incassato={incassato} vaiA={vaiA}
  />;
}

type DatiQuadro = Omit<Props, "orderId" | "conCommerciali" | "conRitenuteBancarie"> & {
  saldi: ReturnType<typeof saldiIvaCommessa> | null;
  aliquota: number | null;
  ivaInCaricamento?: boolean;
  trattenuteSal: number;
  trattenuteCliente: string;
  trattenuteSubappalti: string;
  bonifici: ReturnType<typeof riepilogoBonificiCommessa>;
  statoBonifici: Props["statoIncassi"] | "riservato";
  commerciali: OrderSalesperson[];
};

export function QuadroIncassiMargini({
  saldi, aliquota, ivaInCaricamento, trattenuteSal, trattenuteCliente, trattenuteSubappalti,
  bonifici, statoBonifici, commerciali, apriRegistroBancario, rate, documenti, statoIncassi,
  residuoContratto, incassato, vaiA,
}: DatiQuadro) {
  const quadratura = quadraturaCassaCommessa(residuoContratto, rate, documenti, trattenuteSal, aliquota);
  const nomi = commerciali.map(({ salesperson }) => `${salesperson.first_name} ${salesperson.last_name}`.trim()).filter(Boolean);
  const provvigioni = commerciali.reduce((totale, riga) =>
    totale + calculateStoredCommissionNet(riga.commission_amount, riga.deduction_amount), 0);
  const collegamento = "text-xs font-medium text-primary hover:underline";

  return (
    <section aria-labelledby="titolo-iva-trattenute-cassa" className="rounded-xl border bg-background">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h3 id="titolo-iva-trattenute-cassa" className="flex items-center gap-2 text-base font-semibold">
          <WalletCards className="h-4 w-4 text-primary" aria-hidden /> IVA, trattenute e cassa
        </h3>
        {nomi.length > 0 && <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><button type="button" className="text-left text-sm text-muted-foreground hover:text-primary"
          onClick={() => vaiA("section-provvigioni")}>
          {nomi.length === 1 ? "Commerciale" : "Commerciali"} <strong className="text-foreground">{nomi.join(", ")}</strong>
        </button>
          <span className="text-sm text-muted-foreground">{nomi.length === 1 ? "Provvigione" : "Provvigioni"} <strong className="text-foreground tabular-nums">{formatCurrency(provvigioni)}</strong></span>
        </div>}
      </header>
      <div className="grid grid-cols-1 gap-px bg-border lg:grid-cols-3">
        <div className="space-y-2 bg-background px-4 py-3">
          <h4 className="text-sm font-semibold">IVA della commessa</h4>
          {saldi ? <dl className="space-y-1.5">
            <Importo voce="Ad oggi">{saldi.senzaFatture ? "Nessuna fattura rilevata" : testoSaldo(saldi.oggi)}</Importo>
            <Importo voce="Stima finale">{testoSaldo(saldi.fine)}</Importo>
          </dl> : <p className="text-sm text-muted-foreground">{ivaInCaricamento ? "Caricamento…" : "Dati IVA non disponibili"}</p>}
          <button type="button" className={collegamento} onClick={() => vaiA("section-iva-commessa")}>Dettaglio IVA</button>
        </div>
        <div className="space-y-2 bg-background px-4 py-3">
          <h4 className="text-sm font-semibold">Ritenute di garanzia</h4>
          <dl className="space-y-1.5">
            <Importo voce="Trattenute dal cliente">{trattenuteCliente}</Importo>
            <Importo voce="Da svincolare ai subappaltatori">{trattenuteSubappalti}</Importo>
          </dl>
          <button type="button" className={collegamento} onClick={() => vaiA("section-ritenute")}>Dettaglio garanzie e svincoli</button>
        </div>
        <div className="space-y-2 bg-background px-4 py-3">
          <h4 className="text-sm font-semibold">Ritenuta d’acconto bancaria</h4>
          {statoBonifici === "riservato" ? <p className="text-sm text-muted-foreground">Registro riservato all’amministrazione.</p>
            : statoBonifici === "errore" ? <p className="text-sm text-muted-foreground">Dati dei bonifici non disponibili.</p>
              : statoBonifici === "in_caricamento" ? <p className="text-sm text-muted-foreground">Caricamento…</p>
                : bonifici.lordo === 0 ? <p className="text-sm text-muted-foreground">Nessun bonifico parlante registrato.</p>
                  : <dl className="space-y-1.5">
                    <Importo voce="Bonifici lordi">{formatCurrency(bonifici.lordo)}</Importo>
                    <Importo voce="Trattenuta dalla banca">{formatCurrency(bonifici.ritenuta)}</Importo>
                    {bonifici.commissioni > 0 && <Importo voce="Commissioni bancarie">{formatCurrency(bonifici.commissioni)}</Importo>}
                    <Importo voce="Netto accreditato">{formatCurrency(bonifici.netto)}</Importo>
                  </dl>}
          {apriRegistroBancario && <Link className={collegamento} to="/azienda/contabilita-fiscale?vista=ritenute_bancarie">Registro ritenute bancarie</Link>}
        </div>
      </div>
      <div className="space-y-2 border-t px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">Quadratura del residuo <span className="font-normal text-muted-foreground">· IVA inclusa</span></h4>
          <Button variant="outline" size="sm" onClick={() => vaiA("section-pagamenti")}>Apri Fatture e Incassi</Button>
        </div>
        {statoIncassi !== "pronto" ? <p className="text-sm text-muted-foreground">{statoIncassi === "errore" ? "Quadratura non disponibile." : "Caricamento incassi e rate…"}</p> : <>
          <dl className="grid grid-cols-2 gap-2 xl:grid-cols-4 [&>div]:grid [&>div]:content-start [&>div]:rounded-md [&>div]:bg-muted/35 [&>div]:px-3 [&>div]:py-2 [&_dd]:text-base [&_dd]:font-semibold [&_dt]:text-xs">
            <Importo voce="Incassato dal cliente">{formatCurrency(incassato)}</Importo>
            <Importo voce="Residuo contrattuale">{formatCurrency(residuoContratto)}</Importo>
            <Importo voce="Residuo delle rate registrate">{rate.length > 0 ? formatCurrency(quadratura.rateAperte) : "Nessuna rata"}</Importo>
            <Importo voce="Differenza">{rate.length > 0 ? formatCurrency(quadratura.differenza) : "—"}</Importo>
          </dl>
          {rate.length > 0 && quadratura.differenza !== 0 && <p className="text-xs text-muted-foreground">
            {quadratura.coerenteConGaranzia
              ? <>Lo scarto corrisponde a {formatCurrency(trattenuteSal)} di garanzia dei SAL{(aliquota ?? 0) > 0 ? " più IVA" : ""}. Il residuo delle rate è già al netto di questa garanzia.</>
              : <>Il residuo del contratto differisce dal piano registrato. Verifica gli importi in Fatture e Incassi.</>}
          </p>}
        </>}
      </div>
    </section>
  );
}
