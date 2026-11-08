/**
 * Arrivo della merce su misura: una riga per posizione, pensata per il telefono.
 * Vale per chi riceve in cantiere e per l'ufficio. Reclamo e riordino sono in ArrivoProblemi.
 */
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Camera, Check, Loader2, PackageX, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ImgRiservata } from "@/components/common/ImgRiservata";
import { ArrivoProblemi } from "@/components/ddt/ArrivoProblemi";
import { useElencoArrivo, useRegistraSpunte, type RigaSpunta } from "@/hooks/useArrivoPosizioni";
import { compressImage } from "@/lib/campo/compressImage";
import { messaggioErrore } from "@/lib/campo/messaggioErrore";
import {
  ESITI, abbinaRigheBolla, contiPosizione, descriviMisure, statoPosizione,
  type EsitoArrivo, type PosizioneArrivo,
} from "@/lib/arrivi/arrivoPosizioni";
import { cn } from "@/lib/utils";

const BUCKET = "campo-rapportini";

interface Spunta {
  esito: EsitoArrivo;
  quantita: string;
  nota: string;
  foto: string[];
  sostitutivo: boolean;
  collega: boolean;
}

const TONI: Record<ReturnType<typeof statoPosizione>["tono"], string> = {
  ok: "bg-green-100 text-green-800",
  attenzione: "bg-red-100 text-red-800",
  attesa: "bg-amber-100 text-amber-800",
  neutro: "bg-muted text-muted-foreground",
};

const SCELTA: Record<EsitoArrivo, string> = {
  arrivata: "border-green-600 bg-green-600 text-white",
  danneggiata: "border-red-600 bg-red-600 text-white",
  sbagliata: "border-red-600 bg-red-600 text-white",
  mancante: "border-amber-600 bg-amber-600 text-white",
};

function linkFoto(path: string) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export function ArrivoPosizioniPanel({ odaId, ddtId, nascondiSeVuoto, inCantiere, compatto }: {
  odaId: string;
  /** La bolla aperta: le spunte si agganciano a lei e le sue righe si propongono. */
  ddtId?: string | null;
  /** Dentro la pagina della bolla: se l'ordine non ha posizioni su misura non si vede niente. */
  nascondiSeVuoto?: boolean;
  inCantiere?: boolean;
  /** Dentro la pagina dell'ordine: fornitore e numero si leggono già sopra. */
  compatto?: boolean;
}) {
  const { profile } = useAuth();
  const elenco = useElencoArrivo(odaId, ddtId);
  const registra = useRegistraSpunte(odaId, elenco.data?.ordine.order_id);
  const [spunte, setSpunte] = useState<Record<string, Spunta>>({});
  const [numeroBolla, setNumeroBolla] = useState("");
  const [fotoInCorso, setFotoInCorso] = useState<string | null>(null);
  const invio = useRef<string>(crypto.randomUUID());
  const inCorso = useRef(false);

  const posizioni = useMemo(() => elenco.data?.posizioni ?? [], [elenco.data]);
  const righeBolla = useMemo(() => elenco.data?.righe_bolla ?? [], [elenco.data]);
  const proposte = useMemo(() => abbinaRigheBolla(righeBolla, posizioni), [righeBolla, posizioni]);

  if (elenco.isLoading) {
    return nascondiSeVuoto ? null : <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Carico" /></div>;
  }
  if (elenco.error || !elenco.data) {
    if (nascondiSeVuoto) return null;
    return <p className="rounded-xl border p-4 text-sm text-red-700">{messaggioErrore(elenco.error, "Non riesco ad aprire questo ordine.")}</p>;
  }
  if (posizioni.length === 0) {
    if (nascondiSeVuoto) return null;
    return <p className="rounded-xl border p-4 text-sm text-muted-foreground">In questo ordine non ci sono posizioni su misura.</p>;
  }

  const { ordine, articoli_normali } = elenco.data;
  const daSpuntare = posizioni.filter(p => !contiPosizione(p).completa);
  const tutteLeSpunte = Object.values(spunte);
  const quanteSpunte = tutteLeSpunte.length;

  const scegli = (p: PosizioneArrivo, esito: EsitoArrivo) => {
    const c = contiPosizione(p);
    setSpunte(s => {
      if (s[p.poi_id]?.esito === esito && !s[p.poi_id]?.sostitutivo) {
        const { [p.poi_id]: _tolta, ...resto } = s;
        return resto;
      }
      const massimo = esito === "mancante" ? c.libero : c.arrivabili;
      return { ...s, [p.poi_id]: {
        esito, quantita: String(massimo || 1), nota: s[p.poi_id]?.nota ?? "", foto: s[p.poi_id]?.foto ?? [],
        sostitutivo: false, collega: !!proposte[p.poi_id],
      } };
    });
  };

  const pezzoGiusto = (p: PosizioneArrivo) => {
    const c = contiPosizione(p);
    setSpunte(s => ({ ...s, [p.poi_id]: { esito: "arrivata", quantita: String(c.problemi), nota: "", foto: [], sostitutivo: true, collega: !!proposte[p.poi_id] } }));
  };

  const tuttoArrivato = () => setSpunte(s => {
    const nuovo = { ...s };
    for (const p of daSpuntare) {
      const c = contiPosizione(p);
      if (c.arrivabili > 0) nuovo[p.poi_id] = { esito: "arrivata", quantita: String(c.arrivabili), nota: "", foto: [], sostitutivo: false, collega: !!proposte[p.poi_id] };
    }
    return nuovo;
  });

  const cambia = (id: string, parte: Partial<Spunta>) => setSpunte(s => ({ ...s, [id]: { ...s[id], ...parte } }));

  const aggiungiFoto = async (p: PosizioneArrivo, file: File | undefined) => {
    if (!file) return;
    const azienda = profile?.company_id;
    if (!azienda || !ordine.order_id) { toast.error("Foto non caricata: riapri la pagina."); return; }
    setFotoInCorso(p.poi_id);
    try {
      const blob: Blob = await compressImage(file, 1600, 0.8).catch((): Blob => file);
      const percorso = `${azienda}/${ordine.order_id}/arrivi/${crypto.randomUUID()}.jpg`;
      const { data, error } = await supabase.storage.from(BUCKET).upload(percorso, blob, { contentType: blob.type || "image/jpeg", upsert: false });
      if (error || !data?.path) throw error ?? new Error("caricamento");
      setSpunte(s => s[p.poi_id] ? { ...s, [p.poi_id]: { ...s[p.poi_id], foto: [...s[p.poi_id].foto, data.path] } } : s);
    } catch {
      toast.error("Foto non caricata: la spunta resta, puoi riprovare.");
    } finally {
      setFotoInCorso(null);
    }
  };

  const salva = () => {
    if (inCorso.current || quanteSpunte === 0) return;
    const righe: RigaSpunta[] = Object.entries(spunte).map(([poi_id, s]) => ({
      poi_id,
      esito: s.esito,
      quantita: Number(s.quantita.replace(",", ".")),
      nota: s.nota.trim() || undefined,
      foto: s.foto,
      sostitutivo: s.sostitutivo,
      ddt_riga_id: s.collega ? proposte[poi_id]?.rigaId ?? null : null,
    }));
    if (righe.some(r => !Number.isFinite(r.quantita) || r.quantita <= 0)) { toast.error("Controlla le quantità."); return; }
    inCorso.current = true;
    registra.mutate({ righe, ddtId, numeroBolla, invioId: invio.current }, {
      onSettled: () => { inCorso.current = false; },
      onSuccess: esito => {
        invio.current = crypto.randomUUID();
        setSpunte({});
        if (esito.registrate > 0) toast.success(esito.registrate === 1 ? "Posizione registrata" : `${esito.registrate} posizioni registrate`);
        else if (esito.gia_registrato) toast.info("Era già registrato.");
        for (const s of esito.saltate) toast.warning(`${s.descrizione ?? "Una riga"}: ${s.motivo}`);
      },
      onError: e => toast.error(messaggioErrore(e, "Arrivo non registrato: riprova.")),
    });
  };

  return (
    <div className={cn("space-y-3", !compatto && "pb-24")}>
      <div className={cn(!compatto && "rounded-xl border bg-background p-3")}>
        {!compatto && <p className="text-base font-bold">{ordine.fornitore ?? "Fornitore"} · {ordine.numero}</p>}
        {!compatto && <p className="text-sm text-muted-foreground">{[ordine.commessa, ordine.cliente].filter(Boolean).join(" · ")}</p>}
        <p className={cn("text-sm", !compatto && "mt-1")}>
          {daSpuntare.length === 0 ? "È arrivato tutto." : daSpuntare.length === 1 ? "Manca 1 posizione." : `Mancano ${daSpuntare.length} posizioni.`}
          {" "}Va al cantiere: non entra in magazzino.
        </p>
      </div>

      {!ddtId && daSpuntare.length > 0 && (
        <div className="space-y-1">
          <label htmlFor="arrivo-numero-bolla" className="text-sm font-semibold">Numero bolla (se c'è)</label>
          <input id="arrivo-numero-bolla" value={numeroBolla} onChange={e => setNumeroBolla(e.target.value)}
            className="h-11 w-full rounded-xl border bg-background px-3 text-base" autoComplete="off" />
        </div>
      )}

      {daSpuntare.length > 1 && (
        <button type="button" onClick={tuttoArrivato} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold">
          <Check className="h-4 w-4" aria-hidden="true" />È arrivato tutto giusto
        </button>
      )}

      <ul className="space-y-2">
        {posizioni.map(p => {
          const stato = statoPosizione(p);
          const c = contiPosizione(p);
          const s = spunte[p.poi_id];
          const misure = descriviMisure(p.misure, p.misura_tipo);
          const nome = [p.riferimento, p.nome].filter(Boolean).join(" — ");
          const proposta = proposte[p.poi_id] ? righeBolla.find(r => r.id === proposte[p.poi_id].rigaId) : null;
          const conProblema = s && s.esito !== "arrivata";
          return (
            <li key={p.poi_id} className="space-y-2 rounded-xl border bg-background p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{nome}</p>
                  <p className="text-sm text-muted-foreground">
                    {[misure, p.componente, `${Number(p.quantita)} ${p.unita ?? "pz"}`].filter(Boolean).join(" · ")}
                    {p.riordino ? " · riordino" : ""}
                  </p>
                </div>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", TONI[stato.tono])}>{stato.testo}</span>
              </div>

              {p.problemi.filter(x => x.foto.length > 0 || x.nota).map(x => (
                <div key={x.id} className="space-y-1 rounded-lg bg-muted/50 p-2 text-xs">
                  <p>{x.nota ?? ""}{x.chi ? ` — ${x.chi}` : ""}{x.riordino_numero ? ` · riordino ${x.riordino_numero}` : ""}</p>
                  {x.foto.length > 0 && <div className="flex flex-wrap gap-1">{x.foto.map(f => <ImgRiservata key={f} src={linkFoto(f)} alt="Foto del pezzo" className="h-16 w-16 rounded object-cover" />)}</div>}
                </div>
              ))}

              {!c.completa && c.arrivabili + c.problemi > 0 && (
                <>
                  {c.arrivabili > 0 && (
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                      {ESITI.map(e => (
                        <button key={e.key} type="button" aria-pressed={s?.esito === e.key && !s?.sostitutivo}
                          disabled={e.key === "mancante" && c.libero <= 0}
                          onClick={() => scegli(p, e.key)}
                          className={cn("min-h-11 rounded-lg border text-sm font-semibold disabled:opacity-40",
                            s?.esito === e.key && !s?.sostitutivo ? SCELTA[e.key] : "bg-background")}>
                          {e.etichetta}
                        </button>
                      ))}
                    </div>
                  )}
                  {c.problemi > 0 && (
                    <button type="button" aria-pressed={!!s?.sostitutivo} onClick={() => s?.sostitutivo ? setSpunte(({ [p.poi_id]: _t, ...r }) => r) : pezzoGiusto(p)}
                      className={cn("min-h-11 w-full rounded-lg border text-sm font-semibold", s?.sostitutivo ? SCELTA.arrivata : "bg-background")}>
                      È arrivato il pezzo sostitutivo
                    </button>
                  )}
                </>
              )}

              {s && (
                <div className="space-y-2">
                  {Number(p.quantita) > 1 && (
                    <label className="flex items-center justify-between gap-2 text-sm">
                      <span>Quanti{p.unita && p.unita !== "pz" ? ` ${p.unita}` : " pezzi"}</span>
                      <input inputMode="decimal" value={s.quantita} onChange={e => cambia(p.poi_id, { quantita: e.target.value })}
                        aria-label={`Quanti pezzi per ${nome}`} className="h-11 w-20 rounded-lg border bg-background px-2 text-center text-base" />
                    </label>
                  )}
                  {conProblema && (
                    <>
                      <input value={s.nota} onChange={e => cambia(p.poi_id, { nota: e.target.value })} placeholder="Cosa c'è che non va"
                        aria-label={`Nota per ${nome}`} className="h-11 w-full rounded-lg border bg-background px-3 text-base" />
                      <div className="flex flex-wrap items-center gap-2">
                        <label className={cn("flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-semibold", fotoInCorso === p.poi_id && "opacity-60")}>
                          {fotoInCorso === p.poi_id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Camera className="h-4 w-4" aria-hidden="true" />}
                          Foto
                          <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={fotoInCorso === p.poi_id}
                            onChange={e => { void aggiungiFoto(p, e.target.files?.[0]); e.target.value = ""; }} />
                        </label>
                        {s.foto.length > 0 && <span className="text-sm text-muted-foreground">{s.foto.length === 1 ? "1 foto" : `${s.foto.length} foto`}</span>}
                      </div>
                    </>
                  )}
                  {proposta && (
                    <label className="flex min-h-11 items-center gap-2 rounded-lg bg-muted/50 px-2 text-sm">
                      <input type="checkbox" className="h-5 w-5" checked={s.collega} onChange={e => cambia(p.poi_id, { collega: e.target.checked })} />
                      <span className="min-w-0">Sulla bolla: riga {proposta.posizione}, {proposta.descrizione}</span>
                    </label>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {articoli_normali > 0 && !inCantiere && (
        <p className="flex items-start gap-2 rounded-xl border p-3 text-sm text-muted-foreground">
          <PackageX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {articoli_normali === 1 ? "1 articolo normale di questo ordine" : `${articoli_normali} articoli normali di questo ordine`} si registra dall'arrivo merce dell'ordine e va in magazzino come sempre.
        </p>
      )}

      {elenco.data.puo_riordinare && <ArrivoProblemi elenco={elenco.data} />}

      {quanteSpunte > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:rounded-xl sm:border">
          <div className="mx-auto flex max-w-xl items-center gap-2">
            <button type="button" aria-label="Annulla le spunte" onClick={() => setSpunte({})} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <button type="button" disabled={registra.isPending || !!fotoInCorso} onClick={salva}
              className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-base font-bold text-white disabled:opacity-60">
              {registra.isPending && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
              {quanteSpunte === 1 ? "Salva 1 posizione" : `Salva ${quanteSpunte} posizioni`}
            </button>
          </div>
        </div>
      )}

      {inCantiere && <Link to="/campo/merce" className="block py-2 text-center text-sm text-primary underline">Torna a Merce presa</Link>}
    </div>
  );
}
