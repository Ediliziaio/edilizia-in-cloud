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
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  ipotesi: Ipotesi;
  onCambia: (ip: Ipotesi) => void;
  /** Prefisso degli id dei campi: in pagina possono esserci più moduli. */
  prefisso?: string;
}

export function FormIpotesi({ ipotesi: ip, onCambia, prefisso = "sim" }: Props) {
  const tr = useT();
  const metti = <K extends keyof Ipotesi>(k: K, v: Ipotesi[K]) => onCambia({ ...ip, [k]: v });
  const tipologia = (id: string, p: Partial<Tipologia>) => metti("tipologie", ip.tipologie.map((t) => (t.id === id ? { ...t, ...p } : t)));
  const investitore = (id: string, p: Partial<InvestitoreIpotesi>) => metti("investitori", ip.investitori.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const t = tempi(ip);
  const sviluppo = ip.modello === "sviluppo";
  const nomeLavori = sviluppo ? tr("Costruzione") : tr("Ristrutturazione");
  const importoLavori = ip.planimetria?.computoImportato ? ip.ritocchi.costruzione?.importo : undefined;
  const aImporto = importoLavori !== undefined;
  const id = (s: string) => `${prefisso}-${s}`;

  return (
    <div className="space-y-3">
      <Gruppo titolo={tr("Acquisto")} testo={sviluppo ? tr("Il terreno e le imposte che paghi al rogito.") : tr("L'immobile e le imposte che paghi al rogito.")}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor={id("inizio")} className="text-sm font-normal text-muted-foreground">{tr("Mese dell'acquisto")}</Label>
            <Input
              id={id("inizio")}
              type="month"
              value={ip.inizio}
              className="h-9 text-sm"
              onChange={(e) => { if (/^\d{4}-\d{2}$/.test(e.target.value)) metti("inizio", e.target.value); }}
            />
          </div>
          <CampoNumero id={id("acquisto")} etichetta={tr("Prezzo d'acquisto")} unita="€" valore={ip.acquisto} onCambia={(v) => metti("acquisto", v ?? 0)} />
          <CampoNumero id={id("imposte")} etichetta={tr("Imposte e notaio")} unita="%" valore={ip.impostePct} onCambia={(v) => metti("impostePct", v ?? 0)}
            aiuto={tr("{importo} sul prezzo", { importo: euro((ip.acquisto * ip.impostePct) / 100) })} />
        </div>
      </Gruppo>

      <Gruppo
        titolo={tr("Cosa vendi")}
        testo={tr("{n} unità · {mq} m² vendibili. Aggiungi una riga per ogni tipo (appartamenti, box, negozi).", { n: unitaTotali(ip), mq: mqTotali(ip).toLocaleString(intlCampo()) })}
        azione={(
          <Button type="button" variant="outline" size="sm" onClick={() => metti("tipologie", [...ip.tipologie, nuovaTipologia(ip.tipologie.length ? "Box" : "Appartamenti")])}>
            <Plus className="mr-1 h-4 w-4" /> {tr("Aggiungi un tipo")}
          </Button>
        )}
      >
        {ip.tipologie.length === 0 && <p className="text-sm text-muted-foreground">{tr("Aggiungi almeno un tipo di unità per vedere ricavi e indicatori.")}</p>}
        <div className="space-y-3">
          {ip.tipologie.map((tp, i) => (
            <div key={tp.id} className={aImporto
              ? "grid items-end gap-2 sm:grid-cols-[minmax(8rem,1.4fr)_repeat(3,minmax(5.5rem,1fr))_auto]"
              : "grid items-end gap-2 sm:grid-cols-[minmax(8rem,1.4fr)_repeat(4,minmax(5.5rem,1fr))_auto]"}>
              <div className="space-y-1">
                <Label htmlFor={id(`tp-nome-${i}`)} className="text-sm font-normal text-muted-foreground">{tr("Tipo")}</Label>
                <Input id={id(`tp-nome-${i}`)} value={tp.nome} maxLength={60} className="h-9 text-sm" onChange={(e) => tipologia(tp.id, { nome: e.target.value })} />
              </div>
              <CampoNumero id={id(`tp-quante-${i}`)} etichetta={tr("Quante")} intero valore={tp.quante} onCambia={(v) => tipologia(tp.id, { quante: v ?? 0 })} />
              <CampoNumero id={id(`tp-mq-${i}`)} etichetta={tr("m² l'una")} unita="m²" valore={tp.mq} onCambia={(v) => tipologia(tp.id, { mq: v ?? 0 })} />
              <CampoNumero id={id(`tp-prezzo-${i}`)} etichetta={tr("Vendo a")} unita="€/m²" valore={tp.prezzoMq} onCambia={(v) => tipologia(tp.id, { prezzoMq: v ?? 0 })} />
              {!aImporto && <CampoNumero id={id(`tp-costo-${i}`)} etichetta={tr("Costo")} unita="€/m²" vuotoPermesso valore={tp.costoMq} onCambia={(v) => tipologia(tp.id, { costoMq: v })}
                aiuto={tp.costoMq === null ? tr("come sotto") : undefined} />}
              <Button type="button" variant="ghost" size="icon" aria-label={tp.nome ? tr("Togli {nome}", { nome: tp.nome }) : tr("Togli questo tipo")} className="mb-0.5"
                onClick={() => metti("tipologie", ip.tipologie.filter((x) => x.id !== tp.id))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </Gruppo>

      <Gruppo titolo={tr("Costi")} testo={aImporto ? tr("Importo complessivo dei lavori e spese dell’operazione.") : tr("{lavori} al m² e le spese che ne dipendono.", { lavori: nomeLavori })}>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {aImporto
            ? <CampoNumero key="importo" id={id("costo")} etichetta={nomeLavori} unita="€" valore={importoLavori}
                onCambia={v => metti("ritocchi", { ...ip.ritocchi, costruzione: { ...ip.ritocchi.costruzione, importo:v ?? 0 } })} />
            : <CampoNumero key="al-metro" id={id("costo")} etichetta={nomeLavori} unita="€/m²" valore={ip.costoMq} onCambia={(v) => metti("costoMq", v ?? 0)} />}
          <CampoNumero id={id("oneri")} etichetta={sviluppo ? tr("Oneri e permessi") : tr("Pratiche e permessi")} unita="€" valore={ip.oneri} onCambia={(v) => metti("oneri", v ?? 0)} />
          <CampoNumero id={id("tecnici")} etichetta={tr("Tecnici")} unita="%" valore={ip.tecniciPct} onCambia={(v) => metti("tecniciPct", v ?? 0)} aiuto={tr("della costruzione")} />
          <CampoNumero id={id("comm")} etichetta={tr("Agenzia e pubblicità")} unita="%" valore={ip.commercializzazionePct} onCambia={(v) => metti("commercializzazionePct", v ?? 0)} aiuto={tr("dei ricavi")} />
          <CampoNumero id={id("impr")} etichetta={tr("Imprevisti")} unita="%" valore={ip.imprevistiPct} onCambia={(v) => metti("imprevistiPct", v ?? 0)} aiuto={tr("della costruzione")} />
        </div>
      </Gruppo>

      <Gruppo
        titolo={tr("Tempi")}
        testo={tr("Lavori da {inizioLavori} a {fineLavori}, vendite da {inizioVendite} a {fineVendite}.", {
          inizioLavori: nomeMese(aggiungiMesi(ip.inizio, t.lavori)),
          fineLavori: nomeMese(aggiungiMesi(ip.inizio, t.fineLavori)),
          inizioVendite: nomeMese(aggiungiMesi(ip.inizio, t.vendite)),
          fineVendite: nomeMese(aggiungiMesi(ip.inizio, t.fineVendite)),
        })}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CampoNumero id={id("permessi")} etichetta={tr("Progetto e permessi")} unita={tr("mesi")} intero valore={ip.mesiPermessi} onCambia={(v) => metti("mesiPermessi", v ?? 0)} aiuto={tr("dall'acquisto ai lavori")} />
          <CampoNumero id={id("lavori")} etichetta={tr("Lavori")} unita={tr("mesi")} intero valore={ip.mesiLavori} onCambia={(v) => metti("mesiLavori", v ?? 0)} />
          <CampoNumero id={id("dopo")} etichetta={tr("Vendite rispetto alla fine lavori")} unita={tr("mesi")} intero negativo valore={ip.venditeDopoLavori}
            onCambia={(v) => metti("venditeDopoLavori", v ?? 0)} aiuto={tr("−3 = tre mesi prima")} />
          <CampoNumero id={id("vendite")} etichetta={tr("Vendite in")} unita={tr("mesi")} intero valore={ip.mesiVendite} onCambia={(v) => metti("mesiVendite", Math.max(1, v ?? 1))} />
        </div>
      </Gruppo>

      <Gruppo
        titolo={tr("Con quali soldi")}
        testo={tr("Prima entrano i mezzi propri, poi gli investitori, poi il mutuo a SAL, man mano che servono.")}
        azione={(
          <Button type="button" variant="outline" size="sm" onClick={() => metti("investitori", [...ip.investitori, nuovoInvestitore()])}>
            <Plus className="mr-1 h-4 w-4" /> {tr("Aggiungi un investitore")}
          </Button>
        )}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <CampoNumero id={id("propri")} etichetta={tr("Mezzi propri")} unita="€" valore={ip.mezziPropri} onCambia={(v) => metti("mezziPropri", v ?? 0)} />
          <CampoNumero id={id("mutuo")} etichetta={tr("Mutuo")} unita="€" valore={ip.mutuo.importo} onCambia={(v) => metti("mutuo", { ...ip.mutuo, importo: v ?? 0 })} aiuto={tr("erogato a SAL")} />
          <CampoNumero id={id("tasso")} etichetta={tr("Tasso annuo")} unita="%" valore={ip.mutuo.tassoPct} onCambia={(v) => metti("mutuo", { ...ip.mutuo, tassoPct: v ?? 0 })} />
          <CampoNumero id={id("spese")} etichetta={tr("Spese del mutuo")} unita="€" valore={ip.mutuo.speseIniziali} onCambia={(v) => metti("mutuo", { ...ip.mutuo, speseIniziali: v ?? 0 })} aiuto={tr("istruttoria, perizia")} />
          <div className="space-y-1">
            <Label htmlFor={id("rimborso")} className="text-sm font-normal text-muted-foreground">{tr("Rimborso")}</Label>
            <Select value={ip.mutuo.rimborso} onValueChange={(v) => metti("mutuo", { ...ip.mutuo, rimborso: v as PianoRimborso })}>
              <SelectTrigger id={id("rimborso")} className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PIANI_RIMBORSO.map((p) => <SelectItem key={p} value={p}>{tr(NOMI_RIMBORSO[p].nome)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        {ip.investitori.length > 0 && (
          <div className="mt-3 space-y-3 border-t pt-3">
            {ip.investitori.map((inv, i) => (
              <div key={inv.id} className="grid items-end gap-2 sm:grid-cols-[minmax(8rem,1.4fr)_minmax(9rem,1fr)_repeat(2,minmax(6rem,1fr))_auto]">
                <div className="space-y-1">
                  <Label htmlFor={id(`inv-nome-${i}`)} className="text-sm font-normal text-muted-foreground">{tr("Investitore")}</Label>
                  <Input id={id(`inv-nome-${i}`)} value={inv.nome} maxLength={200} className="h-9 text-sm" onChange={(e) => investitore(inv.id, { nome: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={id(`inv-tipo-${i}`)} className="text-sm font-normal text-muted-foreground">{tr("Come entra")}</Label>
                  <Select value={inv.tipo} onValueChange={(v) => investitore(inv.id, v === "prestito" ? { tipo: "prestito", quotaUtilePct: null, tassoPct: inv.tassoPct ?? 8 } : { tipo: "capitale", tassoPct: null })}>
                    <SelectTrigger id={id(`inv-tipo-${i}`)} className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="capitale">{tr("A capitale (divide l'utile)")}</SelectItem>
                      <SelectItem value="prestito">{tr("A prestito (tasso)")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <CampoNumero id={id(`inv-importo-${i}`)} etichetta={tr("Importo")} unita="€" valore={inv.importo} onCambia={(v) => investitore(inv.id, { importo: v ?? 0 })} />
                {inv.tipo === "prestito" ? (
                  <CampoNumero id={id(`inv-tasso-${i}`)} etichetta={tr("Tasso annuo")} unita="%" valore={inv.tassoPct} onCambia={(v) => investitore(inv.id, { tassoPct: v ?? 0 })} />
                ) : (
                  <CampoNumero id={id(`inv-quota-${i}`)} etichetta={tr("Quota fissa dell'utile")} unita="%" vuotoPermesso valore={inv.quotaUtilePct}
                    onCambia={(v) => investitore(inv.id, { quotaUtilePct: v === null ? null : Math.min(100, v) })} aiuto={inv.quotaUtilePct === null ? tr("vuoto = pro quota") : undefined} />
                )}
                <Button type="button" variant="ghost" size="icon" aria-label={inv.nome ? tr("Togli {nome}", { nome: inv.nome }) : tr("Togli questo investitore")} className="mb-0.5"
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
