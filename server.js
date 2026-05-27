const path = require('path');
const fs = require('fs'); // Added for direct .env file reading
const envResult = require('dotenv').config({ path: path.resolve(__dirname, '.env'), override: true });

if (envResult.error) {
  console.error('❌ Error loading .env file! Make sure it exists in the /backend folder:', envResult.error.message);
}

const express = require('express')
const cors = require('cors')

const { initializeSchema } = require('./src/models/schema')
const { helmetMiddleware, apiLimiter, sanitizeInput } = require('./src/middleware/security')

const publicRoutes   = require('./src/routes/publicRoutes')
const adminRoutes    = require('./src/routes/adminRoutes')
const sheetsRoutes   = require('./src/routes/sheetsRoutes') // New import
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
app.use('/api/admin',    sheetsRoutes) // New: Mount sheets routes under /api/admin
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
console.log('⏳ Initializing database schema...')
initializeSchema()
  .then(() => {
    app.listen(PORT, () => {
      const rawID = process.env.SPREADSHEET_ID || 'NOT SET';
      const maskedID = rawID !== 'NOT SET' 
        ? `${rawID.substring(0, 6)}...${rawID.substring(rawID.length - 4)}` 
        : 'NOT SET';
      
      console.log(`📊 Spreadsheet ID Loaded: ${maskedID}`);
      console.log(`📁 Looking for .env at: ${path.resolve(__dirname, '.env')}`);
      
      // --- NEW DEBUGGING STEP: Directly read .env file ---
      try {
        const envFilePath = path.resolve(__dirname, '.env');
        if (fs.existsSync(envFilePath)) {
          const envFileContent = fs.readFileSync(envFilePath, 'utf8');
          const stats = fs.statSync(envFilePath);
          const match = envFileContent.match(/^SPREADSHEET_ID=(.*)$/m);
          
          if (match && match[1]) {
            const fileID = match[1].trim();
            const maskedFileID = fileID !== 'NOT SET' 
              ? `${fileID.substring(0, 6)}...${fileID.substring(fileID.length - 4)}` 
              : 'NOT SET';
            console.log(`🔍 Value found in .env file: ${maskedFileID}`);
            console.log(`📅 File Last Modified: ${stats.mtime.toLocaleString()}`);
            
            if (fileID !== rawID) {
              console.warn(`⚠️  MISMATCH: The ID in .env (${maskedFileID}) differs from the loaded ID (${maskedID}).`);
              console.warn(`   This strongly suggests a system environment variable is overriding it, or the .env file has a hidden character.`);
            }
          } else {
            console.warn('⚠️  .env file found, but SPREADSHEET_ID not found or malformed within it.');
          }
        } else {
          console.warn('⚠️  .env file not found at the expected path.');
        }
      } catch (fileError) {
        console.error('❌ Error reading .env file for direct comparison:', fileError.message);
      }
      // --- END NEW DEBUGGING STEP ---

      if (rawID.length > 0 && rawID.startsWith('1') === false && rawID !== 'NOT SET') {
        console.log('⚠️  Notice: Your ID looks unusual. Ensure no spaces are in your .env file.');
      }

      console.log(`� Backend running on http://localhost:${PORT}`)
      console.log(`🌐 Accepting requests from: ${ALLOWED_ORIGIN}`)
    })
  })
  .catch((error) => {
    console.error('❌ Failed to initialize schema:', error)
    process.exit(1)
  })
