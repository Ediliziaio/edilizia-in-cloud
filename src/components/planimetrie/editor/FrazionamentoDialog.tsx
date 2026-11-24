import { useId, useMemo, useState } from "react";
import { Rows3, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UniformSelect } from "@/components/ui/uniform-select";
import { alternativeFrazionamento, frazionaContorno, inserisciFrazionamento, type AsseFrazionamento, type EsitoFrazionamento } from "@/lib/planimetrie/frazionamento";
import { chiediFrazionamento } from "@/lib/planimetrie/assistenzaStudio";
import { areaPoligono, puntoInterno } from "../../../../shared/planimetrie/geometria.ts";
import { origineMisura, type Locale, type Proposta, type Punto } from "../../../../shared/planimetrie/modello.ts";
import type { AlternativaFrazionamento, RispostaAlternativa } from "../../../../shared/planimetrie/assistenzaStudio.ts";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const mq = (n: number) => n.toLocaleString(intlCampo(), { maximumFractionDigits: 2 });
const puntiSvg = (p: Punto[]) => p.map(({ x,y }) => `${x},${-y}`).join(" ");
const COLORI = ["#dbeafe", "#dcfce7", "#fef3c7"];

function Disegno({ locale, parti, sigle }: { locale: Locale; parti: Punto[][]; sigle: string[] }) {
  const t = useT();
  const xs = locale.contorno.map(p => p.x), ys = locale.contorno.map(p => -p.y);
  const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, h = Math.max(...ys) - y;
  const margine = Math.max(w,h) / 18;
  return <svg role="img" aria-label={t("Anteprima dei perimetri del frazionamento")} viewBox={`${x-margine} ${y-margine} ${w+2*margine} ${h+2*margine}`} className="h-56 w-full">
    <polygon points={puntiSvg(locale.contorno)} fill="#334155" stroke="#334155" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    {parti.map((p, i) => {
      const centro = puntoInterno(p);
      return <g key={i}>
        <polygon points={puntiSvg(p)} fill={COLORI[i]} />
        {centro && <text x={centro.x} y={-centro.y}
          fontFamily="system-ui, sans-serif" textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(w,h)/8} fontWeight={600} fill="#0f172a">
          {sigle[i] === "Parti comuni" ? t("Comuni") : sigle[i]}
        </text>}
      </g>;
    })}
  </svg>;
}

export function FrazionamentoDialog({ base, companyId, localeIniziale, scalaDaVerificare, onChiudi, onApplica }: {
  base: Proposta; companyId?: string; localeIniziale?: string; scalaDaVerificare?: boolean; onChiudi: () => void; onApplica: (p: Proposta) => void;
}) {
  const t = useT();
  const id = useId();
  const [localeId, setLocaleId] = useState(base.locali.some(l=>l.id===localeIniziale) ? localeIniziale! : base.locali[0]?.id ?? "");
  const [quante, setQuante] = useState(2);
  const [asse, setAsse] = useState<AsseFrazionamento>("x");
  const [posizioni, setPosizioni] = useState(["50"]);
  const [ultimaComune, setUltimaComune] = useState(false);
  const [nome, setNome] = useState("");
  const [richiesta,setRichiesta] = useState("");
  const [suggerimenti,setSuggerimenti] = useState<Array<AlternativaFrazionamento & RispostaAlternativa>>([]);
  const [scelto,setScelto] = useState<string>();
  const [occupato,setOccupato] = useState(false);
  const [errore,setErrore] = useState("");
  const locale = base.locali.find(l => l.id === localeId);
  const esito: EsitoFrazionamento | null = useMemo(() => locale ? frazionaContorno(base, locale, asse, posizioni.map(s => Number(s.replace(",", ".")))) : null, [base, locale, asse, posizioni]);
  const geometria = esito?.ok ? esito : null;
  const stima = scalaDaVerificare || (locale && origineMisura(locale, "contorno") === "stimata");
  const giaUnita = new Set(base.locali.filter(l => l.id !== localeId).map(l => l.unita));
  const sigle = Array.from({ length: quante }, (_, i) => ultimaComune && i === quante - 1 ? "Parti comuni" : (giaUnita.has(String.fromCharCode(65+i)) ? `${base.id}-${i+1}` : String.fromCharCode(65+i)));
  const azzeraSuggerimenti = () => {setSuggerimenti([]);setScelto(undefined);setErrore("");};
  const consulta = async () => {
    if (!companyId || !locale || !richiesta.trim() || occupato) return;
    azzeraSuggerimenti();
    const alternative = alternativeFrazionamento(base,locale,asse,posizioni.map(s=>Number(s.replace(",","."))));
    if (!alternative.length) return setErrore(t("Nessun tramezzo rettilineo compatibile con gli elementi presenti. Disegna i confini nell’editor."));
    setOccupato(true);
    try {
      const risposta = await chiediFrazionamento(companyId,richiesta.trim(),alternative);
      setSuggerimenti(risposta.map(r=>({...alternative.find(a=>a.id===r.id)!,...r})));
      if (!risposta.length) setErrore(t("L’AI non ha restituito un’alternativa utilizzabile per questa zona."));
    } catch (e) {setErrore(e instanceof Error ? e.message : t("L’assistenza AI non è disponibile."));}
    finally {setOccupato(false);}
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !occupato) onChiudi(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Rows3 className="h-5 w-5 text-primary" />{t("Frazionamento")}</DialogTitle>
        <DialogDescription>{t("Traccia i tramezzi nell’ambiente selezionato. Poi completa gli ingressi e i bagni nella variante.")}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <fieldset className="space-y-3" disabled={occupato}>
          <div className="space-y-1.5">
            <Label htmlFor={id+"locale"}>{t("Ambiente da dividere")}</Label>
            <UniformSelect id={id+"locale"} value={localeId} onChange={e => {setLocaleId(e.target.value);azzeraSuggerimenti();}}>
              {base.locali.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </UniformSelect>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor={id+"quante"}>{t("Porzioni")}</Label>
              <UniformSelect id={id+"quante"} value={quante} onChange={e => {
                const n = Number(e.target.value); setQuante(n); setPosizioni(n === 2 ? ["50"] : ["33,33", "66,67"]); azzeraSuggerimenti();
              }}>
                <option value={2}>{t("Due")}</option><option value={3}>{t("Tre")}</option>
              </UniformSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={id+"asse"}>{t("Direzione")}</Label>
              <UniformSelect id={id+"asse"} value={asse} onChange={e => {setAsse(e.target.value as AsseFrazionamento);setScelto(undefined);}}>
                <option value="x">{t("Verticale")}</option><option value="y">{t("Orizzontale")}</option>
              </UniformSelect>
            </div>
          </div>
          {posizioni.map((p, i) => <div className="space-y-1.5" key={i}>
            <Label htmlFor={id+"taglio"+i}>{t("Posizione tramezzo {i} (%)", { i: i+1 })}</Label>
            <Input id={id+"taglio"+i} value={p} inputMode="decimal" onChange={e => {setPosizioni(a => a.map((v,j) => i===j ? e.target.value : v));setScelto(undefined);}} />
          </div>)}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ultimaComune} onChange={e => {setUltimaComune(e.target.checked);setScelto(undefined);}} />{t("Destina l’ultima porzione alle parti comuni")}</label>
          <div className="space-y-1.5"><Label htmlFor={id+"nome"}>{t("Nome della variante")}</Label>
            <Input id={id+"nome"} value={nome} maxLength={100} placeholder={t("{quante} porzioni", { quante: String(quante ?? "") })} onChange={e => setNome(e.target.value)} />
          </div>
        </fieldset>
        <div className="flex flex-col gap-3">
          {locale && <div className="overflow-hidden rounded-xl border bg-slate-50"><Disegno locale={locale} parti={geometria?.parti ?? []} sigle={sigle} /></div>}
          {esito?.ok === false && <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">{esito.motivo}</p>}
          {geometria && <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border p-3 text-sm">
            {geometria.parti.map((p,i) => <div key={i} className="flex items-center justify-between gap-2">
              <dt>{sigle[i] === "Parti comuni" ? t("Parti comuni") : t("Unità {valore}", { valore: String(sigle[i] ?? "") })}</dt><dd className="font-semibold tabular-nums">{mq(areaPoligono(p)/10000)} m²</dd>
            </div>)}
            <div className="flex items-center justify-between gap-2"><dt>{t("Ingombro dei tramezzi")}</dt><dd className="tabular-nums">{mq(geometria.superficieMuri)} m²</dd></div>
          </dl>}
          {stima && <p className="text-xs text-amber-800">{t("Scala o perimetro da verificare. Le superfici restano stimate.")}</p>}
        </div>
      </div>
      {companyId && <fieldset className="space-y-2 rounded-lg border bg-muted/25 p-3" disabled={occupato}>
        <Label className="flex items-center gap-2" htmlFor={id+"ai"}><Sparkles className="h-4 w-4 text-primary"/>{t("Chiedi all’AI sulla zona selezionata")}</Label>
        <Textarea id={id+"ai"} maxLength={1000} value={richiesta} onChange={e=>{setRichiesta(e.target.value);azzeraSuggerimenti();}}
          placeholder={t("Es. avvicina le tre superfici a 100 m² e conserva le aperture.")} />
        <Button variant="outline" size="sm" disabled={!richiesta.trim() || !locale || occupato} onClick={()=>void consulta()}>{occupato ? t("Analisi delle alternative…") : t("Proponi alternative")}</Button>
        {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
        {!!suggerimenti.length && <ul className="space-y-2">
          {suggerimenti.map((a,i)=><li key={a.id} className="rounded-md border bg-card p-2.5">
            <Button size="sm" variant={scelto===a.id ? "secondary" : "ghost"} aria-pressed={scelto===a.id} onClick={()=>{
              setScelto(a.id);setAsse(a.asse);setPosizioni(a.percentuali.map(String));
            }}>{t("Alternativa {n}", { n: i+1 })} · {a.superfici.map(s=>`${mq(s)} m²`).join(" / ")}</Button>
            <p className="px-2 text-sm">{a.motivazione}</p>
            {!!a.verifiche.length && <ul className="ml-6 list-disc text-xs text-muted-foreground">{a.verifiche.map((v,j)=><li key={j}>{v}</li>)}</ul>}
          </li>)}
        </ul>}
      </fieldset>}
      <DialogFooter>
        <Button variant="outline" disabled={occupato} onClick={onChiudi}>{t("Annulla")}</Button>
        <Button disabled={!locale || !geometria || occupato} onClick={() => {
          const propostaAi = suggerimenti.find(a=>a.id===scelto);
          if (locale && geometria) onApplica(inserisciFrazionamento({ ...base, nome: nome.trim() || `${quante} porzioni` }, locale, geometria, sigle,
            propostaAi ? {richiesta:richiesta.trim(),motivazione:propostaAi.motivazione} : undefined));
        }}>{t("Crea variante")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
