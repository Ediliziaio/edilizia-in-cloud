import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UniformSelect } from "@/components/ui/uniform-select";
import { eAmbienteInterno, LIMITE_CIRCUITO_RADIANTE_M, PASSO_RADIANTE_CM, QUOTA_COLLETTORE_RADIANTE_CM, type CollettoreRadiante,
  type Locale, type StatoPianta, type ZonaRadiante } from "../../../../shared/planimetrie/modello.ts";
import { misuraZonaRadiante, superficiePerRadiante } from "../../../../shared/planimetrie/pavimentoRadiante.ts";
import { circuitiRadianti } from "../../../../shared/planimetrie/circuitiRadianti.ts";
import { CircuitiRadiantiElenco } from "../CircuitiRadiantiElenco";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const formato = new Intl.NumberFormat(intlCampo(), { maximumFractionDigits: 2 });
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
  const t = useT();
  const [scelto, setScelto] = useState("");
  const interni = stato.locali.filter(eAmbienteInterno);
  const zone = stato.pavimentoRadiante ?? [];
  const circuiti = useMemo(() => circuitiRadianti(stato), [stato]);
  const locale = interni.find(l => l.id === scelto) ?? interni.find(l => zone.some(z => z.localeId === l.id)) ?? interni[0];
  const zona = zone.find(z => z.localeId === locale?.id);
  if (!locale) return <p className="text-sm text-muted-foreground">{t("Disegna un locale interno per aggiungere il pavimento radiante.")}</p>;
  return <section aria-label={t("Configurazione del pavimento radiante")} className="space-y-3">
    <label className="block space-y-1 text-xs font-medium"><span>{t("Locale")}</span>
      <UniformSelect value={locale.id} onChange={e => setScelto(e.target.value)}>
        {interni.map(l => <option key={l.id} value={l.id}>{l.nome}{zone.some(z => z.localeId === l.id) ? ` ${t("· radiante")}` : ""}</option>)}
      </UniformSelect>
    </label>
    <MisureZona key={JSON.stringify([locale.id, zona])} locale={locale} zona={zona} scalaIncerta={scalaIncerta} onCambia={onCambia} />
    <CollettoreForm key={JSON.stringify(stato.collettoreRadiante ?? null)} inPosa={inPosa}
      collettore={stato.collettoreRadiante} onPosa={onPosa} onCollettore={onCollettore} />
    {circuiti.length > 0 && <div className="space-y-2">
      <h4 className="text-xs font-semibold">{t(circuiti.length === 1 ? "{n} circuito · {metri} m totali" : "{n} circuiti · {metri} m totali", { n: circuiti.length, metri: formato.format(circuiti.reduce((s, c) => s + c.totaleM, 0)) })}</h4>
      <CircuitiRadiantiElenco circuiti={circuiti} />
      <p className="text-xs text-muted-foreground">{t("Stima di posa. Verifica percorsi, passaggi nelle pareti e bilanciamento con il progetto impiantistico.")}</p>
    </div>}
  </section>;
}

function CollettoreForm({ collettore, inPosa, onPosa, onCollettore }: Pick<Props, "inPosa" | "onPosa" | "onCollettore"> & { collettore?: CollettoreRadiante }) {
  const t = useT();
  const [quota, setQuota] = useState(String(collettore?.quotaCm ?? QUOTA_COLLETTORE_RADIANTE_CM.iniziale));
  const [limite, setLimite] = useState(String(collettore?.limiteCircuitoM ?? LIMITE_CIRCUITO_RADIANTE_M.iniziale));
  const impostazioni = { quotaCm: numero(quota), limiteCircuitoM: numero(limite) };
  const q = QUOTA_COLLETTORE_RADIANTE_CM, l = LIMITE_CIRCUITO_RADIANTE_M;
  const valido = impostazioni.quotaCm >= q.min && impostazioni.quotaCm <= q.max &&
    impostazioni.limiteCircuitoM >= l.min && impostazioni.limiteCircuitoM <= l.max;
  const aggiornato = !!collettore && collettore.quotaCm === impostazioni.quotaCm && collettore.limiteCircuitoM === impostazioni.limiteCircuitoM;
  return <div className="space-y-2 border-t pt-3">
    <h4 className="text-xs font-semibold">{t("Collettore del piano")}</h4>
    <div className="grid grid-cols-2 gap-2">
      <label className="space-y-1 text-xs font-medium"><span>{t("Quota mandata (cm)")}</span>
        <Input inputMode="decimal" className="h-9" disabled={inPosa} value={quota} onChange={e => setQuota(e.target.value)} />
      </label>
      <label className="space-y-1 text-xs font-medium"><span>{t("Obiettivo per circuito (m)")}</span>
        <Input inputMode="decimal" className="h-9" disabled={inPosa} value={limite} onChange={e => setLimite(e.target.value)} />
      </label>
    </div>
    {!valido && <p role="alert" className="text-xs text-destructive">{t("Usa {min}–{max} cm per la quota e {min2}–{max2} m per l’obiettivo.", { min: String(q.min ?? ""), max: String(q.max ?? ""), min2: String(l.min ?? ""), max2: String(l.max ?? "") })}</p>}
    {inPosa ? <div className="space-y-1">
      <p role="status" className="text-xs text-muted-foreground">{t("Scegli sulla pianta il punto del collettore.")}</p>
      <Button type="button" size="sm" variant="ghost" onClick={() => onPosa(null)}>{t("Annulla posizione")}</Button>
    </div> : <div className="flex flex-wrap gap-1">
      <Button type="button" size="sm" variant="outline" disabled={!valido} onClick={() => onPosa(impostazioni)}>
        {collettore ? t("Sposta collettore") : t("Posiziona collettore")}
      </Button>
      {collettore && <>
        <Button type="button" size="sm" disabled={!valido || aggiornato}
          onClick={() => onCollettore({ ...impostazioni, posizione: collettore.posizione })}>{t("Aggiorna collettore")}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onCollettore(null)}>{t("Rimuovi collettore")}</Button>
      </>}
    </div>}
  </div>;
}

function MisureZona({ locale, zona, scalaIncerta, onCambia }: {
  locale: Locale; zona?: ZonaRadiante; scalaIncerta: boolean; onCambia: Props["onCambia"];
}) {
  const t = useT();
  const [passo, setPasso] = useState(String(zona?.passoCm ?? PASSO_RADIANTE_CM.iniziale));
  const [esclusa, setEsclusa] = useState(String(zona?.superficieEsclusaMq ?? 0));
  const proposta = { localeId: locale.id, passoCm: numero(passo), superficieEsclusaMq: numero(esclusa) };
  const { min, max } = PASSO_RADIANTE_CM;
  const superficie = superficiePerRadiante(locale);
  const passoValido = proposta.passoCm >= min && proposta.passoCm <= max;
  const esclusaValida = proposta.superficieEsclusaMq >= 0 && proposta.superficieEsclusaMq < superficie;
  const misure = passoValido && esclusaValida ? misuraZonaRadiante(locale, proposta) : null;
  const errore = superficie <= 0 ? t("Controlla il contorno del locale.") : !passoValido ? t("Inserisci un passo da {min} a {max} cm.", { min, max }) :
    !esclusaValida ? t("Inserisci una superficie esclusa tra 0 e meno di {superficie} m².", { superficie: formato.format(superficie) }) : null;
  const cambiata = !zona || zona.passoCm !== proposta.passoCm || zona.superficieEsclusaMq !== proposta.superficieEsclusaMq;
  return <div className="space-y-3">
    <div className="grid grid-cols-2 gap-2">
      <label className="space-y-1 text-xs font-medium"><span>{t("Passo (cm)")}</span>
        <Input inputMode="decimal" className="h-9" value={passo} onChange={e => setPasso(e.target.value)} aria-invalid={!passoValido} />
      </label>
      <label className="space-y-1 text-xs font-medium"><span>{t("Area esclusa (m²)")}</span>
        <Input inputMode="decimal" className="h-9" value={esclusa} onChange={e => setEsclusa(e.target.value)} aria-invalid={!esclusaValida} />
      </label>
    </div>
    {errore && <p className="text-xs text-destructive" role="alert">{errore}</p>}
    {misure && <dl aria-label={t("Stima del pavimento radiante")} className="grid grid-cols-2 gap-2 rounded-md border bg-muted/40 p-2.5 text-xs">
      <div><dt className="text-muted-foreground">{t("Area riscaldata")}</dt><dd className="mt-0.5 text-sm font-semibold tabular-nums">{formato.format(misure.superficieMq)} m²</dd></div>
      <div><dt className="text-muted-foreground">{t("Tubo stimato")}</dt><dd className="mt-0.5 text-sm font-semibold tabular-nums">{formato.format(misure.tuboM)} m</dd></div>
    </dl>}
    {!scalaIncerta && <p className="text-xs text-muted-foreground">{t("L’area esclusa riduce i metri di tubo stimati. La serpentina sulla pianta rappresenta la zona a scopo di verifica.")}</p>}
    <div className="flex flex-wrap gap-1.5">
      <Button type="button" size="sm" disabled={!misure || !cambiata} onClick={() => onCambia(locale.id, proposta)}>
        {zona ? t("Aggiorna zona") : t("Aggiungi zona radiante")}
      </Button>
      {zona && <Button type="button" size="sm" variant="ghost" onClick={() => onCambia(locale.id, null)}>{t("Rimuovi zona")}</Button>}
    </div>
  </div>;
}
