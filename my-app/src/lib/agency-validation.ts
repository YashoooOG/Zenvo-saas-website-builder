import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max, `Use ${max} characters or fewer.`).transform(value => value || null);
export const agencyFields = {
  name: z.string().trim().min(2, 'Enter at least 2 characters.').max(191, 'Use 191 characters or fewer.'),
  businessEmail: z.union([z.literal(''), z.string().trim().email('Enter a valid email address.').max(320)]).transform(value => value || null),
  phone: optionalText(40),
  website: z.string().trim().max(2048).refine(value => {
    if (!value) return true;
    try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
  }, 'Enter a full http:// or https:// website address.').transform(value => value || null),
  address: optionalText(256), city: optionalText(100), region: optionalText(100),
  postalCode: optionalText(32), country: optionalText(100),
};
export const agencySchema = z.object(agencyFields).strict();
export const createAgencySchema = agencySchema.extend({ creationKey: z.uuid() });
export const updateAgencySchema = agencySchema.extend({ id: z.string().min(1).max(191), revision: z.number().int().min(0).max(2147483646) });
export type AgencyValues = { [Key in keyof typeof agencyFields]: string };
export type AgencyFormState = { message?: string; success?: boolean; errors?: Partial<Record<keyof AgencyValues, string[]>>; revision?: number };
export const emptyAgencyValues: AgencyValues = { name: '', businessEmail: '', phone: '', website: '', address: '', city: '', region: '', postalCode: '', country: '' };
