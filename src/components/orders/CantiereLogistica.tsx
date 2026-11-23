/**
 * «Il cantiere» in cima a «Lavori e squadre» (26/09/2026, richiesta del
 * founder): dove si trova, quanta strada c'è dalla sede (km e tempo, con le
 * indicazioni), e i mezzi e gli attrezzi legati al cantiere — quelli che ci
 * stanno e quelli di chi ci lavora. Dal 05/10 anche i ponteggi (e le altre
 * attrezzature a quantità) montati qui: si portano sul cantiere a m² o a pezzi.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Layers, MapPin, Navigation, Pencil, Plus, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { CampoIndirizzo } from "@/components/shared/CampoIndirizzo";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { supabase } from "@/integrations/supabase/client";
import { geocodeBestEffort } from "@/lib/geo/geocodeBestEffort";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompanyBase } from "@/hooks/useCompanyBase";
import { useDistanzeCantieri } from "@/hooks/useDistanzaCantieri";
import { useAssegnaMezzoACommessa, useMezzi, useMezziDisponibilita, useMontaQuantita } from "@/hooks/useMezzi";
import { formatQuantita, numeroLetto, unitaBreve } from "@/types/mezzi";
import { usePermissions } from "@/hooks/usePermissions";
import {
  durataViaggio, linkIndicazioni, mezziLavoroKey, useIndirizzoCantiere, useMezziLavoro, type IndirizzoCantiere,
} from "@/hooks/useCantiereLogistica";
import { AZIONE_TENUE } from "@/lib/manodopera/colori";
import { cn } from "@/lib/utils";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const kmIt = (n: number) => n.toLocaleString(intlCampo(), { maximumFractionDigits: 1 });

function MettiMezzoDialog({ orderId, aperto, onAperto, giaQui }: {
  orderId: string;
  aperto: boolean;
  onAperto: (v: boolean) => void;
  giaQui: Set<string>;
}) {
  const t = useT();
  const qc = useQueryClient();
  const { data: mezzi = [] } = useMezzi();
  const { data: disponibilita } = useMezziDisponibilita();
  const assegna = useAssegnaMezzoACommessa();
  const monta = useMontaQuantita();
  const [scelto, setScelto] = useState("");
  const [quantita, setQuantita] = useState("");
  // I ponteggi (a quantità) si montano a m² o a pezzi, e solo se ne resta in magazzino.
  const scegliibili = mezzi.filter((m) =>
    m.gestione === "quantita"
      ? (disponibilita?.get(m.id)?.disponibile ?? Number(m.quantita_totale ?? 0)) > 0
      : !giaQui.has(m.id) && !m.su_mezzo_id);
  const sceltoInfo = mezzi.find((m) => m.id === scelto);
  const aQuantita = sceltoInfo?.gestione === "quantita";
  const libero = sceltoInfo ? disponibilita?.get(sceltoInfo.id)?.disponibile ?? Number(sceltoInfo.quantita_totale ?? 0) : 0;
  const n = numeroLetto(quantita);
  const quantitaValida = !aQuantita || (n != null && n > 0 && n <= libero);
  const occupato = assegna.isPending || monta.isPending;
  const dove = (m: (typeof mezzi)[number]) =>
    m.gestione === "quantita"
      ? t("{quantita} in magazzino", { quantita: formatQuantita(disponibilita?.get(m.id)?.disponibile ?? m.quantita_totale, m.unita_misura) })
      : m.assegnato_commessa ? t("ora su {commessa}", { commessa: m.assegnato_commessa }) : m.assegnato_persona ? t("con {persona}", { persona: m.assegnato_persona }) : t("in sede");

  const chiudi = () => {
    setScelto("");
    setQuantita("");
    onAperto(false);
  };

  const conferma = () => {
    if (!scelto || !quantitaValida) return;
    if (aQuantita) {
      monta.mutate({ mezzoId: scelto, order_id: orderId, quantita: n! }, { onSuccess: chiudi });
      return;
    }
    assegna.mutate({ mezzoId: scelto, orderId }, {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: mezziLavoroKey(orderId) });
        chiudi();
      },
    });
  };

  return (
    <Dialog open={aperto} onOpenChange={(o) => { if (!occupato) { onAperto(o); if (!o) { setScelto(""); setQuantita(""); } } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Porta un mezzo o un attrezzo sul cantiere")}</DialogTitle>
          <DialogDescription>{t("Da oggi risulta qui: lo vedi nel mezzo e nel diario del giorno.")}</DialogDescription>
        </DialogHeader>
        <Select value={scelto} onValueChange={(v) => { setScelto(v); setQuantita(""); }}>
          <SelectTrigger aria-label={t("Mezzo o attrezzo")}><SelectValue placeholder={t("Scegli…")} /></SelectTrigger>
          <SelectContent>
            {scegliibili.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.nome}{m.targa ? ` · ${m.targa}` : ""} — {dove(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {aQuantita && sceltoInfo && (
          <div className="space-y-1.5">
            <Label htmlFor="logistica-quantita">{t("Quanto ne monti qui ({unita})", { unita: unitaBreve(sceltoInfo.unita_misura) })}</Label>
            <Input
              id="logistica-quantita"
              inputMode="decimal"
              value={quantita}
              onChange={(e) => setQuantita(e.target.value)}
              placeholder={t("al massimo {quantita}", { quantita: formatQuantita(libero, sceltoInfo.unita_misura) })}
              aria-invalid={n != null && n > libero}
            />
            {n != null && n > libero && (
              <p className="text-xs text-red-700">{t("In magazzino ce ne sono {quantita}.", { quantita: formatQuantita(libero, sceltoInfo.unita_misura) })}</p>
            )}
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onAperto(false)} disabled={occupato}>{t("Annulla")}</Button>
          <Button
            className={AZIONE_TENUE.mezzo}
            variant="outline"
            disabled={!scelto || !quantitaValida || (aQuantita && !quantita.trim()) || occupato}
            onClick={conferma}
          >
            {aQuantita ? t("Segna il montaggio") : t("Porta sul cantiere")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModificaIndirizzo({ orderId, indirizzo, onClose }: { orderId: string; indirizzo?: IndirizzoCantiere; onClose: () => void }) {
  const t = useT();
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  const [testo, setTesto] = useState(indirizzo?.indirizzo ?? "");
  const [punto, setPunto] = useState<{ testo: string; lat: number; lng: number } | null>(null);
  const salva = useMutation({
    mutationFn: async () => {
      const valore = testo.trim();
      const coord = punto?.testo === valore ? punto
        : valore === indirizzo?.indirizzo && indirizzo.lat != null && indirizzo.lng != null ? { lat: indirizzo.lat, lng: indirizzo.lng }
        : await geocodeBestEffort([valore]);
      const percorsoCambiato = valore !== indirizzo?.indirizzo ||
        (coord?.lat ?? null) !== indirizzo?.lat || (coord?.lng ?? null) !== indirizzo?.lng;
      let query = supabase.from("orders").update({
        work_address: valore, indirizzo_lavori: valore, work_lat: coord?.lat ?? null, work_lng: coord?.lng ?? null,
        ...(percorsoCambiato ? { distanza_sede_km: null, distanza_sede_minuti: null, distanza_sede_il: null } : {}),
      }).eq("company_id", companyId!).eq("id", orderId).is("deleted_at", null);
      if (indirizzo?.versione != null) query = query.eq("version", indirizzo.versione);
      const { data, error } = await query.select("id").maybeSingle();
      if (error) throw Error(error.message);
      if (!data) throw Error(t("I dati della commessa sono aggiornati da un’altra sessione. Chiudi e riapri l’indirizzo."));
    },
    onError: () => { void qc.invalidateQueries({ queryKey: ["cantiere-indirizzo", orderId] }); },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["cantiere-indirizzo", orderId] });
      void qc.invalidateQueries({ queryKey: ["distanza-cantieri"], predicate: q => String(q.queryKey[1]).split(",").includes(orderId) });
      void qc.invalidateQueries({ queryKey: ["order", orderId] });
      void qc.invalidateQueries({ queryKey: ["orders"] });
      toast.success(t("Indirizzo del cantiere salvato"));
      onClose();
    },
  });
  return <Dialog open onOpenChange={open => { if (!open && !salva.isPending) onClose(); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("Indirizzo del cantiere")}</DialogTitle>
        <DialogDescription>{t("Scegli un risultato per impostare anche la posizione sulla mappa.")}</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (companyId && testo.trim() && !salva.isPending) salva.mutate(); }}>
        <div className="space-y-1">
          <Label htmlFor="logistica-indirizzo">{t("Via, civico e comune")}</Label>
          <CampoIndirizzo id="logistica-indirizzo" value={testo} onChange={setTesto}
            onScegli={a => { setTesto(a.testo); setPunto(a.lat != null && a.lng != null ? { testo: a.testo, lat: a.lat, lng: a.lng } : null); }}
            maxLength={250} />
        </div>
        {salva.isError && <p role="alert" className="text-sm text-destructive">{salva.error.message}</p>}
        <DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={salva.isPending}>{t("Annulla")}</Button>
          <Button type="submit" disabled={!companyId || !testo.trim() || salva.isPending}>{salva.isPending ? t("Salvataggio…") : t("Salva indirizzo")}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

export function CantiereLogistica({ orderId, showSiteEquipment = true }: { orderId: string; showSiteEquipment?: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const perms = usePermissions();
  const puoMezzi = (perms.canEditMezzi || perms.isAdmin) && !perms.solaLettura;
  const vedeMezzi = perms.canViewMezzi === true || perms.isAdmin;
  const sede = useCompanyBase();
  const indirizzo = useIndirizzoCantiere(orderId);
  const cantiere = indirizzo.data;
  const distanze = useDistanzeCantieri([orderId]);
  const { data: mezzi } = useMezziLavoro(orderId);
  const togli = useAssegnaMezzoACommessa();
  const [aperto, setAperto] = useState(false);
  const [modificaIndirizzo, setModificaIndirizzo] = useState(false);

  const strada = distanze.data?.[orderId];
  const indicazioni = linkIndicazioni(sede, cantiere);
  const tempo = durataViaggio(strada?.minuti);
  const sulCantiere = mezzi?.sul_cantiere ?? [];
  const montati = mezzi?.montati ?? [];
  // Con le persone: solo chi lavora su tutta la commessa; quelli di una fase
  // stanno dentro la fase.
  const conTutti = (mezzi?.con_le_persone ?? []).filter((m) => m.fasi === null);

  return (
    <section aria-label={t("Indirizzo e indicazioni")} className="space-y-2.5 rounded-xl border bg-background p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 grow basis-full items-start gap-2 sm:basis-56">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{t("Indirizzo del cantiere")}</h3>
            {indirizzo.isError ? <p role="alert" className="text-sm text-muted-foreground">{t("Indirizzo non disponibile.")} <button type="button" onClick={() => void indirizzo.refetch()} className="underline">{t("Riprova")}</button></p>
              : <p dir="auto" className="mt-0.5 break-words text-sm">{indirizzo.isPending ? t("Carico l’indirizzo…") : cantiere?.indirizzo ?? t("Da inserire")}</p>}
            {cantiere?.indirizzo && <p className="mt-1 text-xs tabular-nums text-muted-foreground">
              {strada ? <>{t("Stima dalla sede")} · <b className="font-medium text-foreground">{kmIt(strada.km)} km{tempo && ` · ${tempo}`}</b> {t("di sola andata")}</>
                : !sede ? t("Imposta la sede operativa per stimare la distanza.")
                  : cantiere.lat == null || cantiere.lng == null ? t("Imposta la posizione sulla mappa per stimare la distanza.")
                    : distanze.isFetching ? t("Calcolo il percorso dalla sede…") : t("Stima del percorso non disponibile.")}
            </p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {perms.canEditOrders && !perms.solaLettura && indirizzo.isSuccess && (
            <Button size="sm" variant={cantiere?.indirizzo ? "outline" : "default"} onClick={() => setModificaIndirizzo(true)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden />{cantiere?.indirizzo ? t("Modifica indirizzo") : t("Inserisci indirizzo")}
            </Button>
          )}
          {indicazioni && <Button asChild size="sm" variant="outline">
            <a href={indicazioni} target="_blank" rel="noopener noreferrer">
              <Navigation className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />{t("Indicazioni")}
            </a>
          </Button>}
        </div>
      </div>
      {modificaIndirizzo && <ModificaIndirizzo orderId={orderId} indirizzo={cantiere} onClose={() => setModificaIndirizzo(false)} />}

      {((showSiteEquipment && (sulCantiere.length > 0 || montati.length > 0 || puoMezzi)) || conTutti.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 border-t pt-2.5">
          <Truck className="mr-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{showSiteEquipment ? t("Mezzi e attrezzi") : t("Al seguito della squadra")}</span>
          {sulCantiere.length === 0 && montati.length === 0 && conTutti.length === 0 && (
            <span className="text-xs text-muted-foreground">{t("nessuno sul cantiere")}</span>
          )}
          {(showSiteEquipment ? sulCantiere : []).map((m) => (
            <span key={m.id} className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs", AZIONE_TENUE.mezzo)}>
              <b className="font-semibold">{m.nome}</b>{m.targa && <span className="opacity-80">{m.targa}</span>}
              <span className="opacity-80">· {t("sul cantiere")}</span>
              {puoMezzi && (
                <button
                  type="button"
                  className="-mr-1 ml-0.5 rounded-full p-0.5 hover:bg-teal-200/60"
                  aria-label={t("Togli {nome} dal cantiere", { nome: m.nome })}
                  disabled={togli.isPending}
                  onClick={() => togli.mutate({ mezzoId: m.id, orderId: null }, {
                    onSuccess: () => void qc.invalidateQueries({ queryKey: mezziLavoroKey(orderId) }),
                  })}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
            </span>
          ))}
          {(showSiteEquipment ? montati : []).map((g) => {
            const testo = <><b className="font-semibold">{g.nome}</b><span className="opacity-80">· {t("{quantita} montati", { quantita: formatQuantita(g.quantita, g.unita) })}</span></>;
            return vedeMezzi ? (
              <Link
                key={g.id}
                to={`/azienda/mezzi/${g.mezzo_id}`}
                className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs hover:underline", AZIONE_TENUE.mezzo)}
                title={t("Montaggi e rientri dalla scheda dell'attrezzatura")}
              >
                <Layers className="h-3 w-3" aria-hidden="true" />{testo}
              </Link>
            ) : (
              <span key={g.id} className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs", AZIONE_TENUE.mezzo)}>
                <Layers className="h-3 w-3" aria-hidden="true" />{testo}
              </span>
            );
          })}
          {conTutti.map((m) => (
            <span key={m.id} className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs">
              <b className="font-semibold">{m.nome}</b>
              <span className="text-muted-foreground">· {m.persona}{m.a_bordo.length > 0 ? `, ${t("con {persona}", { persona: m.a_bordo.join(", ") })}` : ""}</span>
            </span>
          ))}
          {puoMezzi && showSiteEquipment && (
            <Button size="sm" variant="outline" className={cn("h-7 rounded-full px-2.5 text-xs", AZIONE_TENUE.mezzo)} onClick={() => setAperto(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />{t("Mezzo o attrezzo")}
            </Button>
          )}
        </div>
      )}

      {puoMezzi && aperto && (
        <MettiMezzoDialog orderId={orderId} aperto={aperto} onAperto={setAperto} giaQui={new Set(sulCantiere.map((m) => m.id))} />
      )}
    </section>
  );
}
