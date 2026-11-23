import { useState } from "react";
import { ClipboardCheck, CheckCircle2, ArrowRight } from "lucide-react";
import type { MaterialeFase } from "@/hooks/useMaterialiPerFase";
import { verificaDelMateriale } from "@/lib/distinta/verificaAcquisto";
import { bozzaModificata, versionePerBozza, type BozzaVerificaMateriale } from "@/lib/distinta/bozzaVerificaMateriale";
import { Button } from "@/components/ui/button";
import { VerificaDatiMaterialeDialog } from "./VerificaDatiMateriale";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/** La coda segue i risultati visibili; una conferma riuscita apre il materiale seguente. */
export function RevisioneMateriali({ materiali }: { materiali: MaterialeFase[] }) {
  const t = useT();
  const [sessione, setSessione] = useState<{ voci: MaterialeFase[]; indice: number } | null>(null);
  const [confermati, setConfermati] = useState(0);
  const [rimandati, setRimandati] = useState(0);
  const [inPausa, setInPausa] = useState<string | null>(null);
  const [bozze, setBozze] = useState<Record<string, { versione: string; dati: BozzaVerificaMateriale }>>({});
  const pendenti = materiali.filter(m => verificaDelMateriale(m)?.stato === "da_verificare");
  const corrente = sessione?.voci[sessione.indice];
  const bozzaPer = (m: MaterialeFase) => bozze[m.id]?.versione === versionePerBozza(m) ? bozze[m.id].dati : undefined;
  const daRiprendere = pendenti.filter(m => bozzaPer(m)).length;
  const riprendibile = pendenti.some(m => m.id === inPausa);
  const conserva = (m: MaterialeFase, dati: BozzaVerificaMateriale) => setBozze(prima => {
    const dopo = { ...prima };
    if (bozzaModificata(m, dati)) dopo[m.id] = { versione: versionePerBozza(m), dati };
    else delete dopo[m.id];
    return dopo;
  });
  const avanza = () => setSessione(s => s && s.indice + 1 < s.voci.length ? { ...s, indice: s.indice + 1 } : null);
  if (!pendenti.length && !sessione && !confermati && !rimandati) return null;
  return <>
    <section className={"grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 rounded-xl border p-3 sm:flex sm:items-center " + (pendenti.length ? "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20" : "border-emerald-200 bg-emerald-50/50")} aria-label={t("Revisione dei dati mancanti")}>
      {pendenti.length ? <ClipboardCheck className="h-5 w-5 shrink-0 text-amber-700" aria-hidden /> : <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden />}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{pendenti.length ? t(pendenti.length === 1 ? "{n} articolo da completare" : "{n} articoli da completare", { n: pendenti.length }) : t("Revisione completata")}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{pendenti.length ? t("Verifica un articolo alla volta, con le fonti a fianco. Segue i filtri attivi.") : t("Le quantità confermate entrano nel ricalcolo del piano acquisti.")}</p>
        {daRiprendere > 0 && <p className="mt-1 text-xs font-medium text-primary">{t(daRiprendere === 1 ? "{n} bozza da riprendere · conservata finché resti in questa pagina." : "{n} bozze da riprendere · conservate finché resti in questa pagina.", { n: daRiprendere })}</p>}
        {!sessione && (confermati > 0 || rimandati > 0) && <p role="status" className="mt-1 text-xs">{rimandati ? t("{confermati} verificati · {rimandati} rimandati: restano da verificare.", { confermati, rimandati }) : t("{confermati} verificati · {rimandati} rimandati.", { confermati, rimandati })}</p>}
      </div>
      {pendenti.length > 0 && <Button type="button" size="sm" className="col-start-2 w-fit gap-1.5 sm:ml-auto" onClick={() => {
        setConfermati(0); setRimandati(0);
        const voci = riprendibile ? pendenti : pendenti.sort((a, b) => Number(!!bozzaPer(b)) - Number(!!bozzaPer(a)));
        setSessione({ voci, indice: riprendibile ? voci.findIndex(m => m.id === inPausa) : 0 });
        setInPausa(null);
      }}>
        {riprendibile || daRiprendere ? t("Riprendi revisione") : t("Inizia revisione")}<ArrowRight className="h-3.5 w-3.5" aria-hidden /></Button>}
    </section>
    {sessione && corrente && <VerificaDatiMaterialeDialog key={corrente.id} m={corrente} aperto bozza={bozzaPer(corrente)}
      avanzamento={{ posizione: sessione.indice + 1, totale: sessione.voci.length }}
      onBozza={dati => conserva(corrente, dati)}
      onRimanda={dati => { conserva(corrente, dati); setRimandati(n => n + 1); avanza(); }}
      onAperto={aperto => { if (!aperto) { setInPausa(corrente.id); setSessione(null); } }}
      onConfermata={() => {
        setConfermati(n => n + 1);
        setBozze(prima => { const dopo = { ...prima }; delete dopo[corrente.id]; return dopo; });
        avanza();
      }} />}
  </>;
}
