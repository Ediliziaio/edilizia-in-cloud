/**
 * Render AI → Planimetrie → una pianta: le sue stanze, il 3D e i render fatti.
 *
 * Da ogni stanza: «Fai il render di questa stanza». Si sceglie lo stato (com'è oggi o il
 * progetto) e, se ci sono più piani, il piano. Le misure stimate dall'AI si vedono come
 * tali: il render le usa come indicative.
 */
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Box, Building2, Download, ImageIcon, PenLine, Sparkles, Trees, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TestataPlanimetrie } from "@/components/planimetrie/render/TestataPlanimetrie";
import { Vista3DPigra } from "@/components/planimetrie/Vista3DPigra";
import { EsportaPiantaDialog } from "@/components/planimetrie/EsportaPiantaDialog";
import { AbachiPianta } from "@/components/planimetrie/AbachiPianta";
import { ProspettiDialog } from "@/components/planimetrie/ProspettiDialog";
import { RenderInSerieDialog } from "@/components/planimetrie/RenderInSerieDialog";
import { RenderEsterniDialog } from "@/components/planimetrie/RenderEsterniDialog";
import { PrimaEDopo } from "@/components/planimetrie/PrimaEDopo";
import { pianiDaPlanimetria, pianteDaPlanimetria } from "@/lib/planimetrie/tred";
import { usePlanimetria } from "@/lib/planimetrie/archivio";
import { percorsiPlanimetrie } from "@/lib/planimetrie/render/percorsi";
import { useRenderDellaPianta } from "@/lib/planimetrie/render/renderDallaPianta";
import { ambitiDi } from "../../../shared/planimetrie/modello.ts";
import { riepilogoStanza, statoPerAmbito, vincoliDellaStanza } from "../../../shared/render-planimetria/vincoli.ts";
import { svgPiantaStanza } from "../../../shared/render-planimetria/piantaStanza.ts";

/** Con una piscina disegnata si propone il render della piscina, con una pergola quello della pergola. */
function moduloEsterno(p: { elementi?: Array<{ tipo: string }> }) {
  const tipi = new Set((p.elementi ?? []).map((e) => e.tipo));
  if (tipi.has("piscina") || tipi.has("idromassaggio")) return "piscine" as const;
  if (tipi.has("pergola")) return "pergole" as const;
  return "giardini" as const;
}

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export default function RenderPlanimetriaScheda() {
  const { id = "" } = useParams();
  const { data, isLoading, error } = usePlanimetria(id);
  const { data: renders = [] } = useRenderDellaPianta(id);
  const documento = data?.versione.documento;
  const [livelloId, setLivelloId] = useState<string | null>(null);
  const [ambito, setAmbito] = useState("fatto");
  const [mostra3D, setMostra3D] = useState(false);
  const [esporta, setEsporta] = useState(false);
  const [prospetti, setProspetti] = useState(false);
  const [esterni, setEsterni] = useState(false);
  // Render in serie: null chiuso, "" tutte le stanze, altrimenti più stili per quella stanza.
  const [serie, setSerie] = useState<string | null>(null);

  const livello = documento?.livelli.find((l) => l.id === livelloId) ?? documento?.livelli[0];
  const ambiti = useMemo(() => (documento ? ambitiDi(documento) : []), [documento]);
  const stanze = useMemo(() => {
    if (!documento || !livello) return [];
    const stato = statoPerAmbito(documento, livello.id, ambito);
    return (stato?.locali ?? [])
      .map((l) => vincoliDellaStanza(documento, { livello_id: livello.id, ambito, locale_id: l.id }))
      .filter((v): v is NonNullable<typeof v> => v !== null);
  }, [documento, livello, ambito]);
  const piante3D = useMemo(() => {
    if (!documento || !livello) return null;
    const propostaId = ambito.startsWith("progetto:") ? ambito.slice("progetto:".length) : undefined;
    return pianteDaPlanimetria(documento, { livelloId: livello.id, propostaId });
  }, [documento, livello, ambito]);

  const renderPerLocale = useMemo(() => {
    const conta = new Map<string, number>();
    for (const r of renders) {
      if (r.status !== "completed" || !r.planimetria?.locale_id) continue;
      conta.set(r.planimetria.locale_id, (conta.get(r.planimetria.locale_id) ?? 0) + 1);
    }
    return conta;
  }, [renders]);
  const completati = renders.filter((r) => r.status === "completed" && r.result_urls?.[0]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (error || !data || !documento || !livello) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <TestataPlanimetrie indietro={percorsiPlanimetrie.elenco} titolo="Pianta" />
        <Card>
          <CardContent className="p-6 text-sm">{error instanceof Error ? error.message : "Pianta non disponibile."}</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12 max-md:space-y-3">
      <TestataPlanimetrie
        indietro={percorsiPlanimetrie.elenco}
        titolo={data.riga.titolo}
        sottotitolo={`Versione ${data.versione.numero}`}
        azioni={
          <>
            <Button variant="outline" size="sm" onClick={() => setMostra3D((v) => !v)} disabled={stanze.length === 0}>
              <Box className="mr-1.5 h-4 w-4" />
              {mostra3D ? "Chiudi il 3D" : "Guarda in 3D"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEsterni(true)} disabled={stanze.length === 0}>
              <Trees className="mr-1.5 h-4 w-4" />
              Render esterni
            </Button>
            <Button variant="outline" size="sm" onClick={() => setProspetti(true)}>
              <Building2 className="mr-1.5 h-4 w-4" />
              Prospetti e sezioni
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEsporta(true)}>
              <Download className="mr-1.5 h-4 w-4" />
              Esporta
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to={percorsiPlanimetrie.modifica(id)}>
                <PenLine className="mr-1.5 h-4 w-4" />
                Modifica la pianta
              </Link>
            </Button>
          </>
        }
      />

      {(ambiti.length > 1 || documento.livelli.length > 1) && (
        <div className="flex flex-wrap items-center gap-3">
          {ambiti.length > 1 && (
            <ToggleGroup type="single" value={ambito} onValueChange={(v) => v && setAmbito(v)} variant="outline" size="sm" aria-label="Quale pianta">
              {ambiti.map((a) => (
                <ToggleGroupItem key={a.chiave} value={a.chiave}>
                  {a.propostaId === null ? "Com'è oggi" : a.nome || "Progetto"}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
          {documento.livelli.length > 1 && (
            <Select value={livello.id} onValueChange={setLivelloId}>
              <SelectTrigger className="h-9 w-48" aria-label="Piano">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {documento.livelli.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      <EsportaPiantaDialog
        aperto={esporta}
        onChiudi={() => setEsporta(false)}
        documento={documento}
        titolo={data.riga.titolo}
        versione={data.versione.numero}
        livelloId={livello.id}
        propostaId={ambito.startsWith("progetto:") ? ambito.slice("progetto:".length) : undefined}
        haProgetto={livello.proposte.length > 0}
        planimetriaId={id}
      />

      <RenderInSerieDialog
        aperto={serie !== null}
        onChiudi={() => setSerie(null)}
        planimetriaId={id}
        versione={data.versione.numero}
        documento={documento}
        livelloId={livello.id}
        ambito={ambito}
        stanze={stanze.map((v) => ({ id: v.locale.id, nome: v.locale.nome, destinazione: v.locale.destinazione }))}
        soloStanza={serie || null}
      />

      {piante3D && (
        <RenderEsterniDialog
          aperto={esterni}
          onChiudi={() => setEsterni(false)}
          pianta={ambito === "fatto" ? piante3D.fatto : piante3D.progetto}
          vista={ambito === "fatto" ? "fatto" : "progetto"}
          titolo={data.riga.titolo}
          moduloIniziale={moduloEsterno(ambito === "fatto" ? piante3D.fatto : piante3D.progetto)}
          piani={documento.livelli.length > 1 ? pianiDaPlanimetria(documento, ambito.startsWith("progetto:") ? ambito.slice("progetto:".length) : undefined) : undefined}
        />
      )}

      <ProspettiDialog aperto={prospetti} onChiudi={() => setProspetti(false)} stato={statoPerAmbito(documento, livello.id, ambito)} titolo={data.riga.titolo} />

      {mostra3D && piante3D && (
        <Vista3DPigra
          key={`${livello.id}:${ambito}`}
          piante={piante3D}
          piani={documento.livelli.length > 1 ? pianiDaPlanimetria(documento, ambito.startsWith("progetto:") ? ambito.slice("progetto:".length) : undefined) : undefined}
          nomeFile={data.riga.titolo}
          vistaIniziale={ambito === "fatto" ? "fatto" : "progetto"}
        />
      )}

      {livello.proposte.length > 0 && (
        <PrimaEDopo
          key={`${livello.id}:${ambito}`}
          documento={documento}
          titolo={data.riga.titolo}
          planimetriaId={id}
          versione={data.versione.numero}
          livelloId={livello.id}
          propostaId={ambito.startsWith("progetto:") ? ambito.slice("progetto:".length) : livello.proposte[0].id}
        />
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground max-md:text-[13px] max-md:normal-case max-md:tracking-normal max-md:text-foreground">
            Stanze
          </h2>
          {stanze.length > 1 && (
            <Button size="sm" className="gap-1.5 bg-purple-600 hover:bg-purple-700" onClick={() => setSerie("")}>
              <Sparkles className="h-4 w-4" />
              Render di tutte le stanze
            </Button>
          )}
        </div>
        {stanze.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Questa pianta non ha ancora stanze. Aprila con «Modifica la pianta» e disegnale: poi qui puoi fare il render di ognuna.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stanze.map((v) => {
              const fatti = renderPerLocale.get(v.locale.id) ?? 0;
              return (
                <Card key={v.locale.id} className="overflow-hidden">
                  <img src={svgUrl(svgPiantaStanza(v, { lato: 480 }))} alt={`Pianta di ${v.locale.nome}`} className="aspect-square w-full border-b bg-white object-contain" />
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold leading-tight">{v.locale.nome}</p>
                      {(v.locale.stimata || v.aperture.some((a) => a.stimata)) && (
                        <Badge variant="outline" className="shrink-0 border-violet-300 text-violet-700" title="Misure dedotte dall'AI: da controllare">
                          Misure stimate
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{riepilogoStanza(v)}</p>
                    <Button asChild className="w-full bg-purple-600 hover:bg-purple-700" size="sm">
                      <Link to={percorsiPlanimetrie.renderStanza(id, v.locale.id, { livelloId: livello.id, ambito })}>
                        <Wand2 className="mr-1.5 h-4 w-4" />
                        Fai il render di questa stanza
                      </Link>
                    </Button>
                    <Button variant="ghost" size="sm" className="w-full text-purple-700" onClick={() => setSerie(v.locale.id)}>
                      <Sparkles className="mr-1.5 h-4 w-4" />
                      Più stili insieme
                    </Button>
                    {fatti > 0 && <p className="text-center text-xs text-muted-foreground">{fatti === 1 ? "1 render fatto" : `${fatti} render fatti`}</p>}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <AbachiPianta documento={documento} livelloId={livello.id} ambito={ambito} titolo={data.riga.titolo} />

      {completati.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground max-md:text-[13px] max-md:normal-case max-md:tracking-normal max-md:text-foreground">
            Render di questa pianta
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {completati.map((r) => (
              <Link key={r.id} to={`/azienda/render/stanza/gallery/${r.id}`} className="group overflow-hidden rounded-lg border">
                <img loading="lazy" src={r.result_urls![0]} alt={`Render di ${r.planimetria?.locale_nome ?? "una stanza"}`} className="aspect-[4/3] w-full object-cover transition-transform group-hover:scale-[1.02]" />
                <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs">
                  <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{r.planimetria?.locale_nome ?? "Stanza"}</span>
                  {r.planimetria?.partenza === "vista_3d" && <span className="ml-auto shrink-0 text-muted-foreground">dal 3D</span>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
