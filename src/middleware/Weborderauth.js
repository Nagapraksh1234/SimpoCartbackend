const crypto = require('crypto')

// Reads a credential from the request: header first (Client-Id / Access-Key —
// hyphenated, same reasoning as the PHP comment: some servers drop headers
// with underscores in the name), then falls back to the JSON body key.
function readCredential(req, key) {
  const headerName = key.replace(/_/g, '-') // client_id -> client-id
  const headerValue = req.headers[headerName.toLowerCase()]
  if (headerValue) return String(headerValue).trim()

  const bodyValue = req.body?.[key]
  return bodyValue ? String(bodyValue).trim() : ''
}

// Constant-time string comparison, equivalent to PHP's hash_equals().
// timingSafeEqual throws if the buffers differ in length, so guard that first
// (an early-return here is fine — leaking a length mismatch isn't sensitive).
function safeEquals(a, b) {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

// Validates client_id + access_key against this business's configured
// values before anything else runs. Single-tenant for now (env vars);
// the PHP's ef_business_control_flags lookup is the multi-tenant version
// of this same check.
function requireWebOrderCredentials(req, res, next) {
  const clientId = readCredential(req, 'client_id')
  const accessKey = readCredential(req, 'access_key')

  // Never let these leak into rawPayload storage further down the chain.
  if (req.body) {
    delete req.body.client_id
    delete req.body.access_key
  }

  if (!clientId || !accessKey) {
    return res.status(400).json({ result: false, response: 'MISSING_CREDENTIALS', responseText: 'client_id and access_key are required' })
  }

  const expectedClientId = (process.env.WEB_ORDER_CLIENT_ID || '').trim()
  const expectedAccessKey = (process.env.WEB_ORDER_ACCESS_KEY || '').trim()

  console.log('DEBUG expected:', JSON.stringify(expectedClientId), 'got:', JSON.stringify(clientId))

  if (!expectedClientId || !expectedAccessKey) {
    return res.status(500).json({ result: false, response: 'API_NOT_CONFIGURED', responseText: 'Website order API is not enabled for this workshop' })
  }
  if (!safeEquals(expectedClientId, clientId)) {
    return res.status(401).json({ result: false, response: 'INVALID_CLIENT_ID', responseText: 'Invalid client_id' })
  }
  if (!safeEquals(expectedAccessKey, accessKey)) {
    return res.status(401).json({ result: false, response: 'INVALID_ACCESS_KEY', responseText: 'Invalid access_key' })
  }

  next()
}

module.exports = { requireWebOrderCredentials, safeEquals, readCredential }