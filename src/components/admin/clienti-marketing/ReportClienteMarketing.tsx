/**
 * Il report del mese per il cliente: una pagina da stampare (o salvare in
 * PDF) con lead, appuntamenti, vendite, spesa, costi unitari e — per chi paga
 * a scaglioni — come si arriva alla provvigione. È la stessa lettura della
 * console: niente numeri diversi tra quello che vedi tu e quello che mandi.
 */
import { ArrowLeft, ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetteScaglioni, leggiMese, spostaMese, variazione, type ClienteMarketing } from "./provvigioni";
import { dataBreve, eur, numero, ore } from "./formato";

interface Props {
  c: ClienteMarketing;
  mese: string;
  meseLeggibile: string;
  meseOggi: string;
  oggi: Date;
  onMese: (m: string) => void;
  onChiudi: () => void;
}

const STILE_STAMPA = `
@media print {
  body * { visibility: hidden; }
  #report-cliente, #report-cliente * { visibility: visible; }
  #report-cliente { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; box-shadow: none; border: 0; }
  .no-print { display: none !important; }
  @page { size: A4; margin: 14mm; }
}`;

function Voce({ etichetta, valore, nota }: { etichetta: string; valore: string; nota?: string | null }) {
  return (
    <div className="rounded-lg border px-3 py-2.5">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{etichetta}</div>
      <div className="mt-0.5 text-xl font-bold tabular-nums">{valore}</div>
      {nota && <div className="mt-0.5 text-[11px] text-muted-foreground">{nota}</div>}
    </div>
  );
}

function confronto(adesso: number, prima: number): string | null {
  const v = variazione(adesso, prima);
  if (v == null) return prima === 0 && adesso === 0 ? null : `mese prima: ${numero(prima)}`;
  return `${v > 0 ? "+" : ""}${numero(v)}% sul mese prima (${numero(prima)})`;
}

export function ReportClienteMarketing({ c, mese, meseLeggibile, meseOggi, oggi, onMese, onChiudi }: Props) {
  const meseCorrente = mese === meseOggi;
  const l = leggiMese(c, meseCorrente);
  const fette = fetteScaglioni(l.venduto, l.scaglioni).filter((f) => f.fetta > 0);
  const canali = [
    c.lead_meta > 0 && `Meta ${numero(c.lead_meta)}`,
    c.lead_google > 0 && `Google ${numero(c.lead_google)}`,
    c.lead_form > 0 && `moduli del sito ${numero(c.lead_form)}`,
    c.lead_altri > 0 && `altre fonti ${numero(c.lead_altri)}`,
  ].filter(Boolean).join(" · ");
  const fontiSpesa = [
    c.spesa_meta > 0 && `Meta ${eur(c.spesa_meta)}`,
    c.spesa_google > 0 && `Google ${eur(c.spesa_google)}`,
    c.spesa_manuale > 0 && `altro ${eur(c.spesa_manuale)}`,
  ].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4">
      <style>{STILE_STAMPA}</style>
      <div className="no-print flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={onChiudi}><ArrowLeft className="h-4 w-4" /> Torna alla console</Button>
        <div className="inline-flex items-center rounded-lg border">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => onMese(spostaMese(mese, -1))} aria-label="Mese precedente"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-[10rem] px-2 text-center text-sm font-semibold capitalize">{meseLeggibile}</span>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => onMese(spostaMese(mese, 1))} disabled={meseCorrente} aria-label="Mese successivo"><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <Button className="ml-auto gap-1.5" onClick={() => window.print()}><Printer className="h-4 w-4" /> Stampa / Salva PDF</Button>
      </div>

      <article id="report-cliente" className="mx-auto max-w-3xl rounded-xl border bg-white p-8 text-slate-900 shadow-sm">
        <header className="flex items-start justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-3">
            {c.logo_url && <img src={c.logo_url} alt="" className="h-12 w-12 rounded-lg object-contain" />}
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{c.servizio ?? "Marketing"} · report del mese</div>
              <h1 className="text-2xl font-bold leading-tight">{c.cliente_nome}</h1>
              <div className="text-sm text-slate-600"><span className="capitalize">{meseLeggibile}</span>{meseCorrente ? ` (dati al ${dataBreve(oggi.toISOString(), false, oggi)})` : ""}</div>
            </div>
          </div>
          <div className="text-right text-xs text-slate-500">
            <div>Preparato il {dataBreve(oggi.toISOString(), false)}</div>
            {c.commerciale && <div>Referente commerciale: {c.commerciale}</div>}
          </div>
        </header>

        <section className="mt-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Cosa ha portato il marketing</h2>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Voce etichetta="Lead nuovi" valore={numero(c.lead_mese)} nota={[confronto(c.lead_mese, c.lead_prec), canali].filter(Boolean).join(" · ") || null} />
            <Voce etichetta="Lead seguiti" valore={numero(c.lead_lavorati)} nota={c.ore_mediane_primo_contatto != null ? `primo contatto in ${ore(c.ore_mediane_primo_contatto)} (mediana)` : "nessuna azione registrata nel CRM"} />
            <Voce etichetta="Appuntamenti" valore={numero(c.appuntamenti_mese)} nota={confronto(c.appuntamenti_mese, c.appuntamenti_prec)} />
            <Voce etichetta="Vendite chiuse" valore={numero(c.vinte_mese)} nota={[confronto(c.vinte_mese, c.vinte_prec), c.valore_vinto_mese > 0 ? `valore ${eur(c.valore_vinto_mese)}` : null].filter(Boolean).join(" · ") || null} />
          </div>
        </section>

        <section className="mt-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Quanto è costato</h2>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Voce etichetta="Spesa pubblicitaria" valore={eur(l.spesa)} nota={fontiSpesa || "nessun costo registrato"} />
            <Voce etichetta="Costo per lead" valore={l.cpl != null ? eur(l.cpl, 2) : "—"} nota={l.cpl == null ? "serve spesa e almeno un lead" : null} />
            <Voce etichetta="Costo per appuntamento" valore={l.costoAppuntamento != null ? eur(l.costoAppuntamento) : "—"} nota={l.costoAppuntamento == null ? "nessun appuntamento nel mese" : null} />
            <Voce etichetta="Costo per vendita" valore={l.cpa != null ? eur(l.cpa) : "—"} nota={l.roas != null ? `${l.roas.toLocaleString("it-IT")} € di venduto per ogni euro speso` : null} />
          </div>
        </section>

        <section className="mt-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Venduto e compenso del mese</h2>
          <div className="mt-2 rounded-lg border">
            <div className="flex items-baseline justify-between px-3 py-2">
              <span className="text-sm">Venduto imponibile {l.fonteVenduto === "fatture" ? "(dalle fatture emesse)" : l.fonteVenduto === "vendite" ? "(dalle vendite chiuse nel CRM)" : ""}</span>
              <span className="text-lg font-bold tabular-nums">{eur(l.venduto)}</span>
            </div>
            {l.scaglioni.length > 0 ? (
              <table className="w-full border-t text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                  <tr><th className="px-3 py-1.5 text-left font-semibold">Scaglione</th><th className="px-3 py-1.5 text-right font-semibold">Venduto nello scaglione</th><th className="px-3 py-1.5 text-right font-semibold">%</th><th className="px-3 py-1.5 text-right font-semibold">Compenso</th></tr>
                </thead>
                <tbody>
                  {fette.length === 0 && <tr><td colSpan={4} className="px-3 py-2 text-slate-500">Nessun venduto nel mese: nessun compenso.</td></tr>}
                  {fette.map((f) => (
                    <tr key={f.scaglione.da} className="border-t">
                      <td className="px-3 py-1.5">{f.scaglione.a == null ? `oltre ${eur(f.scaglione.da)}` : `${eur(f.scaglione.da)} – ${eur(f.scaglione.a)}`}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{eur(f.fetta)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{f.scaglione.pct.toLocaleString("it-IT")}%</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{eur(f.importo)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-slate-50 font-semibold">
                    <td className="px-3 py-2" colSpan={2}>Compenso del mese{l.aliquota > 0 ? ` (${l.aliquota.toLocaleString("it-IT")}% effettivo)` : ""}</td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 text-right tabular-nums">{eur(l.provvigione)}</td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <p className="border-t px-3 py-2 text-xs text-slate-500">Il compenso di questo contratto non è a scaglioni: si calcola alla chiusura del mese.</p>
            )}
          </div>
        </section>

        <footer className="mt-6 border-t pt-3 text-[11px] leading-relaxed text-slate-500">
          I lead sono i contatti nuovi entrati nel CRM nel mese dalle campagne e dai moduli; un lead è «seguito» quando nel CRM è stato chiamato, spostato di fase o annotato.
          Gli appuntamenti sono quelli fissati nel mese; le vendite quelle segnate come chiuse nel CRM{l.fonteVenduto === "fatture" ? "; il venduto imponibile viene dalle fatture emesse nel mese, note di credito comprese" : ""}.
          {c.spesa_meta_al ? ` Spesa Meta aggiornata il ${dataBreve(c.spesa_meta_al, true, oggi)}.` : ""}
        </footer>
      </article>
    </div>
  );
}
