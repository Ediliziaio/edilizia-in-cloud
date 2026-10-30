// src/components/orders/generali/simulatore/FormIpotesi.tsx
// Le ipotesi rapide: acquisto, unità da vendere, costi, tempi e fonti. Pochi campi, con i
// valori di partenza del modello; il dettaglio voce per voce sta in DettaglioVoci.
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CampoNumero, Gruppo } from "@/components/orders/generali/simulatore/Campi";
import { euro, nomeMese } from "@/components/orders/generali/piano/formato";
import { NOMI_RIMBORSO, PIANI_RIMBORSO, type PianoRimborso } from "@/lib/orders/generali/investitoriConti";
import {
  mqTotali, nuovaTipologia, nuovoInvestitore, tempi, unitaTotali,
  type InvestitoreIpotesi, type Ipotesi, type Tipologia,
} from "@/lib/orders/generali/simulatore";
import { aggiungiMesi } from "@/lib/orders/generali/pianoCategorie";

interface Props {
  ipotesi: Ipotesi;
  onCambia: (ip: Ipotesi) => void;
  /** Prefisso degli id dei campi: in pagina possono esserci più moduli. */
  prefisso?: string;
}

export function FormIpotesi({ ipotesi: ip, onCambia, prefisso = "sim" }: Props) {
  const metti = <K extends keyof Ipotesi>(k: K, v: Ipotesi[K]) => onCambia({ ...ip, [k]: v });
  const tipologia = (id: string, p: Partial<Tipologia>) => metti("tipologie", ip.tipologie.map((t) => (t.id === id ? { ...t, ...p } : t)));
  const investitore = (id: string, p: Partial<InvestitoreIpotesi>) => metti("investitori", ip.investitori.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const t = tempi(ip);
  const sviluppo = ip.modello === "sviluppo";
  const id = (s: string) => `${prefisso}-${s}`;

  return (
    <div className="space-y-3">
      <Gruppo titolo="Acquisto" testo={sviluppo ? "Il terreno e le imposte che paghi al rogito." : "L'immobile e le imposte che paghi al rogito."}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor={id("inizio")} className="text-sm font-normal text-muted-foreground">Mese dell'acquisto</Label>
            <Input
              id={id("inizio")}
              type="month"
              value={ip.inizio}
              className="h-9 text-sm"
              onChange={(e) => { if (/^\d{4}-\d{2}$/.test(e.target.value)) metti("inizio", e.target.value); }}
            />
          </div>
          <CampoNumero id={id("acquisto")} etichetta="Prezzo d'acquisto" unita="€" valore={ip.acquisto} onCambia={(v) => metti("acquisto", v ?? 0)} />
          <CampoNumero id={id("imposte")} etichetta="Imposte e notaio" unita="%" valore={ip.impostePct} onCambia={(v) => metti("impostePct", v ?? 0)}
            aiuto={`${euro((ip.acquisto * ip.impostePct) / 100)} sul prezzo`} />
        </div>
      </Gruppo>

      <Gruppo
        titolo="Cosa vendi"
        testo={`${unitaTotali(ip)} unità · ${mqTotali(ip).toLocaleString("it-IT")} m² vendibili. Aggiungi una riga per ogni tipo (appartamenti, box, negozi).`}
        azione={(
          <Button type="button" variant="outline" size="sm" onClick={() => metti("tipologie", [...ip.tipologie, nuovaTipologia(ip.tipologie.length ? "Box" : "Appartamenti")])}>
            <Plus className="mr-1 h-4 w-4" /> Aggiungi un tipo
          </Button>
        )}
      >
        {ip.tipologie.length === 0 && <p className="text-sm text-muted-foreground">Aggiungi almeno un tipo di unità per vedere ricavi e indicatori.</p>}
        <div className="space-y-3">
          {ip.tipologie.map((tp, i) => (
            <div key={tp.id} className="grid items-end gap-2 sm:grid-cols-[minmax(8rem,1.4fr)_repeat(4,minmax(5.5rem,1fr))_auto]">
              <div className="space-y-1">
                <Label htmlFor={id(`tp-nome-${i}`)} className="text-sm font-normal text-muted-foreground">Tipo</Label>
                <Input id={id(`tp-nome-${i}`)} value={tp.nome} maxLength={60} className="h-9 text-sm" onChange={(e) => tipologia(tp.id, { nome: e.target.value })} />
              </div>
              <CampoNumero id={id(`tp-quante-${i}`)} etichetta="Quante" intero valore={tp.quante} onCambia={(v) => tipologia(tp.id, { quante: v ?? 0 })} />
              <CampoNumero id={id(`tp-mq-${i}`)} etichetta="m² l'una" unita="m²" valore={tp.mq} onCambia={(v) => tipologia(tp.id, { mq: v ?? 0 })} />
              <CampoNumero id={id(`tp-prezzo-${i}`)} etichetta="Vendo a" unita="€/m²" valore={tp.prezzoMq} onCambia={(v) => tipologia(tp.id, { prezzoMq: v ?? 0 })} />
              <CampoNumero id={id(`tp-costo-${i}`)} etichetta="Costo" unita="€/m²" vuotoPermesso valore={tp.costoMq} onCambia={(v) => tipologia(tp.id, { costoMq: v })}
                aiuto={tp.costoMq === null ? "come sotto" : undefined} />
              <Button type="button" variant="ghost" size="icon" aria-label={`Togli ${tp.nome || "questo tipo"}`} className="mb-0.5"
                onClick={() => metti("tipologie", ip.tipologie.filter((x) => x.id !== tp.id))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </Gruppo>

      <Gruppo titolo="Costi" testo={sviluppo ? "Costruzione al m² e le spese che ne dipendono." : "Ristrutturazione al m² e le spese che ne dipendono."}>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <CampoNumero id={id("costo")} etichetta={sviluppo ? "Costruzione" : "Ristrutturazione"} unita="€/m²" valore={ip.costoMq} onCambia={(v) => metti("costoMq", v ?? 0)} />
          <CampoNumero id={id("oneri")} etichetta={sviluppo ? "Oneri e permessi" : "Pratiche e permessi"} unita="€" valore={ip.oneri} onCambia={(v) => metti("oneri", v ?? 0)} />
          <CampoNumero id={id("tecnici")} etichetta="Tecnici" unita="%" valore={ip.tecniciPct} onCambia={(v) => metti("tecniciPct", v ?? 0)} aiuto="della costruzione" />
          <CampoNumero id={id("comm")} etichetta="Agenzia e pubblicità" unita="%" valore={ip.commercializzazionePct} onCambia={(v) => metti("commercializzazionePct", v ?? 0)} aiuto="dei ricavi" />
          <CampoNumero id={id("impr")} etichetta="Imprevisti" unita="%" valore={ip.imprevistiPct} onCambia={(v) => metti("imprevistiPct", v ?? 0)} aiuto="della costruzione" />
        </div>
      </Gruppo>

      <Gruppo
        titolo="Tempi"
        testo={`Lavori da ${nomeMese(aggiungiMesi(ip.inizio, t.lavori))} a ${nomeMese(aggiungiMesi(ip.inizio, t.fineLavori))}, vendite da ${nomeMese(aggiungiMesi(ip.inizio, t.vendite))} a ${nomeMese(aggiungiMesi(ip.inizio, t.fineVendite))}.`}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CampoNumero id={id("permessi")} etichetta="Progetto e permessi" unita="mesi" intero valore={ip.mesiPermessi} onCambia={(v) => metti("mesiPermessi", v ?? 0)} aiuto="dall'acquisto ai lavori" />
          <CampoNumero id={id("lavori")} etichetta="Lavori" unita="mesi" intero valore={ip.mesiLavori} onCambia={(v) => metti("mesiLavori", v ?? 0)} />
          <CampoNumero id={id("dopo")} etichetta="Vendite rispetto alla fine lavori" unita="mesi" intero negativo valore={ip.venditeDopoLavori}
            onCambia={(v) => metti("venditeDopoLavori", v ?? 0)} aiuto="−3 = tre mesi prima" />
          <CampoNumero id={id("vendite")} etichetta="Vendite in" unita="mesi" intero valore={ip.mesiVendite} onCambia={(v) => metti("mesiVendite", Math.max(1, v ?? 1))} />
        </div>
      </Gruppo>

      <Gruppo
        titolo="Con quali soldi"
        testo="Prima entrano i mezzi propri, poi gli investitori, poi il mutuo a SAL, man mano che servono."
        azione={(
          <Button type="button" variant="outline" size="sm" onClick={() => metti("investitori", [...ip.investitori, nuovoInvestitore()])}>
            <Plus className="mr-1 h-4 w-4" /> Aggiungi un investitore
          </Button>
        )}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <CampoNumero id={id("propri")} etichetta="Mezzi propri" unita="€" valore={ip.mezziPropri} onCambia={(v) => metti("mezziPropri", v ?? 0)} />
          <CampoNumero id={id("mutuo")} etichetta="Mutuo" unita="€" valore={ip.mutuo.importo} onCambia={(v) => metti("mutuo", { ...ip.mutuo, importo: v ?? 0 })} aiuto="erogato a SAL" />
          <CampoNumero id={id("tasso")} etichetta="Tasso annuo" unita="%" valore={ip.mutuo.tassoPct} onCambia={(v) => metti("mutuo", { ...ip.mutuo, tassoPct: v ?? 0 })} />
          <CampoNumero id={id("spese")} etichetta="Spese del mutuo" unita="€" valore={ip.mutuo.speseIniziali} onCambia={(v) => metti("mutuo", { ...ip.mutuo, speseIniziali: v ?? 0 })} aiuto="istruttoria, perizia" />
          <div className="space-y-1">
            <Label htmlFor={id("rimborso")} className="text-sm font-normal text-muted-foreground">Rimborso</Label>
            <Select value={ip.mutuo.rimborso} onValueChange={(v) => metti("mutuo", { ...ip.mutuo, rimborso: v as PianoRimborso })}>
              <SelectTrigger id={id("rimborso")} className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PIANI_RIMBORSO.map((p) => <SelectItem key={p} value={p}>{NOMI_RIMBORSO[p].nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        {ip.investitori.length > 0 && (
          <div className="mt-3 space-y-3 border-t pt-3">
            {ip.investitori.map((inv, i) => (
              <div key={inv.id} className="grid items-end gap-2 sm:grid-cols-[minmax(8rem,1.4fr)_minmax(9rem,1fr)_repeat(2,minmax(6rem,1fr))_auto]">
                <div className="space-y-1">
                  <Label htmlFor={id(`inv-nome-${i}`)} className="text-sm font-normal text-muted-foreground">Investitore</Label>
                  <Input id={id(`inv-nome-${i}`)} value={inv.nome} maxLength={200} className="h-9 text-sm" onChange={(e) => investitore(inv.id, { nome: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={id(`inv-tipo-${i}`)} className="text-sm font-normal text-muted-foreground">Come entra</Label>
                  <Select value={inv.tipo} onValueChange={(v) => investitore(inv.id, v === "prestito" ? { tipo: "prestito", quotaUtilePct: null, tassoPct: inv.tassoPct ?? 8 } : { tipo: "capitale", tassoPct: null })}>
                    <SelectTrigger id={id(`inv-tipo-${i}`)} className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="capitale">A capitale (divide l'utile)</SelectItem>
                      <SelectItem value="prestito">A prestito (tasso)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <CampoNumero id={id(`inv-importo-${i}`)} etichetta="Importo" unita="€" valore={inv.importo} onCambia={(v) => investitore(inv.id, { importo: v ?? 0 })} />
                {inv.tipo === "prestito" ? (
                  <CampoNumero id={id(`inv-tasso-${i}`)} etichetta="Tasso annuo" unita="%" valore={inv.tassoPct} onCambia={(v) => investitore(inv.id, { tassoPct: v ?? 0 })} />
                ) : (
                  <CampoNumero id={id(`inv-quota-${i}`)} etichetta="Quota fissa dell'utile" unita="%" vuotoPermesso valore={inv.quotaUtilePct}
                    onCambia={(v) => investitore(inv.id, { quotaUtilePct: v === null ? null : Math.min(100, v) })} aiuto={inv.quotaUtilePct === null ? "vuoto = pro quota" : undefined} />
                )}
                <Button type="button" variant="ghost" size="icon" aria-label={`Togli ${inv.nome || "questo investitore"}`} className="mb-0.5"
                  onClick={() => metti("investitori", ip.investitori.filter((x) => x.id !== inv.id))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Gruppo>
    </div>
  );
}
