export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (!error.status) console.error('Request failed:', error.code || error.name);
  res.status(error.status || 500).json({
    error: {
      code: error.code && error.status ? error.code : 'INTERNAL_ERROR',
      message: error.status ? error.message : 'Something went wrong. Please try again.',
    },
  });
}
