const pool = require('../config/db')
const { normalizeOrder } = require('../utils/normalizers')
const { sendOrderNotificationEmail } = require('../utils/email')

const VALID_STATUSES = ['pending_confirmation', 'informed', 'packed', 'shipped', 'delivered', 'cancelled']

async function adminGetOrders(_req, res) {
  const { rows } = await pool.query('SELECT * FROM orders ORDER BY created_at DESC')
  return res.json(rows.map(normalizeOrder))
}

async function adminUpdateOrderStatus(req, res) {
  const { status } = req.body

  if (!status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`
    })
  }

  const { rows } = await pool.query(
    'UPDATE orders SET status=$1 WHERE id=$2 RETURNING *',
    [status, req.params.id],
  )

  if (!rows[0]) return res.status(404).json({ message: 'Order not found.' })
  return res.json(normalizeOrder(rows[0]))
}

async function checkout(req, res) {
  const { customer, items, total } = req.body

  // Validate required fields
  if (!customer?.name || !customer?.email || !items?.length || !total) {
    return res.status(400).json({ message: 'Missing order details. Name, email, items and total are required.' })
  }

  // Basic email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(customer.email)) {
    return res.status(400).json({ message: 'Invalid email address.' })
  }

  const orderRes = await pool.query(
    `INSERT INTO orders
      (customer_name, customer_email, customer_phone, customer_address,
       total_amount, order_items, payment_method, status)
     VALUES ($1,$2,$3,$4,$5,$6,'cod','pending_confirmation')
     RETURNING id`,
    [
      customer.name,
      customer.email,
      customer.phone || '',
      `${customer.address || ''}, ${customer.city || ''}`.trim().replace(/^,\s*/, ''),
      Number(total),
      JSON.stringify(items),
    ],
  )

  const orderId = orderRes.rows[0].id

  // Send email async — don't block response
  sendOrderNotificationEmail(orderId, customer, items, total, 'cod', 'pending_confirmation')

  return res.json({ success: true, orderId, method: 'cod' })
}

module.exports = { adminGetOrders, adminUpdateOrderStatus, checkout }
