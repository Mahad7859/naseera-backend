require('dotenv').config()

const express = require('express')
const cors = require('cors')
const path = require('path')

const { initializeSchema } = require('./src/models/schema')
const { helmetMiddleware, apiLimiter, sanitizeInput } = require('./src/middleware/security')

const publicRoutes   = require('./src/routes/publicRoutes')
const adminRoutes    = require('./src/routes/adminRoutes')
const supplierRoutes = require('./src/routes/supplierRoutes')

const app = express()
const PORT = process.env.PORT || 4000
const ALLOWED_ORIGIN = process.env.FRONTEND_URL || 'http://localhost:5173'

// ── Security middleware ─────────────────────────────────────
app.use(helmetMiddleware)
app.set('trust proxy', 1) // Required for rate limiting behind proxies (Render, Railway, etc.)

// ── CORS ────────────────────────────────────────────────────
app.use(cors({
  origin: ALLOWED_ORIGIN,
  credentials: true,
}))

// ── Body parsers ────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true, limit: '2mb' }))

// ── Input sanitization ──────────────────────────────────────
app.use(sanitizeInput)

// ── General rate limit on all API routes ───────────────────
app.use('/api', apiLimiter)

// ── Static uploads ──────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'src', 'uploads')))

// ── Routes ──────────────────────────────────────────────────
app.use('/api',          publicRoutes)
app.use('/api/admin',    adminRoutes)
app.use('/api/supplier', supplierRoutes)

// ── 404 handler ─────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ message: 'Route not found.' })
})

// ── Global error handler ────────────────────────────────────
app.use((error, _req, res, _next) => {
  const fs = require('fs')
  const logMessage = `[${new Date().toISOString()}] ${error.stack || error.message}\n`
  fs.appendFileSync(path.join(__dirname, 'error.log'), logMessage)
  
  console.error('Unhandled error:', error.message)
  const status = error.status || 500
  const message = status === 500 ? 'An unexpected server error occurred.' : error.message
  res.status(status).json({ message })
})

// ── Start ────────────────────────────────────────────────────
initializeSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Backend running on http://localhost:${PORT}`)
      console.log(`🌐 Accepting requests from: ${ALLOWED_ORIGIN}`)
    })
  })
  .catch((error) => {
    console.error('❌ Failed to initialize schema:', error)
    process.exit(1)
  })
