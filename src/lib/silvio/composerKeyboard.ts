/** IME Enter accepts a word, it must never also send the question. */
export function shouldSendSilvioOnEnter(event: {
  key: string;
  shiftKey: boolean;
  nativeEvent: { isComposing?: boolean; keyCode?: number };
}): boolean {
  return event.key === "Enter" && !event.shiftKey
    && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229;
}
