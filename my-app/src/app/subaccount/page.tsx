import Link from 'next/link';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { getDb } from '@/lib/db';
import { listSubAccounts } from '@/lib/subaccounts';
export const metadata = { title: 'Your client workspaces' };
export default async function ClientWorkspaces() {
  const user = await requireWorkspaceUser();
  const accounts = await listSubAccounts(getDb(), user.id);
  return <><div className="workspace-heading"><div><h1>Your client workspaces</h1><p>Open a workspace you manage or have been assigned to.</p></div></div>{accounts.length ? <ul className="client-list">{accounts.map(account => <li key={account.id}><div><h2>{account.name}</h2><p>{account.agency.name}</p></div><Link className="text-action" href={`/subaccount/${account.id}`}>Open workspace<span className="sr-only"> {account.name}</span></Link></li>)}</ul> : <section className="agency-empty"><h2>No client workspaces yet</h2><p>Agency owners and admins can create a client workspace from their agency. Other users need an assignment before a workspace appears here.</p></section>}</>;
}
