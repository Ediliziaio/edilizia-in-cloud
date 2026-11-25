import { UniformSelect } from "@/components/ui/uniform-select";
/**
 * Il blocco «Clausole contrattuali» degli editor dei modelli dei preventivatori.
 *
 * Un preventivo firmato è il contratto: senza condizioni quel contratto non dice niente su tempi, varianti,
 * garanzie, pagamenti e recesso.
 *
 * Dal 07/11/2026 le condizioni NON si scrivono più qui. Florin: «le definisco in Contratti e condizioni e le
 * associo: non le devo modificare da altre parti». Questo blocco dice cosa esce nel PDF e da dove, e fa
 * scegliere QUALE modello dell'archivio usa questo preventivatore. La regola è quella dei PDF
 * (`condizioniDelPdf`): modello associato → predefinito → il testo che il modulo aveva → quelle di base del
 * settore. Chi ha ancora il testo nel modulo lo porta nell'archivio con un clic, e da lì lo modifica una
 * volta sola per tutti i preventivatori: niente si perde, il testo del modulo resta dov'è.
 */
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, ExternalLink, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";
import { useAuth } from "@/contexts/AuthContext";
import { useCondizioniArchivio } from "@/hooks/useCondizioniArchivio";
import { impronta } from "@/lib/condizioni/importa";
import { testoDelModello, testoPiano, type ModelloArchivio } from "@/lib/condizioni/archivio";
import { condizioniStandard, type SettoreCondizioni } from "@/lib/condizioniStandard";
import type { QuoteTemplate } from "@/types/quoteTemplate";
import { htmlPerEditorContratto } from "@/lib/preventivi/contrattoEditor";
import { PAGINA_CONDIZIONI, paginaDelModello } from "@/lib/condizioni/indirizzi";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

/** Conserva la formattazione del blocco copiato. */
export function testoDaBloccoLibreria(template: QuoteTemplate): string {
  const raw = String(template.body_html ?? template.contractual_terms_text ?? template.legal_terms_text ?? "");
  return htmlPerEditorContratto(raw);
}

/** Il riassunto da leggere: senza i segni del Markdown («#», «- ») che nel PDF diventano titoli ed elenchi. */
const riassunto = (testo: string): string =>
  testo.replace(/(^|\n)\s*#{1,6}\s*/g, "$1").replace(/(^|\n)\s*[-*•]\s+/g, "$1").replace(/\s+/g, " ").trim();

interface Props {
  companyId: string | null | undefined;
  /** Il settore decide il testo di base, quando non c'è altro. */
  settore: SettoreCondizioni;
  /** Il nome del preventivatore, per chiamare il modello che nasce portando il testo nell'archivio. */
  nomeModulo?: string;
  /** Le condizioni escono nel PDF. Senza `onAttivo` non c'è l'interruttore (il computo non lo ha). */
  attivo?: boolean;
  /** Il testo che questo modulo aveva: si legge, non si scrive più qui. */
  testo: string;
  onAttivo?: (v: boolean) => void;
  /** Il modello dell'archivio associato a questo preventivatore (`condizioni_modello_id`). */
  modelloAssociatoId?: string | null;
  onAssocia?: (id: string | null) => void;
  /** Il modulo di recesso allegato al preventivo: lo accende l'azienda, spento di serie. Facoltativo. */
  recesso?: boolean;
  onRecesso?: (v: boolean) => void;
  /**
   * Compatibilità: gli editor dei modelli d'intervento lo passano. Quei modelli sono veri (si salvano online e
   * da lì nascono i preventivi), quindi il blocco funziona uguale: l'associazione finisce nel modello.
   */
  localOnly?: boolean;
  // Compatibilità: gli editor passavano ancora questi. Non servono più.
  onTesto?: (v: string) => void;
}

export function CondizioniContratto({
  settore, nomeModulo, attivo = true, testo, onAttivo, modelloAssociatoId, onAssocia, recesso = false, onRecesso,
}: Props) {
  const t = useT();
  const archivio = useCondizioniArchivio();
  const perIPreventivi = useMemo(
    () => archivio.modelli.filter((m) => m.attivo && m.ambito === "preventivo"),
    [archivio.modelli],
  );
  const associato = perIPreventivi.find((m) => m.id === modelloAssociatoId) ?? null;
  const predefinito = perIPreventivi.find((m) => m.predefinito) ?? null;
  const dallArchivio = [associato, predefinito].find(m => m && testoDelModello(m).trim()) ?? null;
  const testoDelModulo = testo.trim();

  // Già nell'archivio lo stesso testo? Allora si associa quello, invece di crearne un doppione.
  const giaNellArchivio = useMemo(() => {
    if (!testoDelModulo) return null;
    const suo = impronta(testoDelModulo);
    return perIPreventivi.find((m) => impronta(...(m.clausole ?? []).map((c) => c.testo ?? "")) === suo) ?? null;
  }, [perIPreventivi, testoDelModulo]);

  // L'anteprima è il PDF vero: le stesse pagine delle condizioni che riceve il cliente, coi colori dell'azienda.
  // Il motore del PDF si carica solo quando la si apre: l'editor del modulo resta leggero.
  const [anteprimaAperta, setAnteprimaAperta] = useState(false);
  // Il React Compiler non è nella build: la regola è solo del lint. La memoizzazione a mano resta quella che funziona.
  const daMostrare: ModelloArchivio = useMemo(() => dallArchivio ?? {
    id: "modulo", nome: nomeModulo ?? "Condizioni", ambito: "preventivo", attivo: true, versione: 1, predefinito: false,
    clausole: [{ titolo: "", testo: testoDelModulo || condizioniStandard(settore) }],
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  }, [dallArchivio, nomeModulo, testoDelModulo, settore]);
  const bottoneAnteprima = (
    <Button variant="outline" size="sm" className="h-7" onClick={() => setAnteprimaAperta(true)}>
      <Eye className="mr-1.5 h-3.5 w-3.5" />{t("Anteprima condizioni")}
    </Button>
  );

  const portaNellArchivio = async () => {
    if (!onAssocia) return;
    if (giaNellArchivio) { onAssocia(giaNellArchivio.id); return; }
    const nuovo = await archivio.salvaModello.mutateAsync({
      nome: `${nomeModulo ?? "Preventivatore"} · condizioni`,
      ambito: "preventivo",
      clausole: [{ titolo: "Condizioni generali", testo: testoDelModulo }],
      // Non diventa il predefinito: vale per questo preventivatore, gli altri restano come sono.
      predefinito: false,
      note: `Importato da: ${nomeModulo ?? "un preventivatore"}`,
    });
    if (nuovo?.id) onAssocia(nuovo.id);
  };

  return (
    <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/30 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-sm font-medium"><Scale className="h-3.5 w-3.5" /> {t("Clausole contrattuali")}</p>
        {onAttivo && <Switch checked={attivo} onCheckedChange={onAttivo} aria-label={t("Condizioni generali nel documento")} />}
      </div>

      {attivo && (
        <>
          {dallArchivio ? (
            <div className="space-y-2 rounded-md border bg-background px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <p>
                  {t("Nel PDF esce")} <strong>«{dallArchivio.nome}»</strong>
                  <span className="text-muted-foreground"> · {t("versione {n} · da Contratti e condizioni", { n: dallArchivio.versione })}</span>
                </p>
                <span className="flex gap-1.5">
                  {bottoneAnteprima}
                  <Button asChild variant="outline" size="sm" className="h-7">
                    <Link to={paginaDelModello(dallArchivio.id)}><ExternalLink className="mr-1.5 h-3.5 w-3.5" />{t("Apri e modifica")}</Link>
                  </Button>
                </span>
              </div>
              {onAssocia && perIPreventivi.length > 1 && (
                <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {t("Per questo preventivatore usa")}
                  <UniformSelect aria-label={t("Modello delle condizioni per questo preventivatore")}
                    className="h-8 rounded-md border bg-background px-2 text-sm text-foreground"
                    value={associato?.id ?? ""} onChange={(e) => onAssocia(e.target.value || null)}>
                    <option value="">{predefinito ? t("il predefinito («{nome}»)", { nome: predefinito.nome }) : t("il predefinito")}</option>
                    {perIPreventivi.filter((m) => !m.predefinito).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </UniformSelect>
                </label>
              )}
              <p className="line-clamp-2 text-xs text-muted-foreground">{riassunto(testoDelModello(dallArchivio))}</p>
            </div>
          ) : testoDelModulo ? (
            <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              <p>
                {t("Nel PDF esce il testo scritto in questo preventivatore ({n} caratteri). Le condizioni ora si scrivono una volta sola, in Contratti e condizioni: portalo lì e lo modifichi per tutti.", { n: testoPiano(testoDelModulo).length.toLocaleString(intlCampo()) })}
              </p>
              <p className="line-clamp-2 text-amber-900/80">{riassunto(testoPiano(testoDelModulo))}</p>
              <span className="flex flex-wrap gap-1.5">
              {bottoneAnteprima}
              {onAssocia && (
                <Button size="sm" className="h-7" disabled={archivio.salvaModello.isPending} onClick={() => void portaNellArchivio()}>
                  {giaNellArchivio ? t("Usa «{nome}», che è lo stesso testo", { nome: giaNellArchivio.nome }) : t("Porta questo testo nell'archivio")}
                </Button>
              )}
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-xs">
              <p className="text-muted-foreground">
                {t("Nel PDF escono le condizioni di base del settore: un punto di partenza da rileggere con il tuo consulente.")}
              </p>
              <span className="flex gap-1.5">
                {bottoneAnteprima}
                <Button asChild variant="outline" size="sm" className="h-7">
                  <Link to={PAGINA_CONDIZIONI}><ExternalLink className="mr-1.5 h-3.5 w-3.5" />{t("Scrivi le tue")}</Link>
                </Button>
              </span>
              <details className="w-full">
                <summary className="cursor-pointer text-muted-foreground">{t("Leggi il testo di base")}</summary>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{testoPiano(condizioniStandard(settore))}</p>
              </details>
            </div>
          )}

          {/* Il modulo di recesso è una scelta dell'azienda, spenta di serie (21/09/2026):
              serve solo a chi firma con un privato fuori dalla sede o a distanza. */}
          {onRecesso && <div className="flex items-start justify-between gap-3 rounded-md border bg-background px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("Allega il modulo di recesso")}</p>
              <p className="text-xs text-muted-foreground">
                {t("Serve quando firmi con un privato a casa sua o a distanza (online, al telefono): senza, il cliente può arrivare a recedere fino a 12 mesi dopo, anche a lavori finiti. A chi vende ad aziende o fa firmare in sede non serve.")}
              </p>
            </div>
            <Switch checked={recesso} onCheckedChange={onRecesso} aria-label={t("Allega il modulo di recesso")} />
          </div>}
        </>
      )}

      <AnteprimaCondizioniDialog open={anteprimaAperta} onOpenChange={setAnteprimaAperta} modello={daMostrare} />
    </div>
  );
}

/** La finestra con il PDF vero delle condizioni: la usano il modulo e il singolo preventivo. */
export function AnteprimaCondizioniDialog({ open, onOpenChange, modello, titolo }: {
  open: boolean; onOpenChange: (v: boolean) => void; modello: ModelloArchivio; titolo?: string;
}) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90dvh] max-w-3xl flex-col gap-2 p-4">
        <DialogHeader><DialogTitle className="text-base">{titolo ?? t("Le condizioni come escono nel PDF · «{nome}»", { nome: modello.nome })}</DialogTitle></DialogHeader>
        {open && <PdfDelleCondizioni modello={modello} />}
      </DialogContent>
    </Dialog>
  );
}

/** Il PDF vero, montato solo a finestra aperta: azienda e motore del PDF si caricano solo allora. */
function PdfDelleCondizioni({ modello }: { modello: ModelloArchivio }) {
  const t = useT();
  const { effectiveCompany } = useAuth();
  const disegna = useCallback(async () => {
    const { anteprimaCondizioniUrl, aziendaPerAnteprima } = await import("@/lib/condizioni/anteprimaPdf");
    return anteprimaCondizioniUrl(modello, aziendaPerAnteprima(effectiveCompany));
  }, [modello, effectiveCompany]);
  // La chiave segue il testo: un testo riscritto a mano ridisegna l'anteprima.
  const chiave = `${modello.id}:${modello.versione}:${(modello.clausole ?? []).map((c) => String(c.testo ?? "").length).join(",")}`;
  return (
    <div className="min-h-0 flex-1">
      <PdfBlobLivePreviewPanel renderBlobUrl={disegna} depsKey={chiave}
        enabled downloadFileName="condizioni.pdf" headerLabel={t("Anteprima con dati d'esempio")} />
    </div>
  );
}

export default CondizioniContratto;
