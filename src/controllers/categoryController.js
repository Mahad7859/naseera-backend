const pool = require('../config/db')
const { normalizeCategory } = require('../utils/normalizers')

async function getCategories(_req, res) {
  const { rows } = await pool.query('SELECT * FROM categories ORDER BY display_order ASC, name ASC')
  return res.json(rows.map(normalizeCategory))
}

async function adminGetCategories(_req, res) {
  const { rows } = await pool.query('SELECT * FROM categories ORDER BY display_order ASC')
  return res.json(rows.map(normalizeCategory))
}

async function adminCreateCategory(req, res) {
  const { name, image_url, display_order = 0 } = req.body

  if (!name || !image_url) {
    return res.status(400).json({ message: 'Name and image URL are required.' })
  }

  const { rows } = await pool.query(
    'INSERT INTO categories (name, image_url, display_order) VALUES ($1,$2,$3) RETURNING *',
    [name.toLowerCase().trim(), image_url, Number(display_order)],
  )

  return res.status(201).json(normalizeCategory(rows[0]))
}

async function adminUpdateCategory(req, res) {
  const { name, image_url, display_order = 0 } = req.body

  if (!name || !image_url) {
    return res.status(400).json({ message: 'Name and image URL are required.' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const oldCat = await client.query('SELECT name FROM categories WHERE id=$1', [req.params.id])
    if (!oldCat.rows[0]) {
      await client.query('ROLLBACK')
      return res.status(404).json({ message: 'Category not found.' })
    }

    const oldName = oldCat.rows[0].name
    const newName = name.toLowerCase().trim()

    const { rows } = await client.query(
      `UPDATE categories
       SET name=$1, image_url=$2, display_order=$3, updated_at=NOW()
       WHERE id=$4 RETURNING *`,
      [newName, image_url, Number(display_order), req.params.id],
    )

    // Keep products in sync when category name changes
    if (newName !== oldName) {
      await client.query('UPDATE products SET category=$1 WHERE category=$2', [newName, oldName])
    }

    await client.query('COMMIT')
    return res.json(normalizeCategory(rows[0]))
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Category update error:', error.message)
    return res.status(500).json({ message: 'Failed to update category.' })
  } finally {
    client.release()
  }
}

async function adminDeleteCategory(req, res) {
  const { rowCount } = await pool.query('DELETE FROM categories WHERE id=$1', [req.params.id])
  if (!rowCount) return res.status(404).json({ message: 'Category not found.' })
  return res.status(204).send()
}

module.exports = {
  getCategories,
  adminGetCategories, adminCreateCategory, adminUpdateCategory, adminDeleteCategory,
}
