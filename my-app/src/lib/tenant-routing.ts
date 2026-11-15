// Pure routing policy: hostnames select public sites, never user permissions.
const labelPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const reserved = new Set(['www', 'app', 'api', 'admin', 'agency', 'subaccount', 'auth', 'clerk', 'accounts', 'billing', 'cdn', 'static', 'assets', 'mail', 'support', 'status']);
export const sitePrefix = '/tenant-site';

export function parseHost(value: string | null): string | null {
  if (!value || value !== value.trim() || /[\s,/@\\?#%]/.test(value)) return null;
  const match = /^(\[[0-9a-f:]+\]|[^:]+)(?::([0-9]{1,5}))?$/i.exec(value);
  if (!match || (match[2] && (+match[2] < 1 || +match[2] > 65535))) return null;
  const host = match[1].toLowerCase().replace(/\.$/, '');
  if (host === '[::1]') return host;
  if (host.length > 253 || !host.split('.').every(label => labelPattern.test(label))) return null;
  return host;
}

export function rootDomain(value = process.env.ZENVO_ROOT_DOMAIN ?? 'localhost'): string {
  const host = parseHost(value);
  if (!host || value.includes(':') || host === '127.0.0.1') {
    throw new Error('ZENVO_ROOT_DOMAIN must be a DNS hostname without a scheme, port, or path.');
  }
  return host;
}

export type HostResolution = { kind: 'app' } | { kind: 'tenant'; subdomain: string } | { kind: 'unknown' };

export function resolveHost(value: string | null, root: string): HostResolution {
  const host = parseHost(value);
  if (!host) return { kind: 'unknown' };
  if (host === root || (root === 'localhost' && ['127.0.0.1', '[::1]'].includes(host))) return { kind: 'app' };
  if (!host.endsWith(`.${root}`)) return { kind: 'unknown' };
  const subdomain = host.slice(0, -(root.length + 1));
  if (!labelPattern.test(subdomain) || reserved.has(subdomain)) return { kind: 'unknown' };
  return { kind: 'tenant', subdomain };
}

export function isInternalPath(path: string): boolean {
  return path === sitePrefix || path.startsWith(`${sitePrefix}/`);
}

export function isAppOnlyPath(path: string): boolean {
  return /^\/(agency|subaccount|api|trpc|sign-in|sign-up)(\/|$)/.test(path) || isInternalPath(path);
}

export function sharedAsset(path: string): boolean {
  return path.startsWith('/_next/static/') || path === '/_next/image' || path === '/favicon.ico';
}

// Decode before checking route boundaries; fail closed for ambiguous separators.
export function policyPath(path: string): string | null {
  try {
    const decoded = decodeURIComponent(path);
    if (/[\\%\x00-\x1f]/.test(decoded) || decoded.includes('//')) return null;
    return decoded;
  } catch { return null; }
}
