import { AppError } from './errors.js';
export function fail(message, status = 400, code = 'VALIDATION_ERROR') {
  throw new AppError(status, code, message);
}
export function uuid(value) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  )
    fail('Invalid resource ID.');
  return value;
}
export function text(value, label, max, optional = false) {
  if (optional && value === undefined) return '';
  if (typeof value !== 'string' || (!optional && !value.trim()) || value.trim().length > max)
    fail(`${label} must contain ${optional ? '0' : '1'}–${max} characters.`);
  return value.trim();
}
