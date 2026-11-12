/**
 * A quale commessa va una fattura. Il caso normale è un clic: si sceglie la commessa e si salva. L'importo compare solo
 * se la si divide, ed è sempre col totale della fattura, IVA compresa. Sul costo le quote si salvano sull'imponibile,
 * dove margine e pagamenti le leggono già.
 *
 * La terza destinazione è «A magazzino»: la merce che avanza e resta in giacenza. Non è costo di nessuna commessa
 * (lo diventa quando esce, col costo medio della scheda) e non è nemmeno spesa generale: senza questa casella quella
 * quota finiva addosso a una commessa che non l'ha usata, e all'uscita la stessa spesa veniva contata due volte.
 * La regola che il riquadro fa rispettare: commesse + magazzino + spese generali = imponibile.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Package, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogContentOperativo as DialogContent } from "@/components/orders/generali/design/ContestoOperativo";
import { Input } from "@/components/ui/input";
import { OrderSelectCombobox } from "@/components/warehouse/OrderSelectCombobox";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { leggiImporto } from "@/lib/fatturazione/quoteOrdini";
import { DESTINAZIONE_MAGAZZINO, magazzinoDaVoci, magazzinoInNetto, problemaRipartizione, quotaMagazzinoDelCosto, righeMagazzinoDelCosto, quoteDaVoci, quoteDelCosto, quoteLordeInNette, residuoDaAssegnare, vociFattura, type QuotaCommessa } from "@/lib/fatturazione/ripartizioneFattura";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface FatturaDaCollegare {
  id: string; numero: string | null; fornitore: string | null; imponibile: number | null; totale: number | null;
  companyCostId: string | null; purchaseOrderId?: string | null; suOrdini?: boolean;
}

type Riga = { chiave: number; order_id: string; importo: string };
const testoImporto = (n: number) => (Math.round(n * 100) / 100).toString().replace(".", ",");

export function CollegaFatturaCommesseDialog({ fattura, companyId, onChiudi, onScegliOrdine, commessaIniziale }: {
  fattura: FatturaDaCollegare; companyId: string; onChiudi: () => void; onScegliOrdine?: () => void; commessaIniziale?: string;
}) {
  const queryClient = useQueryClient();
  const totale = Math.abs(Number(fattura.totale ?? fattura.imponibile ?? 0));
  const imponibile = Math.abs(Number(fattura.imponibile ?? fattura.totale ?? 0));
  const suOrdine = !!fattura.purchaseOrderId || !!fattura.suOrdini;
  const { data, isLoading } = useQuery({
    queryKey: ["fattura-collega-commesse", fattura.id],
    staleTime: 0,
    queryFn: async () => {
      const [{ data: f, error: e1 }, costo] = await Promise.all([
        db.from("fatture_ricevute").select("righe").eq("id", fattura.id).eq("company_id", companyId).maybeSingle(),
        fattura.companyCostId
          ? db.from("company_costs").select("order_id, allocations, quota_magazzino, quota_magazzino_righe").eq("id", fattura.companyCostId).eq("company_id", companyId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (e1) throw e1;
      if (costo.error) throw costo.error;
      return { righe: f?.righe ?? null, costo: costo.data };
    },
  });
  const voci = useMemo(() => vociFattura(data?.righe), [data?.righe]);
  const salvate = useMemo(() => quoteDelCosto(data?.costo), [data?.costo]);
  const [perVoci, setPerVoci] = useState(false);
  const [righe, setRighe] = useState<Riga[]>([{ chiave: 0, order_id: commessaIniziale ?? "", importo: testoImporto(totale) }]);
  const [soloUnaParte, setSoloUnaParte] = useState(false);
  const [magazzino, setMagazzino] = useState("");
  const [scelte, setScelte] = useState<Record<number, string | undefined>>({});
  const [salvataggio, setSalvataggio] = useState(false);
  const [letto, setLetto] = useState(false);

  // Si riparte da come è ora: cambiare una quota non deve voler dire riscriverle tutte.
  useEffect(() => {
    if (!data || letto) return;
    setLetto(true);
    const giaInMagazzino = quotaMagazzinoDelCosto(data.costo);
    const righeInMagazzino = righeMagazzinoDelCosto(data.costo);
    if (giaInMagazzino > 0) setMagazzino(testoImporto(imponibile ? (giaInMagazzino * totale) / imponibile : giaInMagazzino));
    if (salvate.length === 0 && righeInMagazzino.length === 0) return;
    setRighe(salvate.length
      ? salvate.map((q, i) => ({ chiave: i, order_id: q.order_id, importo: testoImporto((totale * q.pct) / 100) }))
      : [{ chiave: 0, order_id: "", importo: "" }]);
    if (salvate.length === 1 && salvate[0].pct < 99.99) setSoloUnaParte(true);
    if (salvate.some((q) => q.righe?.length) || righeInMagazzino.length > 0) {
      setPerVoci(true);
      setScelte({
        ...Object.fromEntries(salvate.flatMap((q) => (q.righe ?? []).map((n) => [n, q.order_id]))),
        ...Object.fromEntries(righeInMagazzino.map((n) => [n, DESTINAZIONE_MAGAZZINO])),
      });
    }
  }, [data, letto, salvate, totale, imponibile]);

  // `leggiImporto` dà NaN per la casella vuota o scritta a metà: senza questo filtro
  // il NaN si propagherebbe negli importi delle commesse e le svuoterebbe.
  const scrittoAMagazzino = leggiImporto(magazzino);
  const magazzinoLordo = Number.isFinite(scrittoAMagazzino) && scrittoAMagazzino > 0 ? scrittoAMagazzino : 0;
  // Voce per voce la quota a magazzino è la somma delle voci mandate lì; dividendo per
  // importi è la casella «A magazzino», che si scrive col lordo come tutte le altre.
  const magazzinoNetto = perVoci ? magazzinoDaVoci(voci, scelte) : magazzinoInNetto(magazzinoLordo, totale, imponibile);
  const lorde: QuotaCommessa[] = righe.map((r) => ({ order_id: r.order_id, importo: leggiImporto(r.importo) }));
  const dasalvare = perVoci ? quoteDaVoci(voci, scelte) : quoteLordeInNette(lorde, totale, imponibile, magazzinoLordo);
  const problema = perVoci
    ? problemaRipartizione(dasalvare, imponibile, magazzinoNetto)
    : problemaRipartizione(lorde, totale, magazzinoLordo);
  const residuo = perVoci
    ? residuoDaAssegnare(dasalvare, imponibile, magazzinoNetto) * (imponibile ? totale / imponibile : 1)
    : residuoDaAssegnare(lorde, totale, magazzinoLordo);
  const mostraImporti = righe.length > 1 || soloUnaParte || magazzinoLordo > 0;

  const cambiaImporto = (chiave: number, testo: string) => setRighe((prima) => {
    const dopo = prima.map((x) => (x.chiave === chiave ? { ...x, importo: testo } : x));
    // In due, l'altra prende il resto: non c'è da fare conti.
    if (dopo.length !== 2) return dopo;
    const resto = totale - magazzinoLordo - leggiImporto(testo);
    return dopo.map((x) => (x.chiave === chiave || resto < 0 ? x : { ...x, importo: testoImporto(resto) }));
  });
  const aggiungi = () => setRighe((prima) => {
    const chiave = Math.max(...prima.map((x) => x.chiave)) + 1;
    if (prima.length === 1) {
      const daDividere = totale - magazzinoLordo;
      const meta = Math.round((daDividere / 2) * 100) / 100;
      return [{ ...prima[0], importo: testoImporto(meta) }, { chiave, order_id: "", importo: testoImporto(daDividere - meta) }];
    }
    return [...prima, { chiave, order_id: "", importo: residuo > 0 ? testoImporto(residuo) : "" }];
  });
  // «Una parte resta in magazzino» si comporta come «Dividi su un'altra commessa»: se c'è
  // un residuo lo prende, altrimenti si fa spazio dimezzando l'ultima commessa.
  const apriMagazzino = () => {
    if (residuo > 0.009) { setMagazzino(testoImporto(residuo)); return; }
    const ultima = righe[righe.length - 1];
    const suo = leggiImporto(ultima?.importo ?? "");
    if (!Number.isFinite(suo) || suo <= 0) { setMagazzino(testoImporto(totale)); return; }
    const meta = Math.round((suo / 2) * 100) / 100;
    setRighe(righe.map((x) => (x.chiave === ultima.chiave ? { ...x, importo: testoImporto(meta) } : x)));
    setMagazzino(testoImporto(suo - meta));
  };
  const togli = (chiave: number) => setRighe((prima) => {
    const dopo = prima.filter((x) => x.chiave !== chiave);
    return dopo.length === 1 ? [{ ...dopo[0], importo: testoImporto(totale - magazzinoLordo) }] : dopo;
  });

  const salva = async (quote: QuotaCommessa[], inMagazzino = 0) => {
    setSalvataggio(true);
    try {
      const righeMagazzino = perVoci ? voci.filter((v) => scelte[v.numero] === DESTINAZIONE_MAGAZZINO).map((v) => v.numero) : [];
      const { error } = await db.rpc("fattura_collega_commesse", {
        p_fattura_id: fattura.id, p_quote: quote, p_magazzino: inMagazzino,
        p_magazzino_righe: righeMagazzino.length ? righeMagazzino : null,
      });
      if (error) throw error;
      toast.success(
        quote.length === 0 && inMagazzino === 0 ? "Fattura scollegata dalle commesse"
        : quote.length === 0 ? "Fattura messa tutta a magazzino"
        : quote.length === 1 && inMagazzino === 0 ? "Fattura collegata alla commessa"
        : quote.length === 1 ? "Fattura divisa fra una commessa e il magazzino"
        : inMagazzino > 0 ? `Fattura divisa su ${quote.length} commesse e il magazzino`
        : `Fattura divisa su ${quote.length} commesse`,
      );
      refreshFinancialQueries(queryClient);
      for (const k of ["fatture-ricevute", "fatture-costi-commesse", "fattura-ricevuta-riepilogo", "margin"]) void queryClient.invalidateQueries({ queryKey: [k] });
      onChiudi();
    } catch (e) {
      toast.error("Collegamento non salvato", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSalvataggio(false);
    }
  };

  const linkDiscreto = "text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50";
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onChiudi(); }}>
      <DialogContent struttura="scorrevole" className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>A quale commessa va?</DialogTitle>
          <DialogDescription>{fattura.fornitore ?? "Fornitore"} · n. {fattura.numero ?? "—"} · <span className="font-medium text-foreground">{formatCurrency(totale)}</span> IVA inclusa</DialogDescription>
        </DialogHeader>
        {suOrdine ? (
          <p role="status" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            È su un ordine d’acquisto: la commessa viene da lì. Per sceglierla qui, scollegala prima dall’ordine.
          </p>
        ) : isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">Caricamento…</p>
        ) : perVoci ? (
          <div className="space-y-2">
            <ul className="divide-y rounded-md border" aria-label="Voci della fattura">
              {voci.map((v) => (
                <li key={v.numero} className="space-y-1.5 p-2 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0">{v.descrizione}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{formatCurrency(v.imponibile * (imponibile ? totale / imponibile : 1))}</span>
                  </div>
                  {scelte[v.numero] === DESTINAZIONE_MAGAZZINO ? (
                    <div className="flex items-center gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-dashed px-3 py-1.5 text-sm">
                        <Package className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="min-w-0 truncate">Resta a magazzino</span>
                      </div>
                      <Button type="button" variant="ghost" size="sm" className="shrink-0"
                        onClick={() => setScelte({ ...scelte, [v.numero]: undefined })}>Scegli una commessa</Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <OrderSelectCombobox filtroIniziale="all" companyId={companyId} value={scelte[v.numero]} placeholder="Commessa…" onChange={(id: string) => setScelte({ ...scelte, [v.numero]: id })} />
                      </div>
                      <Button type="button" variant="ghost" size="sm" className="shrink-0" aria-label={`Manda a magazzino: ${v.descrizione}`}
                        onClick={() => setScelte({ ...scelte, [v.numero]: DESTINAZIONE_MAGAZZINO })}>A magazzino</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <button type="button" className={linkDiscreto} onClick={() => setPerVoci(false)}>Torna a dividere per importi</button>
          </div>
        ) : (
          <div className="space-y-2">
            {righe.map((r, i) => (
              <div key={r.chiave} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <OrderSelectCombobox filtroIniziale="all" companyId={companyId} value={r.order_id || undefined} placeholder="Cerca la commessa…"
                    esclusi={righe.filter((x) => x.chiave !== r.chiave).map((x) => x.order_id).filter(Boolean)}
                    onChange={(id: string) => setRighe(righe.map((x) => (x.chiave === r.chiave ? { ...x, order_id: id } : x)))} />
                </div>
                {mostraImporti && (
                  <div className="relative w-28 shrink-0">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                    <Input aria-label={`Importo della commessa ${i + 1}`} inputMode="decimal" className="pl-6 text-right" value={r.importo} onChange={(e) => cambiaImporto(r.chiave, e.target.value)} />
                  </div>
                )}
                {righe.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={`Togli la commessa ${i + 1}`} onClick={() => togli(r.chiave)}><X className="h-4 w-4" /></Button>
                )}
              </div>
            ))}
            {magazzino !== "" && (
              <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm">
                  <Package className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 truncate">A magazzino</span>
                </div>
                <div className="relative w-28 shrink-0">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                  <Input aria-label="Importo che resta a magazzino" inputMode="decimal" className="pl-6 text-right" value={magazzino} onChange={(e) => setMagazzino(e.target.value)} />
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Togli la quota a magazzino" onClick={() => setMagazzino("")}><X className="h-4 w-4" /></Button>
              </div>
            )}
            {magazzino !== "" && (
              <p className="text-xs text-muted-foreground">
                Non è costo di nessuna commessa: lo diventa quando la merce esce dal magazzino, col suo costo medio.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
              <button type="button" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline" onClick={aggiungi}>
                <Plus className="h-4 w-4" />Dividi su un’altra commessa
              </button>
              {magazzino === "" && (
                <button type="button" className={linkDiscreto} onClick={apriMagazzino}>
                  Una parte resta in magazzino
                </button>
              )}
              {voci.length > 1 && <button type="button" className={linkDiscreto} onClick={() => setPerVoci(true)}>Voce per voce</button>}
              {righe.length === 1 && !soloUnaParte && <button type="button" className={linkDiscreto} onClick={() => setSoloUnaParte(true)}>Solo una parte</button>}
            </div>
          </div>
        )}
        {!suOrdine && !isLoading && Math.abs(residuo) > 0.009 && (perVoci || mostraImporti) && (
          <p className={residuo < 0 ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
            {residuo > 0
              ? `Restano ${formatCurrency(residuo)} fuori dalle commesse${magazzinoNetto > 0 ? " e dal magazzino" : ""}: vanno nelle spese generali.`
              : `Hai assegnato ${formatCurrency(-residuo)} di troppo.`}
          </p>
        )}
        {/* Una riga ancora vuota non è un errore: basta che «Salva» aspetti. */}
        {problema && dasalvare.every((q) => q.order_id) && <p role="alert" className="text-sm text-destructive">{problema}</p>}
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {onScegliOrdine && <button type="button" className={linkDiscreto} onClick={onScegliOrdine}>{suOrdine ? "Cambia ordine d’acquisto" : "Va su un ordine d’acquisto"}</button>}
            {!suOrdine && (salvate.length > 0 || quotaMagazzinoDelCosto(data?.costo) > 0) && <button type="button" className={linkDiscreto} disabled={salvataggio} onClick={() => void salva([], 0)}>Scollega</button>}
          </div>
          {!suOrdine && (
            <Button type="button" disabled={salvataggio || isLoading || !!problema || (dasalvare.length === 0 && magazzinoNetto === 0)} onClick={() => void salva(dasalvare, magazzinoNetto)}>
              {salvataggio && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Salva
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
