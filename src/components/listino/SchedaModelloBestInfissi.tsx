import type { FamilyWithAxes } from '@/types/articleFamily';
import { lineaBestInfissi } from '@/lib/listino/bestInfissiLinee';
import { fontePer } from '@/lib/listino/bestInfissiFonti';
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/** Scheda commerciale separata da assi, compatibilità e prezzi. */
export function SchedaModelloBestInfissi({famiglia}: {famiglia: FamilyWithAxes}) {
  const t = useT();
  const modello = lineaBestInfissi(famiglia);
  if (!modello) return null;
  const fonte = fontePer(modello, famiglia.nome);
  return <section aria-label={t("Scheda linea {modello}", { modello })} className="rounded-xl border bg-muted/20 p-3 space-y-3">
    <div className="flex items-start gap-3">
      {fonte.foto && <img src={fonte.foto} alt={t("{produttore} · {nome}, foto rappresentativa della linea", { produttore: fonte.produttore, nome: fonte.nome })} className="h-24 w-24 shrink-0 rounded-lg bg-white object-contain" loading="lazy" />}
      <div className="min-w-0 space-y-1"><p className="text-xs text-muted-foreground">{t("Linea {modello}", { modello })}</p><h3 className="font-semibold">{fonte.nome}</h3><p className="text-sm leading-relaxed">{fonte.descrizione}</p></div>
    </div>
    <details className="text-xs"><summary className="cursor-pointer font-medium">{t("Scheda e verifiche del produttore")}</summary><div className="mt-2 space-y-2">
      {fonte.dati.length>0 && <p>{fonte.dati.join(' · ')}</p>}
      <p>{fonte.attenzione}</p>
      <p>{t("La foto rappresenta la linea. Apertura, dimensioni e fattibilità del prodotto seguono la configurazione e le verifiche indicate sotto.")}</p>
      <a href={fonte.url} target="_blank" rel="noopener noreferrer" className="inline-block text-primary underline">{t("Scheda ufficiale {produttore}", { produttore: fonte.produttore })}</a>
    </div></details>
  </section>;
}
