/**
 * Render AI → Planimetrie → «Nuova pianta»:
 * - `?da=disegno`: l'editor vuoto; la pianta si crea al primo salvataggio;
 * - `?da=documento`: si carica un PDF o una foto (catastale, disegno del tecnico, schizzo);
 * - `?da=testo`: si descrive la casa a parole.
 * Negli ultimi due la pianta la ricava l'AI (`planimetria-genera`, fase 3) e si apre
 * nell'editor con le misure stimate in evidenza; si salva solo dopo averla vista.
 */
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FileUp, Loader2, PenLine, Ruler, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { EditorConSalvataggio } from "@/components/planimetrie/editor/EditorConSalvataggio";
import { TestataPlanimetrie } from "@/components/planimetrie/render/TestataPlanimetrie";
import { leggiMisura } from "@/components/planimetrie/editor/misure";
import {
  confermaScala,
  fileNonValido,
  inBase64,
  leggiRispostaAI,
  misureImmagine,
  scalaDaConfermare,
  type EsitoAI,
  type IngressoAI,
  type RichiestaAI,
} from "@/components/planimetrie/editor/generazione";
import { percorsiPlanimetrie, type ModoNuovaPianta } from "@/lib/planimetrie/render/percorsi";

type Generata = Extract<EsitoAI, { ok: true }> & { ingresso: IngressoAI; titolo: string };

async function chiediAllAI(richiesta: RichiestaAI): Promise<EsitoAI> {
  const { data, error } = await supabase.functions.invoke("planimetria-genera", { body: richiesta });
  if (!error) return leggiRispostaAI(data, 200);
  // l'errore della funzione ha il motivo nel corpo della risposta
  const risposta = (error as { context?: Response }).context;
  if (risposta && typeof risposta.json === "function") {
    const corpo: unknown = await risposta.json().catch((): unknown => null);
    return leggiRispostaAI(corpo, risposta.status);
  }
  return leggiRispostaAI(null, null);
}

export default function RenderPlanimetriaNuova() {
  const [params] = useSearchParams();
  const { effectiveCompany } = useAuth();
  const modo: ModoNuovaPianta = (["disegno", "documento", "testo"] as const).find((m) => m === params.get("da")) ?? "disegno";
  const [generata, setGenerata] = useState<Generata | null>(null);
  const companyId = effectiveCompany?.id;
  if (!companyId) return null;

  if (modo === "disegno") {
    return <EditorConSalvataggio companyId={companyId} titoloPagina="Disegna una pianta" indietro={percorsiPlanimetrie.elenco} />;
  }
  if (generata) return <PiantaGenerata companyId={companyId} generata={generata} onAggiorna={setGenerata} />;
  return <ChiediPianta companyId={companyId} modo={modo} onPronta={setGenerata} />;
}

function ChiediPianta({ companyId, modo, onPronta }: { companyId: string; modo: "documento" | "testo"; onPronta: (g: Generata) => void }) {
  const [tipo, setTipo] = useState<"documento" | "schizzo">("documento");
  const [file, setFile] = useState<File | null>(null);
  const [testo, setTesto] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const scegliFile = (f: File | null) => {
    setErrore(f ? fileNonValido(f) : null);
    setFile(f && !fileNonValido(f) ? f : null);
  };

  const avvia = async () => {
    setErrore(null);
    const ingresso: IngressoAI = modo === "testo" ? "descrizione" : tipo;
    const richiesta: RichiestaAI = { company_id: companyId, ingresso };
    if (modo === "testo") {
      richiesta.testo = testo.trim();
    } else {
      if (!file) return;
      richiesta.mime = file.type;
      richiesta.file_base64 = await inBase64(file);
      if (file.type.startsWith("image/")) {
        const url = URL.createObjectURL(file);
        const misure = await misureImmagine(url);
        URL.revokeObjectURL(url);
        if (misure) Object.assign(richiesta, misure);
      }
    }
    setInCorso(true);
    const esito = await chiediAllAI(richiesta).catch(() => leggiRispostaAI(null, null));
    setInCorso(false);
    if (esito.ok === false) {
      setErrore(esito.messaggio);
      return;
    }
    const titolo = esito.planimetria.titolo ?? (file ? file.name.replace(/\.[^.]+$/, "") : "Pianta da descrizione");
    onPronta({ ...esito, ingresso, titolo });
  };

  const pronto = modo === "testo" ? testo.trim().length >= 10 : !!file;

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-12">
      <TestataPlanimetrie
        indietro={percorsiPlanimetrie.elenco}
        titolo={modo === "testo" ? "Pianta da una descrizione" : "Pianta da un PDF o da una foto"}
        sottotitolo="L'AI ricava la pianta; tu la controlli e la correggi prima di salvarla. Costa 1 credito AI."
      />
      <Card>
        <CardContent className="space-y-5 p-6">
          {modo === "documento" ? (
            <>
              <div className="space-y-2">
                <Label>Che cosa carichi?</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["documento", "Un disegno", "Catastale o pianta del tecnico, in scala"],
                      ["schizzo", "Uno schizzo a mano", "Con le misure scritte sopra"],
                    ] as const
                  ).map(([valore, titolo, spiegazione]) => (
                    <button
                      key={valore}
                      type="button"
                      onClick={() => setTipo(valore)}
                      aria-pressed={tipo === valore}
                      className={cn(
                        "rounded-md border p-3 text-left text-sm transition-colors",
                        tipo === valore ? "border-purple-600 bg-purple-50 ring-1 ring-purple-600" : "hover:bg-muted",
                      )}
                    >
                      <div className="font-medium">{titolo}</div>
                      <div className="text-xs text-muted-foreground">{spiegazione}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="file-pianta">PDF o foto della pianta</Label>
                <Input id="file-pianta" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => scegliFile(e.target.files?.[0] ?? null)} />
                <p className="text-xs text-muted-foreground">Meglio una foto dritta e nitida, con le misure leggibili.</p>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="descrizione-pianta">Com'è la casa?</Label>
              <Textarea
                id="descrizione-pianta"
                rows={5}
                value={testo}
                maxLength={2000}
                placeholder="Es. Trilocale di 75 mq: soggiorno con cucina 30 mq, due camere, bagno 2 × 2,5, corridoio."
                onChange={(e) => setTesto(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Le misure saranno tutte stimate: le controlli e le correggi nel disegno.</p>
            </div>
          )}

          {errore && (
            <div role="alert" className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              <p>{errore}</p>
              <Button asChild size="sm" variant="outline">
                <Link to={percorsiPlanimetrie.nuova("disegno")}>
                  <PenLine className="mr-2 h-4 w-4" /> Disegnala a mano
                </Link>
              </Button>
            </div>
          )}

          <Button className="w-full bg-purple-600 hover:bg-purple-700" disabled={!pronto || inCorso} onClick={avvia}>
            {inCorso ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : modo === "testo" ? <Wand2 className="mr-2 h-4 w-4" /> : <FileUp className="mr-2 h-4 w-4" />}
            {inCorso ? "Sto ricavando la pianta… di solito meno di un minuto" : "Ricava la pianta"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PiantaGenerata({ companyId, generata, onAggiorna }: { companyId: string; generata: Generata; onAggiorna: (g: Generata) => void }) {
  const serveScala = scalaDaConfermare(generata.ingresso, generata.generazione);
  return (
    <EditorConSalvataggio
      // dopo la conferma della scala l'editor riparte dalla pianta adeguata
      key={generata.generazione.scala?.cm_per_unita ?? "senza-scala"}
      companyId={companyId}
      titoloPagina="Controlla la pianta e salvala"
      indietro={percorsiPlanimetrie.elenco}
      iniziale={generata.planimetria}
      titoloProposto={generata.titolo}
      origine={generata.origine}
      avvisi={[
        "Le misure in viola con «≈» sono stimate: controllale e correggile toccandole.",
        ...generata.generazione.avvisi,
      ]}
      sopra={serveScala ? <ConfermaScala generata={generata} onConferma={onAggiorna} /> : undefined}
    />
  );
}

/** «Questa stanza è larga 4,20»: tutta la pianta in scala si adegua. */
function ConfermaScala({ generata, onConferma }: { generata: Generata; onConferma: (g: Generata) => void }) {
  const locali = generata.planimetria.livelli[0]?.fatto.locali ?? [];
  const [localeId, setLocaleId] = useState(locali[0]?.id ?? "");
  const [asse, setAsse] = useState<"x" | "y">("x");
  const [valore, setValore] = useState("");
  const [nascosta, setNascosta] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  if (nascosta || !locali.length) return null;

  const applica = () => {
    const cm = leggiMisura(valore);
    if (!cm) {
      setErrore("Scrivi una misura, es. 4,20.");
      return;
    }
    try {
      const r = confermaScala(generata.planimetria, generata.generazione, localeId, asse, cm);
      onConferma({ ...generata, ...r });
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Misura non applicata.");
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-violet-200 bg-violet-50 p-3 text-sm">
      <div className="w-full flex items-center gap-2 font-medium text-violet-900">
        <Ruler className="h-4 w-4" /> Metti la pianta in scala: scrivi una misura vera di una stanza, tutto il resto si adegua.
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Stanza</Label>
        <Select value={localeId} onValueChange={setLocaleId}>
          <SelectTrigger className="h-9 w-44 bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {locali.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Quale misura</Label>
        <Select value={asse} onValueChange={(v) => setAsse(v as "x" | "y")}>
          <SelectTrigger className="h-9 w-56 bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="x">Larghezza (da sinistra a destra)</SelectItem>
            <SelectItem value="y">Profondità (dall'alto in basso)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="misura-scala" className="text-xs">Metri</Label>
        <Input id="misura-scala" inputMode="decimal" className="h-9 w-24 bg-white" placeholder="4,20" value={valore} onChange={(e) => setValore(e.target.value)} />
      </div>
      <Button size="sm" onClick={applica}>Applica</Button>
      <Button size="sm" variant="ghost" onClick={() => setNascosta(true)}>Lo faccio dopo</Button>
      {errore && <p className="w-full text-xs text-destructive">{errore}</p>}
    </div>
  );
}
