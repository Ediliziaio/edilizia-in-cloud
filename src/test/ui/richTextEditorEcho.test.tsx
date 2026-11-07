import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
const state = vi.hoisted(() => ({ options: null as null | { onUpdate: (args: {editor: {getHTML: () => string}}) => void }, setContent: vi.fn(), html: '<p>Testo <span data-merge-field="{{cliente.nome}}" contenteditable="false" class="chip">{{cliente.nome}}</span> </p>' }));
vi.mock('@tiptap/react', () => ({
  useEditor: (options: typeof state.options) => {
    state.options = options;
    return { getHTML: () => state.html, commands: { setContent: state.setContent }, getAttributes: () => ({}), isActive: () => false };
  },
  EditorContent: () => <div />,
}));
import { RichTextEditor } from '@/components/ui/rich-text-editor';
afterEach(() => { cleanup(); state.setContent.mockClear(); });
describe('editor controllato: echo del testo con campi automatici', () => {
  it('non riparsa il proprio HTML sanitizzato e non perde lo spazio appena digitato', () => {
    const onChange = vi.fn();
    const { rerender } = render(<RichTextEditor value={state.html} onChange={onChange} documentMode />);
    state.setContent.mockClear();
    state.options!.onUpdate({ editor: { getHTML: () => state.html } });
    const emitted = onChange.mock.calls[0][0];
    expect(emitted).toContain('</span> </p>');
    expect(emitted).not.toContain('contenteditable');
    rerender(<RichTextEditor value={emitted} onChange={onChange} documentMode />);
    expect(state.setContent).not.toHaveBeenCalled();
  });
  it('continua a caricare il testo sostituito dall’esterno con Copia da', () => {
    const { rerender } = render(<RichTextEditor value={state.html} onChange={vi.fn()} documentMode />);
    state.setContent.mockClear();
    rerender(<RichTextEditor value="<p>Condizioni copiate</p>" onChange={vi.fn()} documentMode />);
    expect(state.setContent).toHaveBeenCalledWith('<p>Condizioni copiate</p>', { emitUpdate: false });
  });
});

it('mantiene la tipografia ma rimuove gli stili fuori lista e le risorse esterne', () => {
  const onChange = vi.fn();
  render(<RichTextEditor value="<p>Testo</p>" onChange={onChange} documentMode />);
  state.options!.onUpdate({ editor: { getHTML: () => '<p style="color: red; position: fixed; background: url(https://example.test/pixel); padding: 4px" onclick="alert(1)">Testo</p>' } });
  const html = onChange.mock.calls[0][0];
  expect(html).toContain('color: red');
  expect(html).toContain('padding: 4px');
  expect(html).not.toMatch(/position|url\(|onclick|example\.test/);
});
