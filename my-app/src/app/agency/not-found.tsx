import Link from 'next/link';
export default function AgencyNotFound() {
  return <section className="agency-empty"><h1>Agency unavailable</h1><p>This agency doesn’t exist or you don’t have access to its settings.</p><Link className="action" href="/agency">Back to your agencies</Link></section>;
}
