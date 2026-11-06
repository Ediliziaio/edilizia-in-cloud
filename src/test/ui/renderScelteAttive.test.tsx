import { expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RenderResultRefinementPanel } from '@/components/render/RenderResultRefinementPanel';
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
it('UX-42/46: omette i sistemi spenti e permette di leggere tutte le scelte attive', () => {
 render(<RenderResultRefinementPanel maxItems={2} config={{
  soffitto: {attivo:false,tipo:'controsoffitto spento',colore:'rosso non applicato'},
  pareti: {attivo:true,colore:'bianco caldo'},
  tende: {attivo:true,tipo:'lino naturale'},
 }} />);
 expect(screen.queryByText(/Controsoffitto spento/)).not.toBeInTheDocument();
 expect(screen.queryByText(/Rosso non applicato/)).not.toBeInTheDocument();
 expect(screen.getByText('Bianco caldo')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:/Mostra tutte le scelte/}));
 expect(screen.getByText('Lino naturale')).toBeInTheDocument();
});
