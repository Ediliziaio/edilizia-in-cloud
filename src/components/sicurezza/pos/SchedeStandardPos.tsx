import { useState } from "react";
import { BookOpen, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useFasiFascicolo } from "@/hooks/useFascicoloCantiere";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FONTI_SCHEDE_POS, SCHEDE_STANDARD_POS, nuovaDaSchedaStandard, testoRicercaSchedePos } from "../../../../supabase/functions/_shared/posSchedeStandard";
import type { FontePscSchedaPos, FontiSchedaPos } from "../../../../supabase/functions/_shared/posFontiScheda";
import type { Lavorazione } from "../../../../supabase/functions/_shared/posModello";

export function CatalogoSchedeStandardPos({ companyId, orderId, onAggiungi }: {
  companyId?: string; orderId?: string; onAggiungi: (l: Lavorazione) => void;
}) {
  const [aperto, apri] = useState(false);
  const [query, cerca] = useState("");
  const [fase, scegliFase] = useState("");

  const termini = testoRicercaSchedePos(query).split(" ").filter(Boolean);
  const trovate = SCHEDE_STANDARD_POS.filter(s => {
    const testo = testoRicercaSchedePos([s.titolo, s.area, ...s.chiavi].join(" "));
    return termini.every(t => testo.includes(t));
  });
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => apri(true)}>
        <BookOpen className="mr-1 h-4 w-4" aria-hidden="true" /> Schede standard
      </Button>
      <Dialog open={aperto} onOpenChange={v => {
        apri(v);
        if (!v) scegliFase("");
      }}>
        <DialogContent className="flex max-h-[85vh] min-h-0 max-w-3xl flex-col gap-3">
          <DialogHeader>
            <DialogTitle>Schede standard POS</DialogTitle>
            <DialogDescription>Scegli una lavorazione per ritrovare una sequenza di lavoro e i punti da verificare. Potrai modificare la scheda nel POS.</DialogDescription>
          </DialogHeader>
          <div className="relative shrink-0">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={e => cerca(e.target.value)} className="pl-9" aria-label="Cerca una scheda standard" placeholder="Cerca serramenti, cartongesso, ponteggi…" />
          </div>
          {aperto && companyId && orderId && <AssociaFaseScheda companyId={companyId} orderId={orderId} fase={fase} scegliFase={scegliFase} />}
          <ul className="grid min-h-0 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {trovate.map(s => (
              <li key={s.id} className="flex flex-col gap-2 rounded-lg border p-3">
                <span className="text-xs font-medium text-muted-foreground">{s.area}</span>
                <h3 className="text-sm font-semibold">{s.titolo}</h3>
                <p className="text-xs text-muted-foreground">{s.descrizione}</p>
                <Button size="sm" variant="secondary" className="mt-auto self-start" aria-label={`Aggiungi scheda ${s.titolo}`} onClick={() => {
                  const lavorazione = nuovaDaSchedaStandard(s, crypto.randomUUID());
                  if (fase) lavorazione.fase_id = fase;
                  onAggiungi(lavorazione);
                  scegliFase("");
                  cerca("");
                  apri(false);
                }}><Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Aggiungi scheda</Button>
              </li>
            ))}
            {!trovate.length && <li className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground sm:col-span-2">Nessuna scheda trovata.</li>}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AssociaFaseScheda({ companyId, orderId, fase, scegliFase }: {
  companyId: string; orderId: string; fase: string; scegliFase: (id: string) => void;
}) {
  const fasi = useFasiFascicolo(companyId, orderId).data ?? [];
  return !!fasi.length && <label className="block shrink-0 space-y-1 text-sm">
    <span>Associa a una fase della commessa</span>
    <select className="block min-h-9 w-full rounded-md border bg-background px-2" value={fasi.some(f => f.id === fase) ? fase : ""}
      onChange={e => scegliFase(e.target.value)}>
      <option value="">Senza fase</option>
      {fasi.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
    </select>
  </label>;
}

export function RiferimentiSchedaPos({ fonti, superato = false, usaPrescrizione, rimuoviPsc, confermaOcr, apriOriginale }: {
  fonti: FontiSchedaPos; superato?: boolean;
  usaPrescrizione?: (estratto: FontePscSchedaPos["estratti"][number]) => void;
  rimuoviPsc?: () => void;
  confermaOcr?: (indice: number, confermato: boolean) => void;
  apriOriginale?: (pagina?: number) => void;
}) {
  const standard = SCHEDE_STANDARD_POS.find(s => s.id === fonti.standard?.id);
  const fontiStandard = standard ? [FONTI_SCHEDE_POS.modello, FONTI_SCHEDE_POS[standard.fonte]] : [];
  const formatta = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 4 });
  if (!standard && !fonti.computo && !fonti.psc) return null;
  return (
    <details className="rounded-md border bg-background p-2.5 text-xs" open={superato || undefined}>
      <summary className="cursor-pointer font-semibold">Fonti della scheda</summary>
      {standard && <div className="mt-2 space-y-1">
        <p>Standard · {standard.titolo} · v{fonti.standard?.versione}</p>
        <ul className="space-y-1">{fontiStandard.map(f => (
          <li key={f.url}><a className="text-primary underline underline-offset-2" href={f.url} target="_blank" rel="noreferrer">{f.titolo}</a></li>
        ))}</ul>
      </div>}
      {fonti.computo && <div className="mt-2 space-y-1">
        <p className="font-medium">Computo · {fonti.computo.titolo}</p>
        <ul className="space-y-1">
          {fonti.computo.voci.map(v => <li key={v.id} className="break-words">
            {v.codice && <strong className="mr-1">{v.codice}</strong>}{v.titolo}
            {v.quantita != null && <> · {formatta.format(v.quantita)} {v.unita}</>}
            {v.capitolo && <span className="text-muted-foreground"> · {v.capitolo}</span>}
          </li>)}
        </ul>
      </div>}
      {fonti.psc && <div className="mt-2 space-y-1">
        <p className="font-medium">PSC · revisione {fonti.psc.revisione}</p>
        {superato && <p className="text-amber-800">Gli estratti si riferiscono a un PSC diverso. Riesamina questa scheda con il documento corrente.</p>}
        {apriOriginale && !superato && <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => apriOriginale()}>Apri PSC originale</Button>}
        <ul className="space-y-1.5">
          {fonti.psc.estratti.map((v, i) => <li key={`${v.pagina}-${i}`} className="border-l-2 border-muted pl-2">
            <p>{apriOriginale && !superato ? <Button type="button" variant="link" className="h-auto p-0 text-xs font-semibold"
              onClick={() => apriOriginale(v.pagina)}>Pagina {v.pagina}</Button> : <strong>Pagina {v.pagina}</strong>} · {v.testo}</p>
            {v.metodo === "ocr" && <div className="my-1.5 space-y-1">
              <p className={v.confermato ? "text-muted-foreground" : "text-amber-800"}>
                {v.confermato ? "OCR · confrontato con l’originale" : "OCR · da confrontare con l’originale"}
              </p>
              {confermaOcr && !superato && <label className="flex items-center gap-2">
                <Checkbox checked={v.confermato === true} onCheckedChange={valore => confermaOcr(i, valore === true)} />
                Ho confrontato il testo con questa pagina dell’originale
              </label>}
            </div>}
            {usaPrescrizione && !superato && (v.metodo !== "ocr" || v.confermato) && <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => usaPrescrizione(v)}>Porta in Procedure PSC</Button>}
          </li>)}
        </ul>
        {superato && rimuoviPsc && <Button type="button" size="sm" variant="outline" className="h-auto py-1 text-xs" onClick={rimuoviPsc}>Rimuovi gli estratti superati</Button>}
      </div>}
    </details>
  );
}

export function QuesitiSchedaPos({ quesiti, readonly, rispondi }: {
  quesiti: NonNullable<FontiSchedaPos["quesiti"]>; readonly: boolean; rispondi: (n: number, risposta: string) => void;
}) {
  return (
    <fieldset className="space-y-2 rounded-md border p-2.5">
      <legend className="px-1 text-xs font-semibold">Dettagli da confermare sul cantiere</legend>
      {quesiti.map((q, n) => <label key={n} className="block space-y-1 text-xs">
        <span>{q.domanda}</span>
        <Textarea rows={2} maxLength={1500} placeholder="Indica il dato verificato o perché il punto non si applica" value={q.risposta}
          readOnly={readonly} onChange={e => rispondi(n, e.target.value)} />
      </label>)}
    </fieldset>
  );
}
