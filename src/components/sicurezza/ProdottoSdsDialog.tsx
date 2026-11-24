import { UniformSelect } from "@/components/ui/uniform-select";
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
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
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
  const t = useT();
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
          : t("Salvataggio non confermato. I dati sono conservati."),
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
          : t("Fonti non disponibili. I dati inseriti sono conservati."),
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
              ? t("Rettifica impiego del prodotto")
              : t("Registra prodotto e impiego")}
          </DialogTitle>
          <DialogDescription>{t("Collega il prodotto reale alla sua SDS. Una scheda generica non copre gli altri prodotti. Contesto di lettura: {data}.", { data: String(base.ambito.data ?? "") })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto pr-1">
          <fieldset disabled={bloccato} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="sds-materiale">{t("Materiale di origine")}</Label>
                <UniformSelect
                  id="sds-materiale"
                  className={cls}
                  value={dati.materiale_id || ""}
                  disabled={!!prodotto}
                  onChange={(e) => selezionaMateriale(e.target.value)}
                >
                  <option value="">{t("Prodotto non presente nella distinta")}</option>
                  {dati.materiale_id && !origine && (
                    <option value={dati.materiale_id}>
                      {t("Origine non più disponibile")}
                    </option>
                  )}
                  {fonti.materiali.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                      {m.codice ? ` · ${m.codice}` : ""} · {m.id.slice(0, 8)}
                    </option>
                  ))}
                </UniformSelect>
              </div>
              <div>
                <Label htmlFor="sds-impresa">
                  {t("Impresa che impiega il prodotto")}
                </Label>
                <UniformSelect
                  id="sds-impresa"
                  className={cls}
                  value={dati.subappaltatore_id || ""}
                  disabled={!!prodotto}
                  onChange={(e) => {
                    cambia("subappaltatore_id", e.target.value || null);
                    selezionaDocumento("");
                  }}
                >
                  <option value="">{t("La propria impresa")}</option>
                  {fonti.imprese.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.ragione_sociale}
                    </option>
                  ))}
                </UniformSelect>
              </div>
            </div>
            {dati.materiale_id &&
              origine?.impronta !== dati.materiale_impronta && (
                <div className="rounded border border-amber-300 p-2">
                  <p role="alert" className="text-sm">
                    {t("Il materiale di origine è cambiato o è stato rimosso. La descrizione inserita non viene sovrascritta.")}
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
                      {t("Conferma la fonte materiale riletta")}
                    </Button>
                  )}
                </div>
              )}
            <div className="grid gap-3 sm:grid-cols-2">
              {testo("nome", t("Nome commerciale del prodotto"))}
              {testo("produttore", t("Produttore / fabbricante"))}
              {testo("codice", t("Codice prodotto / identificazione"))}
              {testo("area", t("Area di impiego"))}
            </div>
            <div>
              <Label htmlFor="sds-impiego">{t("Impiego nella lavorazione")}</Label>
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
                <Label htmlFor="sds-fase">{t("Fase di impiego")}</Label>
                <UniformSelect
                  id="sds-fase"
                  className={cls}
                  value={dati.fase_id || ""}
                  onChange={(e) => {
                    cambia("fase_id", e.target.value || null);
                    selezionaDocumento("");
                  }}
                >
                  <option value="">{t("Comune a più fasi")}</option>
                  {base.fasi.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </UniformSelect>
              </div>
              {testo("dal", t("Impiego dal"), "date")}
              {testo("al", t("Impiego fino al"), "date")}
            </div>
            <div>
              <Label htmlFor="sds-necessaria">
                {t("SDS necessaria per questo prodotto?")}
              </Label>
              <UniformSelect
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
                <option value="da_valutare">{t("Da valutare")}</option>
                <option value="si">{t("Sì, raccogliere e riesaminare la SDS")}</option>
                <option value="no">{t("No, con motivazione")}</option>
              </UniformSelect>
            </div>
            {dati.sds_necessaria === "no" && (
              <div>
                <Label htmlFor="sds-non-necessaria">
                  {t("Motivo per cui la SDS non è necessaria")}
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
              <Label htmlFor="sds-documento">{t("SDS dal fascicolo")}</Label>
              <UniformSelect
                id="sds-documento"
                className={cls}
                value={dati.evidenza_id || ""}
                onChange={(e) => selezionaDocumento(e.target.value)}
              >
                <option value="">{t("Nessuna SDS collegata")}</option>
                {dati.evidenza_id && !documento && (
                  <option value={dati.evidenza_id} disabled>
                    {t("Riferimento precedente da riesaminare")}
                  </option>
                )}
                {documenti.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.titolo} {t("· rev.")} {e.revisione || t("non indicata")} ·{" "}
                    {e.file_name}
                  </option>
                ))}
              </UniformSelect>
              {documento && (
                <p className="text-xs text-muted-foreground">
                  {t("Revisione {revisione} · rilascio {rilascio}", { revisione: documento.revisione || t("non indicata"), rilascio: documento.data_rilascio || t("non indicato") })} {t("· stato")}{" "}
                  {documento.stato}
                  {documento.data_scadenza
                    ? t(" · scadenza {data_scadenza}", { data_scadenza: String(documento.data_scadenza ?? "") })
                    : ""}
                </p>
              )}
              {documento && documento.impronta !== dati.evidenza_impronta && (
                <div>
                  <p role="alert" className="text-sm text-amber-800">
                    {t("La SDS è cambiata. Riesamina la versione prima di confermare il collegamento.")}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => selezionaDocumento(documento.id)}
                  >
                    {t("Usa la versione SDS riletta")}
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
                {t("Ho controllato che questa versione della SDS corrisponda al prodotto identificato.")}
              </label>
              <p className="text-xs text-muted-foreground">
                {t("Carica prima il file nel fascicolo documenti come Scheda di sicurezza prodotto, indicando revisione e data. Sono proposti solo file della stessa impresa e del contesto pertinente. Nessuna scadenza viene calcolata automaticamente.")}
              </p>
            </div>
            <div>
              <Label htmlFor="sds-note">{t("Note tecniche")}</Label>
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
                {t("Annulla questa registrazione, conservando lo storico")}
              </label>
            )}
            <div>
              <Label htmlFor="sds-motivo">
                {t("Motivo della registrazione o rettifica")}
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
            {legge ? t("Rilettura…") : t("Rileggi materiali e SDS")}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t("La rilettura conserva i dati inseriti e non aggiorna la versione iniziale della registrazione. La corrispondenza va riesaminata: il collegamento non è una valutazione del rischio chimico.")}
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
            {t("Annulla")}
          </Button>
          <Button disabled={bloccato} onClick={() => void registra()}>
            {salva.isPending ? t("Salvataggio…") : t("Salva impiego")}
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
  const t = useT();
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
          <DialogTitle>{t("Storico del prodotto")}</DialogTitle>
          <DialogDescription>{t("{nome}. Versioni registrate, non ricalcolate con i dati attuali.", { nome: String(prodotto.nome ?? "") })}</DialogDescription>
        </DialogHeader>
        {q.isLoading ? (
          <p>{t("Caricamento…")}</p>
        ) : q.isError ? (
          <div role="alert">
            {t("Storico non disponibile.")}
            <Button variant="link" onClick={() => void q.refetch()}>
              {t("Riprova")}
            </Button>
          </div>
        ) : !q.data?.length ? (
          <p>{t("Nessun evento disponibile.")}</p>
        ) : (
          q.data.map((e) => (
            <article key={e.id} className="space-y-1 rounded-lg border p-3">
              <p className="text-sm font-medium">{t("Versione {versione} · {valore}", { versione: String(e.versione ?? ""), valore: new Date(e.registrato_il).toLocaleString(intlCampo()) })}</p>
              <p className="text-sm">{e.motivo}</p>
              <p className="break-all text-xs text-muted-foreground">{t("Autore: {registrato_da}", { registrato_da: String(e.registrato_da ?? "") })}</p>
              {(
                [
                  ["Prima", e.prima],
                  ["Dopo", e.dopo],
                ] as const
              ).map(([titolo, v]) => (
                <div key={titolo} className="text-sm">
                  <p className="font-medium">{t(titolo)}</p>
                  {v ? (
                    <>
                      <p>
                        {v.nome} · {v.produttore || t("Produttore non indicato")} ·{" "}
                        {v.codice || t("Codice non indicato")}
                      </p>
                      <p>
                        {v.impiego} · {v.dal} — {v.al || t("senza fine indicata")}
                        {v.annullato ? ` ${t("· annullato")}` : ""}
                      </p>
                      <p>
                        {t("SDS:")} {v.sds_necessaria} ·{" "}
                        {v.evidenza_snapshot?.titolo || t("nessun collegamento")} {t("· revisione")}{" "}
                        {v.evidenza_snapshot?.revisione || t("non indicata")}
                      </p>
                      <p>{v.motivo_non_necessaria || v.note}</p>
                    </>
                  ) : (
                    <p>{t("Nuova registrazione")}</p>
                  )}
                </div>
              ))}
            </article>
          ))
        )}
        <Button variant="outline" onClick={onClose}>
          {t("Chiudi storico")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
