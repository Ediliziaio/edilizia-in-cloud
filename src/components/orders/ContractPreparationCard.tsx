import type { ContractPreparation, ConfirmedValues } from "@/lib/orders/contractPreparation";
import { contractConfirmations } from "@/lib/orders/contractPreparation";
import { eLavoroSingolo } from "@/lib/orders/confermeContratto";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList } from "lucide-react";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

/** Le conferme dette in due parole, per la riga compatta. */
const ETICHETTE: Record<string, string> = {
  cliente: "cliente", importo: "importo", iva: "IVA", rate: "pagamenti", standard: "fasi di lavoro", date: "date dei lavori",
};

/**
 * Un lavoro singolo (14/11/2026): la scheda alta con «Organizzazione da confermare» e «Standard selezionato
 * automaticamente» diceva in gergo cose che il modulo mostra già (modello delle fasi, date). Resta una riga con
 * quello che manca, più gli avvisi dell'AI sul documento. `nascondi`: conferme che la pagina mostra altrove
 * (in «Nuova commessa» cliente, importo, IVA e pagamenti stanno nella barra «Manca:»).
 */
function RigaDaConfermare({ piano, confermati, nascondi }: { piano: ContractPreparation; confermati: ConfirmedValues; nascondi: readonly string[] }) {
  const t = useT();
  const mancanti = contractConfirmations(piano, confermati).filter((x) => !nascondi.includes(x.key));
  const brevi = mancanti.filter((x) => ETICHETTE[x.key]).map((x) => t(ETICHETTE[x.key]));
  const avvisi = mancanti.filter((x) => !ETICHETTE[x.key]);
  if (!brevi.length && !avvisi.length) return null;
  return <section aria-label={t("Dati da confermare")} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
    {brevi.length > 0 && <p><span className="font-medium">{t("Dal contratto, da confermare:")}</span> {brevi.join(" · ")}</p>}
    {avvisi.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">{avvisi.map((x) => <li key={x.key}>{x.testo}</li>)}</ul>}
  </section>;
}

export function ContractPreparationCard({ piano, confermati = {}, nascondi = [] }: { piano: ContractPreparation; confermati?: ConfirmedValues; nascondi?: readonly string[] }) {
  const t = useT();
  if (eLavoroSingolo(piano)) return <RigaDaConfermare piano={piano} confermati={confermati} nascondi={nascondi} />;
  const mancanti = contractConfirmations(piano, confermati);
  return <Card className="border-orange-200" aria-label={t("Preparazione dal contratto")}>
    <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ClipboardList className="h-5 w-5" />{t("Proposta dal contratto")}</CardTitle></CardHeader>
    <CardContent className="space-y-5 text-sm">
      {piano.profilo === "manutenzione_stradale_su_ordine" && <p className="text-muted-foreground">{t("Profilo aziendale: manutenzione stradale su ordine")}</p>}
      <div><p className="font-semibold">{piano.organizzazione === "interventi_su_ordine" ? t("Contratto ricorrente · interventi su ordinazione") : piano.organizzazione === "lavoro_singolo" ? t("Singolo lavoro") : t("Organizzazione da confermare")}</p><p className="mt-1 text-muted-foreground">{piano.motivo}</p></div>
      {piano.extract.appalto_pubblico?.durata_giorni != null && <p>{t("Durata letta nel contratto:")} <strong>{t("{n} giorni", { n: piano.extract.appalto_pubblico.durata_giorni.toLocaleString(intlCampo()) })}</strong>. {t("Decorrenza e termine da verificare; non sono i giorni lavorativi del singolo intervento.")}</p>}
      <p><strong>{t("Standard selezionato automaticamente:")}</strong> {piano.standardNome ?? t("Da scegliere: corrispondenza non univoca")}</p>
      {piano.organizzazione === "interventi_su_ordine" && <p className="text-muted-foreground">{t("Gli interventi si organizzano su ordine. Il solo contratto non genera appuntamenti mensili o quantità da eseguire.")}</p>}
      {mancanti.length > 0 && <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950" aria-label={t("Dati da confermare")}><h3 className="mb-2 font-semibold">{t("Dati da confermare")}</h3><ul className="list-disc space-y-1 pl-5">{mancanti.map(x => <li key={x.key}>{x.testo}</li>)}</ul></section>}
      {piano.profilo === "manutenzione_stradale_su_ordine" && <div className="grid gap-4 md:grid-cols-2">
        <section aria-label={t("Adempimenti ufficio")}><h3 className="font-semibold">{t("Ufficio · gestione del contratto")}</h3><p className="my-2 text-muted-foreground">{t("Attività da assegnare, senza scadenze inventate. Non modificano l’avanzamento dei lavori.")}</p>{piano.ufficio.length ? <ol className="list-decimal space-y-2 pl-5">{piano.ufficio.map(s => <li key={s.nome}><details><summary className="cursor-pointer">{s.nome}</summary><ul className="list-disc space-y-1 py-2 pl-4 text-muted-foreground">{s.controlli.map(c => <li key={c}>{c}</li>)}</ul></details></li>)}</ol> : <p>{t("Nessun adempimento ricorrente proposto.")}</p>}</section>
        <section aria-label={t("Lavorazioni cantiere")}><h3 className="font-semibold">{t("Cantiere · esecuzione degli interventi")}</h3>{piano.organizzazione === "interventi_su_ordine" ? <><p className="mt-2 text-muted-foreground">{t("Si organizza ogni intervento quando arriva l’ordine: luogo, quantità, lavorazioni, date, squadre e mezzi propri.")}</p><p className="mt-2">{t("Nessuna lavorazione esecutiva avviata dal solo contratto. Fresatura e bitumatura si applicano agli interventi che le prevedono.")}</p></> : <p className="mt-2">{t("{n} fasi proposte dal modello. Verificale nella pianificazione dei lavori.", { n: piano.cantiere.length })}</p>}</section>
      </div>}
    </CardContent>
  </Card>;
}
