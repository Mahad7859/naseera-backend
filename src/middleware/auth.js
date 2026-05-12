const jwt = require('jsonwebtoken')

function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : null

  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' })
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    if (payload.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required.' })
    }
    req.admin = payload
    return next()
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token.' })
  }
}

function requireSupplierAuth(req, res, next) {
  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : null

  if (!token) {
    return res.status(401).json({ message: 'Authorization token required.' })
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    if (payload.role !== 'supplier') {
      return res.status(403).json({ message: 'Supplier access required.' })
    }
    req.user = payload
    return next()
  } catch (error) {
    return res.status(403).json({ message: 'Invalid or expired token.' })
  }
}

function requireAnyAuth(req, res, next) {
  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) return res.status(401).json({ message: 'Authentication required.' })

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    if (payload.role !== 'admin' && payload.role !== 'supplier') {
      return res.status(403).json({ message: 'Access denied.' })
    }
    req.user = payload
    return next()
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token.' })
  }
}

module.exports = { requireAdminAuth, requireSupplierAuth, requireAnyAuth }