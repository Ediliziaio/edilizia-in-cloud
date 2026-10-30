// src/components/orders/generali/vendita/SchedaVendita.tsx
// La scheda vendita dell'unità in PDF, da dare o mandare all'acquirente: operazione, unità,
// piano, tipologia, m², il prezzo di listino se lo vuoi, planimetria, foto, capitolato in breve
// e i contatti dell'azienda. Mai costi, margini, acquirenti o incassi (vendita.ts).
// Il capitolato in breve vale di solito per tutta l'operazione: si ricorda per la generale
// in questo browser. Solo da tablet e computer; si scarica, non si invia da qui.
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { euro } from "@/components/orders/generali/unita/aspetto";
import { scaricaBlob } from "@/components/orders/generali/vendita/scarica";
import { useAziendaDossier } from "@/hooks/useGeneraleRendiconto";
import { immaginePerScheda, useFileVenditaUnita } from "@/hooks/useGeneraleVendita";
import type { ModelloGenerale } from "@/lib/orders/commesseGenerali";
import { oggiLocale } from "@/lib/orders/generali/documenti";
import type { UnitaGenerale } from "@/lib/orders/generali/unita";
import {
  MAX_FOTO_SCHEDA, aziendaVendita, componiSchedaVendita, nomeFileScheda,
} from "@/lib/orders/generali/vendita";

interface Props {
  generaleId: string;
  modello: ModelloGenerale;
  operazione: string;
  unita: UnitaGenerale;
  vedeImporti: boolean;
}

const chiaveCapitolato = (generaleId: string) => `generale-vendita-capitolato:${generaleId}`;
function leggiCapitolato(generaleId: string): string {
  try {
    return window.localStorage.getItem(chiaveCapitolato(generaleId)) ?? "";
  } catch {
    return "";
  }
}
function salvaCapitolato(generaleId: string, testo: string) {
  try {
    window.localStorage.setItem(chiaveCapitolato(generaleId), testo);
  } catch {
    // Navigazione privata o spazio pieno: si riscrive la prossima volta.
  }
}

export function SchedaVendita({ generaleId, modello, operazione, unita: u, vedeImporti }: Props) {
  const azienda = useAziendaDossier();
  const { file, isLoading } = useFileVenditaUnita({ generaleId, modello, orderId: u.orderId });
  const conListino = vedeImporti && u.listino !== null && u.listino > 0;
  const [conPrezzo, setConPrezzo] = useState(false);
  const [conPlanimetria, setConPlanimetria] = useState(true);
  const [conFoto, setConFoto] = useState(true);
  const [capitolato, setCapitolato] = useState(() => leggiCapitolato(generaleId));
  const [preparo, setPreparo] = useState(false);

  const planimetria = file?.planimetria[0] ?? null;
  const foto = (file?.foto ?? []).slice(0, MAX_FOTO_SCHEDA);
  const id = (n: string) => `scheda-${u.orderId}-${n}`;

  const genera = async () => {
    if (!azienda.data || preparo) return;
    setPreparo(true);
    salvaCapitolato(generaleId, capitolato);
    try {
      const [immPlanimetria, ...immFoto] = await Promise.all([
        conPlanimetria && planimetria ? immaginePerScheda(planimetria) : Promise.resolve(null),
        ...(conFoto ? foto.map((f) => immaginePerScheda(f, 1000)) : []),
      ]);
      const fotoBuone = immFoto.filter((f): f is string => !!f);
      const d = componiSchedaVendita({
        azienda: aziendaVendita(azienda.data),
        operazione,
        unita: u,
        conPrezzo: conListino && conPrezzo,
        planimetria: immPlanimetria,
        foto: fotoBuone,
        capitolato,
        data: oggiLocale(),
      });
      const [{ pdf }, { SchedaVenditaPDF }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/orders/generali/vendita/VenditaPDF"),
      ]);
      scaricaBlob(await pdf(<SchedaVenditaPDF d={d} />).toBlob(), nomeFileScheda(d));
      const persi = (conPlanimetria && planimetria && !immPlanimetria ? 1 : 0) + (conFoto ? foto.length - fotoBuone.length : 0);
      if (persi > 0) toast.warning(persi === 1 ? "Un'immagine non si è scaricata ed è rimasta fuori dalla scheda." : `${persi} immagini non si sono scaricate e sono rimaste fuori dalla scheda.`);
      else toast.success(`Scheda di ${u.sigla} pronta`);
    } catch {
      toast.error("Non sono riuscito a preparare la scheda. Riprova.");
    } finally {
      setPreparo(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={(ev) => { ev.preventDefault(); void genera(); }}>
      <p className="text-sm text-muted-foreground">
        Il PDF da dare a chi è interessato a {u.sigla}: dati dell'unità, planimetria, foto, capitolato e i vostri contatti. Niente costi né acquirenti.
      </p>
      <div className="space-y-2">
        {conListino && (
          <div className="flex items-center gap-2">
            <Checkbox id={id("prezzo")} checked={conPrezzo} onCheckedChange={(v) => setConPrezzo(v === true)} />
            <Label htmlFor={id("prezzo")} className="text-sm font-normal">Metti il prezzo di listino ({euro(u.listino)})</Label>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Checkbox id={id("planimetria")} checked={conPlanimetria && !!planimetria} disabled={!planimetria} onCheckedChange={(v) => setConPlanimetria(v === true)} />
          <Label htmlFor={id("planimetria")} className="text-sm font-normal">
            {isLoading ? "Planimetria…" : planimetria ? "Planimetria" : "Planimetria (non caricata: si carica dalla scheda Vendita)"}
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id={id("foto")} checked={conFoto && foto.length > 0} disabled={foto.length === 0} onCheckedChange={(v) => setConFoto(v === true)} />
          <Label htmlFor={id("foto")} className="text-sm font-normal">
            {foto.length === 0 ? "Foto o render (nessuna caricata)" : `Foto o render (${foto.length})`}
          </Label>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={id("capitolato")}>Capitolato in breve <span className="font-normal text-muted-foreground">(una voce per riga)</span></Label>
        <Textarea
          id={id("capitolato")}
          value={capitolato}
          onChange={(ev) => setCapitolato(ev.target.value)}
          rows={4}
          className="text-sm"
          placeholder={"Classe energetica A4, pompa di calore\nPavimenti in gres porcellanato 60×60\nInfissi in PVC con triplo vetro"}
        />
        <p className="text-xs text-muted-foreground">Vale per tutte le unità di quest'operazione: lo ritrovi la prossima volta.</p>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={!azienda.data || isLoading || preparo}>
          {preparo ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
          Scarica la scheda PDF
        </Button>
      </div>
    </form>
  );
}
