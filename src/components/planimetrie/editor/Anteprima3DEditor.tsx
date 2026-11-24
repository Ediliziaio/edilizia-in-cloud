import { useMemo, useRef, type ReactNode } from "react";
import { Box, Focus, Maximize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pianteDaPlanimetria } from "@/lib/planimetrie/tred/adattatore";
import { areaPoligono, lunghezzaMuro, puntoNelPoligono } from "../../../../shared/planimetrie/geometria";
import { origineMisura, originePeggiore, scalaModelloDaVerificare, type Origine, type Planimetria, type StatoPianta } from "../../../../shared/planimetrie/modello";
import { Vista3DPigra, type Vista3DHandle } from "../Vista3DPigra";
import { CATALOGO } from "./catalogo";
import type { Vista } from "./comandi";
import type { Selezione } from "./TelaPlanimetria";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const numero = new Intl.NumberFormat(intlCampo(), { maximumFractionDigits: 2 });
const origini: Record<Origine, string> = { rilevata: "Rilevata", da_documento: "Da documento", stimata: "Stimata" };
const nomiVano = { porta: "Porta", finestra: "Finestra", portafinestra: "Portafinestra", varco: "Varco" };

function misuraSelezione(stato: StatoPianta, selezione: Selezione | null, t: (testo: string) => string) {
  const id = selezione?.id;
  if (selezione?.tipo === "locale") {
    const locale = stato.locali.find(l => l.id === id);
    if (locale) return { nome: locale.nome, misura: `${numero.format(areaPoligono(locale.contorno) / 10_000)} m²`, origine: origineMisura(locale, "contorno") };
  }
  if (selezione?.tipo === "muro") {
    const muro = stato.muri.find(m => m.id === id && m.stato !== "da_demolire");
    if (muro) return { nome: t("Parete"), misura: `${numero.format(lunghezzaMuro(muro) / 100)} m`, origine: origineMisura(muro, "lunghezza") };
  }
  if (selezione?.tipo === "apertura") {
    const vano = stato.aperture.find(a => a.id === id && a.stato !== "da_demolire");
    if (vano) return { nome: t(nomiVano[vano.tipo]), misura: `${numero.format(vano.larghezza)} cm`, origine: origineMisura(vano, "larghezza") };
  }
  if (selezione?.tipo === "elemento") {
    const arredo = stato.elementi.find(e => e.id === id && e.stato !== "da_demolire");
    if (arredo) return {
      nome: arredo.etichetta || CATALOGO.find(e => e.tipo === arredo.tipo)?.nome || t("Arredo"),
      misura: `${numero.format(arredo.larghezza)} × ${numero.format(arredo.profondita)} cm`,
      origine: originePeggiore(origineMisura(arredo, "larghezza"), origineMisura(arredo, "profondita")),
    };
  }
  return null;
}

export function Anteprima3DEditor({ documento, livelloId, propostaId, vista, fase, selezione, comandoPianta, confronto, onSeleziona, onCompleta, onChiudi }: {
  documento: Planimetria;
  livelloId?: string;
  propostaId: string;
  vista: Vista;
  fase: "prima" | "proposta" | "corrente";
  selezione: Selezione | null;
  comandoPianta: ReactNode;
  confronto?: ReactNode;
  onSeleziona?: (selezione: Selezione) => void;
  onCompleta?: () => void;
  onChiudi: () => void;
}) {
  const t = useT();
  const visore = useRef<Vista3DHandle>(null);
  const piante = useMemo(() => pianteDaPlanimetria(documento, { livelloId, propostaId }), [documento, livelloId, propostaId]);
  const modello = piante[vista];
  const disponibile = !!(modello.muri.length || modello.locali.length || modello.elementi.length || modello.aree?.length);
  const { livello } = piante;
  const stato = (vista === "progetto" ? livello?.proposte.find(p => p.id === propostaId) : undefined) ?? livello?.fatto;
  const arredo = selezione?.tipo === "elemento" ? modello.elementi.find(e => e.id === selezione.id) : undefined;
  const localeArredo = arredo && modello.locali.find(l => l.id === arredo.localeId || puntoNelPoligono(arredo.centro, l.contorno));
  const localeSelezionato = selezione?.tipo === "locale" ? modello.locali.find(l => l.id === selezione.id) : undefined;
  const localeId = localeSelezionato?.id ?? localeArredo?.id ?? modello.locali[0]?.id;
  const misura = stato && misuraSelezione(stato, selezione, t);
  const scalaDaVerificare = !!livello && scalaModelloDaVerificare(livello);
  const nomeVista = fase === "proposta" ? t("Proposta di Silvio") : fase === "prima" ? t("Prima della proposta")
    : vista === "fatto" ? t("Com’è oggi") : t("Progetto");

  const seleziona = (id: string) => {
    if (!stato || !onSeleziona) return;
    if (stato.aperture.some(a => a.id === id)) onSeleziona({ tipo: "apertura", id });
    else if (stato.muri.some(m => m.id === id)) onSeleziona({ tipo: "muro", id });
    else if (stato.locali.some(l => l.id === id)) onSeleziona({ tipo: "locale", id });
    else if (stato.elementi.some(e => e.id === id)) onSeleziona({ tipo: "elemento", id });
    else if (stato.aree?.some(a => a.id === id)) onSeleziona({ tipo: "area", id });
  };

  return <section aria-label={t("Anteprima 3D affiancata")} className="pl-editor-anteprima-3d flex min-h-0 min-w-0 flex-col bg-background">
    <header className="flex shrink-0 flex-wrap items-start gap-x-1 gap-y-1.5 border-b px-3 py-2">
      <div className="min-w-[5.5rem] flex-1">
        <h2 className="text-sm font-semibold">{t("Anteprima 3D")}</h2>
        <p className="truncate text-xs text-muted-foreground" role="status">{[livello?.nome, nomeVista].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {comandoPianta}
        {onCompleta && <Button type="button" size="icon" variant="ghost" className="size-8" disabled={!disponibile}
          aria-label={t("Apri 3D completo")} title={t("Apri 3D completo")} onClick={onCompleta}><Maximize2 aria-hidden="true" /></Button>}
        <Button type="button" size="icon" variant="ghost" className="size-8" aria-label={t("Chiudi anteprima 3D")} title={t("Chiudi anteprima 3D")} onClick={onChiudi}>
          <X aria-hidden="true" />
        </Button>
      </div>
    </header>
    {disponibile ? <Vista3DPigra ref={visore} key={livello?.id} className="min-h-0 flex-1"
      piante={piante} anteprimaEditor={{ vista, localeId, selezionato: selezione?.id, onSelezione: onSeleziona && seleziona, confronto }} />
      : <>
        {confronto && <div className="shrink-0 border-b px-2 py-1.5">{confronto}</div>}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-muted/25 p-4 text-center text-sm text-muted-foreground">
          <Box className="size-6" aria-hidden="true" />
          {t("Disegna sulla pianta o chiedi a Silvio di aggiungere un locale.")}
        </div>
      </>}
    {(misura || scalaDaVerificare) && <footer className="flex min-h-8 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t px-3 py-1.5 text-xs">
      {misura && <p className="min-w-0 max-w-full break-words">
        <span className="font-medium">{misura.nome} · {misura.misura}</span>
        <span className="text-muted-foreground"> · {t(origini[misura.origine])}</span>
      </p>}
      {scalaDaVerificare && <span className="text-amber-800 dark:text-amber-300">{t("Scala da verificare")}</span>}
      {arredo && localeArredo && <Button type="button" size="sm" variant="ghost" className="ml-auto h-6 gap-1 px-1.5 text-xs"
        onClick={() => visore.current?.inquadraArredo(arredo.id)} aria-label={t("Inquadra arredo")}><Focus className="size-3.5" aria-hidden="true" />{t("Inquadra")}</Button>}
    </footer>}
  </section>;
}
