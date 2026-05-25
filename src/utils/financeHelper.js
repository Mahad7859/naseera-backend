const pool = require('../config/db');
const { updateFinancialSheet } = require('./sheetsApi');

/**
 * Automated financial logging for delivered orders.
 * Calculates profit based on current wholesale prices and logs to DB and Sheets.
 */
exports.logDeliveredOrderFinancials = async (orderId) => {
  try {
    // 1. Fetch the order and the JSON array of items
    const { rows: orderRows } = await pool.query(
      'SELECT id, total_amount, shipping_fee, order_items FROM orders WHERE id = $1', 
      [orderId]
    );
    
    if (orderRows.length === 0) return { success: false, message: 'Order not found' };
    const order = orderRows[0];

    // 2. Parse the JSONB items safely
    let items = [];
    if (typeof order.order_items === 'string') {
      items = JSON.parse(order.order_items);
    } else {
      items = order.order_items; // Already an object/array
    }
    
    let totalWholesaleCost = 0;
    const itemNames = [];

    // 3. Loop through items to calculate total wholesale cost
    for (const item of items) {
      const productId = item.id || item.productId;
      if (productId) {
        const prodRes = await pool.query('SELECT wholesale_price, name FROM products WHERE id = $1', [productId]);
        if (prodRes.rows[0]) {
          const cost = parseFloat(prodRes.rows[0].wholesale_price) || 0;
          const qty = parseInt(item.quantity) || 1;
          totalWholesaleCost += (cost * qty);
          itemNames.push(prodRes.rows[0].name);
        }
      }
    }

    const revenue = parseFloat(order.total_amount);
    const courierFee = parseFloat(order.shipping_fee) || 0;
    const profit = revenue - totalWholesaleCost - courierFee;

    // 4. Log it to Transactions
    await pool.query(
      `INSERT INTO transactions (type, amount, entity_name, description) 
       VALUES ($1, $2, $3, $4)`,
      ['sale_revenue', profit, 'Customer', `Profit from Order #${orderId}`]
    );

    // 5. Update the Order record with final financial data
    await pool.query(
      `UPDATE orders 
       SET cost_price = $1, 
           courier_fee = $2
       WHERE id = $3`,
      [totalWholesaleCost, courierFee, orderId]
    );

    // 6. Update Google Sheets (Phase 3 automation)
    try {
      await updateFinancialSheet({
        orderId: order.id,
        itemName: itemNames.join(', ') || 'Naseera Product',
        costPrice: totalWholesaleCost,
        sellingPrice: revenue,
        courierFee: courierFee,
      });
    } catch (sheetsError) {
      console.error(`⚠️ Sheets automation failed for Order #${orderId}:`, sheetsError.message);
    }

    console.log(`✅ Financials calculated for Order #${orderId} | Profit: ${profit}`);
    return { success: true, profit, totalWholesaleCost };
  } catch (error) {
    console.error("Error logging financials:", error);
    return { success: false, error: error.message };
  }
};