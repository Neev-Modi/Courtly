export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
let refreshRequest;
export async function request(path, options = {}, retried = false) {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...options.headers },
  });
  if (response.status === 401 && !retried && path !== '/auth/refresh') {
    if (!refreshRequest)
      refreshRequest = fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'same-origin',
      }).finally(() => {
        refreshRequest = null;
      });
    const refreshed = await refreshRequest;
    if (refreshed.ok) return request(path, options, true);
  }
  if (response.status === 204) return null;
  const body = await response.json();
  if (!response.ok)
    throw new ApiError(
      response.status,
      body.error?.message || 'Unable to complete the request.',
      body.error?.code,
    );
  return body;
}
