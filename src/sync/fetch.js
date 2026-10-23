const USER_AGENT = 'london-lions-fixtures (+https://github.com/joeuk89/london-lions)';

export async function fetchText(url, { timeoutMs = 30_000, fetchImpl = fetch, method, headers, body } = {}) {
  const response = await fetchImpl(url, {
    method,
    body,
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/json', ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return response.text();
}
