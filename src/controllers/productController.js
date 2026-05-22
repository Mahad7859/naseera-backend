const pool = require('../config/db')
const { normalizeProduct } = require('../utils/normalizers')

// ── Public ──────────────────────────────────────────────────

async function getProducts(req, res) {
  const { category } = req.query
  let query = 'SELECT * FROM products WHERE is_visible = TRUE AND is_draft = FALSE'
  const params = []

  if (category) {
    query += ' AND category = $1'
    params.push(category)
  }

  query += ' ORDER BY created_at DESC'

  const { rows } = await pool.query(query, params)
  return res.json(rows.map(normalizeProduct))
}

// ── Admin ────────────────────────────────────────────────────

async function adminGetProducts(_req, res) {
  const { rows } = await pool.query('SELECT * FROM products ORDER BY updated_at DESC')
  return res.json(rows.map(normalizeProduct))
}

async function adminCreateProduct(req, res) {
  const {
    name, category, price, wholesalePrice = 0,
    description = '', imageUrl = '', imageBack = '', imageSide = '',
    isFeatured = false, isVisible = true, stockQuantity = 10, isDraft = false,
    discountPercentage = 0, length = '', width = '',
  } = req.body

  if (!name || !category || price === undefined) {
    return res.status(400).json({ message: 'Name, category and price are required.' })
  }

  const { rows } = await pool.query(
    `INSERT INTO products
      (name, category, price, wholesale_price, description, image_url, image_back, image_side,
       is_featured, is_visible, stock_quantity, is_draft, discount_percentage, length, width)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [name, category, Number(price), Number(wholesalePrice), description, imageUrl, imageBack, imageSide,
     isFeatured, isVisible, Number(stockQuantity), isDraft, Number(discountPercentage), length, width],
  )

  return res.status(201).json(normalizeProduct(rows[0]))
}

async function adminUpdateProduct(req, res) {
  const {
    name, category, price, wholesalePrice = 0,
    description = '', imageUrl = '', imageBack = '', imageSide = '',
    isFeatured = false, isVisible = true, stockQuantity = 10, isDraft = false,
    discountPercentage = 0, length = '', width = '',
  } = req.body

  const { rows } = await pool.query(
    `UPDATE products
     SET name=$1, category=$2, price=$3, wholesale_price=$4, description=$5,
         image_url=$6, image_back=$7, image_side=$8,
         is_featured=$9, is_visible=$10, stock_quantity=$11,
         is_draft=$12, discount_percentage=$13, length=$14, width=$15, updated_at=NOW()
     WHERE id=$16
     RETURNING *`,
    [name, category, Number(price), Number(wholesalePrice), description, imageUrl, imageBack, imageSide,
     isFeatured, isVisible, Number(stockQuantity), isDraft, Number(discountPercentage), length, width, req.params.id],
  )

  if (!rows[0]) return res.status(404).json({ message: 'Product not found.' })
  return res.json(normalizeProduct(rows[0]))
}

async function adminDeleteProduct(req, res) {
  const { rowCount } = await pool.query('DELETE FROM products WHERE id=$1', [req.params.id])
  if (!rowCount) return res.status(404).json({ message: 'Product not found.' })
  return res.status(204).send()
}

async function adminGetDrafts(_req, res) {
  const { rows } = await pool.query(
    'SELECT * FROM products WHERE is_draft=TRUE ORDER BY created_at DESC'
  )
  return res.json(rows.map(normalizeProduct))
}

// ── Supplier ─────────────────────────────────────────────────

async function supplierUpdateStock(req, res) {
  const { stockQuantity } = req.body

  if (stockQuantity === undefined || Number(stockQuantity) < 0) {
    return res.status(400).json({ message: 'Valid stock quantity is required.' })
  }

  const { rows } = await pool.query(
    'UPDATE products SET stock_quantity=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
    [Number(stockQuantity), req.params.id],
  )

  if (!rows[0]) return res.status(404).json({ message: 'Product not found.' })
  return res.json(normalizeProduct(rows[0]))
}

async function supplierCreateProduct(req, res) {
  const { name, category, price, wholesalePrice = 0, description = '', imageUrl = '', imageBack = '', imageSide = '', length = '', width = '' } = req.body

  if (!name || !category || price === undefined) {
    return res.status(400).json({ message: 'Name, category and price are required.' })
  }

  const { rows } = await pool.query(
    `INSERT INTO products
      (name, category, price, wholesale_price, description, image_url, image_back, image_side, is_draft, stock_quantity, length, width)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,0,$9,$10)
     RETURNING *`,
    [name, category, Number(price), Number(wholesalePrice), description, imageUrl, imageBack, imageSide, length, width],
  )

  return res.status(201).json(normalizeProduct(rows[0]))
}

module.exports = {
  getProducts,
  adminGetProducts, adminCreateProduct, adminUpdateProduct, adminDeleteProduct, adminGetDrafts,
  supplierUpdateStock, supplierCreateProduct,
}
