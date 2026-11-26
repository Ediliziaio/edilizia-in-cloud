/**
 * «Oggi» in cima all'app di cantiere (26/09/2026): dove vai, cosa fai, con chi
 * e chi chiamare. Le date sono le TUE (seguono le fasi e la squadra), non
 * quelle di tutta la commessa. Sotto, il prossimo giorno di lavoro.
 *
 * Collaudo 23/11/2026 («più ordinata e omogenea»): forme a pillola come il resto dell'app, testi sulla scala
 * 15/14/13/12/11 (`stileCampo`), «Da fare oggi» anche quando l'ufficio non ha dato le fasi a te (si guardano quelle
 * aperte del cantiere), e al capo quanti della squadra sono già in cantiere.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Camera, ChevronRight, FilePenLine, MapPin, Navigation, Package, Phone, Receipt, Users } from "lucide-react";
import { ScattaFoto } from "@/components/campo/ScattaFoto";
import { Skeleton } from "@/components/ui/skeleton";
import { UniformSelect } from "@/components/ui/uniform-select";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDaFareOggi } from "@/hooks/campo/useDaFareOggi";
import type { DaFareOggi } from "@/lib/campo/daFareOggi";
import { CHIP, PILLOLA, PILLOLA_PICCOLA, PILLOLA_TENUE, TITOLO_RIQUADRO } from "@/lib/campo/stileCampo";
import { dateFnsCampo, useT } from "@/lib/campo/lingua/LinguaCampo";
import {
  linkMappa, linkTelefono, useMiaGiornata,
  type CantiereDelGiorno, type Contatto,
} from "@/hooks/campo/useCampoGiornata";

const giornoLungo = (g: string) => format(parseISO(g), "EEEE d MMMM", { locale: dateFnsCampo() });

function Chiama({ ruolo, contatto }: { ruolo: string; contatto: Contatto }) {
  const t = useT();
  const tel = linkTelefono(contatto.telefono);
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="min-w-0 text-sm">
        <span className="text-muted-foreground">{t(ruolo)}: </span>
        <span className="font-semibold">{contatto.nome}</span>
      </p>
      {tel && (
        <a href={tel} className={cn(PILLOLA_PICCOLA, "shrink-0")} aria-label={t("Chiama {nome}", { nome: contatto.nome })}>
          <Phone className="h-3.5 w-3.5" aria-hidden="true" />{t("Chiama")}
        </a>
      )}
    </div>
  );
}

/** Le azioni occasionali: un cerchio con l'icona e la parola sotto, come la barra in basso. */
const TESSERA = "flex min-h-[60px] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-0.5 text-[12px] font-semibold text-foreground active:bg-muted";
const CERCHIO = "flex size-10 items-center justify-center rounded-full border bg-background";

/** Quanti della mia squadra sono in cantiere: la stessa lettura (e la stessa chiave) della pagina «Squadra di oggi». */
function ContaSquadra({ orderId }: { orderId: string }) {
  const t = useT();
  const { user, profile, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? profile?.company_id;
  const q = useQuery({
    queryKey: ["campo-squadra-oggi", orderId, companyId, user?.id],
    staleTime: 60_000,
    queryFn: async (): Promise<{ in_cantiere: boolean }[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("campo_squadra_oggi", { p_order_id: orderId });
      if (error) throw error;
      return (data ?? []) as { in_cantiere: boolean }[];
    },
  });
  if (!q.data?.length) return null;
  const dentro = q.data.filter(r => r.in_cantiere).length;
  return <span className="text-[13px] font-normal">· {t("{dentro} di {totale} in cantiere", { dentro, totale: q.data.length })}</span>;
}

/*
 * Codice e ruolo in alto, il nome del cantiere una volta sola (prima titolo e indirizzo si ripetevano), cosa c'è da
 * fare oggi, due azioni grandi a pillola (Rapportino, Portami lì) e le occasionali come icone tonde. Il pulsante
 * pieno della Home resta la timbratura.
 */
function SchedaCantiere({ c, giorno, puoPrelevare, nomeNellaTendina, daFare }: {
  c: CantiereDelGiorno; giorno: string; puoPrelevare: boolean; nomeNellaTendina: boolean; daFare?: DaFareOggi;
}) {
  const t = useT();
  const mappa = linkMappa(c.indirizzo);
  const caposquadra = !!c.squadra?.sono_caposquadra;
  const vedeSquadra = c.sono_capocantiere || caposquadra;
  // Le MIE fasi di oggi se l'ufficio le ha date; altrimenti quelle aperte del cantiere.
  const fasi = c.fasi.length > 0 ? c.fasi : daFare?.fasi ?? [];
  const titolo = c.titolo || c.codice || t("Cantiere");
  return (
    <div className="space-y-3 rounded-2xl border bg-background p-3">
      <Link to={`/campo/lavoro/${c.order_id}`} aria-label={t("Apri il cantiere {nome}", { nome: titolo }).trim()}
        className="-m-1 flex min-h-11 items-start gap-2 rounded-xl p-1 active:bg-muted">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            {c.codice && <span className="text-xs font-semibold text-muted-foreground">{c.codice}</span>}
            {c.sono_capocantiere && <span className={cn(CHIP, "bg-primary/10 text-primary")}>{t("Capocantiere")}</span>}
            {caposquadra && <span className={cn(CHIP, "bg-orange-100 text-orange-800")}>{t("Caposquadra")}</span>}
          </span>
          {!nomeNellaTendina && <span dir="auto" className="mt-0.5 line-clamp-2 block text-[15px] font-bold leading-snug">{titolo}</span>}
          {c.indirizzo && (
            <span className="mt-0.5 flex items-center gap-1 text-[13px] text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" /><span dir="auto" className="truncate">{c.indirizzo}</span>
            </span>
          )}
        </span>
        <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
      </Link>

      {fasi.length > 0 && (
        <div className="rounded-xl bg-muted/50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("Da fare oggi")}</p>
          <ul className="mt-0.5 space-y-0.5">
            {fasi.map(f => <li key={f} dir="auto" className="text-sm font-semibold leading-snug">{f}</li>)}
          </ul>
          {daFare && daFare.totali > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">{t("{fatte} di {totali} fasi finite", { fatte: daFare.fatte, totali: daFare.totali })}</p>
          )}
        </div>
      )}

      <div className={cn("grid gap-2", mappa ? "grid-cols-2" : "grid-cols-1")} aria-label={t("Azioni per il cantiere")}>
        <Link to={`/campo/lavoro/${c.order_id}/rapportino?data=${giorno}`} className={cn(PILLOLA_TENUE, "min-h-12")}>
          <FilePenLine className="size-4 shrink-0" aria-hidden="true" />{t("Rapportino")}
        </Link>
        {mappa && (
          <a href={mappa} target="_blank" rel="noopener noreferrer" className={cn(PILLOLA, "min-h-12")}>
            <Navigation className="size-4 shrink-0" aria-hidden="true" />{t("Portami lì")}
          </a>
        )}
      </div>
      <div className={cn("grid gap-1", puoPrelevare ? "grid-cols-4" : "grid-cols-3")}>
        <ScattaFoto orderId={c.order_id} nomeCantiere={c.codice ?? c.titolo ?? undefined} className={TESSERA}>
          <span className={CERCHIO}><Camera className="size-[18px]" aria-hidden="true" /></span>{t("Foto")}
        </ScattaFoto>
        <Link to={`/campo/ddt?order=${c.order_id}`} className={TESSERA}>
          <span className={CERCHIO}><Receipt className="size-[18px]" aria-hidden="true" /></span>{t("Bolla")}
        </Link>
        <Link to={`/campo/ticket/nuovo/${c.order_id}`} className={TESSERA}>
          <span className={CERCHIO}><AlertCircle className="size-[18px]" aria-hidden="true" /></span>{t("Segnala")}
        </Link>
        {puoPrelevare && <Link to={`/campo/magazzino?order_id=${c.order_id}`} className={TESSERA}>
          <span className={CERCHIO}><Package className="size-[18px]" aria-hidden="true" /></span>{t("Prelievo")}
        </Link>}
      </div>

      {(c.squadra?.caposquadra || (!c.sono_capocantiere && c.capocantiere)) && (
        <div className="space-y-2 border-t pt-2">
          {c.squadra?.caposquadra && <Chiama ruolo="Caposquadra" contatto={c.squadra.caposquadra} />}
          {!c.sono_capocantiere && c.capocantiere && <Chiama ruolo="Capocantiere" contatto={c.capocantiere} />}
        </div>
      )}

      {vedeSquadra ? (
        <Link to={`/campo/squadra/${c.order_id}`}
          className="flex min-h-11 items-center gap-2 rounded-full bg-orange-50 px-4 text-sm font-semibold text-orange-800 active:bg-orange-100">
          <Users className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{t("Chi c'è oggi")} <ContaSquadra orderId={c.order_id} /></span>
          <ChevronRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
        </Link>
      ) : c.squadra && (
        <p className="flex items-center gap-1.5 text-[13px]">
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.squadra.colore ?? "#94a3b8" }} aria-hidden="true" />
          <span className="text-muted-foreground">{t("Squadra")}:</span> <span className="font-semibold">{c.squadra.nome}</span>
        </p>
      )}
    </div>
  );
}

function CantieriOggi({ cantieri, giorno, memoria, puoPrelevare, daFare }: {
  cantieri: CantiereDelGiorno[];
  giorno: string;
  memoria?: string;
  puoPrelevare: boolean;
  daFare: Map<string, DaFareOggi>;
}) {
  const t = useT();
  const chiave = memoria ? `campo-cantiere-oggi:${memoria}` : null;
  const [scelta, setScelta] = useState(() => {
    try {
      const salvata = chiave ? localStorage.getItem(chiave) : null;
      return salvata?.startsWith(`${giorno}:`) ? salvata.slice(giorno.length + 1) : "";
    } catch { return ""; }
  });
  const cantiere = cantieri.find(c => c.order_id === scelta) ?? cantieri[0];

  return <>
    {cantieri.length > 1 && (
      <UniformSelect aria-label={t("Cantiere di oggi")} value={cantiere.order_id}
        onChange={event => {
          const id = event.target.value;
          setScelta(id);
          try { if (chiave) localStorage.setItem(chiave, `${giorno}:${id}`); } catch { /* La scelta rimane nella pagina. */ }
        }} className="min-h-11 w-full rounded-full bg-background px-4 text-left text-sm font-semibold">
        {cantieri.map(c => <option key={c.order_id} value={c.order_id}>
          {[c.codice, c.titolo || c.indirizzo].filter(Boolean).join(" · ") || "Cantiere"}
        </option>)}
      </UniformSelect>
    )}
    <SchedaCantiere key={cantiere.order_id} c={cantiere} giorno={giorno} puoPrelevare={puoPrelevare}
      nomeNellaTendina={cantieri.length > 1} daFare={daFare.get(cantiere.order_id)} />
  </>;
}

export function CampoOggi({ memoria, puoPrelevare = false }: { memoria?: string; puoPrelevare?: boolean } = {}) {
  const t = useT();
  const { data, isLoading, isError, refetch } = useMiaGiornata(14);
  const giorni = data?.giorni ?? [];
  const oggi = giorni[0];
  const prossimo = giorni.slice(1).find((g) => g.cantieri.length > 0);
  const contattiDiOggi = new Set((oggi?.cantieri ?? []).flatMap(c => [c.squadra?.caposquadra?.nome, c.capocantiere?.nome]).filter((n): n is string => !!n));
  const daFare = useDaFareOggi([...(oggi?.cantieri ?? []), ...(prossimo?.cantieri ?? [])].map(c => c.order_id));

  if (isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (isError) {
    return (
      <section className="rounded-2xl border bg-background p-4 text-sm">
        {t("Non riesco a leggere dove lavori oggi.")}{" "}
        <button type="button" className="font-semibold text-primary underline" onClick={() => refetch()}>{t("Riprova")}</button>
      </section>
    );
  }

  // Senza nessun cantiere con le date, il riquadro non serve: resta l'elenco dei cantieri.
  if (!oggi || (oggi.cantieri.length === 0 && !prossimo)) return null;

  return (
    <section aria-labelledby="campo-oggi" className="space-y-3 rounded-2xl border border-blue-100 bg-blue-50/50 p-3 shadow-sm md:p-4">
      {/* La data è già in cima alla Home: qui non si ripete. */}
      <h2 id="campo-oggi" className={TITOLO_RIQUADRO}>{t("Oggi")}</h2>

      {oggi.cantieri.length === 0 ? (
        <p className="rounded-2xl border bg-background p-3 text-sm text-muted-foreground">{t("Oggi non hai cantieri in programma.")}</p>
      ) : (
        <CantieriOggi key={`${memoria ?? ""}:${oggi.giorno}`} cantieri={oggi.cantieri} giorno={oggi.giorno} memoria={memoria}
          puoPrelevare={puoPrelevare} daFare={daFare} />
      )}

      {prossimo && (
        <div className="rounded-2xl border bg-background/80 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {prossimo === giorni[1] ? t("Domani") : <span className="capitalize">{giornoLungo(prossimo.giorno)}</span>}
          </p>
          {/* Domani nello stesso posto di oggi: una riga, non la scheda ripetuta. */}
          {prossimo === giorni[1] && prossimo.cantieri.every(c => oggi.cantieri.some(o => o.order_id === c.order_id))
            ? <p className="py-1 text-sm">{prossimo.cantieri.length === 1 ? t("Stesso cantiere di oggi") : t("Stessi cantieri di oggi")}</p>
            : prossimo.cantieri.map((c) => {
            const fasi = c.fasi.length > 0 ? c.fasi : daFare.get(c.order_id)?.fasi ?? [];
            // Domani in un posto nuovo: dove, con chi, chi chiamare (piano campo completo, 1.2 — 26/11/2026).
            const mappa = linkMappa(c.indirizzo);
            return (
              <div key={c.order_id} className="space-y-1.5 pb-1">
                <Link to={`/campo/lavoro/${c.order_id}`} className="-mx-1 mt-0.5 flex min-h-11 items-center gap-2 rounded-xl px-1 active:bg-muted">
                  <span className="min-w-0 flex-1">
                    <span dir="auto" className="block truncate text-sm font-semibold">{[c.codice, c.titolo].filter(Boolean).join(" · ") || t("Cantiere")}</span>
                    {fasi.length > 0 && <span dir="auto" className="block truncate text-xs text-muted-foreground">{fasi.join(", ")}</span>}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
                </Link>
                {c.indirizzo && (
                  <div className="flex items-center justify-between gap-2">
                    <p dir="auto" className="flex min-w-0 items-center gap-1.5 text-sm">
                      <MapPin className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="truncate">{c.indirizzo}</span>
                    </p>
                    {mappa && (
                      <a href={mappa} target="_blank" rel="noopener noreferrer" className={cn(PILLOLA_PICCOLA, "shrink-0")}>
                        <Navigation className="h-3.5 w-3.5" aria-hidden="true" />{t("Mappa")}
                      </a>
                    )}
                  </div>
                )}
                {c.squadra && (
                  <p dir="auto" className="flex items-center gap-1.5 text-sm">
                    <Users className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="text-muted-foreground">{t("Squadra")}:</span> <span className="font-semibold">{c.squadra.nome}</span>
                  </p>
                )}
                {/* Chi chiamare, solo se non è già nella scheda di oggi qui sopra. */}
                {c.squadra?.caposquadra && !c.squadra.sono_caposquadra && !contattiDiOggi.has(c.squadra.caposquadra.nome)
                  && <Chiama ruolo="Caposquadra" contatto={c.squadra.caposquadra} />}
                {!c.sono_capocantiere && c.capocantiere && !contattiDiOggi.has(c.capocantiere.nome)
                  && <Chiama ruolo="Capocantiere" contatto={c.capocantiere} />}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
