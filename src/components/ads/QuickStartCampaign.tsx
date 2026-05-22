/**
 * QuickStartCampaign — Form guidato per campagna in 60 secondi.
 *
 * Cambio di paradigma: invece di una sola textarea libera ("voglio lead per
 * bagni Milano 30€/giorno"), guidiamo l'utente con campi strutturati che
 * coprono i parametri chiave per Meta Ads edilizia:
 *
 *   1. Cosa vendi (settore + dettaglio servizio)
 *   2. Zona geografica (Lombardia · Milano · Monza · …)
 *   3. Fascia età target (slider 18-65)
 *   4. Genere target (uomini/donne/tutti)
 *   5. La tua offerta (sconti, detrazioni, garanzie)
 *   6. Budget giornaliero (€/giorno)
 *   7. Tono comunicativo (diretto / premium / familiare)
 *
 * Sempre disponibile: toggle "scrivi libero" per chi preferisce un brief
 * unico in italiano (l'AI lo interpreta).
 *
 * Il form costruisce un brief consolidato che viene passato a
 * ai-ads-brief-parser, identico a prima ma con dati più precisi → AI
 * produce campagna migliore al primo colpo.
 */

import { useMemo, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Euro,
  Eye,
  Facebook,
  Instagram,
  Loader2,
  MapPin,
  Megaphone,
  Send,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Volume2,
  Zap,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ParsedBrief {
  name: string;
  objective: string;
  offer: string;
  dailyBudget: number;
  ageMin: number;
  ageMax: number;
  gender: "all" | "men" | "women";
  suggestedCities: string[];
  suggestedInterests: string[];
  copy: string;
  hooks: string[];
  cta: string;
  reasoning: string;
}

interface Props {
  companyId: string | undefined;
  companyName: string | undefined;
  companyCity?: string | null;
  onConfirm: (parsed: ParsedBrief) => void;
  onCustomize: (parsed: ParsedBrief) => void;
  onCancel: () => void;
}

// ════════════════════════════════════════════════════════════════════
// OPTIONS
// ════════════════════════════════════════════════════════════════════

const SECTORS = [
  { v: "serramenti", label: "Serramenti / Infissi", emoji: "🪟", default_offer: "Sopralluogo gratuito + preventivo entro 48h, bonus 65% calcolato" },
  { v: "bagni", label: "Ristrutturazione bagni", emoji: "🛁", default_offer: "Chiavi in mano in 12 giorni, sopralluogo + render 3D gratuiti, bonus 50%" },
  { v: "ristrutturazioni", label: "Ristrutturazioni casa", emoji: "🏠", default_offer: "Sopralluogo gratuito con architetto, preventivo trasparente, bonus 50%" },
  { v: "fotovoltaico", label: "Fotovoltaico", emoji: "☀️", default_offer: "Calcolo risparmio personalizzato gratuito, detrazione 50%, monitoraggio bolletta" },
  { v: "tetti", label: "Tetti e facciate", emoji: "🏗️", default_offer: "Sopralluogo in 48h con foto drone, preventivo trasparente, garanzia lavoro" },
  { v: "impianti", label: "Impianti elettrici/idraulici", emoji: "⚡", default_offer: "Pronto intervento, preventivo gratuito, materiali certificati" },
  { v: "manutenzione", label: "Manutenzioni", emoji: "🔧", default_offer: "Sopralluogo gratuito, intervento entro 7 giorni, garanzia 24 mesi" },
  { v: "altro", label: "Altro settore edilizia", emoji: "🏛️", default_offer: "Sopralluogo gratuito e preventivo chiaro" },
];

const ZONES = [
  // Regioni
  { v: "Lombardia", label: "Lombardia", type: "regione" as const },
  { v: "Lazio", label: "Lazio", type: "regione" as const },
  { v: "Veneto", label: "Veneto", type: "regione" as const },
  { v: "Emilia-Romagna", label: "Emilia-Romagna", type: "regione" as const },
  { v: "Piemonte", label: "Piemonte", type: "regione" as const },
  { v: "Toscana", label: "Toscana", type: "regione" as const },
  { v: "Campania", label: "Campania", type: "regione" as const },
  { v: "Sicilia", label: "Sicilia", type: "regione" as const },
  { v: "Puglia", label: "Puglia", type: "regione" as const },
  { v: "Liguria", label: "Liguria", type: "regione" as const },
  // Città principali
  { v: "Milano", label: "Milano", type: "città" as const },
  { v: "Roma", label: "Roma", type: "città" as const },
  { v: "Torino", label: "Torino", type: "città" as const },
  { v: "Napoli", label: "Napoli", type: "città" as const },
  { v: "Bologna", label: "Bologna", type: "città" as const },
  { v: "Firenze", label: "Firenze", type: "città" as const },
  { v: "Genova", label: "Genova", type: "città" as const },
  { v: "Verona", label: "Verona", type: "città" as const },
  { v: "Padova", label: "Padova", type: "città" as const },
  { v: "Brescia", label: "Brescia", type: "città" as const },
  { v: "Monza", label: "Monza e Brianza", type: "città" as const },
  { v: "Bergamo", label: "Bergamo", type: "città" as const },
  { v: "Como", label: "Como", type: "città" as const },
];

const TONES = [
  { v: "diretto", label: "Diretto / No-nonsense", desc: "Stile Dan Kennedy: punto, vendita rapida." },
  { v: "premium", label: "Premium / Aspirational", desc: "Stile Ogilvy: qualità, credibilità, lusso." },
  { v: "familiare", label: "Familiare / Vicino", desc: "Tono caldo, vicino alle persone." },
  { v: "tecnico", label: "Tecnico / Esperto", desc: "Per chi cerca expertise, dati, certificazioni." },
];

const CONVERSION_GOALS = [
  { v: "OUTCOME_LEADS", label: "🎯 Generare contatti (preventivi)", desc: "Form Meta con dati cliente" },
  { v: "OUTCOME_TRAFFIC", label: "🌐 Portare al sito web", desc: "Click verso landing page" },
  { v: "OUTCOME_AWARENESS", label: "📢 Farti conoscere", desc: "Brand awareness per nuovi clienti" },
  { v: "OUTCOME_ENGAGEMENT", label: "💬 Ricevere messaggi", desc: "DM Messenger/WhatsApp" },
];

// ════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════

export function QuickStartCampaign({
  companyId,
  companyName,
  companyCity,
  onConfirm,
  onCustomize,
  onCancel,
}: Props) {
  // Form fields strutturati
  const [sector, setSector] = useState<string>("serramenti");
  const [serviceDetail, setServiceDetail] = useState<string>("");
  const [selectedZones, setSelectedZones] = useState<string[]>(
    companyCity ? [companyCity] : [],
  );
  const [zoneInput, setZoneInput] = useState("");
  const [ageRange, setAgeRange] = useState<[number, number]>([35, 65]);
  const [gender, setGender] = useState<"all" | "men" | "women">("all");
  const [offer, setOffer] = useState<string>("");
  const [budget, setBudget] = useState<number>(25);
  const [tone, setTone] = useState<string>("diretto");
  const [goal, setGoal] = useState<string>("OUTCOME_LEADS");

  // Modalità libera alternativa
  const [freeText, setFreeText] = useState("");
  const [mode, setMode] = useState<"guided" | "free">("guided");

  // Stato AI
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedBrief | null>(null);
  const [previewPlatform, setPreviewPlatform] = useState<"facebook" | "instagram">("facebook");

  // Quando cambi settore pre-popola l'offerta default
  const sectorObj = useMemo(() => SECTORS.find((s) => s.v === sector), [sector]);
  const offerPlaceholder = sectorObj?.default_offer ?? "Es. sopralluogo gratuito + sconto + detrazione fiscale";

  // Costruisci il brief consolidato da inviare all'AI
  const consolidatedBrief = useMemo(() => {
    if (mode === "free") return freeText.trim();
    const parts: string[] = [];
    parts.push(`Voglio una campagna pubblicitaria Meta Ads per ${sectorObj?.label ?? sector}.`);
    if (serviceDetail.trim()) parts.push(`Dettaglio servizio: ${serviceDetail.trim()}.`);
    if (selectedZones.length > 0) {
      parts.push(`Zone operative: ${selectedZones.join(", ")}.`);
    }
    parts.push(`Target età: ${ageRange[0]}-${ageRange[1]} anni.`);
    if (gender !== "all") parts.push(`Solo ${gender === "men" ? "uomini" : "donne"}.`);
    if (offer.trim()) {
      parts.push(`Offerta concreta: ${offer.trim()}.`);
    }
    parts.push(`Budget giornaliero: ${budget}€/giorno.`);
    const toneObj = TONES.find((t) => t.v === tone);
    if (toneObj) parts.push(`Tono comunicativo: ${toneObj.label.toLowerCase()}.`);
    const goalObj = CONVERSION_GOALS.find((g) => g.v === goal);
    if (goalObj) parts.push(`Obiettivo: ${goalObj.label}.`);
    return parts.join(" ");
  }, [mode, freeText, sectorObj, sector, serviceDetail, selectedZones, ageRange, gender, offer, budget, tone, goal]);

  const briefValid = mode === "free"
    ? freeText.trim().length >= 20
    : selectedZones.length > 0 && offer.trim().length >= 10;

  const handleParse = async () => {
    if (!companyId) { toast.error("Azienda non selezionata"); return; }
    if (!briefValid) {
      toast.error("Brief incompleto", {
        description: mode === "guided"
          ? "Aggiungi almeno una zona e un'offerta concreta."
          : "Scrivi almeno 20 caratteri descrittivi.",
      });
      return;
    }
    setParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-ads-brief-parser", {
        body: { company_id: companyId, brief: consolidatedBrief },
      });
      if (error) throw new Error(error.message);
      const result = (data as { result?: ParsedBrief } | null)?.result;
      if (!result) throw new Error("AI parsing fallito");
      // Forzature dai campi guidati (l'AI può deviare, ma noi sappiamo già quello che vuole l'utente)
      if (mode === "guided") {
        result.ageMin = ageRange[0];
        result.ageMax = ageRange[1];
        result.gender = gender;
        result.dailyBudget = budget;
        result.objective = goal;
        if (selectedZones.length > 0) {
          result.suggestedCities = Array.from(new Set([...selectedZones, ...(result.suggestedCities ?? [])])).slice(0, 5);
        }
      }
      setParsed(result);
      toast.success("Campagna pronta!", {
        description: result.reasoning?.slice(0, 100),
      });
    } catch (e) {
      toast.error("Errore AI", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setParsing(false);
    }
  };

  // ═══ UI ═══
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      {/* HEADER */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-950">
            <Zap className="h-6 w-6 text-yellow-500" />
            Quick Start — campagna pronta in 60 secondi
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Compila i campi guidati, l'AI prepara pubblico, copy e budget in 3 secondi.
          </p>
        </div>
        <Button variant="ghost" onClick={onCancel}>Annulla</Button>
      </div>

      {/* TABS modalità */}
      <Tabs value={mode} onValueChange={(v) => setMode(v as "guided" | "free")}>
        <TabsList className="grid w-full grid-cols-2 lg:w-auto">
          <TabsTrigger value="guided">
            ✅ Form guidato (consigliato)
          </TabsTrigger>
          <TabsTrigger value="free">
            ✍️ Scrivi tutto libero
          </TabsTrigger>
        </TabsList>

        <TabsContent value="guided" className="mt-4 space-y-4">
          {/* === FORM GUIDATO === */}

          {/* 1. SETTORE */}
          <FieldCard
            icon={<Target className="h-4 w-4 text-blue-600" />}
            title="Cosa vendi?"
            description="Settore principale + dettaglio del servizio specifico."
          >
            <div className="grid gap-2 sm:grid-cols-4">
              {SECTORS.map((s) => (
                <button
                  key={s.v}
                  type="button"
                  onClick={() => {
                    setSector(s.v);
                    if (!offer.trim() || offer === sectorObj?.default_offer) {
                      setOffer(s.default_offer);
                    }
                  }}
                  className={cn(
                    "rounded-lg border p-2 text-left text-xs transition",
                    sector === s.v
                      ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                      : "border-slate-200 bg-white hover:border-slate-300",
                  )}
                >
                  <p className="font-semibold text-slate-950">
                    {s.emoji} {s.label}
                  </p>
                </button>
              ))}
            </div>
            <Input
              value={serviceDetail}
              onChange={(e) => setServiceDetail(e.target.value.slice(0, 200))}
              placeholder="Dettaglio (opzionale): es. solo PVC, materiali in legno, bagni di lusso, impianti residenziali..."
              className="mt-2"
            />
          </FieldCard>

          {/* 2. ZONA */}
          <FieldCard
            icon={<MapPin className="h-4 w-4 text-emerald-600" />}
            title="Dove vuoi vendere?"
            description="Aggiungi regioni, città o zone in cui sei operativo. Multi-selezione."
          >
            <div className="flex flex-wrap gap-1.5">
              {selectedZones.map((z) => (
                <Badge
                  key={z}
                  variant="secondary"
                  className="cursor-pointer bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
                  onClick={() => setSelectedZones((cur) => cur.filter((x) => x !== z))}
                >
                  📍 {z} ✕
                </Badge>
              ))}
              {selectedZones.length === 0 && (
                <p className="text-xs italic text-slate-400">Nessuna zona selezionata</p>
              )}
            </div>
            <div className="mt-3">
              <Label className="mb-1 block text-[11px]">Aggiungi velocemente:</Label>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
                {ZONES.map((z) => {
                  const active = selectedZones.includes(z.v);
                  return (
                    <button
                      key={z.v}
                      type="button"
                      onClick={() =>
                        setSelectedZones((cur) =>
                          active ? cur.filter((x) => x !== z.v) : [...cur, z.v].slice(0, 8),
                        )
                      }
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs",
                        active
                          ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-400",
                      )}
                    >
                      {z.label}
                      <span className="ml-1 text-[9px] text-slate-400">{z.type}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                value={zoneInput}
                onChange={(e) => setZoneInput(e.target.value)}
                placeholder="Altra zona (es. Como, Lecco, Varese)..."
                onKeyDown={(e) => {
                  if (e.key === "Enter" && zoneInput.trim()) {
                    e.preventDefault();
                    setSelectedZones((cur) => [...cur, zoneInput.trim()].slice(0, 8));
                    setZoneInput("");
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (zoneInput.trim()) {
                    setSelectedZones((cur) => [...cur, zoneInput.trim()].slice(0, 8));
                    setZoneInput("");
                  }
                }}
              >
                Aggiungi
              </Button>
            </div>
          </FieldCard>

          {/* 3. ETÀ + GENERE */}
          <div className="grid gap-4 md:grid-cols-2">
            <FieldCard
              icon={<Users className="h-4 w-4 text-violet-600" />}
              title="Fascia di età"
              description={`Da ${ageRange[0]} a ${ageRange[1]} anni`}
            >
              <Slider
                value={ageRange}
                min={18}
                max={65}
                step={1}
                onValueChange={(v) => setAgeRange([v[0], v[1]] as [number, number])}
                className="mt-2"
              />
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                <span>{ageRange[0]} anni</span>
                <span className="font-semibold text-slate-700">{ageRange[1] - ageRange[0]} anni di range</span>
                <span>{ageRange[1]} anni</span>
              </div>
              <p className="mt-2 text-[10px] text-slate-500">
                💡 Per edilizia consigliato 35-65. Per fotovoltaico 30-65. Per arredo 25-50.
              </p>
            </FieldCard>

            <FieldCard
              icon={<Users className="h-4 w-4 text-fuchsia-600" />}
              title="Genere target"
              description="Di solito 'tutti'. Restringi solo se sei sicuro."
            >
              <div className="grid grid-cols-3 gap-2">
                {([
                  { v: "all" as const, label: "Tutti", emoji: "👥" },
                  { v: "men" as const, label: "Uomini", emoji: "👨" },
                  { v: "women" as const, label: "Donne", emoji: "👩" },
                ]).map((g) => (
                  <button
                    key={g.v}
                    type="button"
                    onClick={() => setGender(g.v)}
                    className={cn(
                      "rounded-lg border p-2 text-center text-xs",
                      gender === g.v
                        ? "border-fuchsia-500 bg-fuchsia-50"
                        : "border-slate-200 bg-white hover:border-slate-300",
                    )}
                  >
                    {g.emoji} <strong>{g.label}</strong>
                  </button>
                ))}
              </div>
            </FieldCard>
          </div>

          {/* 4. OFFERTA */}
          <FieldCard
            icon={<Sparkles className="h-4 w-4 text-amber-600" />}
            title="La tua offerta"
            description="Sconti, detrazioni, garanzie, materiali, tempi. Ingredienti reali per l'AI."
          >
            <Textarea
              value={offer}
              onChange={(e) => setOffer(e.target.value.slice(0, 600))}
              placeholder={offerPlaceholder}
              className="min-h-20"
              maxLength={600}
            />
            <p className="mt-1 text-[10px] text-slate-500">
              {offer.length}/600 — più sei specifico, più l'AI scrive una campagna forte.
            </p>
          </FieldCard>

          {/* 5. BUDGET + GOAL + TONO */}
          <div className="grid gap-4 lg:grid-cols-3">
            <FieldCard
              icon={<Euro className="h-4 w-4 text-emerald-600" />}
              title="Budget giornaliero"
              description={`${budget * 30} €/mese stimato`}
            >
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={10}
                  max={300}
                  value={budget}
                  onChange={(e) => setBudget(Math.max(10, Math.min(300, Number(e.target.value) || 25)))}
                  className="text-lg font-bold"
                />
                <span className="text-sm text-slate-500">€/g</span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1">
                {[15, 25, 50].map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBudget(b)}
                    className={cn(
                      "rounded border px-1 py-0.5 text-[10px]",
                      budget === b ? "border-emerald-500 bg-emerald-50" : "border-slate-200",
                    )}
                  >
                    {b}€/g
                  </button>
                ))}
              </div>
            </FieldCard>

            <FieldCard
              icon={<TrendingUp className="h-4 w-4 text-blue-600" />}
              title="Obiettivo"
              description="Cosa vuoi ottenere?"
            >
              <Select value={goal} onValueChange={setGoal}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONVERSION_GOALS.map((g) => (
                    <SelectItem key={g.v} value={g.v}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[10px] text-slate-500">
                {CONVERSION_GOALS.find((g) => g.v === goal)?.desc}
              </p>
            </FieldCard>

            <FieldCard
              icon={<Volume2 className="h-4 w-4 text-rose-600" />}
              title="Tono comunicativo"
              description="Come parli al cliente?"
            >
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TONES.map((t) => (
                    <SelectItem key={t.v} value={t.v}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[10px] text-slate-500">
                {TONES.find((t) => t.v === tone)?.desc}
              </p>
            </FieldCard>
          </div>

          {/* PREVIEW BRIEF */}
          <div className="rounded-xl border-2 border-dashed border-violet-200 bg-violet-50/30 p-3">
            <p className="mb-1 text-[10px] font-semibold uppercase text-violet-700">
              📝 Brief che l'AI riceverà
            </p>
            <p className="text-xs leading-relaxed text-slate-700">{consolidatedBrief}</p>
          </div>
        </TabsContent>

        <TabsContent value="free" className="mt-4">
          <div className="rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/40 p-5">
            <Label className="mb-2 block text-sm font-semibold">
              📝 Scrivi tutto in italiano libero
            </Label>
            <Textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="Es. Voglio una campagna in Lombardia, età fino a 65, per la vendita di serramenti con offerta sconto 30% + bonus 65% + made in Italy"
              className="min-h-32 bg-white text-base"
              maxLength={1500}
            />
            <p className="mt-1 text-[10px] text-slate-500">{freeText.length}/1500</p>
          </div>
        </TabsContent>
      </Tabs>

      {/* CTA */}
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-blue-200 bg-white p-4 shadow-lg">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <p>
            📍 <strong>{companyName ?? "Azienda"}</strong>
            {companyCity && <> · {companyCity}</>}
          </p>
          {!briefValid && (
            <Badge variant="outline" className="border-amber-300 text-[10px] text-amber-700">
              {mode === "guided" ? "Aggiungi zona + offerta" : "Almeno 20 char"}
            </Badge>
          )}
        </div>
        <Button
          size="lg"
          onClick={handleParse}
          disabled={parsing || !briefValid || !companyId}
          className="bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-md hover:from-blue-700 hover:to-violet-700"
        >
          {parsing ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> AI sta preparando…</>
          ) : (
            <><Sparkles className="mr-2 h-4 w-4" /> Genera campagna con AI</>
          )}
        </Button>
      </div>

      {/* RISULTATO */}
      {parsed && (
        <>
          <Alert className="border-emerald-300 bg-emerald-50">
            <Bot className="h-4 w-4 text-emerald-700" />
            <AlertDescription className="text-sm">
              <strong>Logica AI:</strong> {parsed.reasoning}
            </AlertDescription>
          </Alert>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-3 lg:col-span-2">
              <ResultCard icon={<Megaphone className="h-4 w-4 text-blue-600" />} title="Nome campagna" value={parsed.name} />
              <ResultCard
                icon={<MapPin className="h-4 w-4 text-emerald-600" />}
                title="Dove mostrare"
                value={`${parsed.suggestedCities.length} città`}
                detail={parsed.suggestedCities.join(" · ")}
              />
              <ResultCard
                icon={<Users className="h-4 w-4 text-violet-600" />}
                title="Pubblico"
                value={`${parsed.ageMin}-${parsed.ageMax} anni · ${parsed.gender === "all" ? "tutti" : parsed.gender === "men" ? "uomini" : "donne"}`}
                detail={`Interessi: ${parsed.suggestedInterests.slice(0, 4).join(", ")}`}
              />
              <ResultCard
                icon={<Euro className="h-4 w-4 text-rose-600" />}
                title="Budget"
                value={`${parsed.dailyBudget} €/giorno`}
                detail={`${parsed.dailyBudget * 30} €/mese`}
              />
              <div className="rounded-xl border bg-white p-3">
                <p className="mb-1 text-[10px] font-semibold uppercase text-slate-500">Copy principale</p>
                <p className="text-sm leading-relaxed text-slate-800">{parsed.copy}</p>
                {parsed.hooks?.length > 0 && (
                  <div className="mt-2 border-t pt-2">
                    <p className="text-[9px] font-semibold uppercase text-fuchsia-700">Hook alternativi</p>
                    <ul className="text-xs text-slate-600">
                      {parsed.hooks.map((h, i) => <li key={i}>• {h}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border bg-white p-3">
                <div className="mb-2 flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5 text-slate-500" />
                  <p className="text-xs font-semibold text-slate-700">Anteprima ad</p>
                  <div className="ml-auto flex gap-1">
                    <button onClick={() => setPreviewPlatform("facebook")} className={cn("rounded px-2 py-1", previewPlatform === "facebook" ? "bg-blue-100 text-blue-700" : "text-slate-500")}>
                      <Facebook className="h-3 w-3" />
                    </button>
                    <button onClick={() => setPreviewPlatform("instagram")} className={cn("rounded px-2 py-1", previewPlatform === "instagram" ? "bg-fuchsia-100 text-fuchsia-700" : "text-slate-500")}>
                      <Instagram className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                {previewPlatform === "facebook" ? (
                  <FacebookPreview companyName={companyName} copy={parsed.copy} hook={parsed.hooks?.[0]} cta="Preventivo" />
                ) : (
                  <InstagramPreview companyName={companyName} copy={parsed.copy} hook={parsed.hooks?.[0]} cta="Preventivo" />
                )}
              </div>
            </div>
          </div>

          <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-emerald-200 bg-white p-4 shadow-lg">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-slate-950">Pronta da rivedere</p>
                <p className="text-[11px] text-slate-500">Salvi una bozza PAUSED. Niente parte automaticamente.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onCustomize(parsed)}>
                Personalizza prima
              </Button>
              <Button onClick={() => onConfirm(parsed)} className="bg-emerald-600 text-white hover:bg-emerald-700">
                <Send className="mr-2 h-4 w-4" /> Salva bozza
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ════════════════════════════════════════════════════════════════════

function FieldCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <header className="mb-2 flex items-start gap-2">
        <div className="mt-0.5">{icon}</div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
          {description && <p className="text-[11px] text-slate-500">{description}</p>}
        </div>
      </header>
      {children}
    </div>
  );
}

function ResultCard({
  icon,
  title,
  value,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-50">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase text-slate-500">{title}</p>
          <p className="text-sm font-semibold text-slate-950">{value}</p>
          {detail && <p className="mt-0.5 text-xs text-slate-500">{detail}</p>}
        </div>
      </div>
    </div>
  );
}

function FacebookPreview({ companyName, copy, hook, cta }: { companyName?: string; copy: string; hook?: string; cta: string }) {
  const name = companyName ?? "La Tua Azienda";
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white text-xs">
      <div className="flex items-center gap-2 p-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-500 text-[10px] font-bold text-white">
          {name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold text-slate-900">{name}</p>
          <p className="text-[9px] text-slate-500">Sponsorizzato</p>
        </div>
      </div>
      <div className="px-2 pb-2">
        {hook && <p className="mb-1 text-[11px] font-semibold text-slate-900">{hook}</p>}
        <p className="text-[10px] leading-snug text-slate-700 line-clamp-3">{copy}</p>
      </div>
      <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-blue-100 via-violet-50 to-amber-50">
        <p className="text-[10px] text-slate-400">🖼️ Immagine</p>
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-3 py-2">
        <div>
          <p className="text-[9px] uppercase text-slate-500">{name.slice(0, 12).toUpperCase()}.IT</p>
          <p className="text-[10px] font-semibold text-slate-900">Inizia ora</p>
        </div>
        <button className="rounded bg-slate-200 px-3 py-1 text-[10px] font-semibold text-slate-900">{cta}</button>
      </div>
    </div>
  );
}

function InstagramPreview({ companyName, copy, hook, cta }: { companyName?: string; copy: string; hook?: string; cta: string }) {
  const name = companyName ?? "La Tua Azienda";
  return (
    <div className="relative mx-auto aspect-[9/16] w-44 overflow-hidden rounded-xl border-2 border-fuchsia-200 bg-gradient-to-b from-fuchsia-100 via-purple-50 to-amber-50">
      <div className="absolute left-2 right-2 top-2 z-10">
        <div className="mb-1 flex gap-0.5">
          <div className="h-0.5 flex-1 rounded-full bg-white" />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-amber-400 text-[9px] font-bold text-white">
            {name.slice(0, 1).toUpperCase()}
          </div>
          <p className="text-[10px] font-semibold text-white drop-shadow">{name}</p>
          <span className="text-[9px] text-white/80">Sponsorizzato</span>
        </div>
      </div>
      <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 text-center">
        {hook && <p className="mb-2 text-[11px] font-semibold text-slate-900">{hook}</p>}
        <p className="text-[10px] leading-snug text-slate-800 line-clamp-4">{copy}</p>
      </div>
      <div className="absolute inset-x-3 bottom-3 text-center">
        <div className="mx-auto inline-block rounded-full bg-white/90 px-4 py-1.5 text-[10px] font-bold text-slate-900 shadow">
          {cta} →
        </div>
      </div>
    </div>
  );
}

export default QuickStartCampaign;
