const pool = require('../config/db')
const { normalizeOrder } = require('../utils/normalizers')
const { sendOrderNotificationEmail } = require('../utils/email')
const { updateFinancialSheet } = require('../utils/sheetsApi')
const axios = require('axios')
const { logDeliveredOrderFinancials } = require('../utils/financeHelper')
const { appendOrderToSheet, logFinancialTransaction } = require('../utils/googleSheets')

const VALID_STATUSES = ['pending_confirmation', 'informed', 'packed', 'shipped', 'dispatched', 'delivered', 'cancelled', 'returned']

async function adminGetOrders(_req, res) {
  const { rows } = await pool.query(
    `SELECT * FROM orders ORDER BY created_at DESC`
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

  // Trigger financial automation if status is 'delivered'
  if (status === 'delivered') {
    logDeliveredOrderFinancials(req.params.id);
  }

  // Log to Google Sheets when status changes to 'confirmed'
  if (status === 'confirmed') {
    try {
      const updatedOrder = rows[0];
      const items = Array.isArray(updatedOrder.order_items) ? updatedOrder.order_items : JSON.parse(updatedOrder.order_items || '[]');
      const enrichedItems = [];
      for (const item of items) {
        const prodRes = await pool.query('SELECT wholesale_price, supplier_name, category FROM products WHERE id = $1', [item.id]);
        const product = prodRes.rows[0];
        enrichedItems.push({
          ...item,
          wholesale_price: product ? product.wholesale_price : 0,
          supplier_name: product ? product.supplier_name : 'Default Supplier',
          category: product ? product.category : 'Bag'
        });
      }
      await appendOrderToSheet(updatedOrder, enrichedItems);
    } catch (err) {
      console.error('⚠️ Sheets logging failed on manual status change to confirmed:', err.message);
    }
  }

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

    const fullOrder = orderRes.rows[0]
    const orderId = fullOrder.id

    // Enrich items with wholesale cost and deduct stock
    const enrichedItems = []
    for (const item of items) {
      if (item.id) {
        try {
          // Fetch cost and category for logging
          const prodRes = await pool.query('SELECT wholesale_price, supplier_name, category FROM products WHERE id = $1', [item.id])
          const product = prodRes.rows[0]
          enrichedItems.push({
            ...item,
            wholesale_price: product ? product.wholesale_price : 0,
            supplier_name: product ? product.supplier_name : 'Default Supplier',
            category: product ? product.category : 'Bag'
          })

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

    if (!process.env.TRAX_API_KEY) {
      return res.status(500).json({ 
        message: 'TRAX_API_KEY is missing in the local environment (.env file).' 
      });
    }

    // FORCING IDs FOR SWIFT DELIVERY - DO NOT CHANGE
    const serviceTypeId = 1;
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
      order_id: `${process.env.TRAX_ORDER_PREFIX || 'NC'}-${order.id}`,
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
        message: `TRAX Rejected: ${responseData.message || errorDetails}`,
        response: responseData,
      })
    }

    await pool.query(
      'UPDATE orders SET tracking_number = $1, status = $2, trax_status = $3 WHERE id = $4',
      [trackingNumber, 'confirmed', 'booked', orderId]
    );

    // 4. Log to Google Sheets (moved from checkout to confirmation phase)
    try {
      const { rows: orderRows } = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
      const updatedOrder = orderRows[0];
      const items = Array.isArray(updatedOrder.order_items) ? updatedOrder.order_items : JSON.parse(updatedOrder.order_items || '[]');
      
      const enrichedItems = [];
      for (const item of items) {
        const prodRes = await pool.query('SELECT wholesale_price, supplier_name, category FROM products WHERE id = $1', [item.id]);
        const product = prodRes.rows[0];
        enrichedItems.push({
          ...item,
          wholesale_price: product ? product.wholesale_price : 0,
          supplier_name: product ? product.supplier_name : 'Default Supplier',
          category: product ? product.category : 'Bag'
        });
      }

      await appendOrderToSheet(updatedOrder, enrichedItems);
    } catch (sheetError) {
      console.error('⚠️ Sheets logging failed during TRAX confirmation booking:', sheetError.message);
    }

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
    const url = `https://sonic.pk/api/shipment/air_waybill?tracking_number=${trackingNumber}&type=1`;
    const response = await axios.get(url, {
      headers: { 'Authorization': process.env.TRAX_API_KEY },
      responseType: 'arraybuffer'
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=waybill-${trackingNumber}.pdf`);
    return res.send(Buffer.from(response.data));
  } catch (error) {
    if (error.response?.data) {
      const rawError = Buffer.from(error.response.data).toString('utf8');
      console.error("TRAX API ERROR:", rawError);
    } else {
      console.error("Axios Error:", error.message);
    }
    return res.status(500).json({ message: "Could not fetch PDF from TRAX" });
  }
}

async function groupOrders(req, res) {
  const { orderIds } = req.body;
  if (!orderIds || !orderIds.length) {
    return res.status(400).json({ message: 'No orders selected for grouping' });
  }

  const localGroupId = `GRP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  try {
    await pool.query(
      'UPDATE orders SET local_group_id = $1 WHERE id = ANY($2)',
      [localGroupId, orderIds]
    );
    return res.json({ success: true, localGroupId });
  } catch (error) {
    console.error('Grouping Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to group orders' });
  }
}

async function ungroupOrders(req, res) {
  const { groupId } = req.body;
  try {
    // Safety check: Only ungroup if they haven't been deployed to TRAX yet
    await pool.query(
      'UPDATE orders SET local_group_id = NULL WHERE local_group_id = $1 AND trax_sheet_id IS NULL',
      [groupId]
    );
    return res.json({ success: true, message: 'Group dissolved successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to ungroup orders' });
  }
}

async function deployManifest(req, res) {
  const { localGroupId } = req.body;
  try {
    // 1. Fetch tracking numbers and IDs associated with this local group
    const { rows } = await pool.query(
      'SELECT id, tracking_number FROM orders WHERE local_group_id = $1',
      [localGroupId]
    );

    if (rows.length === 0) return res.status(404).json({ message: 'No orders found in this group' });

    const trackingNumbers = rows.map(r => r.tracking_number).filter(tn => !!tn);
    const orderIds = rows.map(r => r.id);

    if (trackingNumbers.length === 0) {
      return res.status(400).json({ message: 'No tracking numbers found in this group. Confirm orders first.' });
    }

    // 2. Send POST to TRAX to create the manifest and deploy rider
    const traxResponse = await axios.post('https://sonic.pk/api/receiving_sheet/create', 
      { tracking_numbers: trackingNumbers },
      { headers: { 'Authorization': process.env.TRAX_API_KEY } }
    );

    if (traxResponse.data.status !== 0) {
      return res.status(400).json({ 
        success: false, 
        message: "TRAX rejected manifest", 
        details: traxResponse.data 
      });
    }

    const sheetId = traxResponse.data.receiving_sheet_id;

    await pool.query(
      'UPDATE orders SET trax_sheet_id = $1, status = $2 WHERE id = ANY($3)', 
      [sheetId, 'dispatched', orderIds]
    );

    return res.json({ success: true, sheetId: sheetId, message: 'Manifest generated and Rider deployed!' });
  } catch (error) {
    console.error("Manifest Creation Error:", error.response?.data || error.message);
    return res.status(500).json({ success: false, message: 'Failed to create manifest' });
  }
}

async function printManifest(req, res) {
  const { sheetId } = req.params;
  try {
    const url = `https://sonic.pk/api/receiving_sheet/view?receiving_sheet_id=${sheetId}&type=1`;
    const response = await axios.get(url, {
      headers: { 'Authorization': process.env.TRAX_API_KEY },
      responseType: 'arraybuffer'
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=manifest-${sheetId}.pdf`);
    return res.send(Buffer.from(response.data));
  } catch (error) {
    if (error.response?.data) {
      const rawError = Buffer.from(error.response.data).toString('utf8');
      console.error("TRAX API ERROR:", rawError);
    } else {
      console.error("Axios Error:", error.message);
    }
    return res.status(500).json({ message: "Could not fetch Manifest PDF" });
  }
}

async function updateOrderManifest(req, res) {
  const { orderId } = req.params;
  const { manifestId } = req.body;
  await pool.query('UPDATE orders SET manifest_id = $1 WHERE id = $2', [manifestId, orderId]);
  return res.json({ success: true });
}

async function cancelOrder(req, res) {
  const { orderId } = req.params;
  try {
    // 1. Fetch current order to get the tracking number
    const orderResult = await pool.query('SELECT tracking_number FROM orders WHERE id = $1', [orderId]);
    
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const trackingNumber = orderResult.rows[0].tracking_number;

    // 2. If it has a TRAX tracking number, cancel it on their server
    if (trackingNumber) {
      const traxResponse = await axios.post('https://sonic.pk/api/shipment/cancel', 
        { tracking_number: trackingNumber },
        { headers: { 'Authorization': process.env.TRAX_API_KEY } }
      );
      
      if (traxResponse.data.status !== 0) {
        console.warn("TRAX Cancellation Note:", traxResponse.data.message);
      }
    }

    // 3. Update Neon Database
    await pool.query('UPDATE orders SET status = $1 WHERE id = $2', ['cancelled', orderId]);
    return res.json({ success: true, message: 'Order cancelled successfully' });
  } catch (error) {
    console.error("Cancellation Error:", error.response?.data || error.message);
    return res.status(500).json({ success: false, message: 'Failed to cancel order' });
  }
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

/**
 * 📦 TRAX SETTLEMENT LOGIC
 */
async function settleTraxBatch(req, res) {
  try {
    // We expect the frontend to send the orders selected and the lump sum deposited
    const { orderIds, batchId, totalAmountReceived } = req.body;

    if (!orderIds || orderIds.length === 0) {
      return res.status(400).json({ error: 'No orders selected for settlement.' });
    }

    // 1. Get the total selling price of all selected orders
    const placeholders = orderIds.map((_, i) => `$${i + 1}`).join(',');
    const query = `SELECT id, total_amount AS price FROM orders WHERE id IN (${placeholders})`;
    const { rows: orders } = await pool.query(query, orderIds);

    const totalExpected = orders.reduce((sum, order) => sum + Number(order.price), 0);
    
    // 2. Calculate the exact Trax deduction (delivery fees + GST)
    const totalDeduction = totalExpected - Number(totalAmountReceived);
    const deductionPerOrder = totalDeduction / orders.length;

    // 3. Update every order in the batch with exact math AND status
    for (let order of orders) {
      const orderActualReceived = Number(order.price) - deductionPerOrder;
      
      await pool.query(
        `UPDATE orders 
         SET trax_status = 'Settled', 
             trax_batch_id = $1, 
             trax_amount_received = $2,
             status = 'delivered' /* 🚨 THIS FORCES IT TO DELIVERED */
         WHERE id = $3`,
        [batchId, orderActualReceived, order.id]
      );
    }

    res.status(200).json({ 
      message: 'Trax batch settled successfully!',
      ordersProcessed: orders.length,
      totalDeduction 
    });

  } catch (error) {
    console.error('❌ Trax Settlement Error:', error);
    res.status(500).json({ error: 'Failed to settle Trax batch' });
  }
}

/**
 * 🏭 SUPPLIER PAYOUT LOGIC
 */
async function paySupplier(req, res) {
  try {
    const { orderIds } = req.body;

    if (!orderIds || orderIds.length === 0) {
      return res.status(400).json({ error: 'No orders selected for supplier payment.' });
    }

    // Update the DB to show the supplier has been paid for these specific bags
    const placeholders = orderIds.map((_, i) => `$${i + 1}`).join(',');
    await pool.query(
      `UPDATE orders 
       SET supplier_payment_status = 'Paid' 
       WHERE id IN (${placeholders})`,
      orderIds
    );

    res.status(200).json({ message: 'Supplier marked as paid successfully!' });

  } catch (error) {
    console.error('❌ Supplier Payout Error:', error);
    res.status(500).json({ error: 'Failed to process supplier payout' });
  }
}

/**
 * 🔔 TRAX WEBHOOK LISTENER
 */
async function handleTraxWebhook(req, res) {
  // 🚨 BEAT THE 3-SECOND TIMEOUT
  // We instantly send a 200 OK success message back to Trax so they don't block us.
  res.status(200).send('Webhook Received');

  try {
    // 🚨 SENIOR DEV MOVE: Log the exact raw data Trax sends us
    console.log('\n📦 --- RAW TRAX WEBHOOK PAYLOAD --- 📦');
    console.log(JSON.stringify(req.body, null, 2));
    console.log('--------------------------------------\n');

    const { tracking_number, status } = req.body;

    // 1. Handle Delivery
    if (status && status.includes('Delivered')) {
      const { rows } = await pool.query(
        `UPDATE orders 
         SET status = 'delivered' 
         WHERE tracking_number = $1
         RETURNING id`,
        [tracking_number]
      );
      
      if (rows[0]) {
        console.log(`✅ Order #${rows[0].id} (Tracking: ${tracking_number}) marked as Delivered!`);
        // Trigger financial automation (Google Sheets logging)
        logDeliveredOrderFinancials(rows[0].id);
      }
    }

    // 2. Handle RTO / Returned parcels
    if (status && status.includes('Returned')) {
      await pool.query(`UPDATE orders SET status = 'returned' WHERE tracking_number = $1`, [tracking_number]);
      console.log(`📦 Parcel ${tracking_number} marked as Returned.`);
    }
  } catch (error) {
    console.error('❌ Webhook Processing Error:', error.message);
  }
}

module.exports = { 
  adminGetOrders, 
  adminUpdateOrderStatus, 
  checkout, 
  publicGetOrderTracking,
  confirmOrderWithTrax,
  getTraxLabel,
  printManifest,
  groupOrders,
  ungroupOrders,
  deployManifest,
  updateOrderManifest,
  completeOrder,
  cancelOrder,
  settleTraxBatch,
  paySupplier,
  handleTraxWebhook,
}
