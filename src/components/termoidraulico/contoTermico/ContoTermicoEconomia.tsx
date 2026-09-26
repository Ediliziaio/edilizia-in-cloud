/**
 * Il riquadro Conto Termico nel passo Economia del preventivo termoidraulico
 * (modello «conto-termico»). Il prezzo resta quello del preventivo (scritto a
 * mano o dalle righe); qui si scrivono contributo, modalità e spese, e sotto
 * si vede subito cosa ottiene il cliente: gli stessi numeri del PDF.
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Flame, TriangleAlert } from "lucide-react";
import { CampoNumero, CampoTesto, Scelta, SchedaTecnica } from "@/components/termoidraulico/campiEconomia";
import { anniTesto, calcolaContoTermico, euro } from "@/lib/contoTermico/calcoli";
import { economiaContoTermico, type DatiContoTermico } from "@/lib/contoTermico/dati";
import { CONTO_TERMICO, INTERVENTI_CONTO_TERMICO, numeroRate, type InterventoContoTermico } from "@/lib/contoTermico/regole";

interface Props {
  dati: DatiContoTermico;
  onChange: (dati: DatiContoTermico) => void;
  /** Il totale del preventivo, IVA inclusa. */
  prezzoIvaInclusa: number;
  ivaPct: number;
}

export function ContoTermicoEconomia({ dati, onChange, prezzoIvaInclusa, ivaPct }: Props) {
  const cambia = (patch: Partial<DatiContoTermico>) => onChange({ ...dati, ...patch });
  const r = useMemo(() => calcolaContoTermico(economiaContoTermico(dati, prezzoIvaInclusa, ivaPct)), [dati, prezzoIvaInclusa, ivaPct]);
  const oltreIlTetto = prezzoIvaInclusa > 0 && dati.contributo > prezzoIvaInclusa * (CONTO_TERMICO.percentualeMassima / 100);
  const rate = numeroRate(dati.contributo, dati.potenza_kw);

  return (
    <Card className="border-orange-200">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <Flame className="h-4 w-4 text-orange-600" /> Conto Termico 3.0
        </CardTitle>
        {/* Telefono: niente spiegazione, i campi e il riquadro verde bastano. */}
        <p className="text-[11px] text-muted-foreground max-sm:hidden">
          Il contributo non lo calcola il preventivo: scrivi quello del simulatore del GSE. Il prezzo è quello del preventivo, IVA inclusa: {euro(prezzoIvaInclusa)}.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* In cima: è quello che si guarda mentre si scrivono prezzo e contributo. */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
          <p className="text-xs font-semibold text-emerald-900">Cosa ottiene il cliente</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-3">
            {[
              ["Contributo", euro(r.contributo)],
              ["Resta a lui", euro(r.restaATe)],
              ["Paga ai lavori", euro(r.pagaOggi)],
              ["Risparmio all'anno", euro(Math.max(0, r.risparmioAnnuo))],
              ["Spesa ripagata", r.anniDiRientro != null ? `in ${anniTesto(r.anniDiRientro)}` : "oltre il periodo"],
              [`In ${dati.anni} anni`, euro(r.beneficioFinale)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[10px] uppercase tracking-wide text-emerald-800/80">{k}</dt>
                <dd className="font-semibold tabular-nums text-emerald-950">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Cosa si installa</Label>
          <Scelta<InterventoContoTermico>
            valore={dati.tipo}
            opzioni={Object.entries(INTERVENTI_CONTO_TERMICO).map(([valore, etichetta]) => ({ valore: valore as InterventoContoTermico, etichetta }))}
            onChange={(tipo) => cambia({ tipo })}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoTesto id="ct-titolo" etichetta="Il nuovo impianto, come lo legge il cliente" valore={dati.titolo} segnaposto="Pompa di calore aria-acqua 8 kW" onCommit={(titolo) => cambia({ titolo })} />
          <CampoTesto id="ct-attuale" etichetta="Cosa si toglie" valore={dati.impianto_attuale} segnaposto="Caldaia a gas del 2008" onCommit={(impianto_attuale) => cambia({ impianto_attuale })} />
        </div>
        {/* Telefono: due numeri corti, affiancati. */}
        <div className="grid gap-3 sm:grid-cols-2 max-sm:grid-cols-2">
          <CampoNumero id="ct-contributo" etichetta="Contributo GSE stimato" valore={dati.contributo || null} suffisso="€" onCommit={(v) => cambia({ contributo: Math.max(0, v ?? 0) })}
            aiuto={rate > 1 ? `Sopra ${euro(CONTO_TERMICO.sogliaUnicaRata)}: arriva in ${rate} rate annuali.` : `Fino a ${euro(CONTO_TERMICO.sogliaUnicaRata)} arriva in un'unica soluzione.`} />
          <CampoNumero id="ct-potenza" etichetta="Potenza del generatore" valore={dati.potenza_kw} suffisso="kW" onCommit={(v) => cambia({ potenza_kw: v && v > 0 ? v : null })}
            aiuto={`Serve per le rate: fino a ${CONTO_TERMICO.potenzaPerDueAnnualita} kW sono 2, oltre 5.`} />
        </div>
        {oltreIlTetto ? (
          <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Il contributo supera il {CONTO_TERMICO.percentualeMassima}% del prezzo: il GSE non paga più del {CONTO_TERMICO.percentualeMassima}% delle spese ammissibili. Ricontrolla la cifra.
          </p>
        ) : null}
        <div className="space-y-1.5">
          <Label className="text-xs">Come lo riceve il cliente</Label>
          <Scelta
            valore={dati.modalita}
            opzioni={[{ valore: "sconto_in_fattura", etichetta: "Sconto in fattura (mandato all'incasso)" }, { valore: "rimborso", etichetta: "Glielo versa il GSE" }]}
            onChange={(modalita) => cambia({ modalita })}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoNumero id="ct-spesa-oggi" etichetta="Spesa annua oggi (riscaldamento e acqua calda)" valore={dati.spesa_annua_attuale || null} suffisso="€/anno" onCommit={(v) => cambia({ spesa_annua_attuale: Math.max(0, v ?? 0) })} />
          <CampoNumero id="ct-spesa-domani" etichetta="Spesa annua col nuovo impianto (stima)" valore={dati.spesa_annua_nuova || null} suffisso="€/anno" onCommit={(v) => cambia({ spesa_annua_nuova: Math.max(0, v ?? 0) })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3 max-sm:grid-cols-2">
          <CampoNumero id="ct-aumento" etichetta="Aumento energia all'anno" valore={dati.aumento_energia_pct} suffisso="%" onCommit={(v) => cambia({ aumento_energia_pct: Math.min(10, Math.max(0, v ?? 0)) })} />
          <CampoNumero id="ct-anni" etichetta="Anni del conto" valore={dati.anni} suffisso="anni" onCommit={(v) => cambia({ anni: Math.min(30, Math.max(5, Math.round(v ?? 15))) })} />
          <div className="space-y-1 max-sm:col-span-2">
            <Label className="text-xs">Confronto con la detrazione</Label>
            <Scelta<number | null>
              valore={dati.detrazione_confronto}
              opzioni={[{ valore: 50, etichetta: "50%" }, { valore: 36, etichetta: "36%" }, { valore: null, etichetta: "Nessuno" }]}
              onChange={(detrazione_confronto) => cambia({ detrazione_confronto })}
            />
          </div>
        </div>

        <SchedaTecnica
          etichetta="Scheda tecnica del modello proposto (nel PDF)"
          righe={dati.caratteristiche}
          onChange={(caratteristiche) => cambia({ caratteristiche })}
        />
      </CardContent>
    </Card>
  );
}
