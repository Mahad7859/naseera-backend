require('dotenv').config()

const cors = require('cors')
const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const nodemailer = require('nodemailer')
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

// Middleware to require supplier authentication
function requireSupplierAuth(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ message: 'Authorization token required.' })

  const token = authHeader.split(' ')[1]
  if (!token) return res.status(401).json({ message: 'Authorization token format is "Bearer <token>".' })

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err || user.role !== 'supplier') return res.status(403).json({ message: 'Access denied.' })
    req.user = user
    next()
  })
}

// Nodemailer Transporter Configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
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
      stock_quantity INTEGER NOT NULL DEFAULT 10,
      is_draft BOOLEAN NOT NULL DEFAULT FALSE,
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
      payment_method TEXT NOT NULL DEFAULT 'cod',
      status TEXT NOT NULL DEFAULT 'pending_confirmation',
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
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
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
    ADD COLUMN IF NOT EXISTS stock_quantity INTEGER NOT NULL DEFAULT 10,
    ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT FALSE,
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
    stockQuantity: Number(row.stock_quantity || 0),
    isDraft: row.is_draft,
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

function normalizeOrder(row) {
  return {
    id: row.id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    customerAddress: row.customer_address,
    totalAmount: Number(row.total_amount),
    orderItems: row.order_items,
    paymentMethod: row.payment_method,
    // Default status for COD is 'pending_confirmation'
    status: row.status,
    createdAt: row.created_at
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

  const token = jwt.sign({ username, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '12h' })
  return res.json({ token, username, role: 'admin' }) // Ensure role is included
})

app.get('/api/products', async (req, res) => {
  const { category } = req.query
  let query = 'SELECT * FROM products WHERE is_visible = TRUE AND is_draft = FALSE'
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
    stockQuantity = 10,
    isDraft = false
  } = req.body

  const { rows } = await pool.query(
    `INSERT INTO products
      (name, category, price, description, image_url, image_back, image_side, is_featured, is_visible, stock_quantity, is_draft)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [name, category, price, description, imageUrl, imageBack, imageSide, isFeatured, isVisible, stockQuantity, isDraft],
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
    stockQuantity = 10,
    isDraft = false
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
         stock_quantity = $10,
         is_draft = $11,
         updated_at = NOW()
     WHERE id = $12
     RETURNING *`,
    [name, category, price, description, imageUrl, imageBack, imageSide, isFeatured, isVisible, stockQuantity, isDraft, req.params.id],
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

// Admin Order Management Routes (Restored)
app.get('/api/admin/orders', requireAdminAuth, async (_req, res) => {
  const { rows } = await pool.query(`SELECT * FROM orders ORDER BY created_at DESC`)
  res.json(rows.map(normalizeOrder))
})

app.patch('/api/admin/orders/:id/status', requireAdminAuth, async (req, res) => {
  const { status } = req.body
  const { rows } = await pool.query(
    `UPDATE orders SET status = $1 WHERE id = $2 RETURNING *`,
    [status, req.params.id]
  )
  if (!rows[0]) {
    return res.status(404).json({ message: 'Order not found.' })
  }
  return res.json(normalizeOrder(rows[0]))
})

app.post('/api/supplier/login', async (req, res) => {
  const { username, password } = req.body
  if (!username || !password) return res.status(400).json({ message: 'Username and password required.' })
  
  const isValid = username === process.env.SUPPLIER_USERNAME && 
                 await bcrypt.compare(password, process.env.SUPPLIER_PASSWORD_HASH)

  if (!isValid) return res.status(401).json({ message: 'Invalid credentials.' })

  const token = jwt.sign({ username, role: 'supplier' }, process.env.JWT_SECRET, { expiresIn: '12h' })
  res.json({ token, username, role: 'supplier' })
})

app.patch('/api/supplier/products/:id/stock', requireSupplierAuth, async (req, res) => {
  const { stockQuantity } = req.body
  const { rows } = await pool.query(
    `UPDATE products SET stock_quantity = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [stockQuantity, req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ message: 'Product not found' })
  res.json(normalizeProduct(rows[0]))
})

app.post('/api/supplier/products', requireSupplierAuth, async (req, res) => {
  const { name, category, price, description = '', imageUrl = '', imageBack = '', imageSide = '' } = req.body
  const { rows } = await pool.query(
    `INSERT INTO products (name, category, price, description, image_url, image_back, image_side, is_draft, stock_quantity)
     VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, 0) RETURNING *`,
    [name, category, price, description, imageUrl, imageBack, imageSide]
  )
  res.status(201).json(normalizeProduct(rows[0]))
})

app.get('/api/admin/drafts', requireAdminAuth, async (_req, res) => {
  const { rows } = await pool.query(`SELECT * FROM products WHERE is_draft = TRUE ORDER BY created_at DESC`)
  res.json(rows.map(normalizeProduct))
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
  const { customer, items, total } = req.body
  
  try {
    // Validate critical data to prevent DB crashes (NOT NULL constraints)
    if (!customer || !customer.email || !items || !total) {
      return res.status(400).json({ message: 'Missing order details. Email is required.' })
    }

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
        'cod',
        'pending_confirmation'
      ]
    )
    const orderId = orderRes.rows[0].id

    await sendOrderNotificationEmail(orderId, customer, items, total, 'cod', 'pending_confirmation');
    return res.json({ success: true, orderId, method: 'cod' })
  } catch (error) {
    console.error('CHECKOUT ERROR:', error)
    res.status(500).json({ 
      message: 'Failed to initialize checkout session.',
      error: error.message 
    })
  }
})

// Function to send order notification email
async function sendOrderNotificationEmail(orderId, customer, items, total, paymentMethod, status) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER, // Send to yourself
    subject: `New Order Received! - Order ID: ${orderId} (${status.toUpperCase()})`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #c5a059;">New Order Alert!</h2>
        <p>A new order has been placed on your store.</p>
        
        <h3 style="color: #4a3f35;">Order Details (ID: ${orderId})</h3>
        <p><strong>Status:</strong> <span style="color: ${status === 'paid' ? '#28a745' : '#ffc107'}; font-weight: bold;">${status.replace('_', ' ').toUpperCase()}</span></p>
        <p><strong>Payment Method:</strong> ${paymentMethod.toUpperCase()}</p>
        <p><strong>Total Amount:</strong> PKR ${Number(total).toLocaleString()}</p>

        <h3 style="color: #4a3f35;">Customer Information</h3>
        <p><strong>Name:</strong> ${customer.name}</p>
        <p><strong>Email:</strong> ${customer.email}</p>
        <p><strong>Phone:</strong> ${customer.phone}</p>
        <p><strong>Address:</strong> ${customer.address}</p>

        <h3 style="color: #4a3f35;">Items Ordered</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr style="background-color: #f8f8f8;">
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Product</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Quantity</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: right;">Price</th>
          </tr>
          ${items.map(item => `
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;">${item.name}</td>
              <td style="padding: 8px; border: 1px solid #ddd;">${item.quantity}</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">PKR ${Number(item.price).toLocaleString()}</td>
            </tr>
          `).join('')}
        </table>
        <p>Thank you for using Naseera Collection!</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Order notification email sent for Order ID: ${orderId}`);
  } catch (emailError) {
    console.error(`Failed to send order notification email for Order ID: ${orderId}`, emailError);
  }
}

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
