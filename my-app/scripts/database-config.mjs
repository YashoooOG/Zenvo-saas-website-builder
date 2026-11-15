// This checker targets local development only; remote TLS policy comes later.
export function localDatabaseConfig(value) {
  const invalid = () => new Error(
    'DATABASE_URL must be a local mysql://user:password@127.0.0.1:port/database URL without query options. Run bun run db:setup.',
  );
  if (!value) throw invalid();
  let url;
  try { url = new URL(value); } catch { throw invalid(); }
  if (
    url.protocol !== 'mysql:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !url.username || !url.password || url.search || url.hash ||
    !/^\/[a-zA-Z0-9_]+$/.test(url.pathname)
  ) throw invalid();
  const port = Number(url.port || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw invalid();
  let user, password;
  try {
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
  } catch { throw invalid(); }
  return {
    host: url.hostname.replace(/^\[|\]$/g, ''), port, user, password,
    database: url.pathname.slice(1), connectTimeout: 10000,
    multipleStatements: false,
  };
}
