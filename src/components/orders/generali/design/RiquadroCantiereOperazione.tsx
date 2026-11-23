import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, HardHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGeneralePianoNumeri } from "@/hooks/useGeneralePiano";
import { avanzamentoDalleFasi, faseFinita, faseInCorso, useFasiCantiere } from "@/hooks/useAvanzamentoCantiere";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { cn } from "@/lib/utils";
import { dataBreve, euro, nomeMese } from "../piano/formato";
import { FasiDalPianoDialog } from "./FasiDalPianoDialog";

export function RiquadroCantiereOperazione({ riepilogo, puoModificare = false }: { riepilogo: RiepilogoGenerale; puoModificare?: boolean }) {
  const [dalPiano, setDalPiano] = useState(false);
  const generaleId = riepilogo.generale.id;
  const [parametri, setParametri] = useSearchParams();
  const n = useGeneralePianoNumeri(riepilogo);
  const fasi = useFasiCantiere(generaleId, riepilogo.figlie.map((f) => f.id));

  const apri = (vista?: "lavorazioni" | "cronoprogramma", ambito?: string) => {
    const dopo = new URLSearchParams(parametri);
    dopo.set("scheda", "cantiere");
    if (vista) dopo.set("vista-cantiere", vista);
    else dopo.delete("vista-cantiere");
    if (ambito) dopo.set("ambito-cantiere", ambito);
    else dopo.delete("ambito-cantiere");
    dopo.delete("fase-cantiere");
    dopo.delete("rapportino-cantiere");
    setParametri(dopo, { replace: true });
  };

  const elenco = Array.isArray(fasi.data) ? fasi.data : [];
  const conVoci = Array.isArray(n.voci) && n.voci.length > 0;
  const oggi = typeof n.reale?.oggi === "string" ? n.reale.oggi : new Date().toISOString().slice(0, 10);
  const meseCorrente = oggi.slice(0, 7);
  const finite = elenco.filter(faseFinita).length;
  const inCorso = elenco.filter(faseInCorso).length;
  const daAvviare = elenco.length - finite - inCorso;
  const avanzamento = avanzamentoDalleFasi(elenco);

  const avvii = new Map<string, { nome: string; data: string; numero: number }>();
  for (const fase of elenco) {
    const data = fase.start_date;
    if (!data || data < oggi || faseFinita(fase) || faseInCorso(fase)) continue;
    const chiave = JSON.stringify([data, fase.name]);
    const gruppo = avvii.get(chiave);
    if (gruppo) gruppo.numero += 1;
    else avvii.set(chiave, { nome: fase.name, data, numero: 1 });
  }
  const prossimiAvvii = [...avvii.entries()]
    .sort(([, a], [, b]) => a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome, "it"))
    .slice(0, 2);

  // Il mese di oggi: registrato contro previsto dal calendario del piano.
  const vedeCosti = riepilogo.permessi.costi;
  const righe = (Array.isArray(n.reale?.righe) ? n.reale!.righe : []).filter((r) => r.tipo === "costo");
  const delMese = righe.filter((r) => r.data?.startsWith(meseCorrente)).reduce((t, r) => t + r.importo, 0);
  const previstoMese = (Array.isArray(n.piano?.cassa?.previsto) ? n.piano!.cassa.previsto : []).find((m) => m.mese === meseCorrente)?.uscite ?? null;
  const ultimi = [...righe]
    .filter((r) => r.data && r.data < "9999")
    .sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""))
    .slice(0, 4);

  return (
    <section aria-labelledby="cantiere-operazione" className="generale-panel overflow-hidden">
      <header className="flex items-center justify-between gap-2 border-b bg-muted/25 px-3 py-2 sm:px-4">
        <h2 id="cantiere-operazione" className="flex items-center gap-2 text-sm font-semibold">
          <span className="generale-section-icon !size-7"><HardHat aria-hidden="true" /></span>Cantiere
        </h2>
        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => apri()}>
          Apri il cantiere <ArrowRight className="ml-1.5 size-3.5" aria-hidden="true" />
        </Button>
      </header>
      <div className="grid divide-y md:grid-cols-[minmax(0,1.25fr)_minmax(0,0.8fr)_minmax(0,1fr)] md:divide-x md:divide-y-0">
        {/* Le fasi */}
        <div className="min-w-0 px-3 py-2.5 sm:px-4">
          <h3 className="text-xs font-medium text-muted-foreground">Avanzamento lavori</h3>
          {fasi.isLoading ? (
            <p role="status" className="mt-1 text-sm text-muted-foreground">Caricamento delle fasi…</p>
          ) : fasi.isError ? (
            <p className="mt-1 text-sm text-muted-foreground">Fasi non disponibili. <button type="button" onClick={() => void fasi.refetch()} className="text-primary hover:underline">Riprova</button></p>
          ) : elenco.length === 0 ? (
            <>
              <p className="mt-0.5 text-sm font-medium">Nessuna fase</p>
              <p className="text-xs text-muted-foreground">Dividi il lavoro in fasi, con le date e chi le fa.</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                {puoModificare && conVoci && (
                  <button type="button" onClick={() => setDalPiano(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700 hover:text-orange-800 dark:text-orange-300">
                    Proponi le fasi dal piano <ArrowRight className="size-3" aria-hidden="true" />
                  </button>
                )}
                <button type="button" onClick={() => apri("lavorazioni", generaleId)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  {puoModificare && conVoci ? "Aggiungi fasi a mano" : "Imposta le fasi"} <ArrowRight className="size-3" aria-hidden="true" />
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-2">
                <p className="text-lg font-semibold tabular-nums">{avanzamento}%</p>
                <button type="button" onClick={() => apri("lavorazioni")} className="generale-text-link">
                  Tutte le lavorazioni <ArrowRight className="size-3" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${avanzamento}%` }} />
              </div>
              <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">
                <span className="whitespace-nowrap">{finite} di {elenco.length} fasi concluse</span>
                {" · "}<span className="whitespace-nowrap">{inCorso} in corso</span>
                {" · "}<span className="whitespace-nowrap">{daAvviare} da avviare</span>
              </p>
              {prossimiAvvii.length > 0 && (
                <div className="mt-2 border-t pt-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <p className="text-xs font-medium text-muted-foreground">Prossimi avvii</p>
                    <button type="button" onClick={() => apri("cronoprogramma")} className="generale-text-link">Cronoprogramma</button>
                  </div>
                  <ul aria-label="Prossimi avvii" className="mt-0.5 space-y-0.5">
                    {prossimiAvvii.map(([chiave, { nome, data, numero }]) => (
                      <li key={chiave} className="flex items-baseline gap-2 text-xs">
                        <span title={nome} className="min-w-0 truncate">{nome}</span>
                        {numero > 1 && <span className="shrink-0 text-muted-foreground">{numero} fasi</span>}
                        <time dateTime={data} className="ml-auto shrink-0 tabular-nums text-muted-foreground">{dataBreve(data)}</time>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {/* Il mese */}
        <div className="min-w-0 px-3 py-2.5 sm:px-4">
          <h3 className="text-xs font-medium text-muted-foreground">Uscite di {nomeMese(meseCorrente)}</h3>
          {!vedeCosti ? (
            <p className="mt-0.5 text-sm text-muted-foreground">Riservato</p>
          ) : (
            <>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{euro(delMese)}</p>
              <p className={cn("text-xs text-muted-foreground", previstoMese !== null && delMese > previstoMese + 0.5 && "text-destructive")}>
                {previstoMese === null
                  ? "registrate; il piano non ha uscite per questo mese"
                  : `registrate su ${euro(previstoMese)} previste dal piano`}
              </p>
            </>
          )}
        </div>

        {/* Gli ultimi costi */}
        <div className="min-w-0 px-3 py-2.5 sm:px-4">
          <h3 className="text-xs font-medium text-muted-foreground">Ultimi costi registrati</h3>
          {!vedeCosti ? (
            <p className="mt-0.5 text-sm text-muted-foreground">Riservato</p>
          ) : ultimi.length === 0 ? (
            <p className="mt-0.5 text-sm text-muted-foreground">Ancora nessuno</p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {ultimi.map((r) => (
                <li key={r.id} className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate" title={r.descrizione}>
                    <span className="tabular-nums text-muted-foreground">{dataBreve(r.data)}</span> {r.descrizione.split(" · ")[1] ?? r.descrizione.split(" · ")[0]}
                  </span>
                  <span className="shrink-0 tabular-nums">{euro(r.importo)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {dalPiano && <FasiDalPianoDialog open onOpenChange={setDalPiano} riepilogo={riepilogo} fasiEsistenti={elenco.length} />}
    </section>
  );
}
