// src/components/orders/generali/unita/UnitaDialog.tsx
// Un'unità aperta dal tabellone o dalla tabella. Da telefono: lo stato di vendita e i numeri
// essenziali. Da tablet e computer anche pagamenti, dati, margine e «Dividi».
import { Link } from "react-router-dom";
import { ExternalLink, Scissors, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CambioStato } from "@/components/orders/generali/unita/CambioStato";
import { DatiUnita } from "@/components/orders/generali/unita/DatiUnita";
import { MargineUnita } from "@/components/orders/generali/unita/MargineUnita";
import { PagamentiUnita } from "@/components/orders/generali/unita/PagamentiUnita";
import { STILE_STATO, dataBreve, euro } from "@/components/orders/generali/unita/aspetto";
import { NOMI_STATO, etichettaPiano, prezzoCorrente, type ElencoUnita, type UnitaGenerale } from "@/lib/orders/generali/unita";
import { formattaNumero, pagamentiUnita, type ContiUnita } from "@/lib/orders/generali/unitaConti";
import { cn } from "@/lib/utils";

interface Props {
  generaleId: string;
  unita: UnitaGenerale | null;
  elenco: ElencoUnita;
  conti: ContiUnita;
  /** Pagamenti, dati e divisione: da tablet e computer, con il permesso. */
  gestisci: boolean;
  telefono: boolean;
  onChiudi: () => void;
  onDividi: (orderId: string) => void;
}

export function UnitaDialog({ generaleId, unita: u, elenco, conti, gestisci, telefono, onChiudi, onDividi }: Props) {
  return (
    <Dialog open={!!u} onOpenChange={(o) => !o && onChiudi()}>
      <DialogContent className="max-w-2xl">
        {u && <Contenuto generaleId={generaleId} u={u} elenco={elenco} conti={conti} gestisci={gestisci} telefono={telefono} onDividi={onDividi} />}
      </DialogContent>
    </Dialog>
  );
}

function Contenuto({ generaleId, u, elenco, conti, gestisci, telefono, onDividi }: Omit<Props, "unita" | "onChiudi"> & { u: UnitaGenerale }) {
  const p = elenco.permessi;
  const dove = [u.edificio, u.piano ? etichettaPiano(u.piano) : null, u.mq !== null ? `${formattaNumero(u.mq)} m²` : null, u.millesimi !== null ? `${formattaNumero(u.millesimi)} ‰` : null]
    .filter(Boolean).join(" · ");
  const garanzia = elenco.modello === "sviluppo" && (u.stato === "prenotata" || u.stato === "compromesso") && u.movimenti.some((m) => m.tipo !== "saldo");
  const divisibile = gestisci && u.stato === "libera" && u.movimenti.length === 0;
  const conMargine = p.margini && (conti.perUnita.get(u.orderId)?.margine ?? null) !== null;
  const vendita = (
    <div className="space-y-3">
      <CambioStato generaleId={generaleId} unita={u} permessi={p} telefono={telefono} />
      <Riepilogo u={u} vedeImporti={p.importi} />
      {garanzia && (
        <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Immobile da costruire con somme versate prima del rogito: serve la fideiussione (D.Lgs. 122/2005), e al rogito la polizza decennale.
        </p>
      )}
    </div>
  );

  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2 pr-6">
          <DialogTitle className="text-lg">{u.sigla}{u.tipologia && <span className="ml-1.5 text-sm font-normal text-muted-foreground">{u.tipologia}</span>}</DialogTitle>
          <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", STILE_STATO[u.stato].scelto)}>{NOMI_STATO[u.stato].una}</span>
        </div>
        <DialogDescription className={cn(!dove && "sr-only")}>{dove || `Unità ${u.sigla}`}</DialogDescription>
      </DialogHeader>

      {telefono ? vendita : (
        <Tabs defaultValue="vendita">
          <TabsList>
            <TabsTrigger value="vendita">Vendita</TabsTrigger>
            {p.importi && <TabsTrigger value="pagamenti">Pagamenti</TabsTrigger>}
            {gestisci && <TabsTrigger value="dati">Dati</TabsTrigger>}
            {conMargine && <TabsTrigger value="margine">Margine</TabsTrigger>}
          </TabsList>
          <TabsContent value="vendita" className="mt-3">{vendita}</TabsContent>
          {p.importi && <TabsContent value="pagamenti" className="mt-3"><PagamentiUnita generaleId={generaleId} unita={u} gestisci={gestisci} /></TabsContent>}
          {gestisci && <TabsContent value="dati" className="mt-3"><DatiUnita generaleId={generaleId} unita={u} vedeImporti={p.importi} /></TabsContent>}
          {conMargine && <TabsContent value="margine" className="mt-3"><MargineUnita unita={u} conti={conti} /></TabsContent>}
        </Tabs>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <Button asChild variant="outline" size="sm" className={cn(telefono && "flex-1")}>
          <Link to={`/azienda/ordini/${u.orderId}`}><ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Apri la commessa{u.codice && !telefono ? ` ${u.codice}` : ""}</Link>
        </Button>
        {divisibile && !telefono && (
          <Button variant="outline" size="sm" onClick={() => onDividi(u.orderId)}>
            <Scissors className="mr-1.5 h-3.5 w-3.5" /> Dividi {u.sigla}
          </Button>
        )}
      </div>
    </>
  );
}

/** Chi, quando, quanto: solo le righe che hanno un valore. */
function Riepilogo({ u, vedeImporti }: { u: UnitaGenerale; vedeImporti: boolean }) {
  const pag = pagamentiUnita(u);
  const righe: [string, string][] = [];
  if (u.acquirente) righe.push(["Acquirente", u.acquirente]);
  if (u.dataPrenotazione) righe.push(["Prenotata il", dataBreve(u.dataPrenotazione)]);
  if (u.dataCompromesso) righe.push(["Compromesso il", dataBreve(u.dataCompromesso)]);
  if (u.rogitoPrevisto && u.stato === "compromesso") righe.push(["Rogito previsto", dataBreve(u.rogitoPrevisto)]);
  if (u.dataRogito) righe.push(["Rogito il", dataBreve(u.dataRogito)]);
  if (vedeImporti) {
    if (u.listino !== null) righe.push(["Listino", euro(u.listino)]);
    if (u.stato !== "libera" && prezzoCorrente(u) !== null) righe.push([u.stato === "rogitata" ? "Prezzo di rogito" : "Prezzo trattato", euro(prezzoCorrente(u))]);
    if (u.stato !== "libera") righe.push(["Pagato", `${euro(pag.pagato)}${pag.residuo ? ` · da incassare ${euro(pag.residuo)}` : ""}`]);
  }
  if (u.agenzia) righe.push(["Agenzia", u.agenzia]);
  if (righe.length === 0) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      {righe.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 truncate tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
