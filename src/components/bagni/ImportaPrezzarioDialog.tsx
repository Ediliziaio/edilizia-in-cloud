import { ImportaLavorazioniDialog, type ImportaLavorazioniProps } from "@/components/prezzario/ImportaLavorazioniDialog";

export type ImportaPrezzarioDialogProps = ImportaLavorazioniProps;
export function ImportaPrezzarioDialog(props: ImportaPrezzarioDialogProps) {
  return <ImportaLavorazioniDialog {...props} listino="bgn" />;
}
export default ImportaPrezzarioDialog;
