/**
 * Versamenti F24 dell'anno: quello che spetta a ogni scadenza e quello che è uscito dalla banca.
 * Lo Stato patrimoniale considera versato tutto alla scadenza: qui si vede se è vero.
 */
import { Fragment, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Landmark, ChevronDown, ChevronRight } from "lucide-react";
import {
  riepilogoVersamenti, useVersamentiFiscali, type StatoVersamento,
} from "@/hooks/controlloGestione/useVersamentiFiscali";
import { formatEuro } from "@/lib/controlloGestione/indiciBanca";
import { formatDateIt } from "@/lib/formatters";

const STATO: Record<StatoVersamento, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pagato: { label: "Pagato", variant: "secondary" },
  parziale: { label: "Pagato in parte", variant: "outline" },
  non_trovato: { label: "Non trovato in banca", variant: "destructive" },
  da_venire: { label: "Da venire", variant: "outline" },
  non_verificabile: { label: "Nessun conto collegato", variant: "outline" },
};

export function VersamentiFiscaliCard({ anno }: { anno: number }) {
  const q = useVersamentiFiscali(anno);
  const [aperta, setAperta] = useState<string | null>(null);

  return (
    <Card id="versamenti" className="scroll-mt-24 rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Landmark className="h-4 w-4" /> Versamenti F24 {anno}: dovuti e usciti dalla banca
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Per ogni scadenza: ritenute e contributi dei cedolini (il 16 del mese dopo), IVA dalle liquidazioni,
          imposta sostitutiva sul TFR, saldo e acconti di IRES e IRAP stimati dal conto economico dell'anno prima,
          F24 registrati. In banca contano le uscite classificate come tributi o contributi e quelle che ne parlano
          nella descrizione («F24», «INPS», «Erario»…), entro 20 giorni dalla scadenza. Lo Stato patrimoniale le
          considera versate alla scadenza: una scadenza «non trovata» può essere un debito ancora aperto.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : q.error ? (
          <p className="text-sm text-destructive">Versamenti non caricati: {q.error instanceof Error ? q.error.message : "errore"}</p>
        ) : !q.data || q.data.scadenze.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun versamento atteso nel {anno}: mancano cedolini, IVA e imposte.</p>
        ) : (
          <Contenuto dati={q.data} aperta={aperta} setAperta={setAperta} />
        )}
      </CardContent>
    </Card>
  );
}

function Contenuto({ dati, aperta, setAperta }: {
  dati: NonNullable<ReturnType<typeof useVersamentiFiscali>["data"]>;
  aperta: string | null;
  setAperta: (s: string | null) => void;
}) {
  const r = riepilogoVersamenti(dati.scadenze);
  return (
    <>
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="secondary">{r.pagate} di {r.scadute} scadenze passate pagate</Badge>
        {r.parziali > 0 && <Badge variant="outline">{r.parziali} pagate in parte</Badge>}
        {r.nonTrovate > 0 && <Badge variant="destructive">{r.nonTrovate} non trovate in banca</Badge>}
        {r.mancante > 0 && <Badge variant="outline">mancano {formatEuro(r.mancante)}</Badge>}
      </div>
      {!dati.conti_bancari && (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs">
          Nessun conto bancario collegato: i versamenti non si possono verificare. Collega i conti in Tesoreria.
        </p>
      )}
      {dati.f24_non_classificati > 0 && (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs">
          {dati.f24_non_classificati} uscite in banca sembrano tributi o contributi ma non hanno una voce di cassa:
          classificale in Tesoreria (voci «Tributi e versamenti» e del personale) per un confronto sicuro.
        </p>
      )}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Scadenza</TableHead>
              <TableHead className="text-right">Dovuto</TableHead>
              <TableHead className="text-right">Uscito dalla banca</TableHead>
              <TableHead>Stato</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dati.scadenze.map((s) => {
              const isAperta = aperta === s.scadenza;
              return (
                <Fragment key={s.scadenza}>
                  <TableRow>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="h-7 gap-1 px-1 text-sm"
                        onClick={() => setAperta(isAperta ? null : s.scadenza)} aria-expanded={isAperta}>
                        {isAperta ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        {formatDateIt(s.scadenza)}
                      </Button>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatEuro(s.atteso)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatEuro(Math.max(s.pagato_banca, s.pagato_f24))}
                    </TableCell>
                    <TableCell><Badge variant={STATO[s.stato].variant}>{STATO[s.stato].label}</Badge></TableCell>
                  </TableRow>
                  {isAperta && (
                    <TableRow>
                      <TableCell colSpan={4} className="bg-muted/40">
                        <ul className="space-y-1 text-xs">
                          {s.voci.map((v, i) => (
                            <li key={i} className="flex justify-between gap-3">
                              <span>{v.voce} <span className="text-muted-foreground">· {v.fonte}</span></span>
                              <span className="tabular-nums">{formatEuro(v.importo)}</span>
                            </li>
                          ))}
                          {s.pagato_f24 > 0 && (
                            <li className="text-muted-foreground">F24 registrati come pagati: {formatEuro(s.pagato_f24)}</li>
                          )}
                        </ul>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
