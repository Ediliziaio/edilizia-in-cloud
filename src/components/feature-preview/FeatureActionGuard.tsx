/**
 * FeatureActionGuard — v8.6.62
 *
 * Wrapper attorno a un elemento interattivo (Button, link, form submit) che
 * intercetta il click se la feature è in preview mode → apre UnlockFeatureDialog.
 * Se la feature è enabled, il click passa al figlio normalmente.
 *
 * Pattern d'uso:
 *
 *   <FeatureActionGuard
 *     featureKey="render_ai"
 *     featureLabel="Render AI"
 *     actionLabel="Genera render"
 *   >
 *     <Button onClick={handleGenerate}>Genera</Button>
 *   </FeatureActionGuard>
 *
 * Implementazione: usa cloneElement per intercettare onClick. Il figlio
 * DEVE essere un singolo elemento React (Button, <a>, <button>, ecc.).
 */
import { Children, cloneElement, isValidElement, useState, type MouseEvent, type ReactElement } from "react";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { UnlockFeatureDialog } from "./UnlockFeatureDialog";

interface Props {
  featureKey: string;
  featureLabel: string;
  /** Etichetta umana dell'azione (es. "Genera render"). Default: "questa azione". */
  actionLabel?: string;
  children: ReactElement;
  /**
   * Se true, blocca anche quando la feature non supporta preview (cioè
   * sempre, indipendentemente da access_level). Default: false — il guard
   * scatta solo se accessLevel === "preview".
   */
  alwaysBlock?: boolean;
}

interface InterceptableProps {
  onClick?: (e: MouseEvent) => void;
  disabled?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export function FeatureActionGuard({
  featureKey, featureLabel, actionLabel, children, alwaysBlock = false,
}: Props) {
  const { isPreview, isLoading } = useFeatureAccess(featureKey);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Solo un figlio valido
  const child = Children.only(children) as ReactElement<InterceptableProps>;
  if (!isValidElement(child)) return children;

  // Stato in cui blocco: preview esplicito oppure alwaysBlock
  const shouldBlock = !isLoading && (isPreview || alwaysBlock);

  // Se non blocco, passo il bambino così com'è
  if (!shouldBlock) return child;

  // Intercetto onClick
  const originalOnClick = child.props.onClick;
  const intercepted = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDialogOpen(true);
    // Non chiamo l'originale: l'azione è bloccata
    if (originalOnClick) {
      // ma se l'autore vuole loggare il tentativo, può guardare `data-preview-attempt`
    }
  };

  return (
    <>
      {cloneElement(child, {
        onClick: intercepted,
        "data-preview-attempt": "true",
        "aria-disabled": "true",
      })}
      <UnlockFeatureDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        featureKey={featureKey}
        featureLabel={featureLabel}
        actionLabel={actionLabel}
      />
    </>
  );
}
