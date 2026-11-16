'use client';
import { useActionState, useId, useState } from 'react';
import { createPipelineAction, mutatePipelineAction, type BoardState } from '@/app/subaccount/pipeline-actions';
type Field = { name: string; label: string; initial?: string; multiline?: boolean; options?: { value: string; label: string }[] };
export function PipelineForm({ hidden, fields, label, create = false, reset = false, disabled = false, compact = false }: {
  hidden: Record<string, string>; fields: Field[]; label: string; create?: boolean; reset?: boolean; disabled?: boolean; compact?: boolean;
}) {
  const id = useId();
  const initial = Object.fromEntries(fields.map(field => [field.name, field.initial ?? '']));
  const [values, setValues] = useState(initial);
  const [state, action, pending] = useActionState<BoardState, FormData>(async (previous, form) => {
    const result = await (create ? createPipelineAction : mutatePipelineAction)(previous, form);
    if (result.success && reset) setValues(initial);
    return result;
  }, { message: '', success: false });
  return <form action={action} className={compact ? 'pipeline-form pipeline-form-compact' : 'pipeline-form'}>
    {Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    {fields.map(field => <div className="agency-field" key={field.name}><label htmlFor={`${id}-${field.name}`}>{field.label}</label>{field.options ? <select id={`${id}-${field.name}`} name={field.name} value={values[field.name]} onChange={event => setValues({ ...values, [field.name]: event.target.value })} disabled={pending || disabled}>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.multiline ? <textarea id={`${id}-${field.name}`} name={field.name} value={values[field.name]} onChange={event => setValues({ ...values, [field.name]: event.target.value })} maxLength={5000} rows={3} disabled={pending || disabled} /> : <input id={`${id}-${field.name}`} name={field.name} value={values[field.name]} onChange={event => setValues({ ...values, [field.name]: event.target.value })} required minLength={2} maxLength={191} disabled={pending || disabled} />}</div>)}
    <button className={compact ? 'text-action' : 'action'} disabled={pending || disabled}>{pending ? 'Saving…' : label}</button>
    {state.message && <p role={state.success ? 'status' : 'alert'} className={state.success ? 'agency-feedback' : 'agency-field-error'}>{state.message}</p>}
  </form>;
}
