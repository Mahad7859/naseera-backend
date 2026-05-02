require('dotenv').config()

const cors = require('cors')
const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const cloudinary = require('cloudinary').v2

const pool = require('./config/db')
const { requireAdminAuth } = require('./middleware/auth')

const app = express()
const port = process.env.PORT || 4000
const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:5173'
const uploadsDir = path.join(__dirname, 'uploads')

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

// Use memory storage for multer because we are forwarding to Cloudinary
const storage = multer.memoryStorage()

const upload = multer({ storage })

app.use(
  cors({
    origin: allowedOrigin,
    credentials: true,
  }),
)
app.use(express.json())
app.use('/uploads', express.static(uploadsDir))

async function initializeSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price NUMERIC(10, 2) NOT NULL DEFAULT 0,
      description TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      image_back TEXT DEFAULT '',
      image_side TEXT DEFAULT '',
      is_featured BOOLEAN NOT NULL DEFAULT FALSE,
      is_visible BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sale_ads (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      subtitle TEXT DEFAULT '',
      cta_text TEXT DEFAULT 'Shop Now',
      product_ids TEXT[] DEFAULT '{}',
      discount_percent NUMERIC(5, 2) DEFAULT 0,
      expires_at TIMESTAMPTZ,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'handbags',
    ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS image_back TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS image_side TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `)

  await pool.query(`
    ALTER TABLE sale_ads
    ADD COLUMN IF NOT EXISTS subtitle TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS cta_text TEXT DEFAULT 'Shop Now',
    ADD COLUMN IF NOT EXISTS product_ids TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `)
}

function normalizeProduct(row) {
  return {
    ...row,
    price: Number(row.price),
    // Map database snake_case to frontend camelCase for consistency
    imageUrl: row.image_url,
    imageBack: row.image_back,
    imageSide: row.image_side,
    isFeatured: row.is_featured,
    isVisible: row.is_visible,
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' })
  }

  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD_HASH || !process.env.JWT_SECRET) {
    return res.status(500).json({ message: 'Admin environment variables are not configured.' })
  }

  const isUsernameValid = username === process.env.ADMIN_USERNAME
  const isPasswordValid = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH)

  if (!isUsernameValid || !isPasswordValid) {
    return res.status(401).json({ message: 'Invalid login credentials.' })
  }

  const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '12h' })
  return res.json({ token, username })
})

app.get('/api/products', async (req, res) => {
  const { category } = req.query
  let query = 'SELECT * FROM products WHERE is_visible = TRUE'
  const params = []

  if (category) {
    query += ' AND category = $1'
    params.push(category)
  }

  query += ' ORDER BY created_at DESC'

  const { rows } = await pool.query(query, params)
  res.json(rows.map(normalizeProduct))
})

app.get('/api/sale-ads/active', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM sale_ads WHERE is_active = TRUE ORDER BY updated_at DESC`,
  )
  res.json(rows)
})

app.get('/api/admin/products', requireAdminAuth, async (_req, res) => {
  const { rows } = await pool.query(`SELECT * FROM products ORDER BY updated_at DESC`)
  res.json(rows.map(normalizeProduct))
})

app.post('/api/admin/products', requireAdminAuth, async (req, res) => {
  const {
    name,
    category,
    price,
    description = '',
    imageUrl = '',
    imageBack = '',
    imageSide = '',
    isFeatured = false,
    isVisible = true,
  } = req.body

  const { rows } = await pool.query(
    `INSERT INTO products
      (name, category, price, description, image_url, image_back, image_side, is_featured, is_visible)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [name, category, price, description, imageUrl, imageBack, imageSide, isFeatured, isVisible],
  )

  res.status(201).json(normalizeProduct(rows[0]))
})

app.put('/api/admin/products/:id', requireAdminAuth, async (req, res) => {
  const {
    name,
    category,
    price,
    description = '',
    imageUrl = '',
    imageBack = '',
    imageSide = '',
    isFeatured = false,
    isVisible = true,
  } = req.body

  const { rows } = await pool.query(
    `UPDATE products
     SET name = $1,
         category = $2,
         price = $3,
         description = $4,
         image_url = $5,
         image_back = $6,
         image_side = $7,
         is_featured = $8,
         is_visible = $9,
         updated_at = NOW()
     WHERE id = $10
     RETURNING *`,
    [name, category, price, description, imageUrl, imageBack, imageSide, isFeatured, isVisible, req.params.id],
  )

  if (!rows[0]) {
    return res.status(404).json({ message: 'Product not found.' })
  }

  return res.json(normalizeProduct(rows[0]))
})

app.delete('/api/admin/products/:id', requireAdminAuth, async (req, res) => {
  const { rowCount } = await pool.query(`DELETE FROM products WHERE id = $1`, [req.params.id])

  if (!rowCount) {
    return res.status(404).json({ message: 'Product not found.' })
  }

  return res.status(204).send()
})

app.get('/api/admin/sale-ads', requireAdminAuth, async (_req, res) => {
  const { rows } = await pool.query(`SELECT * FROM sale_ads ORDER BY updated_at DESC`)
  res.json(rows)
})

app.post('/api/admin/sale-ads', requireAdminAuth, async (req, res) => {
  const { title, subtitle = '', ctaText = 'Shop Now', isActive = true } = req.body
  const { rows } = await pool.query(
    `INSERT INTO sale_ads (title, subtitle, cta_text, is_active)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [title, subtitle, ctaText, isActive],
  )
  res.status(201).json(rows[0])
})

app.put('/api/admin/sale-ads/:id', requireAdminAuth, async (req, res) => {
  const { title, subtitle = '', ctaText = 'Shop Now', isActive = true } = req.body
  const { rows } = await pool.query(
    `UPDATE sale_ads
     SET title = $1,
         subtitle = $2,
         cta_text = $3,
         is_active = $4,
         updated_at = NOW()
     WHERE id = $5
     RETURNING *`,
    [title, subtitle, ctaText, isActive, req.params.id],
  )

  if (!rows[0]) {
    return res.status(404).json({ message: 'Sale ad not found.' })
  }

  return res.json(rows[0])
})

app.delete('/api/admin/sale-ads/:id', requireAdminAuth, async (req, res) => {
  const { rowCount } = await pool.query(`DELETE FROM sale_ads WHERE id = $1`, [req.params.id])

  if (!rowCount) {
    return res.status(404).json({ message: 'Sale ad not found.' })
  }

  return res.status(204).send()
})

app.post(
  '/api/admin/upload-image',
  requireAdminAuth,
  upload.single('image'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: 'Please choose an image to upload.' })
    }

    try {
      // Convert buffer to base64 to send to Cloudinary
      const b64 = Buffer.from(req.file.buffer).toString('base64')
      const dataURI = 'data:' + req.file.mimetype + ';base64,' + b64
      const result = await cloudinary.uploader.upload(dataURI, {
        folder: 'naseera-collection',
      })

      return res.status(201).json({ imageUrl: result.secure_url })
    } catch (uploadError) {
      console.error('Cloudinary upload error:', uploadError)
      return res.status(500).json({ message: 'Failed to upload image to cloud storage.' })
    }
  },
)

app.use((error, _req, res, _next) => {
  console.error(error)
  res.status(500).json({ message: error.message || 'Unexpected server error.' })
})

initializeSchema()
  .then(() => {
    const server = app.listen(port, () => {
      console.log(`Backend running on http://localhost:${port}`)
    })

    server.on('error', (err) => {
      console.error('Server error during startup:', err.message)
    })
  })
  .catch((error) => {
    console.error('Failed to initialize schema:', error)
    process.exit(1)
  })
