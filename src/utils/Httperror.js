class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Throws an HttpError when the condition is falsy. */
function must(condition, status, message) {
  if (!condition) throw new HttpError(status, message);
}

/** Lets async controllers throw; errors go to the error middleware. */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { HttpError, must, asyncHandler };