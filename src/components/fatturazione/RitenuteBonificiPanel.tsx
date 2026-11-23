import { useState } from "react";
import { Link } from "react-router-dom";
import { useRitenuteBonifici } from "@/hooks/useRitenuteBonifici";
import { useFiscalPeriod } from "@/hooks/useFiscalPeriod";
import { FiscalMetric } from "./FiscalSectionLayout";
import { formatCurrency, formatDateIt } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { RitenutaBonifico } from "@/lib/fatturazione/bonificiParlanti";
import { exportToCSV } from "@/lib/csvExport";
import { RitenuteSubiteFatture } from "./RitenuteSubiteFatture";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export default function RitenuteBonificiPanel() {
  const t = useT();
  const period = useFiscalPeriod(),
    q = useRitenuteBonifici(period.anno);
  const [filter, setFilter] = useState("tutte"),
    [search, setSearch] = useState("");
  const [choice, setChoice] = useState<{
    row: RitenutaBonifico;
    azione: "certifica" | "storna";
  } | null>(null);
  const [reference, setReference] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const first =
    period.tipo === "mensile" ? period.mese : (period.trimestre - 1) * 3 + 1;
  const last = period.tipo === "mensile" ? first : first + 2;
  const entries = (q.data ?? []).filter(
    (r) =>
      Number(r.data_accredito.slice(5, 7)) >= first &&
      Number(r.data_accredito.slice(5, 7)) <= last,
  );
  const active = entries.filter((r) => r.stato !== "stornata");
  const sum = (rows: RitenutaBonifico[]) =>
    rows.reduce((total, r) => total + Number(r.ritenuta), 0);
  const rows = entries.filter(
    (r) =>
      (filter === "tutte" || r.stato === filter) &&
      `${r.numero_fattura} ${r.banca} ${r.riferimento}`
        .toLocaleLowerCase("it")
        .includes(search.toLocaleLowerCase("it")),
  );
  const [page, setPage] = useState(0);
  const current = Math.min(page, Math.max(0, Math.ceil(rows.length / 30) - 1));
  const pick = (row: RitenutaBonifico, azione: "certifica" | "storna") => {
    setChoice({ row, azione });
    setReference("");
    setConfirmed(false);
  };
  return (
    <section className="space-y-4" aria-label={t("Ritenute subite su bonifici")}>
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h3 className="font-semibold">
            {t("Ritenute bancarie sui bonifici parlanti")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("Periodo per data di accredito. Acconti d’imposta subiti, non garanzie contrattuali.")}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/azienda/documenti?tab=incassi">{t("Apri Registro incassi")}</Link>
        </Button>
      </div>
      <p className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-sm">
        {t("Il cliente salda il lordo, in banca entra il netto. Nessun F24 1039 a carico dell’impresa e nessuna compensazione automatica. Il riepilogo va verificato dal commercialista con le certificazioni bancarie.")}
      </p>
      {q.isLoading ? (
        <p role="status">{t("Caricamento registro…")}</p>
      ) : q.isError ? (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4"
        >
          <p>
            {t("Registro non disponibile. Non è possibile determinare gli importi del periodo.")}
          </p>
          <p className="mt-1 text-sm">
            {t("Se il modulo non è ancora attivato sul database, serve applicare la migrazione dopo i test. Nessun dato viene simulato o registrato in alternativa.")}
          </p>
          <Button
            variant="outline"
            className="mt-3"
            onClick={() => void q.refetch()}
          >
            {t("Riprova")}
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <FiscalMetric
              label={t("Ritenute verificate nel periodo")}
              value={formatCurrency(sum(active))}
              description={t("Comprende quelle riscontrate con certificazione")}
            />
            <FiscalMetric
              label={t("Da riscontrare con certificazione")}
              value={formatCurrency(
                sum(active.filter((r) => r.stato === "verificata")),
              )}
              description={t("Già confrontate con la contabile dell’incasso")}
            />
            <FiscalMetric
              label={t("Riscontrate con certificazione")}
              value={formatCurrency(
                sum(active.filter((r) => r.stato === "certificata")),
              )}
              description={t("Non equivale a credito fiscale già utilizzabile")}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              aria-label={t("Cerca ritenute bancarie")}
              placeholder={t("Fattura, banca o TRN/CRO…")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="max-w-sm"
            />
            {[
              ["tutte", "Tutte"],
              ["verificata", "Da certificare"],
              ["certificata", "Certificate"],
              ["stornata", "Stornate"],
            ].map(([key, label]) => (
              <Button
                key={key}
                variant={filter === key ? "default" : "outline"}
                onClick={() => {
                  setFilter(key);
                  setPage(0);
                }}
              >
                {label}
              </Button>
            ))}
            <Button
              variant="outline"
              disabled={!rows.length}
              onClick={() => {
                const columns = [
                  "Data accredito",
                  "Fattura",
                  "Banca",
                  "TRN/CRO",
                  "Lordo saldato",
                  "Ritenuta effettiva",
                  "Commissioni",
                  "Netto banca",
                  "Ritenuta prevista",
                  "Stato",
                  "Certificazione",
                  "Motivo storno",
                ];
                exportToCSV(
                  rows.map((r) =>
                    Object.fromEntries(
                      [
                        r.data_accredito,
                        r.numero_fattura,
                        r.banca,
                        r.riferimento,
                        ...[
                          r.lordo,
                          r.ritenuta,
                          r.commissioni,
                          r.netto,
                          r.ritenuta_prevista,
                        ].map((n) => Number(n).toFixed(2).replace(".", ",")),
                        r.stato,
                        r.certificazione ?? "",
                        r.motivo_storno ?? "",
                      ].map((value, index) => [String(index), value]),
                    ),
                  ),
                  columns.map((label, index) => ({
                    key: String(index),
                    label,
                  })),
                  `ritenute-bonifici-${period.anno}-${first}-${last}.csv`,
                );
              }}
            >
              {t("Esporta righe filtrate")}
            </Button>
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  {[
                    "Accredito / fattura",
                    "Banca / riferimento",
                    "Lordo saldato",
                    "Ritenuta",
                    "Commissioni",
                    "Netto in banca",
                    "Stato / azioni",
                  ].map((label) => (
                    <th
                      key={label}
                      className="whitespace-nowrap px-3 py-2 text-left"
                    >
                      {t(label)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(current * 30, current * 30 + 30).map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">
                      {formatDateIt(r.data_accredito)}
                      <br />
                      <Link
                        className="text-blue-700 hover:underline"
                        to={`/azienda/documenti/${r.documento_id}/dettaglio`}
                      >
                        {r.numero_fattura}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      {r.banca}
                      <p className="text-xs text-muted-foreground">
                        {r.riferimento}
                      </p>
                    </td>
                    {[r.lordo, r.ritenuta, r.commissioni, r.netto].map(
                      (n, i) => (
                        <td
                          key={i}
                          className="whitespace-nowrap px-3 py-2 tabular-nums"
                        >
                          {formatCurrency(Number(n))}
                        </td>
                      ),
                    )}
                    <td className="px-3 py-2">
                      <p>
                        {r.stato === "certificata"
                          ? t("Riscontrata con certificazione")
                          : r.stato === "stornata"
                            ? t("Stornata")
                            : t("Verificata sulla contabile")}
                      </p>
                      {r.certificazione && (
                        <p className="text-xs text-muted-foreground">
                          {r.certificazione}
                        </p>
                      )}
                      {r.motivo_storno && (
                        <p className="text-xs text-muted-foreground">
                          {r.motivo_storno}
                        </p>
                      )}
                      {q.canEdit && r.stato !== "stornata" && (
                        <div className="flex gap-2">
                          {r.stato === "verificata" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => pick(r, "certifica")}
                            >
                              {t("Riscontra certificazione")}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => pick(r, "storna")}
                          >
                            {t("Storna")}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-6 text-center text-muted-foreground"
                    >
                      {t("Nessuna ritenuta registrata per questi filtri. Non sono conteggiati importi soltanto previsti.")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {rows.length > 30 && (
            <div className="flex items-center justify-end gap-3">
              <Button
                variant="outline"
                disabled={!current}
                onClick={() => setPage(current - 1)}
              >
                {t("Precedenti")}
              </Button>
              <span>
                {current + 1} / {Math.ceil(rows.length / 30)}
              </span>
              <Button
                variant="outline"
                disabled={(current + 1) * 30 >= rows.length}
                onClick={() => setPage(current + 1)}
              >
                {t("Successivi")}
              </Button>
            </div>
          )}
        </>
      )}
      <Dialog
        open={!!choice}
        onOpenChange={(open) => {
          if (!open && !q.mutation.isPending) setChoice(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {choice?.azione === "storna"
                ? t("Storno documentato dell’incasso")
                : t("Riscontro con certificazione bancaria")}
            </DialogTitle>
            <DialogDescription>
              {choice?.azione === "storna"
                ? t("Riapre il residuo lordo della fattura e annulla il netto in prima nota. La ritenuta resta nello storico.")
                : t("Conferma solo il riscontro documentale: nessuna dichiarazione, compensazione o pagamento viene effettuato.")}
            </DialogDescription>
          </DialogHeader>
          {choice && (
            <p className="text-sm">{t("Fattura {numero} · lordo {lordo} · ritenuta {ritenuta}", { numero: String(choice.row.numero_fattura ?? ""), lordo: formatCurrency(Number(choice.row.lordo)), ritenuta: formatCurrency(Number(choice.row.ritenuta)) })}</p>
          )}
          <Label htmlFor="ritenuta-reference">
            {choice?.azione === "storna"
              ? t("Motivo e riferimento dello storno")
              : t("Riferimento della certificazione verificata")}
          </Label>
          <Input
            id="ritenuta-reference"
            maxLength={2000}
            value={reference}
            onChange={(e) => {
              setReference(e.target.value);
              setConfirmed(false);
            }}
          />
          <Label className="flex gap-2">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(v === true)}
            />
            {t("Ho verificato i documenti e gli effetti dell’operazione.")}
          </Label>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={q.mutation.isPending}
              onClick={() => setChoice(null)}
            >
              {t("Annulla")}
            </Button>
            <Button
              disabled={
                !confirmed ||
                reference.trim().length < 5 ||
                q.mutation.isPending
              }
              onClick={() =>
                choice &&
                q.mutation.mutate(
                  {
                    id: choice.row.id,
                    revisione: choice.row.revisione,
                    azione: choice.azione,
                    riferimento: reference,
                  },
                  { onSuccess: () => setChoice(null) },
                )
              }
            >
              {t("Conferma")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <RitenuteSubiteFatture anno={period.anno} primoMese={first} ultimoMese={last} />
    </section>
  );
}
