import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Field, SelectField, TextField } from './components';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
function render(node: ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(node));
}
afterEach(() => { act(() => root?.unmount()); root = undefined; document.body.replaceChildren(); });
function label(text: string) { return [...document.querySelectorAll('label')].find(item => item.textContent?.trim() === text)!; }

describe('campi in pagina e nei moduli di revisione', () => {
  it('associa ogni etichetta alla propria nota anche quando il nome del campo coincide', () => {
    render(<><form aria-label="Pagina"><TextField name="note" label="Nota della pagina" /></form><form aria-label="Revisione"><TextField name="note" label="Motivo della revisione" required /></form></>);
    const page = document.querySelector<HTMLTextAreaElement>('form[aria-label="Pagina"] textarea')!;
    const review = document.querySelector<HTMLTextAreaElement>('form[aria-label="Revisione"] textarea')!;
    expect(label('Nota della pagina').control).toBe(page);
    expect(label('Motivo della revisione *').control).toBe(review);
    expect(page.id).not.toBe(review.id);
    expect([...review.labels!].map(item => item.textContent)).toEqual(['Motivo della revisione *']);
    review.value = 'Verifica completata';
    expect(new FormData(review.closest('form')!).get('note')).toBe('Verifica completata');
    expect(new FormData(page.closest('form')!).get('note')).toBe('');
    expect(review.required).toBe(true);
  });

  it('mantiene etichette e nomi dei select separati senza collisioni di ID', () => {
    const options = [{ value: 'a', label: 'Fonte A' }];
    render(<><SelectField name="source" label="Fonte in pagina" options={options} /><SelectField name="source" label="Fonte in finestra" options={options} /></>);
    const fields = [...document.querySelectorAll('select')];
    expect(label('Fonte in pagina').control).toBe(fields[0]);
    expect(label('Fonte in finestra').control).toBe(fields[1]);
    expect(fields[0].id).not.toBe(fields[1].id);
    expect(fields[1].name).toBe('source');
  });

  it('collega l’aiuto al campo mantenendo i vincoli degli input file', () => {
    render(<Field name="file" label="Originali" type="file" required multiple help="Massimo dodici file" />);
    const input = label('Originali *').control as HTMLInputElement;
    expect(input.type).toBe('file');
    expect(input.multiple).toBe(true);
    expect(input.required).toBe(true);
    expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent).toBe('Massimo dodici file');
  });
});
