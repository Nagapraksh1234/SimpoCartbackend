const { HttpError } = require("../utils/Httperror");

function notFound(_req, res) {
  res.status(404).json({ message: "Route not found" });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) return res.status(err.status).json({ message: err.message });
  if (err && err.name === "CastError") return res.status(400).json({ message: "Invalid id" });
  if (err && err.name === "ValidationError") return res.status(400).json({ message: err.message });
  if (err && err.code === 11000) {
    return res.status(409).json({ message: "Duplicate value", fields: err.keyValue });
  }
  console.error(err);
  res.status(500).json({ message: "Something went wrong" });
}

module.exports = { notFound, errorHandler };