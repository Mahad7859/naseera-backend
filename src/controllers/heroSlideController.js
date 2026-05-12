const pool = require('../config/db')
const { normalizeHeroSlide } = require('../utils/normalizers')

async function getHeroSlides(_req, res) {
  const { rows } = await pool.query(
    'SELECT * FROM hero_slides WHERE is_active=TRUE ORDER BY display_order ASC, created_at DESC'
  )
  return res.json(rows.map(normalizeHeroSlide))
}

async function adminGetHeroSlides(_req, res) {
  const { rows } = await pool.query(
    'SELECT * FROM hero_slides ORDER BY display_order ASC, created_at DESC'
  )
  return res.json(rows.map(normalizeHeroSlide))
}

async function adminCreateHeroSlide(req, res) {
  const { image_url, title, subtitle = '', display_order = 0, is_active = true } = req.body

  if (!image_url || !title) {
    return res.status(400).json({ message: 'Image URL and title are required.' })
  }

  const { rows } = await pool.query(
    `INSERT INTO hero_slides (image_url, title, subtitle, display_order, is_active)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [image_url, title, subtitle, Number(display_order), is_active],
  )

  return res.status(201).json(normalizeHeroSlide(rows[0]))
}

async function adminUpdateHeroSlide(req, res) {
  const { image_url, title, subtitle = '', display_order = 0, is_active = true } = req.body

  if (!image_url || !title) {
    return res.status(400).json({ message: 'Image URL and title are required.' })
  }

  const { rows } = await pool.query(
    `UPDATE hero_slides
     SET image_url=$1, title=$2, subtitle=$3, display_order=$4, is_active=$5, updated_at=NOW()
     WHERE id=$6 RETURNING *`,
    [image_url, title, subtitle, Number(display_order), is_active, req.params.id],
  )

  if (!rows[0]) return res.status(404).json({ message: 'Hero slide not found.' })
  return res.json(normalizeHeroSlide(rows[0]))
}

async function adminDeleteHeroSlide(req, res) {
  const { rowCount } = await pool.query('DELETE FROM hero_slides WHERE id=$1', [req.params.id])
  if (!rowCount) return res.status(404).json({ message: 'Hero slide not found.' })
  return res.status(204).send()
}

module.exports = {
  getHeroSlides,
  adminGetHeroSlides, adminCreateHeroSlide, adminUpdateHeroSlide, adminDeleteHeroSlide,
}
