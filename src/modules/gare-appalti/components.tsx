import { cloneElement, isValidElement, useId, useState, type ReactNode, type FormEvent } from 'react';
import { AlertCircle, Loader2, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useWorkspace } from './WorkspaceContext';

export function PageTitle({eyebrow,title,description,action}:{eyebrow?:string;title:string;description:string;action?:ReactNode}) {
 return <div className="ga-title mb-4 flex flex-wrap items-start justify-between gap-3"><div>{eyebrow&&<p className="mb-1 text-[10px] font-semibold uppercase tracking-[.15em] text-muted-foreground">{eyebrow}</p>}<h2 className="text-lg font-semibold leading-tight tracking-tight text-secondary sm:text-xl">{title}</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{description}</p></div>{action}</div>;
}
export function Status({children,tone='neutral'}:{children:ReactNode;tone?:'neutral'|'success'|'warning'|'danger'|'blue'}) {
 return <span data-tone={tone} className={cn('ga-status inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium',{'bg-muted text-muted-foreground':tone==='neutral','bg-emerald-50 text-emerald-800':tone==='success','bg-amber-50 text-amber-800':tone==='warning','bg-red-50 text-red-700':tone==='danger','bg-blue-50 text-blue-800':tone==='blue'})}>{children}</span>;
}
export function Empty({title,children,action}:{title:string;children:ReactNode;action?:ReactNode}) {
 return <div className="ga-empty rounded-lg border border-dashed bg-muted/20 px-4 py-5 text-center"><h2 className="text-sm font-semibold text-secondary">{title}</h2><div className="mx-auto mt-1.5 max-w-xl text-xs leading-5 text-muted-foreground">{children}</div>{action&&<div className="mt-3">{action}</div>}</div>;
}
export function Panel({title,description,children,action,className,contentClassName}:{title:string;description?:string;children:ReactNode;action?:ReactNode;className?:string;contentClassName?:string}) {
 return <section className={cn("ga-panel min-w-0 rounded-lg border bg-card shadow-sm",className)}><div className="ga-panel-heading flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3"><div><h2 className="text-sm font-semibold text-secondary">{title}</h2>{description&&<p className="mt-1 text-[11px] leading-5 text-muted-foreground">{description}</p>}</div>{action}</div><div className={cn("ga-panel-body p-3 sm:p-4",contentClassName)}>{children}</div></section>;
}
export function Notice({children}:{children:ReactNode}) { return <div className="ga-notice flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-950"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/><div>{children}</div></div>; }
export function Field({label,name,defaultValue='',type='text',required=false,children,help,min,max,step,maxLength,multiple=false}:{label:string;name:string;defaultValue?:string|number;type?:string;required?:boolean;children?:ReactNode;help?:string;min?:string|number;max?:string|number;step?:string;maxLength?:number;multiple?:boolean}) {
 const fieldId=`${name}-${useId().replace(/:/g,'')}`;
 const helpId=help?`${fieldId}-help`:undefined;
 const control=isValidElement<{id?:string;'aria-describedby'?:string}>(children)
  ?cloneElement(children,{id:fieldId,'aria-describedby':[children.props['aria-describedby'],helpId].filter(Boolean).join(' ')||undefined})
  :children||<Input id={fieldId} aria-describedby={helpId} name={name} type={type} defaultValue={defaultValue} required={required} min={min} max={max} step={step} maxLength={maxLength} multiple={multiple}/>;
 return <div className="space-y-1.5"><Label htmlFor={fieldId}>{label}{required?' *':''}</Label>{control}{help&&<p id={helpId} className="text-xs leading-5 text-muted-foreground">{help}</p>}</div>;
}
export function SelectField({label,name,defaultValue='',required=false,options}:{label:string;name:string;defaultValue?:string;required?:boolean;options:{value:string;label:string}[]}) {
 return <Field label={label} name={name} required={required}><select id={name} name={name} defaultValue={defaultValue} required={required} className="flex h-10 w-full rounded-md border bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>;
}
export function Check({name,label,defaultChecked=false,value,required=false}:{name:string;label:string;defaultChecked?:boolean;value?:string;required?:boolean}) {return <label className="flex cursor-pointer items-start gap-3 text-sm leading-6"><input name={name} type="checkbox" value={value} required={required} defaultChecked={defaultChecked} className="mt-1 h-4 w-4 accent-primary"/>{label}</label>;}
export function TextField({name,label,defaultValue='',required=false,rows=3,minLength}:{name:string;label:string;defaultValue?:string;required?:boolean;rows?:number;minLength?:number}) {return <Field name={name} label={label} required={required}><textarea name={name} id={name} defaultValue={defaultValue} required={required} minLength={minLength} rows={rows} className="w-full rounded-md border bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"/></Field>;}
export function ActionForm({children,onSave,label='Salva',busyLabel='Salvataggio…',afterSave,pendingContent,submitDisabled=false}:{children:ReactNode;onSave:(data:FormData)=>Promise<unknown>;label?:string;busyLabel?:string;afterSave?:()=>void;pendingContent?:ReactNode;submitDisabled?:boolean}) {
 const {refresh}=useWorkspace();const [saving,setSaving]=useState(false);const [error,setError]=useState('');
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(submitDisabled||saving)return;const data=new FormData(e.currentTarget);setSaving(true);setError('');try{await onSave(data);await refresh();afterSave?.();}catch(e){setError(e instanceof Error?e.message:typeof e==='object'&&e&&'message'in e?String(e.message):String(e));}finally{setSaving(false);}}
 return <form onSubmit={submit} className="space-y-4"><fieldset disabled={saving} className="space-y-4">{children}</fieldset>{saving&&pendingContent}{error&&<p role="alert" className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}<div className="flex justify-end border-t pt-4"><Button disabled={saving||submitDisabled} type="submit">{saving&&<Loader2 className="animate-spin"/>}{saving?busyLabel:label}</Button></div></form>;
}
export function EditorDialog({title,description,children,onClose,wide=false,className,initialFocusId}:{title:string;description:string;children:ReactNode;onClose:()=>void;wide?:boolean;className?:string;initialFocusId?:string}) {return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent onOpenAutoFocus={event=>{const el=initialFocusId?document.getElementById(initialFocusId):null;if(el){event.preventDefault();(el.querySelector<HTMLElement>('input,select,textarea')||el).focus({preventScroll:true});el.scrollIntoView?.({block:'center'});}}} className={cn(`gare-app ga-dialog max-h-[90dvh] overflow-y-auto ${wide?'max-w-6xl':'max-w-2xl'}`,className)}><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>{children}</DialogContent></Dialog>;}
export function GoLink({to,children}:{to:string;children:ReactNode}) {return <Link className="inline-flex items-center gap-1 text-sm font-medium text-secondary underline-offset-4 hover:underline" to={to}>{children}<ArrowUpRight className="h-3.5 w-3.5"/></Link>;}
export const value=(f:FormData,key:string)=>String(f.get(key)??'').trim();
