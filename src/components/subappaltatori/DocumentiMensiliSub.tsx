import { UniformSelect } from "@/components/ui/uniform-select";
import { useState } from "react";
import {
  TIPI_MENSILI,
  riepilogoMensili,
  meseFuoriContratto,
  type DocumentoMensile,
  type TipoMensile,
} from "@/lib/sicurezza/documentiMensili";
import { STATO_EVIDENZA, oggiSicurezza } from "@/lib/sicurezza/fascicolo";
import {
  BUCKET_MENSILI,
  caricaMensileSub,
  useMensiliSub,
  useSalvaMensileSub,
  usePreparaMensiliSub,
} from "@/hooks/useDocumentiMensiliSub";
import { apriFileRiservato } from "@/lib/storagePrivato";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Shield } from "lucide-react";
import { toast } from "sonner";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
type Contratto = {
  id: string;
  data_inizio?: string | null;
  data_fine_effettiva?: string | null;
  data_fine_prevista?: string | null;
  stato?: string | null;
  numero_contratto?: string | null;
  order_id?: string | null;
  commessa?: { order_code?: string | null } | null;
};
type Form = Pick<
  DocumentoMensile,
  | "tipo"
  | "contratto_id"
  | "competenza"
  | "stato"
  | "origine_requisito"
  | "riferimento_requisito"
  | "termine"
  | "referente"
  | "note"
> & { id?: string; file_path?: string | null; file_name?: string | null };
export function DocumentiMensiliSub({
  companyId,
  subId,
  contratti,
}: {
  companyId: string;
  subId: string;
  contratti: Contratto[];
}) {
  const t = useT();
  const p = usePermissions();
  const [contrattoId, setContrattoId] = useState(() =>
    contratti.length === 1 ? contratti[0].id : "",
  );
  const [mese, setMese] = useState(() => oggiSicurezza().slice(0, 7));
  const q = useMensiliSub(companyId, subId, contrattoId, mese);
  const salva = useSalvaMensileSub(companyId, subId);
  const prepara = usePreparaMensiliSub(companyId, subId);
  const [form, setForm] = useState<Form | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  if (!p.canViewSubappaltatoriAmministrazione)
    return (
      <p className="rounded-lg border p-4 text-sm text-muted-foreground">
        {t("Serve il permesso Documenti mensili subappaltatori per consultare questo fascicolo riservato.")}
      </p>
    );
  const scrive = !p.solaLettura;
  const correnti = (q.data ?? []).filter((d) => d.stato !== "superato");
  const storico = (q.data ?? []).filter((d) => d.stato === "superato");
  const riepilogo = riepilogoMensili(q.data ?? []);
  const selezionato = contratti.find((c) => c.id === contrattoId);
  const fuoriPeriodo = !!selezionato && meseFuoriContratto(mese, selezionato);
  const apri = (tipo: TipoMensile, d?: DocumentoMensile) => {
    setFile(null);
    setForm(
      d
        ? { ...d }
        : {
            tipo,
            contratto_id: contrattoId,
            competenza: mese,
            stato: "da_richiedere",
            origine_requisito: "da_verificare",
            riferimento_requisito: null,
            termine: null,
            referente: null,
            note: null,
          },
    );
  };
  const campo = (k: keyof Form, v: string) =>
    setForm((f) => (f ? { ...f, [k]: v || null } : f));
  const errore = (e: unknown) =>
    toast.error(
      e instanceof Error ? e.message : t("Operazione non riuscita. Riprova."),
    );
  const salvaForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (form.stato === "non_applicabile" && !form.note?.trim()) {
      toast.error(t("Motiva la non applicabilità per questo contratto e mese."));
      return;
    }
    if (form.stato === "ricevuto" && !form.file_path && !file) {
      toast.error(t("Allega il documento prima di registrarlo come ricevuto."));
      return;
    }
    if (form.stato === "verificato" && !form.file_path) {
      toast.error(t("Carica e salva il documento prima di verificarlo."));
      return;
    }
    setPending(true);
    try {
      const { file_path, file_name, ...resto } = form;
      const row = await salva.mutateAsync({
        ...resto,
        ...(!form.id && file ? { stato: "da_richiedere" as const } : {}),
        ...(form.id && file_path
          ? { file_path, file_name: file?.name ?? file_name }
          : {}),
      });
      setForm((f) => (f ? { ...f, id: row.id } : f));
      let path = file_path;
      if (file && !path) {
        path = await caricaMensileSub(companyId, row.id, file);
        setForm((f) =>
          f ? { ...f, id: row.id, file_path: path, file_name: file.name } : f,
        );
      }
      if (file && path)
        await salva.mutateAsync({
          id: row.id,
          contratto_id: form.contratto_id,
          competenza: form.competenza,
          tipo: form.tipo,
          file_path: path,
          file_name: file.name,
          stato: ["da_richiedere", "richiesto"].includes(form.stato)
            ? "ricevuto"
            : form.stato,
        });
      setForm(null);
      setFile(null);
      toast.success(t("Documento mensile salvato nel fascicolo amministrativo"));
    } catch (e) {
      errore(e);
    } finally {
      setPending(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-4 w-4" />
          {t("Documenti amministrativi mensili")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("Controlli per impresa, contratto e mese. Configura l’applicabilità in base al contratto; queste sei voci dell’Excel non diventano obblighi universali. I file non entrano nel POS.")}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <div>
            <Label htmlFor="mensile-contratto">
              {t("Contratto del subappaltatore")}
            </Label>
            <UniformSelect
              id="mensile-contratto"
              className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={contrattoId}
              onChange={(e) => setContrattoId(e.target.value)}
            >
              <option value="">{t("Scegli il contratto")}</option>
              {contratti.map((c) => (
                <option key={c.id} value={c.id}>
                  {[c.commessa?.order_code, c.numero_contratto]
                    .filter(Boolean)
                    .join(" · ") || t("Contratto {id}", { id: c.id.slice(0, 8) })}
                </option>
              ))}
            </UniformSelect>
          </div>
          <div>
            <Label htmlFor="mensile-mese">{t("Mese di competenza")}</Label>
            <Input
              id="mensile-mese"
              className="mt-1"
              type="month"
              value={mese}
              onChange={(e) => setMese(e.target.value)}
            />
          </div>
        </div>
        {selezionato && (
          <p className="text-xs text-muted-foreground">
            {selezionato.stato ? `${t("Contratto {stato} ·", { stato: String(selezionato.stato ?? "") })} ` : ""}
            {selezionato.data_inizio
              ? t("Dal {data_inizio}", { data_inizio: String(selezionato.data_inizio ?? "") })
              : t("Inizio non indicato")}{" "}
            ·{" "}
            {selezionato.data_fine_effettiva
              ? t("fine effettiva {data_fine_effettiva}", { data_fine_effettiva: String(selezionato.data_fine_effettiva ?? "") })
              : selezionato.data_fine_prevista
                ? t("fine prevista {data_fine_prevista}", { data_fine_prevista: String(selezionato.data_fine_prevista ?? "") })
                : t("fine non indicata")}
          </p>
        )}
        {fuoriPeriodo && (
          <p
            role="status"
            className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
          >
            {t("Il mese scelto è fuori dal periodo contrattuale registrato. Verifica la competenza prima di preparare i controlli; puoi comunque registrare una raccolta retroattiva.")}
          </p>
        )}
        {!contratti.length ? (
          <p className="rounded-lg border border-dashed p-4 text-sm">
            {t("Collega prima un contratto alla commessa dalla scheda Contratti.")}
          </p>
        ) : !contrattoId || !mese ? (
          <p className="text-sm text-muted-foreground">
            {t("Scegli contratto e mese per consultare o preparare i controlli.")}
          </p>
        ) : q.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {t("Fascicolo mensile non disponibile.")}{" "}
            <Button variant="link" onClick={() => void q.refetch()}>
              {t("Riprova")}
            </Button>
          </p>
        ) : q.isLoading ? (
          <p>{t("Caricamento documenti mensili…")}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {t("{configurati}/6 voci configurate · {daConfigurare} da configurare · {verificati} verificate · {aperti} da gestire · {nonApplicabili} non applicabili", { configurati: riepilogo.configurati, daConfigurare: 6 - riepilogo.configurati, verificati: riepilogo.verificati, aperti: riepilogo.aperti, nonApplicabili: riepilogo.nonApplicabili })}
              </p>
              {scrive && correnti.length < 6 && (
                <Button
                  variant="outline"
                  disabled={prepara.isPending}
                  onClick={() =>
                    void prepara
                      .mutateAsync({
                        contrattoId,
                        mese,
                        tipi: (
                          Object.keys(TIPI_MENSILI) as TipoMensile[]
                        ).filter(
                          (tipo) => !correnti.some((d) => d.tipo === tipo),
                        ),
                      })
                      .then(() =>
                        toast.success(
                          t("Voci preparate: nessuna richiesta è stata inviata"),
                        ),
                      )
                      .catch(errore)
                  }
                >
                  {prepara.isPending && (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  )}
                  {t("Prepara le voci dell’Excel")}
                </Button>
              )}
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {(Object.entries(TIPI_MENSILI) as [TipoMensile, string][]).map(
                ([tipo, label]) => {
                  const d = correnti.find((d) => d.tipo === tipo);
                  return (
                    <section key={tipo} className="rounded-lg border p-4">
                      <div className="flex flex-wrap justify-between gap-2">
                        <h3 className="text-sm font-medium">{label}</h3>
                        <Badge variant="outline">
                          {d ? t(STATO_EVIDENZA[d.stato]) : t("Da configurare")}
                        </Badge>
                      </div>
                      {d?.termine && (
                        <p className="mt-2 text-xs text-muted-foreground">{t("Termine: {termine}", { termine: String(d.termine ?? "") })}</p>
                      )}
                      {d?.referente && (
                        <p className="mt-1 text-xs text-muted-foreground">{t("Referente: {referente}", { referente: String(d.referente ?? "") })}</p>
                      )}
                      {d?.verificato_il && (
                        <p className="mt-1 text-xs text-muted-foreground">{t("Verifica registrata il {valore}", { valore: new Date(d.verificato_il).toLocaleString(intlCampo()) })}</p>
                      )}
                      {d?.stato === "non_applicabile" && (
                        <p className="mt-2 text-sm">{d.note}</p>
                      )}
                      <div className="mt-3 flex gap-2">
                        {d?.file_path && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              void apriFileRiservato(
                                BUCKET_MENSILI,
                                d.file_path!,
                              ).catch(errore)
                            }
                          >
                            {t("Apri file")}
                          </Button>
                        )}
                        {scrive && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => apri(tipo, d)}
                          >
                            {d ? t("Gestisci") : t("Configura")}
                          </Button>
                        )}
                      </div>
                    </section>
                  );
                },
              )}
            </div>
            {!!storico.length && (
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm">{t("Versioni superate · {n}", { n: storico.length })}</summary>
                <ul className="mt-2 space-y-2">
                  {storico.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span>
                        {TIPI_MENSILI[d.tipo]} ·{" "}
                        {d.file_name ?? t("Senza allegato")}
                      </span>
                      {d.file_path && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void apriFileRiservato(
                              BUCKET_MENSILI,
                              d.file_path!,
                            ).catch(errore)
                          }
                        >
                          {t("Apri file")}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </CardContent>
      <Dialog
        open={!!form}
        onOpenChange={(o) => !o && !pending && setForm(null)}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form && TIPI_MENSILI[form.tipo]}</DialogTitle>
            <DialogDescription>{t("Competenza {competenza}. La registrazione di una richiesta non invia messaggi. Per sostituire un file conserva la voce come Superato e prepara la nuova evidenza.", { competenza: String(form?.competenza ?? "") })}</DialogDescription>
          </DialogHeader>
          {form && (
            <form onSubmit={salvaForm} className="space-y-3">
              <div>
                <Label htmlFor="mensile-stato">{t("Stato")}</Label>
                <UniformSelect
                  id="mensile-stato"
                  className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm"
                  value={form.stato}
                  onChange={(e) => campo("stato", e.target.value)}
                >
                  {Object.entries(STATO_EVIDENZA).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </UniformSelect>
              </div>
              <div>
                <Label htmlFor="mensile-origine">{t("Origine del requisito")}</Label>
                <UniformSelect
                  id="mensile-origine"
                  className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm"
                  value={form.origine_requisito}
                  onChange={(e) => campo("origine_requisito", e.target.value)}
                >
                  <option value="da_verificare">{t("Da verificare")}</option>
                  <option value="contratto">{t("Contratto / committente")}</option>
                  <option value="interna">{t("Procedura interna")}</option>
                  <option value="normativa">{t("Normativa da indicare")}</option>
                </UniformSelect>
              </div>
              <div>
                <Label htmlFor="mensile-riferimento">
                  {t("Clausola o riferimento")}
                </Label>
                <Input
                  id="mensile-riferimento"
                  value={form.riferimento_requisito ?? ""}
                  onChange={(e) =>
                    campo("riferimento_requisito", e.target.value)
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="mensile-termine">{t("Termine di raccolta")}</Label>
                  <Input
                    id="mensile-termine"
                    type="date"
                    value={form.termine ?? ""}
                    onChange={(e) => campo("termine", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="mensile-referente">{t("Referente")}</Label>
                  <Input
                    id="mensile-referente"
                    value={form.referente ?? ""}
                    onChange={(e) => campo("referente", e.target.value)}
                  />
                </div>
              </div>
              {form.file_path ? (
                <p className="rounded-lg border p-3 text-sm">{t("File conservato: {file_name}", { file_name: String(form.file_name ?? "") })}</p>
              ) : (
                <div>
                  <Label htmlFor="mensile-file">
                    {t("File PDF o immagine (fino a 20 MB)")}
                  </Label>
                  <Input
                    id="mensile-file"
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              )}
              <div>
                <Label htmlFor="mensile-note">
                  {t("Note / motivazione della non applicabilità")}
                </Label>
                <Textarea
                  id="mensile-note"
                  value={form.note ?? ""}
                  onChange={(e) => campo("note", e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => setForm(null)}
                >
                  {t("Annulla")}
                </Button>
                <Button disabled={pending}>
                  {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  {t("Salva documento mensile")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
