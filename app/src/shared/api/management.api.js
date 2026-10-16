import { request } from './client';
const send = (path, method, body) =>
  request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
export const managementApi = {
  courts: () => request('/courts'),
  saveCourt: (id, data) => send(id ? `/courts/${id}` : '/courts', id ? 'PUT' : 'POST', data),
  blocks: (id) => request(`/courts/${id}/blocks`),
  addBlock: (id, data) => send(`/courts/${id}/blocks`, 'POST', data),
  removeBlock: (id, block) => send(`/courts/${id}/blocks/${block}`, 'DELETE'),
  slots: (query) => request(`/bookings/availability?${new URLSearchParams(query)}`),
  createBooking: (data) => send('/bookings', 'POST', data),
  bookings: (admin, query) =>
    request(`/bookings${admin ? '' : '/mine'}?${new URLSearchParams(query)}`),
  respond: (id, status) => send(`/bookings/${id}/respond`, 'POST', { status }),
  cancel: (id, reason) => send(`/bookings/${id}/cancel`, 'POST', { reason }),
};
