/**
 * «Fai il render di questa stanza» da una pianta (Planimetrie, fase 5b).
 *
 * 1. Da dove parti: una foto della stanza (come il render stanza di sempre) oppure una
 *    vista del 3D, scelta girando la telecamera dentro la stanza.
 * 2. Stile e materiali: lo stesso modulo del render stanza (`StanzaConfigForm`).
 * 3–4. Attesa e risultato, come gli altri render.
 *
 * La sessione è una normale `render_stanza_sessions` (crediti, galleria, rimborsi come
 * il render stanza); in `config.planimetria` porta pianta, versione, stanza, partenza e
 * aperture inquadrate. Misure, porte e finestre la funzione `generate-room-render` le
 * rilegge dalla pianta salvata: dal browser arriva solo la scelta.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Box, Camera, CheckCircle2, Download, ImagePlus, Loader2, RefreshCw, Sofa, Upload, Wand2, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { RenderWizardHeader } from "@/components/render/RenderWizardHeader";
import { RenderCreditGate } from "@/components/render/RenderCreditGate";
import { RenderProcessingCard } from "@/components/render/RenderProcessingCard";
import { BeforeAfterSlider } from "@/components/render/BeforeAfterSlider";
import { StanzaConfigForm, DEFAULT_STANZA_CONFIG } from "@/components/render-stanza/StanzaConfigForm";
import { Vista3DPigra, type Fotogramma } from "@/components/planimetrie/Vista3DPigra";
import { pianteDaPlanimetria } from "@/lib/planimetrie/tred";
import { usePlanimetria } from "@/lib/planimetrie/archivio";
import { percorsiPlanimetrie } from "@/lib/planimetrie/render/percorsi";
import { chiaviRenderPianta, pngDaSvg, tipoStanzaDaDestinazione, type PlanimetriaNelRender } from "@/lib/planimetrie/render/renderDallaPianta";
import { preloadImage } from "@/lib/render/preloadImage";
import { downloadRenderImage } from "@/lib/render/downloadRenderImage";
import { uploadRenderOriginal } from "@/lib/render/renderStorage";
import { getEdgeFunctionAuthHeaders, resolveEdgeFunctionErrorMessage } from "@/modules/render/lib/edgeFunctionClient";
import type { ConfigurazioneStanza } from "@/modules/render-stanza/lib/types";
import { metri, riepilogoStanza, vincoliDellaStanza } from "../../../shared/render-planimetria/vincoli.ts";
import { svgPiantaStanza } from "../../../shared/render-planimetria/piantaStanza.ts";
import type { PartenzaRender } from "../../../shared/render-planimetria/prompt.ts";

type Passo = 1 | 2 | 3 | 4;

const ATTESE = [3000, 5000, 8000, 12000, 15000];
const ATTESA_MASSIMA_S = 420;
const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function dimensioniImmagine(url: string): Promise<{ w: number; h: number } | null> {
  return new Promise((ok) => {
    const img = new window.Image();
    img.onload = () => ok(img.naturalWidth && img.naturalHeight ? { w: img.naturalWidth, h: img.naturalHeight } : null);
    img.onerror = () => ok(null);
    img.src = url;
  });
}

export default function RenderPlanimetriaStanza() {
  const { id = "", localeId: localeParam = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const { data, isLoading, error } = usePlanimetria(id);
  const documento = data?.versione.documento;

  const livelloId = params.get("livello") ?? documento?.livelli[0]?.id ?? "";
  // La stanza e lo stato possono cambiare se nel 3D si sceglie un'altra stanza o
  // «com'è oggi» invece del progetto: il render segue l'inquadratura scelta.
  const [scelta, setScelta] = useState<{ ambito: string; localeId: string }>({ ambito: params.get("ambito") ?? "fatto", localeId: localeParam });
  const vincoli = useMemo(
    () => (documento ? vincoliDellaStanza(documento, { livello_id: livelloId, ambito: scelta.ambito, locale_id: scelta.localeId }) : null),
    [documento, livelloId, scelta],
  );
  const propostaId = scelta.ambito.startsWith("progetto:") ? scelta.ambito.slice("progetto:".length) : undefined;
  const piante3D = useMemo(() => (documento ? pianteDaPlanimetria(documento, { livelloId, propostaId }) : null), [documento, livelloId, propostaId]);

  const [passo, setPasso] = useState<Passo>(1);
  const [partenza, setPartenza] = useState<PartenzaRender>("vista_3d");
  const [foto, setFoto] = useState<File | null>(null);
  const [fotogramma, setFotogramma] = useState<Fotogramma | null>(null);
  const [anteprima, setAnteprima] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [config, setConfig] = useState<ConfigurazioneStanza>(DEFAULT_STANZA_CONFIG);
  const configIniziale = useRef(false);
  useEffect(() => {
    if (!vincoli || configIniziale.current) return;
    configIniziale.current = true;
    setConfig((c) => ({ ...c, tipo_stanza: tipoStanzaDaDestinazione(vincoli.locale.destinazione) }));
  }, [vincoli]);

  const [sessione, setSessione] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [preparo, setPreparo] = useState(false);
  const [trascorsi, setTrascorsi] = useState(0);
  const [puntini, setPuntini] = useState(0);
  const [risultato, setRisultato] = useState<string | null>(null);
  const [salvato, setSalvato] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orologio = useRef<ReturnType<typeof setInterval> | null>(null);

  const fermaAttesa = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (orologio.current) clearInterval(orologio.current);
    timer.current = null;
    orologio.current = null;
  }, []);
  useEffect(() => fermaAttesa, [fermaAttesa]);
  useEffect(() => () => {
    if (anteprima?.startsWith("blob:")) URL.revokeObjectURL(anteprima);
  }, [anteprima]);

  const scegliFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) {
      toast.error("Foto troppo pesante: massimo 20 MB.");
      return;
    }
    setFoto(f);
    setFotogramma(null);
    setAnteprima(URL.createObjectURL(f));
    setSessione(null);
  };

  const usaVista = (f: Fotogramma) => {
    if (!documento) return;
    if (f.metadati.vista === "confronto") {
      toast.info("Per il render scegli «Stato di fatto» o «Progetto»: i colori di demolizioni e nuovo finirebbero nell'immagine.");
      return;
    }
    // Il 3D dice quale stanza e quale stato si stanno guardando.
    // «Progetto» e «demolizioni e nuovo» mostrano la proposta; senza proposte è il fatto.
    const proposta = propostaId ?? documento.livelli.find((l) => l.id === livelloId)?.proposte[0]?.id;
    const ambito = f.metadati.vista === "fatto" || !proposta ? "fatto" : `progetto:${proposta}`;
    if (f.metadati.locale.id !== scelta.localeId || ambito !== scelta.ambito) {
      if (!vincoliDellaStanza(documento, { livello_id: livelloId, ambito, locale_id: f.metadati.locale.id })) {
        toast.error("Questa stanza non si trova nella pianta: scegline un'altra nel 3D.");
        return;
      }
      setScelta({ ambito, localeId: f.metadati.locale.id });
      toast.info(`Il render sarà di «${f.metadati.locale.nome}», la stanza che hai inquadrato.`);
    }
    setFotogramma(f);
    setFoto(null);
    setAnteprima(URL.createObjectURL(f.png));
    setSessione(null);
  };

  const pronto = partenza === "foto" ? !!foto : !!fotogramma;

  const controlla = useCallback((sid: string) => {
    fermaAttesa();
    let giri = 0;
    let secondi = 0;
    orologio.current = setInterval(() => {
      secondi += 1;
      setTrascorsi(secondi);
      setPuntini((d) => (d + 1) % 4);
    }, 1000);
    const giro = async () => {
      if (secondi >= ATTESA_MASSIMA_S) {
        fermaAttesa();
        setInCorso(false);
        setPasso(2);
        toast.error("Il render ci sta mettendo troppo: riprova tra qualche minuto.");
        return;
      }
      const { data: s } = await supabase.from("render_stanza_sessions").select("status, result_urls, error_message").eq("id", sid).single();
      const r = s as { status: string; result_urls: string[] | null; error_message: string | null } | null;
      if (r?.status === "completed" && r.result_urls?.[0]) {
        fermaAttesa();
        await preloadImage(r.result_urls[0]);
        setRisultato(r.result_urls[0]);
        setInCorso(false);
        setPasso(4);
        queryClient.invalidateQueries({ queryKey: chiaviRenderPianta.dellaPianta(id) });
        queryClient.invalidateQueries({ queryKey: ["render-stanza-sessions", companyId] });
        queryClient.invalidateQueries({ queryKey: ["render-credits", companyId] });
        return;
      }
      if (r?.status === "failed") {
        fermaAttesa();
        setInCorso(false);
        setPasso(2);
        toast.error(r.error_message?.includes("insufficient_credits") ? "Crediti render finiti: ricaricali per continuare." : "Il render non è riuscito: il credito è stato restituito. Riprova.");
        return;
      }
      timer.current = setTimeout(giro, ATTESE[Math.min(giri++, ATTESE.length - 1)]);
    };
    void giro();
  }, [companyId, fermaAttesa, id, queryClient]);

  const genera = useCallback(async () => {
    if (!companyId || !user || !data || !vincoli || inCorso) return;
    const sorgente = partenza === "foto" ? foto : fotogramma ? new File([fotogramma.png], "vista-3d.png", { type: "image/png" }) : null;
    if (!sorgente) return;
    setInCorso(true);
    setPreparo(true);
    setRisultato(null);
    setSalvato(false);
    try {
      let sid = sessione;
      const rif: PlanimetriaNelRender = {
        planimetria_id: id,
        versione: data.versione.numero,
        livello_id: livelloId,
        ambito: scelta.ambito,
        locale_id: scelta.localeId,
        locale_nome: vincoli.locale.nome,
        partenza,
        inquadrate: partenza === "vista_3d" && fotogramma
          ? fotogramma.metadati.aperture_visibili.map((a) => ({ id: a.id, posizione: a.posizione, riquadro: a.riquadro }))
          : [],
        pianta_path: null,
      };
      if (!sid) {
        const ora = Date.now();
        const estensione = sorgente.name.split(".").pop() || "jpg";
        const { storagePath } = await uploadRenderOriginal({ bucket: "stanza-originals", path: `${companyId}/${ora}_original.${estensione}`, file: sorgente });
        // La pianta della stanza, coi nomi in inglese che il prompt usa. Se non si carica,
        // il render parte lo stesso con misure e aperture scritte.
        try {
          const png = await pngDaSvg(svgPiantaStanza(vincoli, { lingua: "en" }));
          const percorso = `${companyId}/${ora}_pianta.png`;
          const { error: errPianta } = await supabase.storage.from("stanza-originals").upload(percorso, png, { contentType: "image/png", upsert: true });
          if (!errPianta) rif.pianta_path = percorso;
        } catch { /* si va avanti senza disegno */ }
        const { data: nuova, error: errSessione } = await supabase
          .from("render_stanza_sessions")
          .insert({
            company_id: companyId,
            created_by: user.id,
            status: "pending",
            original_photo_url: storagePath,
            config: { ...config, planimetria: rif } as never,
          })
          .select("id")
          .single();
        if (errSessione || !nuova) throw new Error("Render non avviato: riprova.");
        sid = (nuova as { id: string }).id;
        setSessione(sid);
      } else {
        const { data: vecchia } = await supabase.from("render_stanza_sessions").select("config").eq("id", sid).single();
        rif.pianta_path = ((vecchia as { config?: { planimetria?: PlanimetriaNelRender } } | null)?.config?.planimetria?.pianta_path) ?? null;
        await supabase
          .from("render_stanza_sessions")
          .update({ config: { ...config, planimetria: rif } as never, status: "pending", result_urls: null, error_message: null })
          .eq("id", sid);
      }

      const dim = anteprima ? await dimensioniImmagine(anteprima) : null;
      setPreparo(false);
      setPasso(3);
      setTrascorsi(0);
      controlla(sid);
      const headers = await getEdgeFunctionAuthHeaders();
      const { data: risposta, error: errFn } = await supabase.functions.invoke("generate-room-render", {
        body: { session_id: sid, config: { ...config, planimetria: rif }, ...(dim ? { target_width: dim.w, target_height: dim.h } : {}) },
        headers,
      });
      if (errFn || risposta?.error) {
        const msg = await resolveEdgeFunctionErrorMessage({ error: errFn, data: risposta, fallback: "Render non avviato" });
        if (/idle timeout|timeout limit|150s/i.test(msg)) return; // il render va avanti: si continua a controllare
        fermaAttesa();
        setInCorso(false);
        setPasso(2);
        toast.error(msg.includes("insufficient_credits") ? "Crediti render finiti: ricaricali per continuare." : msg);
      }
    } catch (e) {
      fermaAttesa();
      setInCorso(false);
      setPreparo(false);
      setPasso(2);
      toast.error(e instanceof Error ? e.message : "Render non avviato: riprova.");
    }
  }, [anteprima, companyId, config, controlla, data, fermaAttesa, foto, fotogramma, id, inCorso, livelloId, partenza, scelta, sessione, user, vincoli]);

  const salvaInGalleria = async () => {
    if (!sessione) return;
    const { error: e } = await supabase
      .from("render_stanza_sessions")
      .update({ saved_to_gallery: true, config_summary: { tipo_stanza: config.tipo_stanza, stile_target: config.stile_target, intensita: config.intensita, stanza: vincoli?.locale.nome } })
      .eq("id", sessione);
    if (e) {
      toast.error("Non salvato: riprova.");
      return;
    }
    setSalvato(true);
    toast.success("Salvato in galleria.");
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (error || !data || !documento || !vincoli || !piante3D) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Card>
          <CardContent className="space-y-3 p-6 text-sm">
            <p>{error instanceof Error ? error.message : "Questa stanza non si trova nella pianta: forse è stata cambiata."}</p>
            <Button asChild variant="outline" size="sm">
              <Link to={id ? percorsiPlanimetrie.pianta(id) : percorsiPlanimetrie.elenco}>Torna alla pianta</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const misureStimate = vincoli.locale.stimata || vincoli.aperture.some((a) => a.stimata);

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12 max-md:space-y-3">
      <RenderWizardHeader
        onBack={() => {
          if (passo === 2 && !inCorso) setPasso(1);
          else if (passo !== 3) navigate(percorsiPlanimetrie.pianta(id));
        }}
        eyebrow={data.riga.titolo}
        title={`Render: ${vincoli.locale.nome}`}
        mobileTitle={vincoli.locale.nome}
        description="Il render rispetta le misure della stanza e tiene porte e finestre dove sono nella pianta."
        badgeLabel="Render AI — Planimetrie"
        stepLabels={["Da dove parti", "Stile", "Elaborazione", "Risultato"]}
        currentStep={passo}
        accent="violet"
      />
      <RenderCreditGate />

      {/* La stanza come la vede il render: misure e aperture con i loro nomi. */}
      {passo <= 2 && (
        <Card>
          <CardContent className="flex gap-4 p-4 max-md:flex-col">
            <img src={svgUrl(svgPiantaStanza(vincoli, { lato: 360 }))} alt={`Pianta di ${vincoli.locale.nome}`} className="h-40 w-40 shrink-0 rounded border bg-white object-contain max-md:mx-auto" />
            <div className="min-w-0 space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{vincoli.locale.nome}</p>
                {misureStimate && <Badge variant="outline" className="border-violet-300 text-violet-700">Misure stimate</Badge>}
              </div>
              <p className="text-muted-foreground">{riepilogoStanza(vincoli)}</p>
              {vincoli.aperture.length > 0 && (
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {vincoli.aperture.map((a) => (
                    <li key={a.id}>
                      <span className="font-medium text-foreground">{a.etichetta}</span> sulla parete {a.parete}: {metri(a.larghezza_cm)} × {metri(a.altezza_cm)}
                      {a.davanzale_cm > 0 ? `, da terra ${metri(a.davanzale_cm)}` : ""}
                      {a.stimata ? " (stimata)" : ""}
                    </li>
                  ))}
                </ul>
              )}
              {misureStimate && (
                <p className="text-xs text-violet-700">
                  Alcune misure sono state dedotte dall'AI e nessuno le ha ancora controllate: il render le usa come indicative. Confermale nella pianta per un risultato più fedele.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {passo === 1 && (
        <div className="space-y-4 max-md:space-y-3">
          <ToggleGroup type="single" value={partenza} onValueChange={(v) => v && setPartenza(v as PartenzaRender)} variant="outline" className="justify-start" aria-label="Da dove parti">
            <ToggleGroupItem value="vista_3d">
              <Box className="mr-1.5 h-4 w-4" />
              Dalla vista 3D
            </ToggleGroupItem>
            <ToggleGroupItem value="foto">
              <Camera className="mr-1.5 h-4 w-4" />
              Da una foto
            </ToggleGroupItem>
          </ToggleGroup>

          {partenza === "vista_3d" ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Scegli l'inquadratura</CardTitle>
                <p className="text-sm text-muted-foreground">Sei dentro la stanza: trascina per guardarti intorno, frecce o rotella per camminare. Quando ti piace, premi «Usa questa vista per il render».</p>
              </CardHeader>
              <CardContent>
                <Vista3DPigra
                  piante={piante3D}
                  nomeFile={data.riga.titolo}
                  modoIniziale="dentro"
                  vistaIniziale={scelta.ambito === "fatto" ? "fatto" : "progetto"}
                  localeIniziale={scelta.localeId}
                  onFotogramma={usaVista}
                />
                {fotogramma && anteprima && (
                  <div className="mt-3 flex items-center gap-3 rounded-lg border bg-muted/30 p-2">
                    <img src={anteprima} alt="Vista scelta" className="h-16 w-24 rounded object-cover" />
                    <p className="text-sm">
                      Vista scelta
                      {fotogramma.metadati.aperture_visibili.length > 0
                        ? ` · si vedono ${fotogramma.metadati.aperture_visibili.length === 1 ? "1 apertura" : `${fotogramma.metadati.aperture_visibili.length} aperture`}`
                        : " · nessuna porta o finestra inquadrata"}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-4">
                {anteprima && foto ? (
                  <div className="relative overflow-hidden rounded-lg">
                    <img src={anteprima} alt="Foto della stanza" className="max-h-80 w-full object-cover" />
                    <Button variant="secondary" size="sm" className="absolute right-3 top-3 gap-1.5" onClick={() => fileRef.current?.click()}>
                      <RefreshCw className="h-3.5 w-3.5" />
                      Cambia foto
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed border-muted-foreground/30 p-10 transition-colors hover:border-purple-500/50"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="h-8 w-8 text-purple-500/70" />
                    <span className="font-semibold">Carica una foto di questa stanza</span>
                    <span className="text-sm text-muted-foreground">JPG, PNG o WEBP fino a 20 MB. Meglio frontale e luminosa.</span>
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={scegliFoto} />
              </CardContent>
            </Card>
          )}

          <Button className="w-full gap-2 bg-purple-600 hover:bg-purple-700" size="lg" disabled={!pronto} onClick={() => setPasso(2)}>
            <Wand2 className="h-4 w-4" />
            Avanti: scegli lo stile
          </Button>
        </div>
      )}

      {passo === 2 && (
        <div className="space-y-4 max-md:space-y-3">
          {anteprima && (
            <div className="relative h-40 overflow-hidden rounded-xl">
              <img src={anteprima} alt="Partenza" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <div className="absolute bottom-2 left-3 text-xs font-medium text-white">{partenza === "foto" ? "Foto caricata" : "Vista del 3D"}</div>
            </div>
          )}
          <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
            <CardHeader className="max-md:hidden">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sofa className="h-4 w-4" />
                Stile e materiali
              </CardTitle>
            </CardHeader>
            <CardContent className="max-md:p-0">
              <StanzaConfigForm value={config} onChange={setConfig} companyId={companyId} />
            </CardContent>
          </Card>
          <Button className="w-full gap-2 bg-purple-600 hover:bg-purple-700" size="lg" disabled={inCorso} onClick={genera}>
            {preparo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {preparo ? "Preparo il render…" : "Genera il render"}
          </Button>
        </div>
      )}

      {passo === 3 && (
        <RenderProcessingCard photoPreview={anteprima} elapsedSec={trascorsi} dots={puntini} accent="violet" subjectLabel={`L'AI sta facendo il render di «${vincoli.locale.nome}»`} />
      )}

      {passo === 4 && risultato && (
        <div className="space-y-4 max-md:space-y-3">
          <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4 max-md:hidden">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
            <p className="text-sm font-semibold text-green-800">Render pronto: è già tra i render di questa pianta.</p>
          </div>
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {anteprima ? <BeforeAfterSlider beforeUrl={anteprima} afterUrl={risultato} /> : <img src={risultato} alt="Render" className="w-full" />}
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="gap-2" onClick={() => downloadRenderImage(risultato, `render-${vincoli.locale.nome.replace(/\W+/g, "-").toLowerCase()}.png`).catch(() => toast.error("Download non riuscito: tieni premuto sull'immagine per salvarla."))}>
              <Download className="h-4 w-4" />
              Scarica
            </Button>
            <Button variant={salvato ? "secondary" : "default"} className="gap-2" disabled={salvato} onClick={salvaInGalleria}>
              <CheckCircle2 className="h-4 w-4" />
              {salvato ? "Salvato in galleria" : "Salva in galleria"}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="gap-2" onClick={() => setPasso(2)}>
              <ImagePlus className="h-4 w-4" />
              Un'altra variante
            </Button>
            <Button asChild variant="outline">
              <Link to={percorsiPlanimetrie.pianta(id)}>Torna alla pianta</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
