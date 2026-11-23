import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UniformSelect } from "@/components/ui/uniform-select";
import { eAmbienteInterno, LIMITE_CIRCUITO_RADIANTE_M, PASSO_RADIANTE_CM, QUOTA_COLLETTORE_RADIANTE_CM, type CollettoreRadiante,
  type Locale, type StatoPianta, type ZonaRadiante } from "../../../../shared/planimetrie/modello.ts";
import { misuraZonaRadiante, superficiePerRadiante } from "../../../../shared/planimetrie/pavimentoRadiante.ts";
import { circuitiRadianti } from "../../../../shared/planimetrie/circuitiRadianti.ts";
import { CircuitiRadiantiElenco } from "../CircuitiRadiantiElenco";

const formato = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });
const numero = (v: string) => /^\d+(?:[.,]\d+)?$/.test(v.trim()) ? Number(v.replace(",", ".")) : NaN;

type Props = {
  stato: StatoPianta;
  scalaIncerta: boolean;
  inPosa: boolean;
  onCambia: (localeId: string, zona: ZonaRadiante | null) => void;
  onPosa: (impostazioni: Omit<CollettoreRadiante, "posizione"> | null) => void;
  onCollettore: (collettore: CollettoreRadiante | null) => void;
};

export function PavimentoRadiantePanel({ stato, scalaIncerta, inPosa, onCambia, onPosa, onCollettore }: Props) {
  const [scelto, setScelto] = useState("");
  const interni = stato.locali.filter(eAmbienteInterno);
  const zone = stato.pavimentoRadiante ?? [];
  const circuiti = useMemo(() => circuitiRadianti(stato), [stato]);
  const locale = interni.find(l => l.id === scelto) ?? interni.find(l => zone.some(z => z.localeId === l.id)) ?? interni[0];
  const zona = zone.find(z => z.localeId === locale?.id);
  if (!locale) return <p className="text-sm text-muted-foreground">Disegna un locale interno per aggiungere il pavimento radiante.</p>;
  return <section aria-label="Configurazione del pavimento radiante" className="space-y-3">
    <label className="block space-y-1 text-xs font-medium"><span>Locale</span>
      <UniformSelect value={locale.id} onChange={e => setScelto(e.target.value)}>
        {interni.map(l => <option key={l.id} value={l.id}>{l.nome}{zone.some(z => z.localeId === l.id) ? " · radiante" : ""}</option>)}
      </UniformSelect>
    </label>
    <MisureZona key={JSON.stringify([locale.id, zona])} locale={locale} zona={zona} scalaIncerta={scalaIncerta} onCambia={onCambia} />
    <CollettoreForm key={JSON.stringify(stato.collettoreRadiante ?? null)} inPosa={inPosa}
      collettore={stato.collettoreRadiante} onPosa={onPosa} onCollettore={onCollettore} />
    {circuiti.length > 0 && <div className="space-y-2">
      <h4 className="text-xs font-semibold">{circuiti.length} {circuiti.length === 1 ? "circuito" : "circuiti"} · {formato.format(circuiti.reduce((s, c) => s + c.totaleM, 0))} m totali</h4>
      <CircuitiRadiantiElenco circuiti={circuiti} />
      <p className="text-xs text-muted-foreground">Stima di posa. Verifica percorsi, passaggi nelle pareti e bilanciamento con il progetto impiantistico.</p>
    </div>}
  </section>;
}

function CollettoreForm({ collettore, inPosa, onPosa, onCollettore }: Pick<Props, "inPosa" | "onPosa" | "onCollettore"> & { collettore?: CollettoreRadiante }) {
  const [quota, setQuota] = useState(String(collettore?.quotaCm ?? QUOTA_COLLETTORE_RADIANTE_CM.iniziale));
  const [limite, setLimite] = useState(String(collettore?.limiteCircuitoM ?? LIMITE_CIRCUITO_RADIANTE_M.iniziale));
  const impostazioni = { quotaCm: numero(quota), limiteCircuitoM: numero(limite) };
  const q = QUOTA_COLLETTORE_RADIANTE_CM, l = LIMITE_CIRCUITO_RADIANTE_M;
  const valido = impostazioni.quotaCm >= q.min && impostazioni.quotaCm <= q.max &&
    impostazioni.limiteCircuitoM >= l.min && impostazioni.limiteCircuitoM <= l.max;
  const aggiornato = !!collettore && collettore.quotaCm === impostazioni.quotaCm && collettore.limiteCircuitoM === impostazioni.limiteCircuitoM;
  return <div className="space-y-2 border-t pt-3">
    <h4 className="text-xs font-semibold">Collettore del piano</h4>
    <div className="grid grid-cols-2 gap-2">
      <label className="space-y-1 text-xs font-medium"><span>Quota mandata (cm)</span>
        <Input inputMode="decimal" className="h-9" disabled={inPosa} value={quota} onChange={e => setQuota(e.target.value)} />
      </label>
      <label className="space-y-1 text-xs font-medium"><span>Obiettivo per circuito (m)</span>
        <Input inputMode="decimal" className="h-9" disabled={inPosa} value={limite} onChange={e => setLimite(e.target.value)} />
      </label>
    </div>
    {!valido && <p role="alert" className="text-xs text-destructive">Usa {q.min}–{q.max} cm per la quota e {l.min}–{l.max} m per l’obiettivo.</p>}
    {inPosa ? <div className="space-y-1">
      <p role="status" className="text-xs text-muted-foreground">Scegli sulla pianta il punto del collettore.</p>
      <Button type="button" size="sm" variant="ghost" onClick={() => onPosa(null)}>Annulla posizione</Button>
    </div> : <div className="flex flex-wrap gap-1">
      <Button type="button" size="sm" variant="outline" disabled={!valido} onClick={() => onPosa(impostazioni)}>
        {collettore ? "Sposta collettore" : "Posiziona collettore"}
      </Button>
      {collettore && <>
        <Button type="button" size="sm" disabled={!valido || aggiornato}
          onClick={() => onCollettore({ ...impostazioni, posizione: collettore.posizione })}>Aggiorna collettore</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onCollettore(null)}>Rimuovi collettore</Button>
      </>}
    </div>}
  </div>;
}

function MisureZona({ locale, zona, scalaIncerta, onCambia }: {
  locale: Locale; zona?: ZonaRadiante; scalaIncerta: boolean; onCambia: Props["onCambia"];
}) {
  const [passo, setPasso] = useState(String(zona?.passoCm ?? PASSO_RADIANTE_CM.iniziale));
  const [esclusa, setEsclusa] = useState(String(zona?.superficieEsclusaMq ?? 0));
  const proposta = { localeId: locale.id, passoCm: numero(passo), superficieEsclusaMq: numero(esclusa) };
  const { min, max } = PASSO_RADIANTE_CM;
  const superficie = superficiePerRadiante(locale);
  const passoValido = proposta.passoCm >= min && proposta.passoCm <= max;
  const esclusaValida = proposta.superficieEsclusaMq >= 0 && proposta.superficieEsclusaMq < superficie;
  const misure = passoValido && esclusaValida ? misuraZonaRadiante(locale, proposta) : null;
  const errore = superficie <= 0 ? "Controlla il contorno del locale." : !passoValido ? `Inserisci un passo da ${min} a ${max} cm.` :
    !esclusaValida ? `Inserisci una superficie esclusa tra 0 e meno di ${formato.format(superficie)} m².` : null;
  const cambiata = !zona || zona.passoCm !== proposta.passoCm || zona.superficieEsclusaMq !== proposta.superficieEsclusaMq;
  return <div className="space-y-3">
    <div className="grid grid-cols-2 gap-2">
      <label className="space-y-1 text-xs font-medium"><span>Passo (cm)</span>
        <Input inputMode="decimal" className="h-9" value={passo} onChange={e => setPasso(e.target.value)} aria-invalid={!passoValido} />
      </label>
      <label className="space-y-1 text-xs font-medium"><span>Area esclusa (m²)</span>
        <Input inputMode="decimal" className="h-9" value={esclusa} onChange={e => setEsclusa(e.target.value)} aria-invalid={!esclusaValida} />
      </label>
    </div>
    {errore && <p className="text-xs text-destructive" role="alert">{errore}</p>}
    {misure && <dl aria-label="Stima del pavimento radiante" className="grid grid-cols-2 gap-2 rounded-md border bg-muted/40 p-2.5 text-xs">
      <div><dt className="text-muted-foreground">Area riscaldata</dt><dd className="mt-0.5 text-sm font-semibold tabular-nums">{formato.format(misure.superficieMq)} m²</dd></div>
      <div><dt className="text-muted-foreground">Tubo stimato</dt><dd className="mt-0.5 text-sm font-semibold tabular-nums">{formato.format(misure.tuboM)} m</dd></div>
    </dl>}
    {!scalaIncerta && <p className="text-xs text-muted-foreground">L’area esclusa riduce i metri di tubo stimati. La serpentina sulla pianta rappresenta la zona a scopo di verifica.</p>}
    <div className="flex flex-wrap gap-1.5">
      <Button type="button" size="sm" disabled={!misure || !cambiata} onClick={() => onCambia(locale.id, proposta)}>
        {zona ? "Aggiorna zona" : "Aggiungi zona radiante"}
      </Button>
      {zona && <Button type="button" size="sm" variant="ghost" onClick={() => onCambia(locale.id, null)}>Rimuovi zona</Button>}
    </div>
  </div>;
}
