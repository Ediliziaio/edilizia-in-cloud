import { useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileCheck, ArrowUpRight, AlertCircle, Check, ChevronDown } from "lucide-react";
import { numeroEditor } from "@/lib/computo/editorNativo";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { verificaDelMateriale } from "@/lib/distinta/verificaAcquisto";
import { guidaVerifica } from "@/lib/distinta/guidaVerifica";
import { bozzaDelMateriale, specificheGiaLette, type BozzaVerificaMateriale, type MaterialeDaVerificare } from "@/lib/distinta/bozzaVerificaMateriale";
import type { MaterialeFase } from "@/hooks/useMaterialiPerFase";
import type { Json } from "@/integrations/supabase/types";
import { DatiDocumentoMateriale } from "./DatiDocumentoMateriale";
import { CalcoloQuantitaAssistito } from "./CalcoloQuantitaAssistito";
import { specificheConCalcolo } from "@/lib/distinta/calcoloAcquistoAssistito";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

/** Approvazione della singola riga: dati e motivazione espliciti, senza attivare ricette AI per tutta l'azienda. */
export function VerificaDatiMateriale({ m }: { m: MaterialeFase }) {
  const t = useT();
  const [aperto, setAperto] = useState(false);
  if (verificaDelMateriale(m)?.stato !== "da_verificare") return null;
  return <>
    <Button size="sm" variant="ghost" aria-label={t("Completa dati tecnici")} className="h-7 gap-1 rounded-md px-2 text-[11px] font-medium text-amber-800 hover:bg-amber-50 hover:text-amber-900" onClick={() => setAperto(true)}>{t("Verifica dati")}<ArrowUpRight className="h-3 w-3" aria-hidden /></Button>
    {aperto && <VerificaDatiMaterialeDialog m={m} aperto={aperto} onAperto={setAperto} />}
  </>;
}

export function VerificaDatiMaterialeDialog({ m, aperto, onAperto, onConfermata, avanzamento, bozza, onBozza, onRimanda }: {
  m: MaterialeDaVerificare;
  aperto: boolean; onAperto: (v: boolean) => void; onConfermata?: () => void;
  avanzamento?: { posizione: number; totale: number };
  bozza?: BozzaVerificaMateriale; onBozza?: (bozza: BozzaVerificaMateriale) => void; onRimanda?: (bozza: BozzaVerificaMateriale) => void;
}) {
  const tr = useT();
  const iniziale = bozza ?? bozzaDelMateriale(m);
  const [nome, setNome] = useState(iniziale.nome);
  const [quantita, setQuantita] = useState(iniziale.quantita);
  const [unita, setUnita] = useState(iniziale.unita);
  const [specifiche, setSpecifiche] = useState(iniziale.specifiche);
  const [nota, setNota] = useState(iniziale.nota);
  const [verificato, setVerificato] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState("");
  const [indicazioniAperte, setIndicazioniAperte] = useState(false);
  const idCampi = useId();
  const { effectiveCompany, user } = useAuth();
  const qc = useQueryClient();
  const verifica = verificaDelMateriale(m);
  const guida = guidaVerifica(m);
  if (verifica?.stato !== "da_verificare") return null;
  const qVerificata = numeroEditor(quantita);
  const pezziInteri = !/^(?:pz|pezzi|cad\.?|cadauno|n\.?|nr\.?)$/i.test(unita.trim()) || (qVerificata != null && Number.isInteger(qVerificata));
  const richiesti = [!nome.trim() && tr("Nome del prodotto"), (qVerificata == null || qVerificata <= 0) && tr("Quantità maggiore di zero"),
    !pezziInteri && tr("Numero intero di pezzi"), !unita.trim() && tr("Unità d'acquisto"), !specifiche.trim() && tr("Caratteristiche del prodotto"),
    !nota.trim() && tr("Fonte usata per la verifica"), !verificato && tr("Conferma della verifica")].filter((s): s is string => !!s);
  const valida = richiesti.length === 0;
  const bozzaAttuale = () => ({ nome, quantita, unita, specifiche, nota });
  const chiudi = (apri: boolean) => {
    if (salvando) return;
    if (!apri) onBozza?.(bozzaAttuale());
    onAperto(apri);
  };
  const salva = async () => {
    if (!valida || !user || !effectiveCompany || qVerificata == null) return;
    setSalvando(true);
    setErrore("");
    try {
      const { data: ordine, error: erroreOrdine } = await supabase.from("orders").select("id").eq("id", m.order_id).eq("company_id", effectiveCompany.id).single();
      if (erroreOrdine || !ordine) throw erroreOrdine ?? new Error(tr("Commessa non disponibile."));
      const { data: attuale, error } = await supabase.from("order_items").select("id,updated_at,origini,status,stock_item_id,quantity_reserved,quantity_received,supplier_rfq_item_id,phase_id")
        .eq("id", m.id).eq("order_id", m.order_id).single();
      if (error) throw error;
      if (attuale.status !== "da_ordinare" || attuale.stock_item_id || Number(attuale.quantity_reserved) > 0 || Number(attuale.quantity_received) > 0 || attuale.supplier_rfq_item_id) throw new Error(tr("La riga è già impegnata: riconcilia prima magazzino, offerta e ordini."));
      const { data: coperture, error: erroreCoperture } = await supabase.from("purchase_order_items").select("id,purchase_orders!inner(status)").eq("order_item_id", m.id).neq("purchase_orders.status", "annullato").limit(1);
      if (erroreCoperture) throw erroreCoperture;
      if (coperture?.length) throw new Error(tr("La riga ha già un ordine collegato: riconcilialo prima di modificare i dati."));
      if (attuale.phase_id) {
        const { data: fase, error: erroreFase } = await supabase.from("materiali_fasi_validazione").select("stato").eq("order_id", m.order_id).eq("phase_id", attuale.phase_id).maybeSingle();
        if (erroreFase) throw erroreFase;
        if (fase && fase.stato !== "bozza") throw new Error(tr("Riporta i materiali della fase in bozza prima di correggerli."));
      }
      if (JSON.stringify(attuale.origini) !== JSON.stringify(m.origini)) throw new Error(tr("La fonte è cambiata: aggiorna la commessa e ricontrolla i dati."));
      const origine = (Array.isArray(attuale.origini) ? attuale.origini : []).map(o => typeof o === "object" && o && !Array.isArray(o)
        ? { ...o, verifica_acquisto: { stato: "confermata", motivi: [...verifica.motivi, `Verifica dell'utente: ${nota.trim()}`],
          campi_mancanti: [] as string[], confermata_il: new Date().toISOString(), confermata_da: user.id } } : o);
      let q = supabase.from("order_items").update({ name: nome.trim(), quantity: qVerificata, quantita_calcolata: qVerificata,
        quantita_netta: qVerificata, unita_misura: unita.trim(), specifiche: specifiche.trim(), description: specifiche.trim(), origini: origine as Json })
        .eq("id", m.id).eq("order_id", m.order_id);
      q = attuale.updated_at ? q.eq("updated_at", attuale.updated_at) : q.is("updated_at", null);
      const { data: fatte, error: erroreSalvataggio } = await q.select("id");
      if (erroreSalvataggio) throw erroreSalvataggio;
      if (!fatte?.length) throw new Error(tr("La riga è cambiata durante la verifica. Aggiorna e riprova."));
      await Promise.all([qc.invalidateQueries({ queryKey: ["materiali-per-fase"] }), qc.invalidateQueries({ queryKey: ["piano-acquisti-computo"] }), qc.invalidateQueries({ queryKey: ["order-items"] }), qc.invalidateQueries({ queryKey: ["fabbisogno-materiali"] })]);
      toast.success(tr("Materiale verificato"), { description: tr("Il piano acquisti viene ricalcolato con i dati confermati.") });
      if (onConfermata) onConfermata(); else onAperto(false);
    } catch (e) {
      const messaggio = e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e);
      setErrore(messaggio); toast.error(tr("Verifica non salvata"), { description: messaggio });
    }
    finally { setSalvando(false); }
  };
  return <Dialog open={aperto} onOpenChange={chiudi}><DialogContent className="flex max-h-[92dvh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
      <DialogHeader className="border-b px-5 py-4 text-left">
        <div className="flex items-start gap-3 pr-6"><span className="rounded-xl bg-amber-50 p-2.5 text-amber-700"><FileCheck className="h-5 w-5" aria-hidden /></span>
          <div className="min-w-0">{avanzamento && <p className="mb-1 text-xs font-medium text-primary">{tr("Articolo {posizione} di {totale}", { posizione: avanzamento.posizione, totale: avanzamento.totale })}</p>}
            <DialogTitle>{tr("Verifica del materiale")}</DialogTitle><DialogDescription className="mt-1 line-clamp-2 text-sm" dir="auto">{m.name}</DialogDescription></div>
        </div>
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid md:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="space-y-4 border-b bg-muted/25 p-5 md:border-b-0 md:border-r">
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs font-medium text-muted-foreground">{guida.tipoQuantita}</p>
              {guida.dati?.quantita_documento != null && <p className="mt-1 text-sm font-semibold">{guida.dati.quantita_documento.toLocaleString(intlCampo())} {guida.dati.unita_documento}</p>}
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{tr("Proposta attuale: {quantita} {unita}. Completa solo ciò che serve a verificarla.", { quantita: m.quantity.toLocaleString(intlCampo()), unita: m.unita_misura ?? "" })}</p>
            </div>
            <Button type="button" variant="ghost" size="sm" className="h-auto w-full justify-between gap-2 px-0 text-xs md:hidden" aria-expanded={indicazioniAperte}
              aria-label={tr("Indicazioni e fonti della verifica")} onClick={() => setIndicazioniAperte(v => !v)}>
              {tr("Cosa verificare e dove trovare i dati")}<ChevronDown className={"h-3.5 w-3.5 shrink-0 " + (indicazioniAperte ? "rotate-180" : "")} aria-hidden />
            </Button>
            <div className={(indicazioniAperte ? "" : "hidden ") + "space-y-4 md:block"}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tr("Cosa completare")}</p>
            <ol className="space-y-4" aria-label={tr("Come completare il materiale")}>{guida.azioni.map((a, i) => <li key={a.titolo} className="flex gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[11px] font-semibold text-amber-900">{i + 1}</span>
              <div><p className="text-xs font-semibold">{a.titolo}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{a.dettaglio}</p>
                <p className="mt-1 text-[11px] font-medium text-primary">{a.fonte}</p></div></li>)}</ol>
            <DatiDocumentoMateriale dati={guida.dati} />
            <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">{tr("Dettagli della segnalazione")}</summary>
              <ul className="mt-2 space-y-2 text-amber-900">{verifica.motivi.map(t => <li key={t}>{t}</li>)}</ul></details>
            </div>
          </aside>
          <fieldset disabled={salvando} className="min-w-0 space-y-4 p-5">
            <p className="text-sm font-semibold">{tr("Dati da usare per l'acquisto")}</p>
            <label className="block text-xs font-medium">{tr("Prodotto")}<Input className="mt-1.5" value={nome} onChange={e => setNome(e.target.value)} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-medium">{tr("Quantità verificata")}<Input className="mt-1.5" inputMode="decimal" value={quantita} onChange={e => setQuantita(e.target.value)} /></label>
              <label className="text-xs font-medium">{tr("Unità d'acquisto")}<Input className="mt-1.5" placeholder={tr("Es. pz, kg, sacco")} value={unita} onChange={e => setUnita(e.target.value)} /></label>
            </div>
            {verifica.campi_mancanti.some(c => ["resa", "quantita", "confezione"].includes(c)) && <CalcoloQuantitaAssistito baseIniziale={guida.dati?.quantita_documento} onApplica={v => {
              setQuantita(String(v.quantita)); setUnita(v.unita); setVerificato(false);
              setNota(prima => prima.includes(v.nota) ? prima : [prima, v.nota].filter(Boolean).join("\n"));
              setSpecifiche(prima => specificheConCalcolo(prima, v.specifiche));
            }} />}
            <div className="text-xs font-medium"><label htmlFor={idCampi + "-specifiche"}>{tr("Specifiche confermate")}</label><textarea id={idCampi + "-specifiche"} className="mt-1.5 min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm font-normal leading-5" value={specifiche} onChange={e => setSpecifiche(e.target.value)} />
              {!m.specifiche?.trim() && specifiche && specifiche === specificheGiaLette(m) && <p className="mt-1 text-[11px] font-normal text-primary">{tr("Riprese dal documento: controllale prima di confermare.")}</p>}
            </div>
            <div className="text-xs font-medium"><label htmlFor={idCampi + "-fonte"}>{tr("Fonte della verifica e calcolo della quantità")}</label><textarea id={idCampi + "-fonte"} className="mt-1.5 min-h-20 w-full rounded-md border border-input bg-background p-3 text-sm font-normal" placeholder={tr("Es. scheda prodotto, resa, mani, confezioni, rilievo o offerta e data")} value={nota} onChange={e => setNota(e.target.value)} /></div>
            <label className="flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-xs leading-5"><input className="mt-1" type="checkbox" checked={verificato} onChange={e => setVerificato(e.target.checked)} />{tr("Ho verificato quantità, unità, caratteristiche e inclusioni della fornitura.")}</label>
            {richiesti.length > 0 && <div className="rounded-lg border border-dashed bg-muted/20 p-3" aria-label={tr("Dati richiesti per salvare")}>
              <p className="text-xs font-medium">{tr("Per salvare manca:")}</p><ul className="mt-1 space-y-1 text-xs text-muted-foreground">{richiesti.map(r => <li key={r} className="flex gap-1.5"><span aria-hidden>·</span>{r}</li>)}</ul>
            </div>}
            {errore && <p role="alert" className="flex gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden />{errore}</p>}
          </fieldset>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-5 py-3">
        <div className="min-w-0 text-xs text-muted-foreground"><span>{valida ? <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5 text-emerald-700" aria-hidden />{tr("Dati pronti per il ricalcolo degli acquisti.")}</span> : tr(richiesti.length === 1 ? "{n} conferma da completare" : "{n} conferme da completare", { n: richiesti.length })}</span>
          {onBozza && <p className="mt-1">{tr("Le modifiche non confermate restano solo in questa pagina.")}</p>}</div>
        <div className="flex flex-wrap justify-end gap-2 max-sm:w-full"><Button variant="ghost" disabled={salvando} onClick={() => chiudi(false)}>{onBozza ? tr("Pausa") : tr("Annulla")}</Button>
          {onRimanda && <Button variant="outline" disabled={salvando} onClick={() => onRimanda(bozzaAttuale())}>{tr("Salta per ora")}</Button>}
          <Button disabled={!valida || salvando} onClick={salva}>{salvando ? tr("Salvataggio…") : avanzamento ? avanzamento.posizione < avanzamento.totale ? tr("Salva e continua") : tr("Salva e termina") : tr("Conferma dati di questa riga")}</Button></div>
      </div>
    </DialogContent></Dialog>;
}
