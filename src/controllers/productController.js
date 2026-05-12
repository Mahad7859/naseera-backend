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
    name, category, price,
    description = '', imageUrl = '', imageBack = '', imageSide = '',
    isFeatured = false, isVisible = true, stockQuantity = 10, isDraft = false,
  } = req.body

  if (!name || !category || price === undefined) {
    return res.status(400).json({ message: 'Name, category and price are required.' })
  }

  const { rows } = await pool.query(
    `INSERT INTO products
      (name, category, price, description, image_url, image_back, image_side,
       is_featured, is_visible, stock_quantity, is_draft)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [name, category, Number(price), description, imageUrl, imageBack, imageSide,
     isFeatured, isVisible, Number(stockQuantity), isDraft],
  )

  return res.status(201).json(normalizeProduct(rows[0]))
}

async function adminUpdateProduct(req, res) {
  const {
    name, category, price,
    description = '', imageUrl = '', imageBack = '', imageSide = '',
    isFeatured = false, isVisible = true, stockQuantity = 10, isDraft = false,
  } = req.body

  const { rows } = await pool.query(
    `UPDATE products
     SET name=$1, category=$2, price=$3, description=$4,
         image_url=$5, image_back=$6, image_side=$7,
         is_featured=$8, is_visible=$9, stock_quantity=$10,
         is_draft=$11, updated_at=NOW()
     WHERE id=$12
     RETURNING *`,
    [name, category, Number(price), description, imageUrl, imageBack, imageSide,
     isFeatured, isVisible, Number(stockQuantity), isDraft, req.params.id],
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
  const { name, category, price, description = '', imageUrl = '', imageBack = '', imageSide = '' } = req.body

  if (!name || !category || price === undefined) {
    return res.status(400).json({ message: 'Name, category and price are required.' })
  }

  const { rows } = await pool.query(
    `INSERT INTO products
      (name, category, price, description, image_url, image_back, image_side, is_draft, stock_quantity)
     VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,0)
     RETURNING *`,
    [name, category, Number(price), description, imageUrl, imageBack, imageSide],
  )

  return res.status(201).json(normalizeProduct(rows[0]))
}

module.exports = {
  getProducts,
  adminGetProducts, adminCreateProduct, adminUpdateProduct, adminDeleteProduct, adminGetDrafts,
  supplierUpdateStock, supplierCreateProduct,
}
