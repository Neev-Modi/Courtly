import { request } from '../../shared/api/client';
export const generateReport = (input) =>
  request('/analysis/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
