import * as React from "react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

type Option = { key: string; label: string; disabled: boolean; group: string };
type Snapshot = { options: Option[]; selected: string; value: string; label?: string };

/** The native control remains the form/event source; only the visible menu is replaced. */
export const UniformSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ children, className, style, autoFocus, onBlur, onInvalid, onFocus, ...props }, forwardedRef) => {
  const t = useT();
    const native = React.useRef<HTMLSelectElement>(null);
    const trigger = React.useRef<HTMLButtonElement>(null);
    const [snapshot, setSnapshot] = React.useState<Snapshot>({ options: [], selected: "", value: "" });
    const [invalid, setInvalid] = React.useState(false);
    const [open, setOpen] = React.useState(false);
    const keyboardChoice = React.useRef(false);
    const refresh = React.useCallback(() => {
      const control = native.current;
      if (!control) return;
      const next: Snapshot = {
        options: Array.from(control.options).map((option, index) => ({
          key: `option-${index}`, label: option.label,
          disabled: option.disabled || (option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled),
          group: option.parentElement instanceof HTMLOptGroupElement ? option.parentElement.label : "",
        })),
        selected: control.selectedIndex < 0 ? "" : `option-${control.selectedIndex}`,
        value: control.value,
        label: Array.from(new Set([...(control.labels ?? []), ...(trigger.current?.labels ?? []), ...Array.from(control.ownerDocument.getElementsByTagName("label")).filter(label => !!props.id && label.htmlFor === props.id)])).map(label => {
          const copy = label.cloneNode(true) as HTMLElement;
          copy.querySelectorAll("select, [role=combobox], [data-uniform-select-trigger]").forEach(child => child.remove());
          return copy.textContent?.trim();
        }).filter(Boolean).join(" · ") || undefined,
      };
      setSnapshot(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    }, [props.id]);
    // Read the committed DOM: options may be produced by arbitrary child components.
    React.useLayoutEffect(() => { refresh(); });
    React.useEffect(() => {
      const control = native.current;
      if (!control) return;
      const observer = new MutationObserver(refresh);
      observer.observe(control, { childList: true, subtree: true, characterData: true, attributes: true });
      const form = control.form;
      const reset = () => { window.setTimeout(() => { setInvalid(false); refresh(); }, 0); };
      form?.addEventListener("reset", reset);
      return () => { observer.disconnect(); form?.removeEventListener("reset", reset); };
    }, [refresh]);
    const label = props["aria-label"] || snapshot.label;
    // Native select layouts often use `block`; the shared trigger needs flex
    // for its label and chevron, while responsive visibility stays unchanged.
    const triggerClasses = className?.split(/\s+/).map(token => token.replace(/(^|:)(!?)(block|inline-block|inline|grid|inline-grid|contents)$/, "$1$2flex")).join(" ");
    const blocks: {group: string; options: Option[]}[] = [];
    for (const option of snapshot.options) {
      const last = blocks.at(-1);
      if (last && last.group === option.group) last.options.push(option);
      else blocks.push({group: option.group, options: [option]});
    }
    return <>
      <Select open={open} onOpenChange={setOpen} value={snapshot.selected} disabled={props.disabled} onValueChange={key => {
        // Radix form synchronisation can emit an empty change on mount. Only a
        // choice made in the open menu may update the original form control.
        if ((!open && !keyboardChoice.current) || !/^option-\d+$/.test(key)) return;
        const control = native.current;
        if (!control) return;
        const index = Number(key.slice("option-".length));
        if (!Number.isInteger(index) || !control.options[index] || control.matches(":disabled")) return;
        control.selectedIndex = index;
        control.dispatchEvent(new Event("change", { bubbles: true }));
        setInvalid(false); refresh();
      }}>
        <SelectTrigger ref={trigger} id={props.id} value={snapshot.value} data-uniform-select-trigger="" autoFocus={autoFocus} type="button" onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} onKeyDown={event => {
          if (["ArrowUp", "ArrowDown", "Enter", " "].includes(event.key)) event.stopPropagation();
          if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.stopPropagation();
            keyboardChoice.current = true;
            queueMicrotask(() => {keyboardChoice.current = false;});
          }
        }} style={style} className={cn("w-auto min-w-0", triggerClasses)}
          aria-label={props["aria-label"] || (props.id ? undefined : label)} aria-labelledby={props["aria-labelledby"]} aria-describedby={props["aria-describedby"]}
          aria-required={props.required} aria-invalid={props["aria-invalid"] ?? invalid} title={invalid ? native.current?.validationMessage : props.title}
          onBlur={event => {event.stopPropagation();if (!open) native.current?.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: event.relatedTarget }));}}>
          <SelectValue placeholder={t("Seleziona…")} />
        </SelectTrigger>
      <select {...props} ref={node => {
        native.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }} id={props.id ? `${props.id}--native` : undefined} aria-label={undefined} aria-labelledby={undefined} aria-hidden="true" tabIndex={-1} className="sr-only" data-uniform-select-native="" onMouseDown={event => event.preventDefault()} onClick={event => {event.preventDefault();trigger.current?.focus();}} onFocus={event => {
        onFocus?.(event); trigger.current?.focus();
      }} onBlur={event => {if(event.relatedTarget !== trigger.current) onBlur?.(event);}} onInvalid={event => {
        onInvalid?.(event); event.preventDefault(); setInvalid(true); trigger.current?.focus();
      }}>{children}</select>

        <SelectContent onClick={event => event.stopPropagation()} onPointerDownOutside={() => {queueMicrotask(() => native.current?.dispatchEvent(new FocusEvent("focusout", {bubbles:true})));}}>
          {blocks.map((block, index) => {
            const items = block.options.map(option => <SelectItem key={option.key} data-uniform-select-option-key={option.key} value={option.key} disabled={option.disabled}>{option.label || t("Seleziona…")}</SelectItem>);
            return block.group ? <SelectGroup key={index}><SelectLabel>{block.group}</SelectLabel>{items}</SelectGroup> : <React.Fragment key={index}>{items}</React.Fragment>;
          })}
        </SelectContent>
      </Select>
    </>;
  },
);
UniformSelect.displayName = "UniformSelect";
