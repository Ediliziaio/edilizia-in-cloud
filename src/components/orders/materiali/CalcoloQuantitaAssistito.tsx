import { useId, useState } from "react";
import { Calculator } from "lucide-react";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
import { numeroEditor } from "@/lib/computo/editorNativo";
import { calcoloAcquistoAssistito } from "@/lib/distinta/calcoloAcquistoAssistito";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const n = (v: number) => v.toLocaleString("it-IT", { maximumFractionDigits: 4 });
export function CalcoloQuantitaAssistito({ baseIniziale, onApplica }: { baseIniziale?: number | null; onApplica: (v: { quantita: number; unita: string; nota: string; specifiche: string }) => void }) {
  const t = useT();
  const nV = (v: number) => v.toLocaleString(intlCampo(), { maximumFractionDigits: 4 });
  const idModo = useId();
  const [aperto, setAperto] = useState(false);
  const [base, setBase] = useState(baseIniziale ? String(baseIniziale) : "");
  const [resa, setResa] = useState("");
  const [mani, setMani] = useState("1");
  const [sfrido, setSfrido] = useState("0");
  const [confezione, setConfezione] = useState("");
  const [modo, setModo] = useState<"consumo" | "copertura">("consumo");
  const [unita, setUnita] = useState("");
  const [unitaConfezione, setUnitaConfezione] = useState("");
  const [fonte, setFonte] = useState("");
  let risultato: ReturnType<typeof calcoloAcquistoAssistito> | null = null, errore = "";
  if (base && resa && mani && sfrido) {
    try { risultato = calcoloAcquistoAssistito({ base: numeroEditor(base) ?? NaN, resa: numeroEditor(resa) ?? NaN, mani: numeroEditor(mani) ?? NaN,
      sfrido: numeroEditor(sfrido) ?? NaN, modo, confezione: confezione ? numeroEditor(confezione) ?? NaN : null }); }
    catch (e) { errore = e instanceof Error ? e.message : t("Controlla i valori."); }
  }
  const applica = () => {
    if (!risultato || !unita.trim() || !fonte.trim() || (confezione && !unitaConfezione.trim())) return;
    const formula = n(numeroEditor(base)!) + (modo === "consumo" ? " × " : " ÷ ") + n(numeroEditor(resa)!) + " × " + mani + " mani/strati + " + sfrido + "% sfrido = " + n(risultato.totale) + " " + unita;
    const pacchi = risultato.confezioni ? " · " + risultato.confezioni + " " + unitaConfezione + " da " + confezione + " " + unita : "";
    onApplica({ quantita: risultato.quantitaAcquisto, unita: confezione ? unitaConfezione.trim() : unita.trim(), nota: fonte.trim() + ". Calcolo: " + formula + pacchi,
      specifiche: confezione ? "Confezione d'acquisto: " + confezione + " " + unita + " per " + unitaConfezione + "." : "" });
    setAperto(false);
  };
  return <div className="rounded-lg border bg-muted/20 p-3">
    <Button type="button" variant="ghost" size="sm" className="h-auto gap-2 px-0 text-xs" aria-expanded={aperto} onClick={() => setAperto(v => !v)}><Calculator className="h-3.5 w-3.5" aria-hidden />{t("Calcola da resa e confezione")}</Button>
    {aperto && <div className="mt-3 space-y-3 text-xs">
      <p className="leading-5 text-muted-foreground">{t("Usa i valori della scheda del prodotto. Il calcolo aggiorna la proposta; controllala prima di confermare.")}</p>
      <div><label htmlFor={idModo}>{t("Tipo di resa")}</label><select id={idModo} className="mt-1 h-9 w-full rounded-md border bg-background px-2" value={modo} onChange={e => setModo(e.target.value as typeof modo)}><option value="consumo">{t("Consumo per unità di lavoro, es. kg/m²")}</option><option value="copertura">{t("Copertura per unità di prodotto, es. m²/l")}</option></select></div>
      <div className="grid grid-cols-2 gap-3"><label>{t("Quantità di lavoro")}<Input className="mt-1" inputMode="decimal" value={base} onChange={e => setBase(e.target.value)} /></label><label>{modo === "consumo" ? t("Consumo per unità") : t("Copertura per unità")}<Input className="mt-1" inputMode="decimal" value={resa} onChange={e => setResa(e.target.value)} /></label>
        <label>{t("Mani o strati")}<Input className="mt-1" inputMode="numeric" value={mani} onChange={e => setMani(e.target.value)} /></label><label>{t("Sfrido %")}<Input className="mt-1" inputMode="decimal" value={sfrido} onChange={e => setSfrido(e.target.value)} /></label>
        <label>{t("Unità del prodotto")}<Input className="mt-1" placeholder={t("kg, l, m²…")} value={unita} onChange={e => setUnita(e.target.value)} /></label><label>{t("Contenuto confezione")}<Input className="mt-1" placeholder={t("Facoltativo, es. 25")} inputMode="decimal" value={confezione} onChange={e => setConfezione(e.target.value)} /></label>
      </div>
      {confezione && <label className="block">{t("Unità della confezione")}<Input className="mt-1" placeholder={t("sacco, latta, rotolo…")} value={unitaConfezione} onChange={e => setUnitaConfezione(e.target.value)} /></label>}
      <label className="block">{t("Fonte della resa")}<Input className="mt-1" placeholder={t("Scheda tecnica, prodotto e data")} value={fonte} onChange={e => setFonte(e.target.value)} /></label>
      {errore && <p role="alert" className="text-destructive">{errore}</p>}
      {risultato && <p role="status" className="rounded-md bg-background p-2 leading-5">{t("Prodotto necessario:")} <strong>{nV(risultato.totale)} {unita}</strong>{risultato.confezioni !== null && <> · {t("acquisto:")} <strong>{risultato.confezioni} {unitaConfezione || t("confezioni")}</strong> · {t("avanzo {n}", { n: nV(risultato.avanzo) })} {unita}</>}</p>}
      <Button type="button" size="sm" className="w-full" disabled={!risultato || !unita.trim() || !fonte.trim() || (!!confezione && !unitaConfezione.trim())} onClick={applica}>{t("Usa il calcolo nella proposta")}</Button>
    </div>}
  </div>;
}
