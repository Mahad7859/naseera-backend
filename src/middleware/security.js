const rateLimit = require('express-rate-limit')
const helmet = require('helmet')

// ── Helmet — sets secure HTTP headers ──────────────────────
const helmetMiddleware = helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow images to load cross-origin
})

// ── Rate limiters ───────────────────────────────────────────

// Strict limiter for login endpoints — prevents brute force
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { message: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// General API limiter — prevents abuse
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: { message: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Checkout limiter — prevents order spam
const checkoutLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: { message: 'Too many checkout attempts. Please wait a moment.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// ── Input sanitizer — strips dangerous characters ──────────
function sanitizeInput(req, _res, next) {
  const sanitize = (obj) => {
    if (!obj || typeof obj !== 'object') return obj
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'string') {
        // Remove null bytes and trim whitespace
        obj[key] = obj[key].replace(/\0/g, '').trim()
      } else if (typeof obj[key] === 'object') {
        sanitize(obj[key])
      }
    }
    return obj
  }
  sanitize(req.body)
  sanitize(req.query)
  next()
}

module.exports = { helmetMiddleware, loginLimiter, apiLimiter, checkoutLimiter, sanitizeInput }
