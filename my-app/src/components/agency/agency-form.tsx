'use client';
import { useActionState, useId, useState } from 'react';
import Link from 'next/link';
import { createAgencyAction, updateAgencyAction } from '@/app/agency/actions';
import { emptyAgencyValues, type AgencyValues, type AgencyFormState } from '@/lib/agency-validation';

const details: Array<{ key: keyof AgencyValues; label: string; type?: string; max: number; autoComplete?: string; wide?: boolean }> = [
  { key: 'name', label: 'Agency name', max: 191, autoComplete: 'organization', wide: true },
  { key: 'businessEmail', label: 'Business email', type: 'email', max: 320, autoComplete: 'email' },
  { key: 'phone', label: 'Phone number', type: 'tel', max: 40, autoComplete: 'tel' },
  { key: 'website', label: 'Website', type: 'url', max: 2048, autoComplete: 'url', wide: true },
  { key: 'address', label: 'Street address', max: 256, autoComplete: 'street-address', wide: true },
  { key: 'city', label: 'City', max: 100, autoComplete: 'address-level2' },
  { key: 'region', label: 'State or region', max: 100, autoComplete: 'address-level1' },
  { key: 'postalCode', label: 'Postal code', max: 32, autoComplete: 'postal-code' },
  { key: 'country', label: 'Country', max: 100, autoComplete: 'country-name' },
];
export function AgencyForm({ agencyId, creationKey, revision = 0, initialValues = emptyAgencyValues }: {
  agencyId?: string; creationKey?: string; revision?: number; initialValues?: AgencyValues;
}) {
  const editing = Boolean(agencyId);
  const formId = useId();
  const [values, setValues] = useState(initialValues);
  const [state, action, pending] = useActionState<AgencyFormState, FormData>(editing ? updateAgencyAction : createAgencyAction, {});
  return <form action={action} className="agency-form">
    <input type="hidden" name="creationKey" value={creationKey ?? ''} />
    <input type="hidden" name="id" value={agencyId ?? ''} />
    <input type="hidden" name="revision" value={state.revision ?? revision} />
    <div className="agency-form-heading"><h2>Business details</h2><p>Your agency name is required. You can add or change the other details later.</p></div>
    <fieldset disabled={pending} className="agency-fields"><legend className="sr-only">Agency business details</legend>
      {details.map(field => {
        const error = state.errors?.[field.key]?.[0];
        return <div className={field.wide ? 'agency-field agency-field-wide' : 'agency-field'} key={field.key}>
          <label htmlFor={`${formId}-${field.key}`}>{field.label}{field.key !== 'name' && <span>Optional</span>}</label>
          <input id={`${formId}-${field.key}`} name={field.key} type={field.type ?? 'text'} autoComplete={field.autoComplete}
            required={field.key === 'name'} minLength={field.key === 'name' ? 2 : undefined} maxLength={field.max}
            value={values[field.key]} onChange={event => setValues({ ...values, [field.key]: event.target.value })}
            aria-invalid={Boolean(error)} aria-describedby={error ? `${formId}-${field.key}-error` : undefined} />
          {error && <p id={`${formId}-${field.key}-error`} className="agency-field-error">{error}</p>}
        </div>;
      })}
    </fieldset>
    {state.message && <p role={state.success ? 'status' : 'alert'} className={state.success ? 'agency-feedback' : 'agency-field-error'}>{state.message}</p>}
    <div className="agency-form-footer"><Link href="/agency" className="text-action">Back to agencies</Link><button type="submit" className="action" disabled={pending}>{pending ? 'Saving…' : editing ? 'Save changes' : 'Create agency'}</button></div>
  </form>;
}
