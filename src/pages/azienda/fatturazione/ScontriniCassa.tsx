import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronLeft, Download, ReceiptText, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { chiaveQueryCassa, IMPOSTAZIONI_CASSA, invocaCassa, useCollegamentiCassa } from "@/lib/cassaInCloud";
import { formatCount, formatCurrency, formatDateShort } from "@/lib/formatters";
import {
  giornoCassa, GIORNI_IMPORT_CASSA, intervalliCassa, type EsitoImportCassa, type FatturaDaCassa, type PagamentoCassa,
} from "../../../../shared/cassaInCloud";
import ChiusureGiornaliereCassa from "./ChiusureGiornaliereCassa";
import { FattureDaScontrinoCassa } from "./FattureDaScontrinoCassa";

const PER_PAGINA = 50;
const METODI: Record<string, string> = {
  CASH: "Contanti", BANKCHECK: "Assegno", CASHCARD: "Bancomat", CREDITCARD: "Carta",
  TICKET: "Buoni pasto", DEFERRED: "Differito", FIDELITYCARD: "Carta fedeltà",
  VOUCHER: "Buono", VOUCHER_GOODS: "Buono merce", BANK_TRANSFER: "Bonifico",
  RIBA_30: "Ri.Ba. 30 giorni", RIBA_60: "Ri.Ba. 60 giorni", PAYPAL: "PayPal", POSTE_PAY: "Postepay",
  CUSTOM: "Personalizzato", DISCOUNT_ON_PAYMENT: "Sconto sul pagamento", ROOM_CHARGE: "Addebito in camera", OTHER: "Altro",
};

function importo(n: number, valuta: string | null) {
  if (valuta === "EUR") return formatCurrency(n);
  return new Intl.NumberFormat("it-IT", valuta
    ? { style: "currency", currency: valuta }
    : { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(n);
}

function ArchivioCassa({ companyId }: { companyId: string }) {
  const permessi = usePermissions();
  const puoImportare = !permessi.isLoading && permessi.canEditSettingsIntegrations && !permessi.solaLettura;
  const mobile = useIsMobile();
  const oggi = giornoCassa();
  const [params, setParams] = useSearchParams();
  const dalLink = params.get("dal") ?? "";
  const alLink = params.get("al") ?? "";
  const [dal, setDal] = useState(() => /^\d{4}-\d\d-\d\d$/.test(dalLink) ? dalLink : `${oggi.slice(0, 7)}-01`);
  const [al, setAl] = useState(() => /^\d{4}-\d\d-\d\d$/.test(alLink) ? alLink : oggi);
  const [punto, setPunto] = useState("");
  const [pagina, setPagina] = useState(0);
  const [avanzamento, setAvanzamento] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);
  const [erroreImport, setErroreImport] = useState<string | null>(null);
  const chiusure = params.get("tab") === "chiusure";
  const controller = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();
  const collegamenti = useCollegamentiCassa(companyId);
  const punti = collegamenti.data ?? [];
  const filtro = punti.some((p) => p.punto_vendita_id === punto) ? punto : "";
  const daImportare = filtro || (punti.length === 1 ? punti[0].punto_vendita_id : "");
  const intervalli = intervalliCassa(dal, al);
  const dateValide = !!dal && !!al && dal <= al && al <= oggi;

  useEffect(() => () => controller.current?.abort(), []);

  const archivio = useQuery({
    queryKey: [...chiaveQueryCassa(companyId), "scontrini", dal, al, filtro, pagina],
    enabled: dateValide && !chiusure,
    queryFn: async ({ signal }) => {
      let query = supabase.from("cassa_in_cloud_scontrini")
        .select("esterno_id,punto_vendita_id,punto_vendita_nome,cassa_id,numero,numero_z,data,ora,totale,resto,pagamenti,valuta,confermato,con_reso,con_fattura,fatture,presente_in_cassa", { count: "exact" })
        .eq("company_id", companyId).gte("data", dal).lte("data", al);
      if (filtro) query = query.eq("punto_vendita_id", filtro);
      const { data, count, error } = await query
        .order("data", { ascending: false }).order("ora", { ascending: false, nullsFirst: false })
        .order("punto_vendita_id").order("esterno_id")
        .range(pagina * PER_PAGINA, (pagina + 1) * PER_PAGINA - 1).abortSignal(signal);
      if (error) throw error;
      return { righe: data, totale: count ?? 0 };
    },
  });

  function aggiornaFiltro(set: (v: string) => void, value: string) {
    set(value);
    setPagina(0);
    setEsito(null);
    setErroreImport(null);
  }

  async function importa() {
    if (!puoImportare || !dateValide || !daImportare || !intervalli.length || controller.current) return;
    const inCorso = new AbortController();
    controller.current = inCorso;
    setErroreImport(null);
    setEsito(null);
    let importati = 0;
    let assenti = 0;
    let completati = 0;
    try {
      for (const intervallo of intervalli) {
        setAvanzamento(`Importazione ${completati + 1} di ${intervalli.length}…`);
        const risultato = await invocaCassa<EsitoImportCassa>(companyId, chiusure ? "importa_chiusure" : "importa", {
          ...intervallo, punto_vendita_id: daImportare,
        }, inCorso.signal);
        if (inCorso.signal.aborted) return;
        importati += risultato.importati;
        assenti += risultato.assenti;
        completati++;
      }
    } catch (error) {
      if (inCorso.signal.aborted) return;
      const messaggio = error instanceof Error ? error.message : "Importazione non riuscita.";
      setErroreImport(completati
        ? `Importazione interrotta dal ${formatDateShort(intervalli[completati].dal)}. ${messaggio}`
        : messaggio);
    } finally {
      controller.current = null;
      void queryClient.invalidateQueries({ queryKey: chiaveQueryCassa(companyId) });
      if (!inCorso.signal.aborted) {
        if (completati) {
          setPagina(0);
          setEsito(`${formatCount(importati)} scontrini letti da Cassa in Cloud.${assenti ? ` ${formatCount(assenti)} scontrini assenti nell’ultima importazione.` : ""}${chiusure ? " Confronto chiusure aggiornato." : ""}`);
        }
        setAvanzamento(null);
      }
    }
  }

  const righe = archivio.data?.righe ?? [];
  const totale = archivio.data?.totale ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/azienda/documenti" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
            <ChevronLeft className="h-4 w-4" />Fatturazione
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><ReceiptText className="h-6 w-6" />Scontrini</h1>
          <p className="mt-1 text-sm text-muted-foreground">Documenti commerciali e pagamenti registrati in Cassa in Cloud.</p>
        </div>
        {puoImportare && !mobile && (
          <Button variant="outline" size="sm" asChild>
            <Link to={IMPOSTAZIONI_CASSA}><Settings2 className="mr-2 h-4 w-4" />Collegamenti Cassa in Cloud</Link>
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Viste Cassa in Cloud">
        {["scontrini", "chiusure"].map((v) => (
          <Button type="button" key={v} size="sm" variant={(v === "chiusure") === chiusure ? "secondary" : "ghost"}
            aria-pressed={(v === "chiusure") === chiusure} disabled={!!avanzamento} onClick={() => {
              const next = new URLSearchParams(params);
              if (v === "chiusure") next.set("tab", "chiusure"); else next.delete("tab");
              setEsito(null);
              setErroreImport(null);
              setParams(next, { replace: true });
            }}>{v === "chiusure" ? "Chiusure giornaliere" : "Scontrini"}</Button>
        ))}
      </div>
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="cassa-dal">Dal</Label>
              <Input id="cassa-dal" type="date" max={oggi} value={dal} disabled={!!avanzamento}
                onChange={(e) => aggiornaFiltro(setDal, e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cassa-al">Al</Label>
              <Input id="cassa-al" type="date" min={dal} max={oggi} value={al} disabled={!!avanzamento}
                onChange={(e) => aggiornaFiltro(setAl, e.target.value)} />
            </div>
            {punti.length > 0 && (
              <div className="min-w-40 space-y-1">
                <Label htmlFor="cassa-filtro-punto">Punto vendita</Label>
                <select id="cassa-filtro-punto" className="block h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={filtro} disabled={!!avanzamento}
                  onChange={(e) => aggiornaFiltro(setPunto, e.target.value)}>
                  <option value="">Tutti i punti vendita</option>
                  {punti.map((p) => <option key={p.punto_vendita_id} value={p.punto_vendita_id}>{p.nome} · {p.punto_vendita_id}</option>)}
                </select>
              </div>
            )}
            {puoImportare && punti.length > 0 && (
              <Button type="button" disabled={!!avanzamento || !dateValide || !intervalli.length || !daImportare} onClick={() => void importa()}>
                <Download className="mr-2 h-4 w-4" />{chiusure ? "Importa chiusure e scontrini" : "Importa scontrini"}
              </Button>
            )}
          </div>
          {!dateValide && <p className="text-sm text-muted-foreground">Scegli un intervallo valido, fino a oggi.</p>}
          {collegamenti.isError && <p role="alert" className="text-sm text-destructive">Impossibile verificare i punti vendita. <button className="underline" onClick={() => void collegamenti.refetch()}>Riprova</button></p>}
          {collegamenti.isSuccess && !punti.length && <p className="text-sm text-muted-foreground">Per importare nuovi scontrini, collega un punto vendita in Impostazioni → Fatturazione → Cassa in Cloud.</p>}
          {puoImportare && punti.length > 0 && dateValide && !intervalli.length && (
            <p className="text-sm text-muted-foreground">Per l’importazione puoi selezionare fino a {GIORNI_IMPORT_CASSA} giorni alla volta.</p>
          )}
          {puoImportare && punti.length > 1 && !daImportare && <p className="text-sm text-muted-foreground">Seleziona un punto vendita per importare.</p>}
          {(avanzamento || esito) && <p role="status" className="text-sm text-muted-foreground">{avanzamento ?? esito}</p>}
          {erroreImport && <p role="alert" className="text-sm text-destructive">{erroreImport}</p>}
        </CardContent>
      </Card>

      {dateValide && chiusure && <ChiusureGiornaliereCassa companyId={companyId} dal={dal} al={al} punto={filtro} />}
      {dateValide && !chiusure && (
        <Card>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Data</TableHead><TableHead>Scontrino</TableHead><TableHead>Punto vendita</TableHead>
              <TableHead className="text-right">Totale documento</TableHead><TableHead>Pagamenti</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {archivio.isError && (
                <TableRow><TableCell colSpan={5} className="p-6 text-center text-destructive">
                  Impossibile leggere l’archivio. <button className="underline" onClick={() => void archivio.refetch()}>Riprova</button>
                </TableCell></TableRow>
              )}
              {!archivio.isError && !righe.length && (
                <TableRow><TableCell colSpan={5} className="p-6 text-center text-muted-foreground">
                  {archivio.isPending ? "Caricamento scontrini…" : "Nessuno scontrino importato per questi filtri."}
                </TableCell></TableRow>
              )}
              {righe.map((r) => (
                <TableRow key={`${r.punto_vendita_id}/${r.esterno_id}`}>
                  <TableCell className="whitespace-nowrap">
                    {formatDateShort(r.data)}{r.ora && <div className="text-xs text-muted-foreground">{r.ora.slice(0, 5)}</div>}
                  </TableCell>
                  <TableCell>
                    <div className="whitespace-nowrap font-medium">{r.numero ? `N. ${r.numero}` : r.esterno_id}{r.numero_z && ` · Z ${r.numero_z}`}</div>
                    <div className="flex flex-wrap gap-1">
                      {!r.presente_in_cassa && <Badge variant="outline">Assente nell’ultimo import</Badge>}
                      {r.confermato === false && <Badge variant="outline">Bozza</Badge>}
                      {r.con_reso && <Badge variant="outline">Contiene resi</Badge>}
                      {r.con_fattura && <Badge variant="outline">Fattura collegata</Badge>}
                    </div>
                    {Array.isArray(r.fatture) && <FattureDaScontrinoCassa companyId={companyId} fatture={r.fatture as unknown as FatturaDaCassa[]} />}
                  </TableCell>
                  <TableCell>{r.punto_vendita_nome}{r.cassa_id && <div className="text-xs text-muted-foreground">Cassa {r.cassa_id}</div>}</TableCell>
                  <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                    {importo(r.totale, r.valuta)}
                    {!!r.resto && <div className="text-xs font-normal text-muted-foreground">Resto {importo(r.resto, r.valuta)}</div>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {(r.pagamenti as unknown as PagamentoCassa[]).map((p, i) => (
                      <div key={i} className="text-sm">
                        {p.descrizione || METODI[p.tipo] || p.tipo} · {importo(p.importo, r.valuta)}
                        {p.differito && <span className="ml-1 text-xs text-muted-foreground">(differito)</span>}
                        {!!p.resto && !r.resto && <span className="ml-1 text-xs text-muted-foreground">resto {importo(p.resto, r.valuta)}</span>}
                      </div>
                    ))}
                    {Array.isArray(r.pagamenti) && !r.pagamenti.length && <span className="text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {(totale > PER_PAGINA || pagina > 0) && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3">
              <span className="text-sm text-muted-foreground">{formatCount(totale)} scontrini</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={!pagina} onClick={() => setPagina(pagina - 1)}>Precedente</Button>
                <Button size="sm" variant="outline" disabled={(pagina + 1) * PER_PAGINA >= totale} onClick={() => setPagina(pagina + 1)}>Successiva</Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

export default function ScontriniCassa() {
  const { effectiveCompany } = useAuth();
  return effectiveCompany?.id ? <ArchivioCassa key={effectiveCompany.id} companyId={effectiveCompany.id} /> : null;
}
