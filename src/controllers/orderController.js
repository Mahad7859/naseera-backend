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
  const { customer, items, total, shippingFee } = req.body

  // Validate required fields
  if (!customer?.name || !customer?.email || !items?.length || !total) {
    return res.status(400).json({ message: 'Missing order details. Name, email, items and total are required.' })
  }

  // Basic email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(customer.email)) {
    return res.status(400).json({ message: 'Invalid email address.' })
  }

  try {
    const orderRes = await pool.query(
      `INSERT INTO orders
        (customer_name, customer_email, customer_phone, customer_address,
         total_amount, order_items, payment_method, status, shipping_fee, province)
       VALUES ($1,$2,$3,$4,$5,$6,'cod','pending_confirmation',$7,$8)
       RETURNING id`,
      [
        customer.name,
        customer.email,
        customer.phone || '',
        `${customer.address || ''}, ${customer.city || ''}`.trim().replace(/^,\s*/, ''),
        Number(total),
        JSON.stringify(items),
        Number(shippingFee || 0),
        customer.province || ''
      ],
    )

    const orderId = orderRes.rows[0].id

    // Deduct stock for each item purchased
    for (const item of items) {
      if (item.id) {
        try {
          await pool.query(
            'UPDATE products SET stock_quantity = GREATEST(0, stock_quantity - $1) WHERE id = $2',
            [item.quantity || 1, item.id]
          );
        } catch (stockError) {
          console.error(`❌ Failed to deduct stock for Product #${item.id}:`, stockError.message);
          // We don't throw here to ensure the order itself is still processed
        }
      }
    }

    // Send email - removed await to prevent checkout from getting stuck if connection is slow/blocked
    sendOrderNotificationEmail(orderId, customer, items, total, 'cod', 'pending_confirmation', shippingFee, customer.province)

    return res.json({
      message: 'Order placed successfully',
      orderId,
    })
  } catch (error) {
    console.error('Checkout error:', error)
    return res.status(500).json({ message: 'Internal server error during checkout.' })
  }
}

async function publicGetOrderTracking(req, res) {
  const { id } = req.params
  try {
    const { rows } = await pool.query(
      'SELECT * FROM orders WHERE id=$1', 
      [id]
    )
    
    if (!rows[0]) return res.status(404).json({ message: 'Order not found.' })
    
    return res.json(normalizeOrder(rows[0]))
  } catch (error) {
    console.error('Tracking fetch error:', error)
    return res.status(500).json({ message: 'Error fetching order tracking details.' })
  }
}

module.exports = { adminGetOrders, adminUpdateOrderStatus, checkout, publicGetOrderTracking }
