/**
 * La barra delle modifiche in blocco sulle fatture ricevute. Prima di partire dice su quante fatture
 * agisce e quali salta; alla fine elenca quelle non riuscite, col motivo del database.
 */
import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCheck, FileCheck2, FolderKanban, Loader2, Receipt, RotateCcw, ShieldCheck, ShieldOff, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { OrderSelectCombobox } from "@/components/warehouse/OrderSelectCombobox";
import { dataAllaScadenza, dividiPerAzione, eseguiInBlocco, type AzioneRicevute, type Esito, type RicevutaInBlocco } from "@/lib/fatturazione/azioniInBlocco";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const oggi = () => new Date().toLocaleDateString("en-CA");

const chiama = async (funzione: string, argomenti: Record<string, unknown>): Promise<void> => {
  const { error } = await db.rpc(funzione, argomenti);
  if (error) throw error;
};
const segnaPagata = (id: string, pagata: boolean, data: string | null) =>
  chiama("segna_fattura_ricevuta_pagata", { p_id: id, p_pagata: pagata, p_data: data });
const segnaVerifica = (id: string, verificata: boolean) =>
  chiama("fattura_segna_verifica", { p_fattura_id: id, p_verificata: verificata });

const AZIONI: Record<AzioneRicevute, { etichetta: string; titolo: string; conferma: string; fatto: string; icona: typeof CheckCheck }> = {
  pagate: { etichetta: "Segna pagate", titolo: "Segna pagate", conferma: "Segna pagate", fatto: "segnate pagate", icona: CheckCheck },
  da_pagare: { etichetta: "Da pagare", titolo: "Di nuovo da pagare", conferma: "Rimetti da pagare", fatto: "di nuovo da pagare", icona: RotateCcw },
  verificate: { etichetta: "Verificate", titolo: "Segna verificate", conferma: "Segna verificate", fatto: "verificate", icona: ShieldCheck },
  da_verificare: { etichetta: "Da verificare", titolo: "Rimetti da verificare", conferma: "Rimetti da verificare", fatto: "di nuovo da verificare", icona: ShieldOff },
  contabilizza: { etichetta: "Contabilizza", titolo: "Contabilizza", conferma: "Contabilizza", fatto: "contabilizzate", icona: Receipt },
  commessa: { etichetta: "Commessa", titolo: "Metti su una commessa", conferma: "Metti sulla commessa", fatto: "messe sulla commessa", icona: FolderKanban },
  mezzi: { etichetta: "Conferma mezzi", titolo: "Conferma i mezzi proposti dalla targa", conferma: "Conferma i mezzi", fatto: "con i mezzi confermati", icona: Truck },
};
const ORDINE: AzioneRicevute[] = ["pagate", "da_pagare", "verificate", "da_verificare", "contabilizza", "commessa", "mezzi"];

/** I mezzi proposti dalla targa su una fattura, tutti confermati. Torna quanti. */
const confermaMezzi = async (fatturaId: string, companyId: string): Promise<number> => {
  const { data: u } = await supabase.auth.getUser();
  const { data, error } = await db.from("fattura_ricevuta_mezzi")
    .update({ confermata: true, confermata_da: u.user?.id ?? null, confermata_at: new Date().toISOString() })
    .eq("company_id", companyId).eq("fattura_ricevuta_id", fatturaId).eq("confermata", false).select("id");
  if (error) throw error;
  return (data ?? []).length;
};

const fatture = (n: number) => `${n} fattur${n === 1 ? "a" : "e"}`;

export function AzioniInBloccoRicevute({ companyId, righe, filtrate, onSelezionaTutte, onSvuota }: {
  companyId: string;
  righe: RicevutaInBlocco[];
  /** Quante fatture mostra l'elenco con i filtri di adesso. */
  filtrate: number;
  onSelezionaTutte: () => void;
  onSvuota: () => void;
}) {
  const queryClient = useQueryClient();
  const [azione, setAzione] = useState<AzioneRicevute | null>(null);
  const [modoData, setModoData] = useState<"data" | "scadenza">("data");
  const [data, setData] = useState(oggi);
  const [commessa, setCommessa] = useState<string | undefined>();
  const [fatte, setFatte] = useState<number | null>(null);
  const [fallite, setFallite] = useState<Esito<RicevutaInBlocco>["fallite"]>([]);
  const mezziConfermati = useRef(0);

  const selezione = useMemo(() => (azione ? dividiPerAzione(azione, righe) : null), [azione, righe]);
  const totale = selezione?.idonee.reduce((s, r) => s + Number(r.totale ?? 0), 0) ?? 0;
  const inCorso = fatte !== null;

  const aggiorna = () => {
    for (const k of ["fatture-ricevute", "fatture-ricevute-pagamento", "fattura-ricevuta-riepilogo", "commessa-fatture-fornitori", "oda-contabilita", "cashflow", "fattura-collegamenti", "mezzo-fatture", "mezzo-costo-orario", "mezzi-piano-fonti"]) {
      void queryClient.invalidateQueries({ queryKey: [k] });
    }
    void queryClient.invalidateQueries({ queryKey: queryKeys.costs.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.scadenzario.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.companyCosts(companyId) });
  };

  const apri = (a: AzioneRicevute) => {
    setFallite([]); setCommessa(undefined); setModoData("data"); setData(oggi()); setAzione(a);
  };

  const lavoro = (a: AzioneRicevute) => (r: RicevutaInBlocco): Promise<void> => {
    switch (a) {
      case "pagate": return segnaPagata(r.id, true, modoData === "scadenza" ? dataAllaScadenza(r.scadenze, oggi()) : data);
      case "da_pagare": return segnaPagata(r.id, false, null);
      case "verificate": return segnaVerifica(r.id, true);
      case "da_verificare": return segnaVerifica(r.id, false);
      case "contabilizza": return chiama("contabilizza_fattura_ricevuta", { p_fattura_id: r.id });
      case "commessa": return chiama("commessa_collega_fattura_ricevuta", { p_fattura_id: r.id, p_order_id: commessa });
      case "mezzi": return confermaMezzi(r.id, companyId).then((n) => { mezziConfermati.current += n; });
    }
  };

  /** Riporta le fatture riuscite a com'erano. Contabilizza e commessa non si disfano da qui. */
  const annullamento = (a: AzioneRicevute, riuscite: RicevutaInBlocco[]) => {
    const inverso: ((r: RicevutaInBlocco) => Promise<void>) | null =
      a === "pagate" ? (r) => segnaPagata(r.id, false, null)
      : a === "da_pagare" ? (r) => segnaPagata(r.id, true, r.pagataIl)
      : a === "verificate" ? (r) => segnaVerifica(r.id, false)
      : a === "da_verificare" ? (r) => segnaVerifica(r.id, true)
      : null;
    if (!inverso) return undefined;
    return {
      label: "Annulla",
      onClick: () => {
        void eseguiInBlocco(riuscite, inverso).then((e) => {
          aggiorna();
          if (e.fallite.length) toast.error(`${fatture(e.fallite.length)} non riportate indietro`, { description: e.fallite[0].motivo });
          else toast.success(`${fatture(e.riuscite.length)} riportate a com'erano`);
        });
      },
    };
  };

  const parti = async () => {
    if (!azione || !selezione) return;
    mezziConfermati.current = 0;
    setFatte(0);
    const esito = await eseguiInBlocco(selezione.idonee, lavoro(azione), setFatte);
    setFatte(null);
    aggiorna();
    if (azione === "mezzi" && esito.riuscite.length) {
      const n = mezziConfermati.current;
      toast.success(n ? `${n} mezz${n === 1 ? "o confermato" : "i confermati"} su ${fatture(esito.riuscite.length)}` : "Nessun mezzo da confermare sulle fatture scelte");
    } else if (esito.riuscite.length) {
      const fatto = esito.riuscite.length === 1 ? AZIONI[azione].fatto.replace(/^segnate pagate$/, "segnata pagata").replace(/^verificate$/, "verificata").replace(/^contabilizzate$/, "contabilizzata").replace(/^messe /, "messa ") : AZIONI[azione].fatto;
      toast.success(`${fatture(esito.riuscite.length)} ${fatto}`, { action: annullamento(azione, esito.riuscite), duration: 10_000 });
    }
    if (esito.fallite.length) {
      setFallite(esito.fallite);
      return;
    }
    setAzione(null);
    onSvuota();
  };

  const dataValida = azione !== "pagate" || modoData === "scadenza" || (/^\d{4}-\d{2}-\d{2}$/.test(data) && data <= oggi());
  const pronta = !!selezione?.idonee.length && !inCorso && dataValida && (azione !== "commessa" || !!commessa) && !fallite.length;

  return (
    <>
      <div role="toolbar" aria-label="Modifiche in blocco" className="fixed bottom-4 left-1/2 z-40 flex w-[min(60rem,calc(100vw-2rem))] -translate-x-1/2 flex-wrap items-center gap-2 rounded-lg border bg-background px-3 py-2 shadow-lg max-md:bottom-[calc(env(safe-area-inset-bottom)+5.5rem)]">
        <span className="text-sm font-medium">{righe.length} selezionat{righe.length === 1 ? "a" : "e"}</span>
        {righe.length < filtrate && (
          <Button variant="link" size="sm" className="h-auto min-h-0 p-0 text-xs" onClick={onSelezionaTutte}>Seleziona tutte le {filtrate}</Button>
        )}
        <span className="hidden h-5 w-px bg-border sm:block" />
        {/* Su telefono una fila sola che scorre: a capo la barra copriva mezzo schermo e finiva sotto il menu dell'app. */}
        <div className="flex w-full gap-2 overflow-x-auto pb-0.5 max-sm:order-last sm:contents">
          {ORDINE.map((a) => {
            const quante = dividiPerAzione(a, righe).idonee.length;
            const Icona = AZIONI[a].icona;
            return (
              <Button key={a} variant="outline" size="sm" className="shrink-0" disabled={!quante} onClick={() => apri(a)}>
                <Icona className="mr-1.5 h-3.5 w-3.5" />{AZIONI[a].etichetta}{quante ? ` (${quante})` : ""}
              </Button>
            );
          })}
        </div>
        <Button variant="ghost" size="sm" className="ml-auto" aria-label="Togli la selezione" onClick={onSvuota}><X className="h-4 w-4" /></Button>
      </div>

      <Dialog open={!!azione} onOpenChange={(aperta) => { if (!aperta && !inCorso) setAzione(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{azione ? AZIONI[azione].titolo : ""}</DialogTitle>
            <DialogDescription>
              {selezione ? (azione === "mezzi" ? fatture(selezione.idonee.length) : `${fatture(selezione.idonee.length)} · ${formatCurrency(totale)}`) : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {!!selezione?.escluse.length && (
              <div className="rounded-md border bg-muted/40 p-2.5 text-xs">
                <p className="font-medium">Restano fuori:</p>
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                  {selezione.escluse.map((e) => <li key={e.motivo}>{fatture(e.quante)}: {e.motivo}</li>)}
                </ul>
              </div>
            )}
            {azione === "pagate" && (
              <RadioGroup value={modoData} onValueChange={(v) => setModoData(v as "data" | "scadenza")} className="space-y-2">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="data" id="blocco-data" />
                  <Label htmlFor="blocco-data" className="font-normal">Pagate il</Label>
                  <Input type="date" aria-label="Data di pagamento" className="h-8 w-40" max={oggi()} value={data} disabled={modoData !== "data"} onChange={(e) => setData(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="scadenza" id="blocco-scadenza" />
                  <Label htmlFor="blocco-scadenza" className="font-normal">Ognuna alla sua scadenza (se è futura o manca, oggi)</Label>
                </div>
              </RadioGroup>
            )}
            {azione === "commessa" && (
              <OrderSelectCombobox filtroIniziale="all" companyId={companyId} value={commessa} placeholder="Cerca la commessa…" onChange={(id) => setCommessa(id)} />
            )}
            {azione === "contabilizza" && <p className="text-muted-foreground">Crea un costo per ogni fattura. Non si annulla in blocco.</p>}
            {azione === "mezzi" && <p className="text-muted-foreground">Conferma i mezzi che la targa ha trovato nelle righe: il loro importo entra nel costo del mezzo. Le fatture senza proposte restano come sono.</p>}
            {inCorso && selezione && <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {fatte} di {selezione.idonee.length}…</p>}
            {fallite.length > 0 && (
              <div className="rounded-md border border-destructive/40 p-2.5 text-xs">
                <p className="font-medium text-destructive">{fatture(fallite.length)} non riuscite: le altre sono a posto.</p>
                <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-muted-foreground">
                  {fallite.map((f) => <li key={f.riga.id}>{f.riga.numero}: {f.motivo}</li>)}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={inCorso} onClick={() => setAzione(null)}>{fallite.length ? "Chiudi" : "Annulla"}</Button>
            {!fallite.length && (
              <Button disabled={!pronta} onClick={() => void parti()}>
                <FileCheck2 className="mr-1.5 h-4 w-4" />{azione ? AZIONI[azione].conferma : ""}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
