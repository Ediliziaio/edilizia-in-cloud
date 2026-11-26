/**
 * Un intervento breve dal telefono (26/11/2026, richiesta del founder): la manutenzione di oggi, a passi semplici.
 * Prima: cosa fare, cliente (chiama), dove (portami lì), impianto, materiale. Poi «Inizio intervento». Poi foto,
 * note, ore, materiale usato, firma del cliente (facoltativa o obbligatoria: lo decide l'azienda) e «Intervento
 * finito». Alla fine: il prossimo intervento del giorno. Niente fasi, squadre o rapportino: sono dei cantieri.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Camera, CheckCircle2, Loader2, MapPin, Navigation, Package, PenLine, Phone, Play, Wrench, X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FirmaDito } from "@/components/campo/FirmaDito";
import { compressImage } from "@/lib/campo/compressImage";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import {
  dbInterventi, giornoRoma, interventoFatto, interventoIniziato, linkMappa, oraRoma, prossimoIntervento, spostaGiorno,
  useMieiInterventi, useRapportiIntervento, type InterventoCampo,
} from "@/lib/campo/interventi";

const BUCKET = "campo-foto";
const oggiRoma = () => giornoRoma(new Date().toISOString());

interface FotoLocale { path: string; anteprima: string }

export default function CampoIntervento() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const t = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  // Un mese prima e dopo: l'intervento aperto da una notifica o dal calendario può non essere di oggi.
  const oggi = oggiRoma();
  const lista = useMieiInterventi(spostaGiorno(oggi, -31), spostaGiorno(oggi, 31));
  const intervento = useMemo(() => (lista.data ?? []).find(i => i.id === ticketId) ?? null, [lista.data, ticketId]);

  if (lista.isLoading) return <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-muted-foreground" aria-label={t("Carico…")} /></div>;
  if (!intervento) {
    return (
      <div className="mx-auto max-w-md space-y-3 p-6 text-center">
        <p className="font-semibold">{t("Intervento non trovato")}</p>
        <p className="text-sm text-muted-foreground">{t("Non è più assegnato a te, oppure è stato annullato. Chiedi all'ufficio.")}</p>
        <Button onClick={() => navigate("/campo")}>{t("Torna alla Home")}</Button>
      </div>
    );
  }
  return <Dettaglio key={intervento.id} intervento={intervento} tutti={lista.data ?? []} userId={user?.id ?? ""}
    aggiorna={() => { void qc.invalidateQueries({ queryKey: ["campo-interventi"] }); void qc.invalidateQueries({ queryKey: ["campo-intervento-rapporti"] }); void qc.invalidateQueries({ queryKey: ["campo-miei-interventi"] }); }} />;
}

function Dettaglio({ intervento: i, tutti, userId, aggiorna }: { intervento: InterventoCampo; tutti: InterventoCampo[]; userId: string; aggiorna: () => void }) {
  const t = useT();
  const fatto = interventoFatto(i);
  const iniziato = interventoIniziato(i);
  const [foto, setFoto] = useState<FotoLocale[]>([]);
  const [caricoFoto, setCaricoFoto] = useState(false);
  const [note, setNote] = useState("");
  const [ore, setOre] = useState(i.durata_stimata_h ? String(i.durata_stimata_h) : "");
  const [materiali, setMateriali] = useState("");
  const [firma, setFirma] = useState<string | null>(null);
  const [firmaAperta, setFirmaAperta] = useState(false);
  const [nomeFirma, setNomeFirma] = useState(i.cliente?.nome ?? "");
  const [appenaFinito, setAppenaFinito] = useState(false);
  const prossimo = prossimoIntervento(tutti, i.id);

  // Le anteprime locali si liberano solo uscendo dalla pagina (non a ogni foto aggiunta).
  const fotoRef = useRef(foto); fotoRef.current = foto;
  useEffect(() => () => fotoRef.current.forEach(f => URL.revokeObjectURL(f.anteprima)), []);
  const cartella = `${userId}/interventi/${i.id}/`;

  const inizia = useMutation({
    mutationFn: async () => {
      const { error } = await dbInterventi().rpc("campo_intervento_inizia", { p_ticket: i.id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success(t("Intervento iniziato")); aggiorna(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("Non sono riuscito a salvare: riprova.")),
  });

  const aggiungiFoto = async (files: FileList | null) => {
    if (!files?.length) return;
    setCaricoFoto(true);
    try {
      for (const f of Array.from(files).slice(0, 20 - foto.length)) {
        const blob = await compressImage(f).catch(() => f);
        const path = `${cartella}${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
        if (error) throw error;
        setFoto(prev => [...prev, { path, anteprima: URL.createObjectURL(blob) }]);
      }
    } catch {
      toast.error(t("Non riesco a caricare la foto. Controlla la rete e riprova."));
    } finally { setCaricoFoto(false); }
  };

  const chiudi = useMutation({
    mutationFn: async () => {
      let firmaPath: string | null = null;
      if (firma) {
        const blob = await (await fetch(firma)).blob();
        firmaPath = `${cartella}firma-${crypto.randomUUID()}.png`;
        const { error } = await supabase.storage.from(BUCKET).upload(firmaPath, blob, { contentType: "image/png", upsert: false });
        if (error) throw new Error(t("Non riesco a salvare la firma. Controlla la rete e riprova."));
      }
      const oreNum = ore.trim() ? Number(ore.replace(",", ".")) : null;
      const { error } = await dbInterventi().rpc("campo_intervento_chiudi", {
        p_ticket: i.id, p_note: note, p_ore: Number.isFinite(oreNum) ? oreNum : null, p_materiali: materiali,
        p_foto: foto.map(f => f.path), p_firma_path: firmaPath, p_firma_nome: firma ? nomeFirma : null,
        p_senza_firma_motivo: null,
        // La firma va anche nel rapportino d'intervento, come quella dell'area tecnico (immagine piccola).
        p_firma_png: firma ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { setAppenaFinito(true); toast.success(t("Intervento finito. L'ufficio è avvisato.")); aggiorna(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("Non sono riuscito a salvare: riprova.")),
  });

  const manca = i.firma_obbligatoria && !firma;
  const quando = giornoRoma(i.quando) === oggiRoma() ? t("Oggi alle {ora}", { ora: oraRoma(i.quando) })
    : `${new Date(i.quando).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · ${oraRoma(i.quando)}`;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-3 pb-28">
      <div className="flex items-start gap-2">
        {/* La freccia «indietro» c'è già nella barra in alto. */}
        <div className="min-w-0 flex-1 pt-1">
          <p className="text-xs font-semibold text-muted-foreground">{quando}{i.tipo_intervento ? ` · ${i.tipo_intervento}` : ""}</p>
          <h1 dir="auto" className="text-[17px] font-black leading-tight">{i.titolo ?? t("Intervento")}</h1>
        </div>
        <span className={cn("mt-1 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
          fatto ? "bg-emerald-100 text-emerald-800" : iniziato ? "bg-blue-100 text-blue-800" : "bg-muted text-muted-foreground")}>
          {fatto ? t("Fatto") : iniziato ? t("In corso") : t("Da fare")}
        </span>
      </div>

      {/* 1. Prima di partire: chi, dove, cosa. */}
      <section className="space-y-3 rounded-2xl border bg-background p-3">
        {i.descrizione && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("Cosa fare")}</p>
            <p dir="auto" className="mt-0.5 whitespace-pre-line text-sm">{i.descrizione}</p>
          </div>
        )}
        {(i.cliente?.nome || i.indirizzo) && (
          <div className="space-y-1">
            {i.cliente?.nome && <p dir="auto" className="text-sm font-semibold">{i.cliente.nome}</p>}
            {i.indirizzo && <p className="flex items-start gap-1 text-sm text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{i.indirizzo}</p>}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {i.cliente?.telefono
            ? <Button asChild variant="outline" className="h-11"><a href={`tel:${i.cliente.telefono.replace(/\s+/g, "")}`}><Phone className="mr-1.5 size-4" />{t("Chiama")}</a></Button>
            // Il numero non c'è, o l'azienda non lo dà a tutti (26/11/2026): si chiede all'ufficio.
            : <Button variant="outline" className="h-11" disabled><Phone className="mr-1.5 size-4" />{t("Numero all'ufficio")}</Button>}
          {i.indirizzo
            ? <Button asChild variant="outline" className="h-11"><a href={linkMappa(i.indirizzo)} target="_blank" rel="noreferrer"><Navigation className="mr-1.5 size-4" />{t("Portami lì")}</a></Button>
            : <Button variant="outline" className="h-11" disabled><Navigation className="mr-1.5 size-4" />{t("Senza indirizzo")}</Button>}
        </div>
        {i.impianto && (
          <div className="rounded-xl bg-muted/60 p-2.5 text-sm">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground"><Wrench className="size-3.5" aria-hidden="true" />{t("Impianto")}</p>
            <p dir="auto" className="mt-0.5 font-semibold">{[i.impianto.marca, i.impianto.modello].filter(Boolean).join(" ") || i.impianto.tipo}</p>
            <p className="text-xs text-muted-foreground">
              {[i.impianto.matricola && t("Matricola {n}", { n: i.impianto.matricola }),
                i.impianto.installato && t("Installato il {data}", { data: new Date(i.impianto.installato).toLocaleDateString() })].filter(Boolean).join(" · ")}
            </p>
            {i.impianto.note && <p dir="auto" className="mt-1 text-xs text-muted-foreground">{i.impianto.note}</p>}
          </div>
        )}
        {i.merce_richiesta && (
          <p className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-950">
            <Package className="size-4 shrink-0" aria-hidden="true" />
            {i.merce_stato === "arrivata" ? t("Il materiale è arrivato: passa a prenderlo.") : t("Serve materiale: chiedi all'ufficio se è arrivato.")}
          </p>
        )}
        {i.order_code && i.order_id && <Link to={`/campo/lavoro/${i.order_id}`} className="block text-xs font-semibold text-primary">{t("Apri il cantiere {codice}", { codice: i.order_code })}</Link>}
      </section>

      {/* 2. Arrivato: inizio. */}
      {!fatto && !iniziato && (
        <Button className="h-14 w-full text-base" disabled={inizia.isPending} onClick={() => inizia.mutate()}>
          {inizia.isPending ? <Loader2 className="mr-2 size-5 animate-spin" /> : <Play className="mr-2 size-5" />}{t("Sono arrivato: inizio intervento")}
        </Button>
      )}

      {/* 3-4. Durante e fine. */}
      {!fatto && iniziato && !appenaFinito && (
        <section className="space-y-3 rounded-2xl border bg-background p-3">
          <div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{t("Foto")} <span className="font-normal text-muted-foreground">· {t("prima e dopo")}</span></p>
              <label className={cn("inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm font-semibold text-primary active:bg-muted", caricoFoto && "pointer-events-none opacity-60")}>
                {caricoFoto ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}{t("Scatta")}
                <input type="file" accept="image/*" multiple className="hidden" onChange={e => { void aggiungiFoto(e.target.files); e.target.value = ""; }} />
              </label>
            </div>
            {foto.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {foto.map(f => (
                  <div key={f.path} className="relative">
                    <img src={f.anteprima} alt={t("Foto dell'intervento")} className="size-16 rounded-lg border object-cover" />
                    <button type="button" aria-label={t("Togli foto")} onClick={() => setFoto(prev => prev.filter(x => x.path !== f.path))}
                      className="tap-compact absolute -right-2 -top-2 flex size-7 items-center justify-center rounded-full bg-background shadow ring-1 ring-border"><X className="size-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-1">
            <label htmlFor="int-note" className="text-sm font-semibold">{t("Cosa hai fatto")}</label>
            <Textarea id="int-note" rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder={t("Es. pulito il bruciatore, sostituita la guarnizione.")} />
          </div>
          <div className="grid grid-cols-[110px_1fr] gap-2">
            <div className="grid gap-1">
              <label htmlFor="int-ore" className="text-sm font-semibold">{t("Ore")}</label>
              <Input id="int-ore" inputMode="decimal" value={ore} onChange={e => setOre(e.target.value)} placeholder="1,5" />
            </div>
            <div className="grid gap-1">
              <label htmlFor="int-mat" className="text-sm font-semibold">{t("Materiale usato")}</label>
              <Input id="int-mat" value={materiali} onChange={e => setMateriali(e.target.value)} placeholder={t("facoltativo")} />
            </div>
          </div>

          <div className="space-y-2 rounded-xl border p-2.5">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><PenLine className="size-4" aria-hidden="true" />
              {t("Firma del cliente")} <span className={cn("text-xs font-normal", i.firma_obbligatoria ? "text-red-700" : "text-muted-foreground")}>
                · {i.firma_obbligatoria ? t("obbligatoria") : t("facoltativa")}</span></p>
            {firma ? (
              <div className="flex items-center gap-2">
                <img src={firma} alt={t("Firma del cliente")} className="h-14 rounded border bg-white" />
                <Button type="button" variant="ghost" size="sm" onClick={() => setFirma(null)}>{t("Rifai")}</Button>
              </div>
            ) : firmaAperta ? (
              <FirmaDito onConferma={png => { setFirma(png); setFirmaAperta(false); }} onAnnulla={() => setFirmaAperta(false)} />
            ) : (
              <Button type="button" variant="outline" className="h-11 w-full" onClick={() => setFirmaAperta(true)}>{t("Fai firmare il cliente")}</Button>
            )}
            {(firma || firmaAperta) && (
              <Input aria-label={t("Nome di chi firma")} value={nomeFirma} onChange={e => setNomeFirma(e.target.value)} placeholder={t("Nome di chi firma")} />
            )}
          </div>

          <Button className="h-14 w-full text-base" disabled={chiudi.isPending || caricoFoto || manca || firmaAperta} onClick={() => chiudi.mutate()}>
            {chiudi.isPending ? <Loader2 className="mr-2 size-5 animate-spin" /> : <CheckCircle2 className="mr-2 size-5" />}{t("Intervento finito")}
          </Button>
          {/* Firma disegnata ma non confermata: non si chiude, altrimenti si perderebbe senza dirlo. */}
          {firmaAperta ? <p className="text-center text-xs text-amber-800">{t("Prima tocca «Conferma» sotto la firma, oppure «Annulla».")}</p>
            : manca && <p className="text-center text-xs text-red-700">{t("La tua azienda chiede la firma del cliente per chiudere.")}</p>}
        </section>
      )}

      <RapportiIntervento ticketId={i.id} />

      {/* 5. Fatto: il prossimo. */}
      {(fatto || appenaFinito) && (
        <section className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="flex items-center gap-2 font-semibold text-emerald-900"><CheckCircle2 className="size-5" aria-hidden="true" />{t("Intervento fatto")}</p>
          {prossimo ? (
            <Link to={`/campo/intervento/${prossimo.id}`} className="block rounded-xl border bg-background p-3 active:bg-muted">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("Prossimo")}</p>
              <p className="text-sm font-semibold">{oraRoma(prossimo.quando)} · {prossimo.titolo ?? t("Intervento")}</p>
              {prossimo.indirizzo && <p className="text-xs text-muted-foreground">{prossimo.indirizzo}</p>}
            </Link>
          ) : (
            <p className="text-sm text-emerald-900">{t("Per oggi non hai altri interventi.")}</p>
          )}
        </section>
      )}
    </div>
  );
}

/** I rapportini dell'intervento (26/11/2026): gli stessi che vede l'ufficio, di tutti i tecnici e dell'ufficio. */
function RapportiIntervento({ ticketId }: { ticketId: string }) {
  const t = useT();
  const { data = [] } = useRapportiIntervento(ticketId);
  if (!data.length) return null;
  const quando = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <section aria-labelledby="rapporti-intervento" className="space-y-2 rounded-2xl border bg-background p-3">
      <h2 id="rapporti-intervento" className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("Rapportini dell'intervento")}</h2>
      <ul className="divide-y">
        {data.map(r => (
          <li key={r.id} className="space-y-0.5 py-2 text-sm">
            <p className="text-xs text-muted-foreground">
              {[`#${r.numero}`, r.quando ? quando(r.quando) : null, r.mio ? t("tu") : r.chi,
                r.ore != null ? t("{n} ore", { n: String(r.ore).replace(".", ",") }) : null].filter(Boolean).join(" · ")}
            </p>
            {r.descrizione && <p dir="auto" className="whitespace-pre-line">{r.descrizione}</p>}
            {(r.foto > 0 || r.firmato) && (
              <p className="text-xs text-muted-foreground">
                {[r.foto > 0 ? t("{n} foto", { n: r.foto }) : null, r.firmato ? (r.firmato_da ? t("firmato da {nome}", { nome: r.firmato_da }) : t("firmato dal cliente")) : null].filter(Boolean).join(" · ")}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
