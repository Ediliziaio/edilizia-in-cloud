// Template prompts are never factual values, even when quoted literally from a source.
export function missingValue(value){const text=String(value??'').trim();return !text||/\{\{[^}]*\}\}|<<[^>]*>>|\[(?:DA[ _]|COMPLETARE|INSERIRE|DATO|CAMPO)[^\]]*\]|DATO DIMOSTRATIVO|\bDA (?:COMPLETARE|VERIFICARE|CONFERMARE|INSERIRE)\b|click or tap here|fare clic qui/i.test(text);}
