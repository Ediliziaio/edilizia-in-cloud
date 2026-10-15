import { expect, it } from 'vitest';
import { DOCUMENTO_TEMPLATE_SELECT } from '@/lib/documenti/templateQuery';

it('disambigua i campi quando esistono anche i vincoli aziendali compositi', () => {
  expect(DOCUMENTO_TEMPLATE_SELECT).toContain('documento_template_fields!documento_template_fields_template_id_fkey(*)');
  expect(DOCUMENTO_TEMPLATE_SELECT).not.toContain('documento_template_fields(*)');
});
