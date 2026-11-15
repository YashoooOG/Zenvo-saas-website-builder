'use client';
export default function WorkspaceError({ reset }: { reset: () => void }) {
  return <section className="agency-empty"><h1>Your workspace couldn’t load</h1><p>Please try again. If it continues, check your connection or sign out and back in.</p><button className="action" onClick={reset}>Try again</button></section>;
}
