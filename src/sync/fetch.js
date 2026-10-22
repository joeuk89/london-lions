const USER_AGENT = 'london-lions-fixtures (+https://github.com/joeuk89/london-lions)';

export async function fetchText(url, { timeoutMs = 30_000, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return response.text();
}
