import type { ReactNode } from 'react';

export function DetailsHelp({ children, title = 'Come funziona' }: { children: ReactNode; title?: string }) {
  return <details className="ga-details-help"><summary>{title}</summary><div>{children}</div></details>;
}
