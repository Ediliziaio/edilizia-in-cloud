import { MaterialiProgetto } from "@/components/planimetrie/MaterialiProgetto";
/**
 * Render AI → Planimetrie → una pianta: le sue stanze, il 3D e i render fatti.
 *
 * Da ogni stanza: «Fai il render di questa stanza». Si sceglie lo stato (com'è oggi o il
 * progetto) e, se ci sono più piani, il piano. Le misure stimate dall'AI si vedono come
 * tali: il render le usa come indicative.
 */
import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Box, Building2, Download, ImageIcon, PenLine, Sparkles, Trees, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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
import { pianiProspetto } from "@/lib/planimetrie/prospetti";
import { RenderInSerieDialog } from "@/components/planimetrie/RenderInSerieDialog";
import { RenderEsterniDialog } from "@/components/planimetrie/RenderEsterniDialog";
import { PrimaEDopo } from "@/components/planimetrie/PrimaEDopo";
import { GalleriaStanza } from "@/components/planimetrie/GalleriaStanza";
import { UnitaEdificio } from "@/components/planimetrie/UnitaEdificio";
import { VerifichePianta } from "@/components/planimetrie/VerifichePianta";
import { pianiDaPlanimetria, pianteDaPlanimetria } from "@/lib/planimetrie/tred";
import { usePlanimetria } from "@/lib/planimetrie/archivio";
import { usePermissions } from "@/hooks/usePermissions";
import { percorsiPlanimetrie } from "@/lib/planimetrie/render/percorsi";
import { useRenderDellaPianta } from "@/lib/planimetrie/render/renderDallaPianta";
import { ambitiDi } from "../../../shared/planimetrie/modello.ts";
import { statoPerAmbito, vincoliDellaStanza } from "../../../shared/render-planimetria/vincoli.ts";
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
  // La galleria di una stanza si apre da sola quando si arriva da «Salva nella galleria» (?galleria=<stanza>).
  const [params, setParams] = useSearchParams();
  const galleriaDi = params.get("galleria");
  const chiudiGalleria = () => setParams((p) => { const n = new URLSearchParams(p); n.delete("galleria"); return n; }, { replace: true });
  const permessi = usePermissions();
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
  // tutte le stanze di tutti i piani (render di tutto l'edificio): com'è oggi o la proposta, se il piano ce l'ha
  const stanzeEdificio = useMemo(() => {
    if (!documento) return [];
    return [...documento.livelli].sort((a, b) => a.quota - b.quota).flatMap((l) => {
      const st = statoPerAmbito(documento, l.id, ambito) ?? l.fatto;
      return st.locali.map((x) => ({ id: x.id, nome: x.nome, destinazione: x.destinazione, livelloId: l.id, piano: l.nome }));
    });
  }, [documento, ambito]);
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
  // tutti i render di ogni stanza, i più recenti per primi (per la galleria della stanza)
  const renderPerStanza = useMemo(() => {
    const m = new Map<string, Array<{ id: string; url: string; salvato: boolean; creato: string }>>();
    for (const r of [...completati].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))) {
      const k = r.planimetria?.locale_id;
      if (!k) continue;
      m.set(k, [...(m.get(k) ?? []), { id: r.id, url: r.result_urls![0], salvato: !!r.saved_to_gallery, creato: r.created_at }]);
    }
    return m;
  }, [completati]);
  // l'ultimo render fatto per ogni stanza: la scheda mostra quello, invece dello schema, appena c'è
  const ultimoPerLocale = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of [...completati].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))) {
      const k = r.planimetria?.locale_id;
      if (k && r.planimetria?.versione === data?.versione.numero && r.planimetria?.ambito === ambito && !m.has(k)) m.set(k, r.result_urls![0]);
    }
    return m;
  }, [completati, data?.versione.numero, ambito]);
  // la sezione delle unità c'è solo con due appartamenti o più (condomini, bifamiliari)
  const piuUnita = useMemo(() => {
    if (!documento) return false;
    const sigle = new Set(documento.livelli.flatMap((l) => l.fatto.locali.map((x) => x.unita?.trim()).filter((u): u is string => !!u && !/comun|condominial|androne/i.test(u))));
    return sigle.size >= 2;
  }, [documento]);

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
    <div className="mx-auto max-w-6xl space-y-6 pb-12 max-md:space-y-3">
      <TestataPlanimetrie
        indietro={percorsiPlanimetrie.elenco}
        titolo={data.riga.titolo}
        sottotitolo={`Versione ${data.versione.numero}`}
      />

      {/* Azioni: una sola in evidenza (modificare), le altre sullo stesso piano e leggibili; sul telefono solo le icone. */}
      <div className="flex flex-wrap items-center gap-2 max-md:flex-nowrap" role="toolbar" aria-label="Azioni sulla pianta">
        <Button asChild size="sm" className="gap-2 max-md:flex-1">
          <Link to={percorsiPlanimetrie.modifica(id)}>
            <PenLine className="h-4 w-4" />
            {permessi.solaLettura ? "Apri la pianta" : "Modifica la pianta"}
          </Link>
        </Button>
        <span className="mx-1 h-6 w-px bg-border max-md:hidden" aria-hidden="true" />
        <Button variant={mostra3D ? "secondary" : "outline"} size="sm" className="gap-2" onClick={() => setMostra3D((v) => !v)} disabled={stanze.length === 0} aria-pressed={mostra3D} aria-label={mostra3D ? "Chiudi il 3D" : "Guarda in 3D"} title={mostra3D ? "Chiudi il 3D" : "Guarda in 3D"}>
          <Box className="h-4 w-4" />
          <span className="max-md:hidden">{mostra3D ? "Chiudi il 3D" : "Guarda in 3D"}</span>
        </Button>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setEsterni(true)} disabled={stanze.length === 0} aria-label="Render esterni" title="Render esterni">
          <Trees className="h-4 w-4" />
          <span className="max-md:hidden">Render esterni</span>
        </Button>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setProspetti(true)} aria-label="Prospetti e sezioni" title="Prospetti e sezioni">
          <Building2 className="h-4 w-4" />
          <span className="max-md:hidden">Prospetti e sezioni</span>
        </Button>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setEsporta(true)} aria-label="Esporta" title="Esporta">
          <Download className="h-4 w-4" />
          <span className="max-md:hidden">Esporta</span>
        </Button>
      </div>

      <MaterialiProgetto key={`${ambito}:${data.versione.numero}`} documento={documento} ambito={ambito} planimetriaId={id} versione={data.versione.numero} solaLettura={permessi.solaLettura} />

      {(ambiti.length > 1 || documento.livelli.length > 1) && (
        <div className="flex flex-wrap items-center gap-3">
          {ambiti.length > 1 && (
            <ToggleGroup type="single" value={ambito} onValueChange={(v) => v && setAmbito(v)} variant="outline" size="sm" aria-label="Quale pianta" className="max-w-full justify-start overflow-x-auto">
              {ambiti.map((a) => (
                <ToggleGroupItem key={a.chiave} value={a.chiave} className="shrink-0 whitespace-nowrap">
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
        stanzeEdificio={documento.livelli.length > 1 ? stanzeEdificio : undefined}
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

      {(() => {
        const st = galleriaDi ? stanzeEdificio.find((x) => x.id === galleriaDi) : undefined;
        return (
          <GalleriaStanza
            aperto={!!galleriaDi && !!st}
            onChiudi={chiudiGalleria}
            nomeStanza={st?.nome ?? "Stanza"}
            render={galleriaDi ? renderPerStanza.get(galleriaDi) ?? [] : []}
            nuovoRender={galleriaDi ? percorsiPlanimetrie.renderStanza(id, galleriaDi, { livelloId: livello.id, ambito }) : "#"}
          />
        );
      })()}

      <ProspettiDialog aperto={prospetti} onChiudi={() => setProspetti(false)} stato={statoPerAmbito(documento, livello.id, ambito)} tetto={livello.tetto} titolo={data.riga.titolo} piani={pianiProspetto(documento, ambito)} />

      {mostra3D && piante3D && (
        <Vista3DPigra
          key={`${livello.id}:${ambito}`}
          piante={piante3D}
          piani={documento.livelli.length > 1 ? pianiDaPlanimetria(documento, ambito.startsWith("progetto:") ? ambito.slice("progetto:".length) : undefined) : undefined}
          nomeFile={data.riga.titolo}
          vistaIniziale={ambito === "fatto" ? "fatto" : "progetto"}
        />
      )}

      {/* Scorciatoie: la scheda è lunga, si salta a quello che serve */}
      {stanze.length > 0 && (
        <nav aria-label="Sezioni della scheda" className="-mx-1 overflow-x-auto px-1 max-md:hidden">
          <div className="inline-flex gap-1 rounded-lg bg-muted p-1 text-sm">
            {([
              livello.proposte.length > 0 && ["prima-e-dopo", "Prima e dopo"],
              ["stanze", "Stanze e render"],
              ["verifiche", "Verifiche"],
              piuUnita && ["unita", "Unità e vendite"],
              ["abachi", "Abachi"],
              completati.length > 0 && ["render-fatti", "Render fatti"],
            ].filter(Boolean) as Array<[string, string]>).map(([ancora, nome]) => (
              <a key={ancora} href={`#${ancora}`}
                onClick={(e) => { e.preventDefault(); document.getElementById(ancora)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                className="shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground hover:shadow-sm">
                {nome}
              </a>
            ))}
          </div>
        </nav>
      )}

      {livello.proposte.length > 0 && (
        <div id="prima-e-dopo" className="scroll-mt-4">
        <PrimaEDopo
          key={`${livello.id}:${ambito}`}
          documento={documento}
          titolo={data.riga.titolo}
          planimetriaId={id}
          versione={data.versione.numero}
          livelloId={livello.id}
          propostaId={ambito.startsWith("progetto:") ? ambito.slice("progetto:".length) : livello.proposte[0].id}
          contactId={data.riga.contact_id}
          sola={permessi.solaLettura}
          prezzi={permessi.canViewPreventivi}
          creaPreventivo={permessi.canEditPreventivi && !permessi.solaLettura}
        />
        </div>
      )}

      <section id="stanze" className="scroll-mt-4 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground max-md:text-[13px] max-md:normal-case max-md:tracking-normal max-md:text-foreground">
              Render delle stanze
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground max-md:hidden">
              L'AI parte dalla stanza com'è nella pianta (vista 3D o una tua foto), ne rispetta misure, porte e finestre, e la veste con lo stile che scegli.
              In circa 1–2 minuti hai il risultato.
            </p>
          </div>
          {stanze.length > 1 && (
            <Button size="sm" className="gap-1.5 max-md:w-full" onClick={() => setSerie("")}>
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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 max-md:gap-2.5">
            {stanze.map((v) => {
              const fatti = renderPerLocale.get(v.locale.id) ?? 0;
              const ultimo = ultimoPerLocale.get(v.locale.id);
              const porte = v.aperture.filter((a) => a.tipo === "porta").length;
              const finestre = v.aperture.filter((a) => a.tipo === "finestra" || a.tipo === "portafinestra").length;
              const stimata = v.locale.stimata || v.aperture.some((a) => a.stimata);
              const chip = [
                `${v.locale.superficie_mq.toFixed(1).replace(".", ",")} m²`,
                `h ${(v.locale.altezza_cm / 100).toFixed(2).replace(".", ",")} m`,
                porte ? `${porte} ${porte === 1 ? "porta" : "porte"}` : null,
                finestre ? `${finestre} ${finestre === 1 ? "finestra" : "finestre"}` : null,
              ].filter(Boolean) as string[];
              return (
                <Card key={v.locale.id} className="overflow-hidden transition-shadow hover:shadow-md max-sm:grid max-sm:grid-cols-[116px_1fr]">
                  <div className="relative border-b bg-white max-sm:border-b-0 max-sm:border-r">
                    {fatti > 0 && <button type="button" className="absolute inset-0 z-10" onClick={() => setParams((p) => { const n = new URLSearchParams(p); n.set("galleria", v.locale.id); return n; })} aria-label={`Apri la galleria di ${v.locale.nome}`} />}
                    <img
                      loading="lazy"
                      src={ultimo ?? svgUrl(svgPiantaStanza(v, { lato: 480 }))}
                      alt={ultimo ? `Ultimo render di ${v.locale.nome}` : `Pianta di ${v.locale.nome}`}
                      className={cn("w-full bg-white", ultimo ? "aspect-[4/3] object-cover max-sm:aspect-square" : "aspect-[4/3] object-contain p-2 max-sm:aspect-square")}
                    />
                    <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-medium text-muted-foreground shadow-sm max-sm:hidden">
                      {ultimo ? "Ultimo render" : "Pianta della stanza"}
                    </span>
                  </div>
                  <CardContent className="flex min-w-0 flex-col gap-2.5 p-4 max-sm:p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold leading-tight">{v.locale.nome}</p>
                      {stimata && (
                        <Badge variant="outline" className="shrink-0 border-primary/40 text-primary" title="Misure dedotte dall'AI: da controllare">
                          Stimate
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {chip.map((c) => (
                        <span key={c} className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{c}</span>
                      ))}
                    </div>
                    <div className="mt-auto flex items-center gap-2 pt-1">
                      <Button asChild size="sm" className="flex-1 gap-1.5">
                        <Link to={percorsiPlanimetrie.renderStanza(id, v.locale.id, { livelloId: livello.id, ambito })}>
                          <Wand2 className="h-4 w-4" />
                          {fatti > 0 ? "Nuovo render" : "Fai il render"}
                        </Link>
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSerie(v.locale.id)} aria-label="Più stili insieme" title="Più stili insieme">
                        <Sparkles className="h-4 w-4" />
                        <span className="max-xl:hidden">Più stili</span>
                      </Button>
                    </div>
                    {fatti > 0 && (
                      <button type="button" className="w-fit text-left text-xs font-medium text-primary hover:underline" onClick={() => setParams((p) => { const n = new URLSearchParams(p); n.set("galleria", v.locale.id); return n; })}>
                        Galleria · {fatti === 1 ? "1 render" : `${fatti} render`}
                      </button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <div id="verifiche" className="scroll-mt-4">
        <VerifichePianta documento={documento} titolo={data.riga.titolo} ambito={ambito} nomeStato={ambito === "fatto" ? "Com'è oggi" : ambiti.find((x) => x.chiave === ambito)?.nome ?? "Progetto"} />
      </div>

      <div id="unita" className="scroll-mt-4">
        <UnitaEdificio documento={documento} titolo={data.riga.titolo} planimetriaId={id} versione={data.versione.numero} sola={permessi.solaLettura} prezzi={permessi.canViewPreventivi} modificaPrezzi={permessi.canEditPreventivi} />
      </div>

      <div id="abachi" className="scroll-mt-4">
        <AbachiPianta documento={documento} livelloId={livello.id} ambito={ambito} titolo={data.riga.titolo} />
      </div>

      {completati.length > 0 && (
        <section id="render-fatti" className="scroll-mt-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground max-md:text-[13px] max-md:normal-case max-md:tracking-normal max-md:text-foreground">
            Render di questa pianta
          </h2>
          <p className="text-xs text-muted-foreground">Le immagini delle versioni precedenti conservano i materiali scelti allora. Genera nuovi render per applicare le ultime scelte del progetto.</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {completati.map((r) => (
              <Link key={r.id} to={`/azienda/render/stanza/gallery/${r.id}`} className="group overflow-hidden rounded-lg border">
                <img loading="lazy" src={r.result_urls![0]} alt={`Render di ${r.planimetria?.locale_nome ?? "una stanza"}`} className="aspect-[4/3] w-full object-cover transition-transform group-hover:scale-[1.02]" />
                <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs">
                  <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1"><span className="block truncate">{r.planimetria?.locale_nome ?? "Stanza"}</span>{r.planimetria?.versione !== data.versione.numero ? <span className="text-[10px] text-amber-700">Versione precedente</span> : r.planimetria?.ambito !== ambito ? <span className="text-[10px] text-muted-foreground">Altro stato della pianta</span> : null}</span>
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
