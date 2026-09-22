/**
 * Negli otto editor dei moduli edili, la sezione di una pagina del Piano dei lavori
 * (vedi pagineEditor.ts): la scheda con l'interruttore «Mostra nel PDF» (lo stesso
 * dell'occhio in «Ordine e pagine»), i testi, il contenuto e la foto della pagina.
 * Per le sezioni che c'erano già (Chi siamo, Come lavoriamo, Cronoprogramma) solo
 * la foto della pagina, in una scheda sotto le loro.
 *
 * La scheda ricalca quella degli editor edili (SectionCard), che è la stessa negli otto.
 */
import type { ComponentType, ReactNode } from "react";
import { Camera, Eye, EyeOff, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ContenutoPagina, type CampoFoto } from "@/components/preventivi/ContenutoPagina";
import { paginaEditor } from "@/components/preventivi/pagineEditor";
import { capitoloVisibile, conCapitoloVisibile, type VoceOrdine } from "@/components/preventivi/pdf/ordineCapitoli";
import type { SettoreBlocchi } from "../../../supabase/functions/_shared/blocchiPreventivo";
import type { PaginaConTestata } from "../../../supabase/functions/_shared/testatePagine";

interface Props {
  /** La sezione aperta nell'editor: se non è una pagina di questo elenco, niente. */
  sezione: string;
  settore: SettoreBlocchi;
  blocchi: unknown;
  onBlocchi: (v: Record<string, unknown>) => void;
  /** `pdf_ordine_capitoli` e `pdf_pagine_libere` del modello: dicono se la pagina esce. */
  ordine: unknown;
  pagine: unknown;
  onOrdine: (v: VoceOrdine[]) => void;
  /** «Garanzie e domande» del modello (`show_garanzie`): spento, non escono né le une né le altre. */
  mostraGaranzie: boolean;
  onMostraGaranzie: (v: boolean) => void;
  /** Quello che mostrano recensioni, domande, garanzie e lavori: gli editor del modulo. */
  contenuti?: Partial<Record<PaginaConTestata, ReactNode>>;
  campoFoto: CampoFoto;
}

function Scheda({ icona: Icona, titolo, descrizione, toggle, children }: {
  icona: ComponentType<{ className?: string }>;
  titolo: string;
  descrizione?: string;
  toggle?: { value: boolean; onChange: (v: boolean) => void };
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
              <Icona className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-sm">{titolo}</CardTitle>
              {descrizione ? <p className="mt-0.5 text-[11px] text-muted-foreground">{descrizione}</p> : null}
            </div>
          </div>
          {toggle ? (
            <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
              {toggle.value ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Mostra nel PDF</span>
              <Switch checked={toggle.value} onCheckedChange={toggle.onChange} aria-label={`Mostra «${titolo}» nel PDF`} />
            </label>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function SezionePaginaEdile({
  sezione, settore, blocchi, onBlocchi, ordine, pagine, onOrdine, mostraGaranzie, onMostraGaranzie, contenuti, campoFoto,
}: Props) {
  const pagina = paginaEditor("edili", sezione);
  if (!pagina || (pagina.esistente && !pagina.foto)) return null;

  if (pagina.esistente) {
    return (
      <Scheda icona={Camera} titolo="Foto della pagina">
        <ContenutoPagina pagina={pagina} motore="edili" settore={settore} blocchi={blocchi} onBlocchi={onBlocchi} campoFoto={campoFoto} soloFoto />
      </Scheda>
    );
  }

  const capitolo = pagina.pagina;
  // Garanzie e domande hanno anche l'interruttore di prima, per tutte e due: spento, non
  // esce nessuna delle due. Chi ne riaccende una ritrova l'altra com'era, cioè spenta.
  const conLeGaranzie = capitolo === "garanzie" || capitolo === "domande";
  const visibile = capitolo ? capitoloVisibile(ordine, pagine, capitolo) && (!conLeGaranzie || mostraGaranzie) : false;
  const cambia = (v: boolean) => {
    if (!capitolo) return;
    let nuovo = conCapitoloVisibile(ordine, pagine, capitolo, v);
    if (v && conLeGaranzie && !mostraGaranzie) {
      nuovo = conCapitoloVisibile(nuovo, pagine, capitolo === "garanzie" ? "domande" : "garanzie", false);
      onMostraGaranzie(true);
    }
    onOrdine(nuovo);
  };

  return (
    <Scheda
      icona={pagina.icona ?? FileText}
      titolo={pagina.voce}
      descrizione={pagina.descrizione}
      toggle={capitolo ? { value: visibile, onChange: cambia } : undefined}
    >
      <ContenutoPagina
        pagina={pagina}
        motore="edili"
        settore={settore}
        blocchi={blocchi}
        onBlocchi={onBlocchi}
        contenuto={pagina.testata ? contenuti?.[pagina.testata] : undefined}
        campoFoto={campoFoto}
      />
    </Scheda>
  );
}

export default SezionePaginaEdile;
