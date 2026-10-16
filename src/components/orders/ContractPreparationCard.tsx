import type { ContractPreparation, ConfirmedValues } from "@/lib/orders/contractPreparation";
import { contractConfirmations } from "@/lib/orders/contractPreparation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList } from "lucide-react";

export function ContractPreparationCard({ piano, confermati = {} }: { piano: ContractPreparation; confermati?: ConfirmedValues }) {
  const mancanti = contractConfirmations(piano, confermati);
  return <Card className="border-orange-200" aria-label="Preparazione dal contratto">
    <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ClipboardList className="h-5 w-5" />Proposta dal contratto</CardTitle></CardHeader>
    <CardContent className="space-y-5 text-sm">
      <div><p className="font-semibold">{piano.organizzazione === "interventi_su_ordine" ? "Contratto ricorrente · interventi su ordinazione" : "Singolo lavoro"}</p><p className="mt-1 text-muted-foreground">{piano.motivo}</p></div>
      {piano.extract.appalto_pubblico?.durata_giorni != null && <p>Durata letta nel contratto: <strong>{piano.extract.appalto_pubblico.durata_giorni.toLocaleString("it-IT")} giorni</strong>. Decorrenza e termine da verificare; non sono i giorni lavorativi del singolo intervento.</p>}
      <p><strong>Standard selezionato automaticamente:</strong> {piano.standardNome ?? "Da scegliere: corrispondenza non univoca"}</p>
      {piano.organizzazione === "interventi_su_ordine" && <p className="text-muted-foreground">Gli interventi si organizzano su ordine. Il solo contratto non genera appuntamenti mensili o quantità da eseguire.</p>}
      {mancanti.length > 0 && <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950" aria-label="Dati da confermare"><h3 className="mb-2 font-semibold">Dati da confermare</h3><ul className="list-disc space-y-1 pl-5">{mancanti.map(x => <li key={x.key}>{x.testo}</li>)}</ul></section>}
      <div className="grid gap-4 md:grid-cols-2">
        <section aria-label="Adempimenti ufficio"><h3 className="font-semibold">Ufficio · gestione del contratto</h3><p className="my-2 text-muted-foreground">Attività da assegnare, senza scadenze inventate. Non modificano l’avanzamento dei lavori.</p>{piano.ufficio.length ? <ol className="list-decimal space-y-2 pl-5">{piano.ufficio.map(s => <li key={s.nome}><details><summary className="cursor-pointer">{s.nome}</summary><ul className="list-disc space-y-1 py-2 pl-4 text-muted-foreground">{s.controlli.map(c => <li key={c}>{c}</li>)}</ul></details></li>)}</ol> : <p>Nessun adempimento ricorrente proposto.</p>}</section>
        <section aria-label="Lavorazioni cantiere"><h3 className="font-semibold">Cantiere · esecuzione degli interventi</h3>{piano.organizzazione === "interventi_su_ordine" ? <><p className="mt-2 text-muted-foreground">Si organizza ogni intervento quando arriva l’ordine: luogo, quantità, lavorazioni, date, squadre e mezzi propri.</p><p className="mt-2">Nessuna lavorazione esecutiva avviata dal solo contratto. Fresatura e bitumatura si applicano agli interventi che le prevedono.</p></> : <p className="mt-2">{piano.cantiere.length} fasi proposte dal modello. Verificale nella pianificazione dei lavori.</p>}</section>
      </div>
    </CardContent>
  </Card>;
}
