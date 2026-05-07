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
app.use(express.urlencoded({ extended: true }))
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
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT,
      customer_address TEXT,
      total_amount NUMERIC(12, 2) NOT NULL,
      order_items JSONB NOT NULL DEFAULT '[]',
      payment_method TEXT NOT NULL DEFAULT 'online',
      status TEXT NOT NULL DEFAULT 'pending',
      safepay_tracker TEXT,
      cashmaal_order_id TEXT,
      cashmaal_cm_tid TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      image_url TEXT NOT NULL,
      display_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hero_slides (
      id SERIAL PRIMARY KEY,
      image_url TEXT NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT DEFAULT '',
      display_order INTEGER DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS customer_phone TEXT,
    ADD COLUMN IF NOT EXISTS customer_address TEXT,
    ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS order_items JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'online',
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS safepay_tracker TEXT,
    ADD COLUMN IF NOT EXISTS cashmaal_order_id TEXT,
    ADD COLUMN IF NOT EXISTS cashmaal_cm_tid TEXT;
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
    ALTER TABLE categories
    ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `)

  await pool.query(`
    ALTER TABLE hero_slides
    ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0,
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

/**
 * Normalizes product row from database snake_case to frontend camelCase.
 * Ensures consistency across the application.
 */
function normalizeHeroSlide(row) {
  return {
    ...row,
    imageUrl: row.image_url,
    displayOrder: row.display_order,
    isActive: row.is_active,
  }
}

function normalizeCategory(row) {
  return {
    ...row,
    imageUrl: row.image_url,
    displayOrder: row.display_order,
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

app.get('/api/hero-slides', async (_req, res) => {
  const { rows } = await pool.query(`SELECT * FROM hero_slides WHERE is_active = TRUE ORDER BY display_order ASC, created_at DESC`)
  res.json(rows.map(normalizeHeroSlide))
})

app.get('/api/categories', async (_req, res) => {
  const { rows } = await pool.query(`SELECT * FROM categories ORDER BY display_order ASC, name ASC`)
  res.json(rows.map(normalizeCategory))
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

app.get('/api/admin/hero-slides', requireAdminAuth, async (_req, res) => {
  const { rows } = await pool.query(`SELECT * FROM hero_slides ORDER BY display_order ASC, created_at DESC`)
  res.json(rows.map(normalizeHeroSlide))
})

app.post('/api/admin/hero-slides', requireAdminAuth, async (req, res) => {
  const { image_url, title, subtitle = '', display_order = 0, is_active = true } = req.body
  const { rows } = await pool.query(
    `INSERT INTO hero_slides (image_url, title, subtitle, display_order, is_active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [image_url, title, subtitle, display_order, is_active]
  )
  res.status(201).json(normalizeHeroSlide(rows[0]))
})

app.put('/api/admin/hero-slides/:id', requireAdminAuth, async (req, res) => {
  const { image_url, title, subtitle = '', display_order = 0, is_active = true } = req.body
  const { rows } = await pool.query(
    `UPDATE hero_slides
     SET image_url = $1,
         title = $2,
         subtitle = $3,
         display_order = $4,
         is_active = $5,
         updated_at = NOW()
     WHERE id = $6
     RETURNING *`,
    [image_url, title, subtitle, display_order, is_active, req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ message: 'Hero slide not found.' })
  return res.json(normalizeHeroSlide(rows[0]))
})

app.delete('/api/admin/hero-slides/:id', requireAdminAuth, async (req, res) => {
  const { rowCount } = await pool.query(`DELETE FROM hero_slides WHERE id = $1`, [req.params.id])
  if (!rowCount) return res.status(404).json({ message: 'Hero slide not found.' })
  return res.status(204).send()
})

app.get('/api/admin/categories', requireAdminAuth, async (_req, res) => {
  const { rows } = await pool.query(`SELECT * FROM categories ORDER BY display_order ASC`)
  res.json(rows.map(normalizeCategory))
})

app.post('/api/admin/categories', requireAdminAuth, async (req, res) => {
  const { name, image_url, display_order = 0 } = req.body
  const { rows } = await pool.query(
    `INSERT INTO categories (name, image_url, display_order)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [name.toLowerCase(), image_url, display_order]
  )
  res.status(201).json(normalizeCategory(rows[0]))
})

app.put('/api/admin/categories/:id', requireAdminAuth, async (req, res) => {
  const { name, image_url, display_order = 0 } = req.body
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const oldCat = await client.query('SELECT name FROM categories WHERE id = $1', [req.params.id])
    if (!oldCat.rows[0]) {
      await client.query('ROLLBACK')
      return res.status(404).json({ message: 'Category not found' })
    }
    const oldName = oldCat.rows[0].name
    const newName = name.toLowerCase()
    const { rows } = await client.query(
      `UPDATE categories SET name = $1, image_url = $2, display_order = $3, updated_at = NOW() WHERE id = $4 RETURNING *`,
      [newName, image_url, display_order, req.params.id]
    )
    if (newName !== oldName) {
      await client.query('UPDATE products SET category = $1 WHERE category = $2', [newName, oldName])
    }
    await client.query('COMMIT')
    res.json(normalizeCategory(rows[0]))
  } catch (error) {
    await client.query('ROLLBACK')
    res.status(500).json({ message: 'Failed to update category.' })
  } finally {
    client.release()
  }
})

app.delete('/api/admin/categories/:id', requireAdminAuth, async (req, res) => {
  const { rowCount } = await pool.query(`DELETE FROM categories WHERE id = $1`, [req.params.id])
  if (!rowCount) return res.status(404).json({ message: 'Category not found.' })
  return res.status(204).send()
})

app.post('/api/checkout', async (req, res) => {
  const { customer, items, total, paymentMethod } = req.body
  
  try {
    // Validate critical data to prevent DB crashes (NOT NULL constraints)
    if (!customer || !customer.email || !items || !total) {
      return res.status(400).json({ message: 'Missing order details. Email is required.' })
    }

    // 1. Create Order record
    const orderRes = await pool.query(
      `INSERT INTO orders (customer_name, customer_email, customer_phone, customer_address, total_amount, order_items, payment_method, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        customer.name, 
        customer.email, 
        customer.phone, 
        `${customer.address}, ${customer.city}`, 
        total, 
        JSON.stringify(items), 
        paymentMethod || 'online',
        paymentMethod === 'cod' ? 'pending_confirmation' : 'pending_payment'
      ]
    )
    const orderId = orderRes.rows[0].id

    if (paymentMethod === 'cod') {
      return res.json({ success: true, orderId, method: 'cod' })
    }

    // 2. CashMaal Integration Logic
    const cashmaalOrderId = `ORDER_${orderId}_${Date.now()}`
    
    await pool.query(
      `UPDATE orders SET cashmaal_order_id = $1 WHERE id = $2`,
      [cashmaalOrderId, orderId]
    )

    res.json({ 
      orderId,
      cashmaalOrderId,
      webId: process.env.CASHMAAL_WEB_ID,
      amount: total,
      currency: 'PKR',
      customerEmail: customer.email,
      customerName: customer.name,
      successUrl: `${allowedOrigin}/order-success?orderId=${orderId}`,
      cancelUrl: `${allowedOrigin}/checkout`
    })

  } catch (error) {
    console.error('CHECKOUT ERROR:', error)
    res.status(500).json({ 
      message: 'Failed to initialize checkout session.',
      error: error.message 
    })
  }
})

// CashMaal IPN (Webhook) Listener
app.post('/api/webhooks/cashmaal', async (req, res) => {
  const { status, cm_tid, order_id } = req.body;

  try {
    if (status === 'success') {
      await pool.query(
        `UPDATE orders SET status = 'paid', cashmaal_cm_tid = $1 
         WHERE cashmaal_order_id = $2 AND status = 'pending_payment'`,
        [cm_tid, order_id]
      );
      console.log(`[Webhook] Payment confirmed for Order: ${order_id}`);
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error('[Webhook Error]:', err);
    res.status(500).send('Webhook Processing Failed');
  }
});

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
