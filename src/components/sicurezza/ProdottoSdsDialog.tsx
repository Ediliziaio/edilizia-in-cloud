import { useState } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useSalvaProdottoSds,
  useStoricoProdottoSds,
  leggiProdottiSds,
  type AmbitoProdottiSds,
} from "@/hooks/useProdottiSds";
import {
  vuotoProdottoSds,
  datiProdottoSds,
  erroriProdottoSds,
  documentiSdsPertinenti,
  type QuadroProdottiSds,
  type ImpiegoProdottoSds,
  type MaterialeSds,
  type DatiProdottoSds,
} from "@/lib/sicurezza/prodottiSds";
import type { FaseFascicolo } from "@/lib/sicurezza/fascicolo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
const cls = "w-full rounded-md border bg-background p-2 text-sm";
export function ModuloProdotto({
  ambito,
  quadro,
  prodotto,
  materiale,
  fasi,
  onClose,
}: {
  ambito: AmbitoProdottiSds;
  quadro: QuadroProdottiSds;
  prodotto?: ImpiegoProdottoSds;
  materiale?: MaterialeSds;
  fasi: FaseFascicolo[];
  onClose: () => void;
}) {
  const [base] = useState(() => structuredClone({ ambito, prodotto, fasi }));
  const [fonti, setFonti] = useState(() => structuredClone(quadro));
  const [id] = useState(() => prodotto?.id || crypto.randomUUID());
  const [request, setRequest] = useState(() => crypto.randomUUID());
  const [dati, setDati] = useState<DatiProdottoSds>(() =>
    prodotto
      ? datiProdottoSds(prodotto)
      : {
          ...vuotoProdottoSds(ambito.data, ambito.faseId),
          ...(materiale
            ? {
                materiale_id: materiale.id,
                materiale_impronta: materiale.impronta,
                nome: materiale.nome,
                codice: materiale.codice || "",
                fase_id: materiale.fase_id,
              }
            : {}),
        },
  );
  const [errore, setErrore] = useState("");
  const [legge, setLegge] = useState(false);
  const [erroreFonti, setErroreFonti] = useState("");
  const salva = useSalvaProdottoSds(base.ambito);
  const p = usePermissions();
  const bloccato =
    salva.isPending || legge || !p.canViewSicurezzaCantiere || p.solaLettura;
  const cambia = <K extends keyof DatiProdottoSds>(
    k: K,
    v: DatiProdottoSds[K],
  ) => {
    setDati((d) => ({
      ...d,
      [k]: v,
      ...(["nome", "produttore", "codice", "fase_id"].includes(k)
        ? { corrispondenza_confermata: false }
        : {}),
    }));
    setRequest(crypto.randomUUID());
    setErrore("");
  };
  const selezionaMateriale = (val: string) => {
    const m = fonti.materiali.find((m) => m.id === val);
    setDati((d) => ({
      ...d,
      materiale_id: m?.id || null,
      materiale_impronta: m?.impronta || null,
      nome: m?.nome || "",
      codice: m?.codice || "",
      fase_id: m?.fase_id || base.ambito.faseId || null,
      produttore: "",
      evidenza_id: null,
      evidenza_impronta: null,
      corrispondenza_confermata: false,
    }));
    setRequest(crypto.randomUUID());
    setErrore("");
  };
  const documenti = documentiSdsPertinenti(
    fonti.documenti,
    dati,
    base.ambito.data,
  );
  const documento = documenti.find((e) => e.id === dati.evidenza_id);
  const origine = fonti.materiali.find((m) => m.id === dati.materiale_id);
  const selezionaDocumento = (id: string) => {
    const e = documenti.find((e) => e.id === id);
    setDati((d) => ({
      ...d,
      evidenza_id: id || null,
      evidenza_impronta: e?.impronta || null,
      corrispondenza_confermata: false,
    }));
    setRequest(crypto.randomUUID());
    setErrore("");
  };
  const registra = async () => {
    if (bloccato) return;
    const e = erroriProdottoSds(dati);
    if (e.length) {
      setErrore(e.join(" "));
      return;
    }
    try {
      await salva.mutateAsync({
        id,
        versione: base.prodotto?.versione ?? null,
        requestId: request,
        dati,
      });
      onClose();
    } catch (e) {
      setErrore(
        e instanceof Error
          ? e.message
          : "Salvataggio non confermato. I dati sono conservati.",
      );
    }
  };
  const rileggi = async () => {
    if (bloccato) return;
    setLegge(true);
    setErroreFonti("");
    try {
      setFonti(await leggiProdottiSds(base.ambito));
    } catch (e) {
      setErroreFonti(
        e instanceof Error
          ? e.message
          : "Fonti non disponibili. I dati inseriti sono conservati.",
      );
    } finally {
      setLegge(false);
    }
  };
  const testo = (
    k: "nome" | "produttore" | "codice" | "area" | "dal" | "al",
    label: string,
    tipo = "text",
  ) => (
    <div>
      <Label htmlFor={`sds-${k}`}>{label}</Label>
      <Input
        id={`sds-${k}`}
        type={tipo}
        maxLength={tipo === "text" ? 250 : undefined}
        value={dati[k]}
        onChange={(e) => cambia(k, e.target.value)}
      />
    </div>
  );
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !salva.isPending) onClose();
      }}
    >
      <DialogContent className="flex max-h-[92dvh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {prodotto
              ? "Rettifica impiego del prodotto"
              : "Registra prodotto e impiego"}
          </DialogTitle>
          <DialogDescription>
            Collega il prodotto reale alla sua SDS. Una scheda generica non
            copre gli altri prodotti. Contesto di lettura: {base.ambito.data}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto pr-1">
          <fieldset disabled={bloccato} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="sds-materiale">Materiale di origine</Label>
                <select
                  id="sds-materiale"
                  className={cls}
                  value={dati.materiale_id || ""}
                  disabled={!!prodotto}
                  onChange={(e) => selezionaMateriale(e.target.value)}
                >
                  <option value="">Prodotto non presente nella distinta</option>
                  {dati.materiale_id && !origine && (
                    <option value={dati.materiale_id}>
                      Origine non più disponibile
                    </option>
                  )}
                  {fonti.materiali.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                      {m.codice ? ` · ${m.codice}` : ""} · {m.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="sds-impresa">
                  Impresa che impiega il prodotto
                </Label>
                <select
                  id="sds-impresa"
                  className={cls}
                  value={dati.subappaltatore_id || ""}
                  disabled={!!prodotto}
                  onChange={(e) => {
                    cambia("subappaltatore_id", e.target.value || null);
                    selezionaDocumento("");
                  }}
                >
                  <option value="">La propria impresa</option>
                  {fonti.imprese.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.ragione_sociale}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {dati.materiale_id &&
              origine?.impronta !== dati.materiale_impronta && (
                <div className="rounded border border-amber-300 p-2">
                  <p role="alert" className="text-sm">
                    Il materiale di origine è cambiato o è stato rimosso. La
                    descrizione inserita non viene sovrascritta.
                  </p>
                  {origine && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        cambia("materiale_impronta", origine.impronta);
                        cambia("corrispondenza_confermata", false);
                      }}
                    >
                      Conferma la fonte materiale riletta
                    </Button>
                  )}
                </div>
              )}
            <div className="grid gap-3 sm:grid-cols-2">
              {testo("nome", "Nome commerciale del prodotto")}
              {testo("produttore", "Produttore / fabbricante")}
              {testo("codice", "Codice prodotto / identificazione")}
              {testo("area", "Area di impiego")}
            </div>
            <div>
              <Label htmlFor="sds-impiego">Impiego nella lavorazione</Label>
              <textarea
                id="sds-impiego"
                className={cls}
                rows={2}
                maxLength={2000}
                value={dati.impiego}
                onChange={(e) => cambia("impiego", e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="sds-fase">Fase di impiego</Label>
                <select
                  id="sds-fase"
                  className={cls}
                  value={dati.fase_id || ""}
                  onChange={(e) => {
                    cambia("fase_id", e.target.value || null);
                    selezionaDocumento("");
                  }}
                >
                  <option value="">Comune a più fasi</option>
                  {base.fasi.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              {testo("dal", "Impiego dal", "date")}
              {testo("al", "Impiego fino al", "date")}
            </div>
            <div>
              <Label htmlFor="sds-necessaria">
                SDS necessaria per questo prodotto?
              </Label>
              <select
                id="sds-necessaria"
                className={cls}
                value={dati.sds_necessaria}
                onChange={(e) =>
                  cambia(
                    "sds_necessaria",
                    e.target.value as DatiProdottoSds["sds_necessaria"],
                  )
                }
              >
                <option value="da_valutare">Da valutare</option>
                <option value="si">Sì, raccogliere e riesaminare la SDS</option>
                <option value="no">No, con motivazione</option>
              </select>
            </div>
            {dati.sds_necessaria === "no" && (
              <div>
                <Label htmlFor="sds-non-necessaria">
                  Motivo per cui la SDS non è necessaria
                </Label>
                <textarea
                  id="sds-non-necessaria"
                  className={cls}
                  maxLength={2000}
                  value={dati.motivo_non_necessaria}
                  onChange={(e) =>
                    cambia("motivo_non_necessaria", e.target.value)
                  }
                />
              </div>
            )}
            <div className="space-y-2 rounded-lg border p-3">
              <Label htmlFor="sds-documento">SDS dal fascicolo</Label>
              <select
                id="sds-documento"
                className={cls}
                value={dati.evidenza_id || ""}
                onChange={(e) => selezionaDocumento(e.target.value)}
              >
                <option value="">Nessuna SDS collegata</option>
                {dati.evidenza_id && !documento && (
                  <option value={dati.evidenza_id} disabled>
                    Riferimento precedente da riesaminare
                  </option>
                )}
                {documenti.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.titolo} · rev. {e.revisione || "non indicata"} ·{" "}
                    {e.file_name}
                  </option>
                ))}
              </select>
              {documento && (
                <p className="text-xs text-muted-foreground">
                  Revisione {documento.revisione || "non indicata"} · rilascio{" "}
                  {documento.data_rilascio || "non indicato"} · stato{" "}
                  {documento.stato}
                  {documento.data_scadenza
                    ? ` · scadenza ${documento.data_scadenza}`
                    : ""}
                </p>
              )}
              {documento && documento.impronta !== dati.evidenza_impronta && (
                <div>
                  <p role="alert" className="text-sm text-amber-800">
                    La SDS è cambiata. Riesamina la versione prima di confermare
                    il collegamento.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => selezionaDocumento(documento.id)}
                  >
                    Usa la versione SDS riletta
                  </Button>
                </div>
              )}
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={dati.corrispondenza_confermata}
                  disabled={
                    !documento || documento.impronta !== dati.evidenza_impronta
                  }
                  onChange={(e) =>
                    cambia("corrispondenza_confermata", e.target.checked)
                  }
                />
                Ho controllato che questa versione della SDS corrisponda al
                prodotto identificato.
              </label>
              <p className="text-xs text-muted-foreground">
                Carica prima il file nel fascicolo documenti come Scheda di
                sicurezza prodotto, indicando revisione e data. Sono proposti
                solo file della stessa impresa e del contesto pertinente.
                Nessuna scadenza viene calcolata automaticamente.
              </p>
            </div>
            <div>
              <Label htmlFor="sds-note">Note tecniche</Label>
              <textarea
                id="sds-note"
                className={cls}
                rows={2}
                maxLength={2000}
                value={dati.note}
                onChange={(e) => cambia("note", e.target.value)}
              />
            </div>
            {prodotto && (
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={dati.annullato}
                  onChange={(e) => cambia("annullato", e.target.checked)}
                />
                Annulla questa registrazione, conservando lo storico
              </label>
            )}
            <div>
              <Label htmlFor="sds-motivo">
                Motivo della registrazione o rettifica
              </Label>
              <textarea
                id="sds-motivo"
                className={cls}
                rows={2}
                maxLength={2000}
                value={dati.motivo}
                onChange={(e) => cambia("motivo", e.target.value)}
              />
            </div>
          </fieldset>
          <Button
            variant="outline"
            size="sm"
            disabled={bloccato}
            onClick={() => void rileggi()}
          >
            {legge ? "Rilettura…" : "Rileggi materiali e SDS"}
          </Button>
          <p className="text-xs text-muted-foreground">
            La rilettura conserva i dati inseriti e non aggiorna la versione
            iniziale della registrazione. La corrispondenza va riesaminata: il
            collegamento non è una valutazione del rischio chimico.
          </p>
          {erroreFonti && (
            <p role="alert" className="text-sm text-destructive">
              {erroreFonti}
            </p>
          )}
          {errore && (
            <p role="alert" className="text-sm text-destructive">
              {errore}
            </p>
          )}
        </div>
        <DialogFooter className="border-t pt-3">
          <Button
            variant="outline"
            disabled={salva.isPending}
            onClick={onClose}
          >
            Annulla
          </Button>
          <Button disabled={bloccato} onClick={() => void registra()}>
            {salva.isPending ? "Salvataggio…" : "Salva impiego"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
export function StoricoProdotto({
  ambito,
  prodotto,
  onClose,
}: {
  ambito: AmbitoProdottiSds;
  prodotto: ImpiegoProdottoSds;
  onClose: () => void;
}) {
  const q = useStoricoProdottoSds(ambito, prodotto.id);
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Storico del prodotto</DialogTitle>
          <DialogDescription>
            {prodotto.nome}. Versioni registrate, non ricalcolate con i dati
            attuali.
          </DialogDescription>
        </DialogHeader>
        {q.isLoading ? (
          <p>Caricamento…</p>
        ) : q.isError ? (
          <div role="alert">
            Storico non disponibile.
            <Button variant="link" onClick={() => void q.refetch()}>
              Riprova
            </Button>
          </div>
        ) : !q.data?.length ? (
          <p>Nessun evento disponibile.</p>
        ) : (
          q.data.map((e) => (
            <article key={e.id} className="space-y-1 rounded-lg border p-3">
              <p className="text-sm font-medium">
                Versione {e.versione} ·{" "}
                {new Date(e.registrato_il).toLocaleString("it-IT")}
              </p>
              <p className="text-sm">{e.motivo}</p>
              <p className="break-all text-xs text-muted-foreground">
                Autore: {e.registrato_da}
              </p>
              {(
                [
                  ["Prima", e.prima],
                  ["Dopo", e.dopo],
                ] as const
              ).map(([titolo, v]) => (
                <div key={titolo} className="text-sm">
                  <p className="font-medium">{titolo}</p>
                  {v ? (
                    <>
                      <p>
                        {v.nome} · {v.produttore || "Produttore non indicato"} ·{" "}
                        {v.codice || "Codice non indicato"}
                      </p>
                      <p>
                        {v.impiego} · {v.dal} — {v.al || "senza fine indicata"}
                        {v.annullato ? " · annullato" : ""}
                      </p>
                      <p>
                        SDS: {v.sds_necessaria} ·{" "}
                        {v.evidenza_snapshot?.titolo || "nessun collegamento"} ·
                        revisione{" "}
                        {v.evidenza_snapshot?.revisione || "non indicata"}
                      </p>
                      <p>{v.motivo_non_necessaria || v.note}</p>
                    </>
                  ) : (
                    <p>Nuova registrazione</p>
                  )}
                </div>
              ))}
            </article>
          ))
        )}
        <Button variant="outline" onClick={onClose}>
          Chiudi storico
        </Button>
      </DialogContent>
    </Dialog>
  );
}
