const pool = require('../config/db')
const { normalizeOrder } = require('../utils/normalizers')
const { sendOrderNotificationEmail } = require('../utils/email')
const { updateFinancialSheet } = require('../utils/sheetsApi')
const axios = require('axios')

const VALID_STATUSES = ['pending_confirmation', 'informed', 'packed', 'shipped', 'delivered', 'cancelled']

async function adminGetOrders(_req, res) {
  const { rows } = await pool.query(
    `SELECT orders.*, m.trax_sheet_id
     FROM orders
     LEFT JOIN manifests m ON orders.manifest_id = m.id
     ORDER BY orders.created_at DESC`
  )
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
         total_amount, order_items, payment_method, status, shipping_fee, province, city_id)
       VALUES ($1,$2,$3,$4,$5,$6,'cod','pending_confirmation',$7,$8,$9)
       RETURNING id`,
      [
        customer.name,
        customer.email,
        customer.phone || '',
        `${customer.address || ''}, ${customer.city || ''}`.trim().replace(/^,\s*/, ''),
        Number(total),
        JSON.stringify(items),
        Number(shippingFee || 0),
        customer.province || '',
        customer.cityId || null
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

    // Send notification email to admin
    try {
      await sendOrderNotificationEmail(orderId, customer, items, total, 'cod', 'pending_confirmation', shippingFee, customer.province, customer.city)
    } catch (emailError) {
      console.error('📧 Email notification failed but order was saved:', emailError.message)
    }

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

async function confirmOrderWithTrax(req, res) {
  const { orderId } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    const order = rows[0];
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Defensive parsing: ensure we never send NaN to the carrier
    const serviceTypeId = Number(process.env.TRAX_SERVICE_TYPE_ID) || 1;
    const shippingModeId = Number(process.env.TRAX_SHIPPING_MODE_ID) || 3;
    const pickupCityId = Number(process.env.TRAX_PICKUP_CITY_ID) || 144;
    const pickupAddressId = Number(process.env.TRAX_PICKUP_ADDRESS_ID) || 631587;
    const consigneeCityId = Number(order.city_id) || 223;

    const traxPayload = {
      service_type_id: serviceTypeId,
      pickup_city_id: pickupCityId,
      consignee_city_id: consigneeCityId,
      consignee_name: String(order.customer_name || order.customerName || 'Customer').trim(),
      consignee_address: String(order.customer_address || '').trim(),
      consignee_phone_number_1: String(order.customer_phone || '').trim(),
      order_id: `NC-${order.id}`,
      item_product_type_id: Number(process.env.TRAX_PRODUCT_TYPE_ID || 24), // 24 = Purses/Apparel
      item_description: "Handcrafted Purse",
      item_quantity: 1,      // Mandatory for Service Type 1
      pieces_quantity: 1,    // Mandatory for physical box count
      weight: 0.5,
      estimated_weight: 0.5,
      shipping_mode_id: shippingModeId,
      amount: Math.floor(Number(order.total_amount)), // Ensure integer
      payment_mode_id: Number(process.env.TRAX_PAYMENT_MODE_ID) || 1,
      charges_mode_id: Number(process.env.TRAX_CHARGES_MODE_ID) || 4,
      information_display: process.env.TRAX_INFORMATION_DISPLAY === 'false' ? 0 : 1,
      item_insurance: process.env.TRAX_ITEM_INSURANCE === 'true' ? 1 : 0,
      pickup_address_id: pickupAddressId,
    }
    
    // CRITICAL DEBUGGING: This prints exactly what TRAX sees
    console.log('--- TRAX OUTGOING PAYLOAD DEBUG ---');
    console.log('Environment Var (TRAX_SHIPPING_MODE_ID):', process.env.TRAX_SHIPPING_MODE_ID);
    console.log('Final Mode ID used:', shippingModeId);
    console.log('Full Payload:', JSON.stringify(traxPayload, null, 2));
    console.log('-----------------------------------');

    if (pickupAddressId === 0) {
      console.error('TRAX Booking Error: missing TRAX_PICKUP_ADDRESS_ID environment variable')
      return res.status(500).json({
        message: 'TRAX Booking Failed: pickup_address_id not configured. Set TRAX_PICKUP_ADDRESS_ID in the server environment.',
      })
    }

    const traxResponse = await axios.post('https://sonic.pk/api/shipment/book', traxPayload, {
      headers: { 'Authorization': process.env.TRAX_API_KEY }
    });

    const responseData = traxResponse.data || {}
    const trackingNumber = responseData.tracking_number || responseData.data?.tracking_number || responseData.result?.tracking_number || responseData.tracking_no || responseData.trackingNumber

    if (!trackingNumber) {
      const errorDetails = responseData.errors
        ? Object.entries(responseData.errors)
            .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(', ') : msgs}`)
            .join(' | ')
        : 'No specific error details provided';

      console.error('TRAX Booking Error: Carrier rejected the shipment request', {
        orderId,
        status: traxResponse.status,
        apiMessage: responseData.message,
        errorDetails,
        rawResponse: responseData,
      })

      return res.status(502).json({
        message: 'TRAX Booking Failed: missing tracking number in carrier response.',
        response: responseData,
      })
    }

    await pool.query(
      'UPDATE orders SET tracking_number = $1, status = $2, trax_status = $3 WHERE id = $4',
      [trackingNumber, 'confirmed', 'booked', orderId]
    );

    return res.json({ success: true, tracking_number: trackingNumber });
  } catch (error) {
    const errorData = error.response?.data || {};
    const errorDetails = errorData.errors
      ? Object.entries(errorData.errors)
          .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(', ') : msgs}`)
          .join(' | ')
      : 'No detailed errors';

    console.error('TRAX Booking Error:', error.message, { 
      orderId, 
      errorDetails, 
      error: errorData || error.stack || error 
    })
    return res.status(500).json({ message: 'TRAX Booking Failed' });
  }
}

async function getTraxLabel(req, res) {
  const { trackingNumber } = req.params;
  try {
    const url = `https://sonic.pk/api/shipment/print_waybill?tracking_number=${trackingNumber}&api_key=${process.env.TRAX_API_KEY}`;
    const response = await axios.get(url);

    res.setHeader('Content-Type', 'text/html');
    return res.send(response.data);
  } catch (error) {
    console.error("CRITICAL ERROR FROM TRAX:", error.response?.data || error.message);
    return res.status(500).json({ message: "Check Railway Logs for TRAX error" });
  }
}

async function dispatchOrders(req, res) {
  const { trackingNumbers } = req.body;
  try {
    const sheetRes = await axios.post('https://sonic.pk/api/receiving_sheet/create', 
      { tracking_numbers: trackingNumbers },
      { headers: { 'Authorization': process.env.TRAX_API_KEY } }
    );

    const sheetId = sheetRes.data.sheet_id;

    const manifestResult = await pool.query(
      'INSERT INTO manifests (trax_sheet_id, pdf_url) VALUES ($1, $2) RETURNING id, trax_sheet_id',
      [sheetId, `https://sonic.pk/api/receiving_sheet/print?sheet_id=${sheetId}`]
    );

    await pool.query(
      'UPDATE orders SET status = $1, trax_status = $2, manifest_id = $3 WHERE tracking_number = ANY($4)',
      ['shipped', 'dispatched', manifestResult.rows[0].id, trackingNumbers]
    );

    return res.json({ success: true, sheetId: manifestResult.rows[0].trax_sheet_id });
  } catch (error) {
    return res.status(500).json({ message: 'Dispatch Failed' });
  }
}

async function getTraxManifest(req, res) {
  const { sheetId } = req.params;
  try {
    const url = `https://sonic.pk/api/receiving_sheet/print?sheet_id=${sheetId}&api_key=${process.env.TRAX_API_KEY}`;
    const response = await axios.get(url);

    res.setHeader('Content-Type', 'text/html');
    return res.send(response.data);
  } catch (error) {
    console.error("CRITICAL ERROR FROM TRAX:", error.response?.data || error.message);
    return res.status(500).json({ message: "Check Railway Logs for TRAX error" });
  }
}

async function updateOrderManifest(req, res) {
  const { orderId } = req.params;
  const { manifestId } = req.body;
  await pool.query('UPDATE orders SET manifest_id = $1 WHERE id = $2', [manifestId, orderId]);
  return res.json({ success: true });
}

/**
 * POST /api/admin/orders/:id/complete
 * Logs the order to Google Sheets and marks it as 'Completed' in the DB.
 * Expects { cost_price, courier_fee } in the request body.
 */
async function completeOrder(req, res) {
  const { id } = req.params
  const { cost_price, courier_fee } = req.body

  if (cost_price === undefined || cost_price === null) {
    return res.status(400).json({ message: 'cost_price is required to complete an order.' })
  }

  try {
    // 1. Fetch the order
    const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [id])
    if (!rows[0]) return res.status(404).json({ message: 'Order not found.' })

    const order = rows[0]

    // 2. Derive item name from order_items JSON
    const items = Array.isArray(order.order_items) ? order.order_items : JSON.parse(order.order_items || '[]')
    const itemName = items.map(i => i.name || i.itemName || 'Unknown').join(', ') || 'Purse'

    // 3. Log to Google Sheets
    try {
      await updateFinancialSheet({
        orderId: order.id,
        itemName,
        costPrice: Number(cost_price),
        sellingPrice: Number(order.total_amount),
        courierFee: Number(courier_fee ?? order.shipping_fee ?? 0),
      })
    } catch (sheetsError) {
      console.error('⚠️  Google Sheets logging failed (order still completed):', sheetsError.message)
    }

    // 4. Update status in DB
    const { rows: updated } = await pool.query(
      `UPDATE orders
         SET status = 'Completed',
             cost_price = $1,
             courier_fee = $2
       WHERE id = $3
       RETURNING *`,
      [Number(cost_price), Number(courier_fee ?? order.shipping_fee ?? 0), id]
    )

    return res.json({ message: 'Order marked as Completed and logged to Sheets.', order: normalizeOrder(updated[0]) })
  } catch (error) {
    console.error('completeOrder error:', error)
    return res.status(500).json({ message: 'Internal server error while completing order.' })
  }
}

module.exports = { 
  adminGetOrders, 
  adminUpdateOrderStatus, 
  checkout, 
  publicGetOrderTracking,
  confirmOrderWithTrax,
  getTraxLabel,
  getTraxManifest,
  dispatchOrders,
  updateOrderManifest,
  completeOrder,
}
