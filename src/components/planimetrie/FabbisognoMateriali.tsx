/**
 * «Materiali da comprare» dalla pianta (23/11/2026): litri di pittura, scatole di
 * pavimento, sacchi di colla e stucco, pezzi di battiscopa, con il calcolo spiegato
 * e il dettaglio per stanza. Cambia con la pianta: frazionare una stanza o spostare
 * un tramezzo aggiorna subito i numeri. Mani di pittura e sfrido si possono
 * cambiare qui; il calcolo è in `shared/planimetrie/fabbisogno.ts`.
 */
import { useMemo, useState } from "react";
import { ChevronDown, PaintBucket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FASI_FABBISOGNO, fabbisognoMateriali, IPOTESI_FABBISOGNO, NOME_LAVORO, stanzeFabbisogno, type FaseFabbisogno } from "../../../shared/planimetrie/fabbisogno.ts";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const fmt = (n: number) => n.toLocaleString(intlCampo(), { maximumFractionDigits: 1 });

export function FabbisognoMateriali({ documento, ambito, titolo: titoloDato }: { documento: Planimetria; ambito: string; titolo?: string }) {
  const t = useT();
  const titolo = titoloDato ?? t("Materiali da comprare");
  const [mani, setMani] = useState(IPOTESI_FABBISOGNO.maniPittura);
  const [sfrido, setSfrido] = useState(Math.round(IPOTESI_FABBISOGNO.sfridoPavimento * 100));
  const [aperta, setAperta] = useState<string | null>(null);
  // Che lavori si fanno e dove. In una variante si parte dalle stanze che cambiano (nuove,
  // divise, con finiture diverse): il resto della casa non si rifà, salvo sceglierlo.
  const stanze = useMemo(() => stanzeFabbisogno(documento, ambito), [documento, ambito]);
  const tutte = useMemo(() => fabbisognoMateriali(documento, ambito), [documento, ambito]);
  const lavoriPossibili = useMemo(() => FASI_FABBISOGNO.filter((f) => tutte.some((r) => r.fase === f.id)).map((f) => f.id), [tutte]);
  const iniziali = useMemo(() => (stanze.some((s) => s.toccata) ? stanze.filter((s) => s.toccata) : stanze).map((s) => s.id), [stanze]);
  const [lavoriTolti, setLavoriTolti] = useState<FaseFabbisogno[]>([]);
  const [stanzeScelte, setStanzeScelte] = useState<string[] | null>(null);
  const scelte = stanzeScelte ?? iniziali;
  const lavori = lavoriPossibili.filter((f) => !lavoriTolti.includes(f));
  const righe = fabbisognoMateriali(documento, ambito, { maniPittura: mani, sfridoPavimento: sfrido / 100 }, { fasi: lavori, stanze: scelte });
  if (!tutte.length) return null;
  const pulsante = (attivo: boolean) => `rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${attivo ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`;

  const scarica = () => {
    const csv = [["Fase", "Materiale", "Quantità", "Unità", "Da comprare", "Come", "Per stanza"],
      ...righe.map((r) => [FASI_FABBISOGNO.find((f) => f.id === r.fase)?.nome ?? "", r.materiale, fmt(r.quantita), r.unita, r.confezioni?.nome ?? "", r.come, r.stanze.map((s) => `${s.nome}: ${fmt(s.valore)}`).join("; ")])]
      .map((riga) => riga.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "materiali-da-comprare.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section aria-label={titolo} className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold"><PaintBucket className="h-4 w-4 text-primary" />{titolo}</h3>
          <p className="text-xs text-muted-foreground">{t("Scegli i lavori e le stanze: la lista si calcola dalle misure della pianta, nell’ordine del cantiere. Rese tipiche, da confermare con le schede dei prodotti.")}</p>
        </div>
        <Button size="sm" variant="outline" onClick={scarica}>{t("Scarica CSV")}</Button>
      </div>
      <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold">{t("1 · Che lavori fai?")}</p>
          <div className="flex flex-wrap gap-1.5">
            {lavoriPossibili.map((f) => <button key={f} type="button" aria-pressed={lavori.includes(f)} className={pulsante(lavori.includes(f))}
              onClick={() => setLavoriTolti((v) => v.includes(f) ? v.filter((x) => x !== f) : [...v, f])}>{NOME_LAVORO[f]}</button>)}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-semibold">{t("2 · In quali stanze?")} <span className="font-normal text-muted-foreground">{t("{n} di {totale}", { n: scelte.length, totale: stanze.length })}{stanze.some((s) => s.toccata) && stanzeScelte === null ? ` · ${t("quelle che cambiano nella variante")}` : ""}</span></p>
          <div className="flex flex-wrap gap-1.5">
            {stanze.map((s) => <button key={s.id} type="button" aria-pressed={scelte.includes(s.id)} className={pulsante(scelte.includes(s.id))}
              onClick={() => setStanzeScelte(scelte.includes(s.id) ? scelte.filter((x) => x !== s.id) : [...scelte, s.id])}>{s.nome}</button>)}
            {scelte.length < stanze.length && <button type="button" className="rounded-full px-2.5 py-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
              onClick={() => setStanzeScelte(stanze.map((s) => s.id))}>{t("Tutta la casa")}</button>}
          </div>
        </div>
      </div>
      {!righe.length && <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">{t("Scegli almeno un lavoro e una stanza per vedere i materiali.")}</p>}
      <div className="flex flex-wrap gap-3 text-xs">
        <label className="flex items-center gap-1.5">{t("Mani di pittura")}
          <select value={mani} onChange={(e) => setMani(Number(e.target.value))} className="rounded-md border bg-background px-1.5 py-1">
            {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5">{t("Sfrido pavimento")}
          <select value={sfrido} onChange={(e) => setSfrido(Number(e.target.value))} className="rounded-md border bg-background px-1.5 py-1">
            {[5, 8, 10, 12, 15].map((n) => <option key={n} value={n}>{n}%</option>)}
          </select>
        </label>
      </div>
      {FASI_FABBISOGNO.filter((f) => righe.some((r) => r.fase === f.id)).map((f) => (
      <div key={f.id} className="space-y-1.5">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{f.nome}</h4>
        <p className="text-xs leading-relaxed text-muted-foreground">{f.posa}</p>
      <ul className="divide-y rounded-lg border">
        {righe.filter((r) => r.fase === f.id).map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => setAperta((v) => (v === r.id ? null : r.id))} aria-expanded={aperta === r.id}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{r.materiale}</span>
                <span className="block text-xs text-muted-foreground">{r.come}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-semibold tabular-nums">{fmt(r.quantita)} {r.unita}</span>
                {r.confezioni && <span className="block text-xs text-muted-foreground">{r.confezioni.nome}</span>}
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${aperta === r.id ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {aperta === r.id && (
              <ul className="space-y-0.5 bg-muted/30 px-3 py-2 text-xs">
                {r.stanze.map((s) => <li key={s.nome} className="flex justify-between gap-3"><span>{s.nome}</span><span className="tabular-nums">{fmt(s.valore)} {r.unita}</span></li>)}
              </ul>
            )}
          </li>
        ))}
      </ul>
      </div>
      ))}
    </section>
  );
}
