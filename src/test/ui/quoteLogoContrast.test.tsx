import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QuoteTemplatePreview } from '@/components/quotes/QuoteTemplatePreview';

describe('Contrasto dei loghi nelle anteprime dei preventivi', () => {
  it.each(['modern', 'bold'] as const)('usa il logo chiaro senza targhetta bianca nel layout %s scuro', layout => {
    const { container } = render(<QuoteTemplatePreview template={{ layout, primary_color: '#334155' }} logoSrc="/scuro.png" logoLightSrc="/chiaro.png" page="detail" />);
    const logo = container.querySelector('img');
    expect(logo?.getAttribute('src')).toBe('/chiaro.png');
    expect(logo?.style.backgroundColor).toBe('transparent');
  });
  it.each(['classic', 'minimal', 'modern', 'bold'] as const)('mantiene il logo scuro su fondo chiaro nel layout %s', layout => {
    const { container } = render(<QuoteTemplatePreview template={{ layout, primary_color: '#ffffff' }} logoSrc="/scuro.png" logoLightSrc="/chiaro.png" page="detail" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/scuro.png');
  });
  it('usa il logo chiaro trasparente sulla copertina fotografica oscurata', () => {
    const { container } = render(<QuoteTemplatePreview template={{ cover_title: 'Offerta' }} logoSrc="/scuro.png" logoLightSrc="/chiaro.png" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/chiaro.png');
    expect(container.querySelector('img')?.style.background).toBe('transparent');
  });
});
