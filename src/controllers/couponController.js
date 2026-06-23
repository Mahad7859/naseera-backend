const pool = require('../config/db');

// --------------------- ADMIN CRUD ---------------------

// GET all coupons
async function adminGetCoupons(req, res) {
  try {
    const result = await pool.query(`
      SELECT id, code, discount_type, discount_value, applies_to, target_id,
             min_order_amount, max_discount, usage_limit, used_count,
             start_date, end_date, is_active, created_at
      FROM coupons
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('adminGetCoupons error:', error);
    res.status(500).json({ message: 'Failed to fetch coupons.' });
  }
}

// POST create coupon
async function adminCreateCoupon(req, res) {
  try {
    const {
      code, discount_type, discount_value, applies_to = 'all', target_id,
      min_order_amount = 0, max_discount, usage_limit = 1,
      start_date, end_date, is_active = true,
    } = req.body;

    // Basic validation
    if (!code || !discount_type || discount_value === undefined) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }
    if (!['percentage', 'fixed'].includes(discount_type)) {
      return res.status(400).json({ message: 'Invalid discount_type.' });
    }

    // ── Proper numeric conversions ──
    const discountVal = parseFloat(discount_value);
    if (isNaN(discountVal) || discountVal <= 0) {
      return res.status(400).json({ message: 'Discount must be a positive number.' });
    }

    // target_id: null for 'all', otherwise parse as integer or null
    const targetId = (applies_to === 'all' || target_id === '' || target_id === undefined || target_id === null)
      ? null
      : parseInt(target_id, 10);

    // min_order_amount: parse as float, default 0
    const minOrder = parseFloat(min_order_amount) || 0;

    // max_discount: null means no cap; parse only if provided
    const maxDisc = (max_discount === '' || max_discount === undefined || max_discount === null)
      ? null
      : parseFloat(max_discount);

    // usage_limit: parse as integer, default 1 (0 = unlimited)
    const usageLimit = parseInt(usage_limit, 10);
    const finalUsageLimit = (isNaN(usageLimit) || usageLimit < 0) ? 1 : usageLimit;

    // Dates
    const startDate = start_date && start_date !== '' ? start_date : new Date();
    const endDate = end_date && end_date !== '' ? end_date : null;

    // Ensure code is uppercase
    const upperCode = code.toUpperCase();

    // Check for duplicate
    const existing = await pool.query('SELECT id FROM coupons WHERE code = $1', [upperCode]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'Coupon code already exists.' });
    }

    const result = await pool.query(`
      INSERT INTO coupons (
        code, discount_type, discount_value, applies_to, target_id,
        min_order_amount, max_discount, usage_limit, start_date, end_date, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      upperCode, discount_type, discountVal, applies_to, targetId,
      minOrder, maxDisc, finalUsageLimit, startDate, endDate, is_active,
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('adminCreateCoupon error:', error);
    res.status(500).json({ message: 'Failed to create coupon.' });
  }
}

// PUT update coupon
async function adminUpdateCoupon(req, res) {
  try {
    const { id } = req.params;
    const {
      code, discount_type, discount_value, applies_to, target_id,
      min_order_amount, max_discount, usage_limit, start_date, end_date, is_active,
    } = req.body;

    // ── Proper numeric conversions ──
    const discountVal = discount_value !== undefined ? parseFloat(discount_value) : undefined;
    if (discountVal !== undefined && (isNaN(discountVal) || discountVal <= 0)) {
      return res.status(400).json({ message: 'Discount must be a positive number.' });
    }

    const targetId = (applies_to === 'all' || target_id === '' || target_id === undefined || target_id === null)
      ? null
      : parseInt(target_id, 10);

    const minOrder = min_order_amount !== undefined ? (parseFloat(min_order_amount) || 0) : undefined;

    const maxDisc = (max_discount === '' || max_discount === undefined || max_discount === null)
      ? null
      : parseFloat(max_discount);

    const usageLimit = usage_limit !== undefined ? parseInt(usage_limit, 10) : undefined;
    const finalUsageLimit = (usageLimit !== undefined && (isNaN(usageLimit) || usageLimit < 0)) ? 1 : usageLimit;

    const startDate = start_date && start_date !== '' ? start_date : null;
    const endDate = end_date && end_date !== '' ? end_date : null;

    // Ensure code uppercase
    const upperCode = code?.toUpperCase();

    // Build dynamic update query
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (upperCode) { fields.push(`code = $${paramIndex++}`); values.push(upperCode); }
    if (discount_type) { fields.push(`discount_type = $${paramIndex++}`); values.push(discount_type); }
    if (discountVal !== undefined) { fields.push(`discount_value = $${paramIndex++}`); values.push(discountVal); }
    if (applies_to) { fields.push(`applies_to = $${paramIndex++}`); values.push(applies_to); }
    if (target_id !== undefined) { fields.push(`target_id = $${paramIndex++}`); values.push(targetId); }
    if (min_order_amount !== undefined) { fields.push(`min_order_amount = $${paramIndex++}`); values.push(minOrder); }
    if (max_discount !== undefined) { fields.push(`max_discount = $${paramIndex++}`); values.push(maxDisc); }
    if (usage_limit !== undefined) { fields.push(`usage_limit = $${paramIndex++}`); values.push(finalUsageLimit); }
    if (start_date !== undefined && start_date !== '' && startDate) { fields.push(`start_date = $${paramIndex++}`); values.push(startDate); }
    if (end_date !== undefined && end_date !== '' && endDate) { fields.push(`end_date = $${paramIndex++}`); values.push(endDate); }
    if (is_active !== undefined) { fields.push(`is_active = $${paramIndex++}`); values.push(is_active); }

    if (fields.length === 0) {
      return res.status(400).json({ message: 'No fields to update.' });
    }

    values.push(id);
    const query = `
      UPDATE coupons
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Coupon not found.' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('adminUpdateCoupon error:', error);
    res.status(500).json({ message: 'Failed to update coupon.' });
  }
}

// DELETE coupon
async function adminDeleteCoupon(req, res) {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM coupons WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Coupon not found.' });
    }
    res.json({ message: 'Coupon deleted.' });
  } catch (error) {
    console.error('adminDeleteCoupon error:', error);
    res.status(500).json({ message: 'Failed to delete coupon.' });
  }
}

// --------------------- PUBLIC VALIDATION ---------------------

async function validateCoupon(req, res) {
  try {
    const { code, cartItems, totalAmount } = req.body;

    if (!code) {
      return res.status(400).json({ valid: false, message: 'Please enter a coupon code.' });
    }
    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({ valid: false, message: 'Cart is empty.' });
    }

    // Parse totalAmount safely
    const total = parseFloat(totalAmount);
    if (isNaN(total) || total <= 0) {
      return res.status(400).json({ valid: false, message: 'Invalid cart total.' });
    }

    const upperCode = code.toUpperCase();

    // 1. Fetch coupon
    const result = await pool.query(`
      SELECT * FROM coupons WHERE code = $1
    `, [upperCode]);

    if (result.rows.length === 0) {
      return res.json({ valid: false, message: 'Invalid coupon code.' });
    }
    const coupon = result.rows[0];

    // 2. Check active
    if (!coupon.is_active) {
      return res.json({ valid: false, message: 'This coupon is no longer active.' });
    }

    // 3. Date range
    const now = new Date();
    if (coupon.start_date && new Date(coupon.start_date) > now) {
      return res.json({ valid: false, message: 'This coupon is not yet active.' });
    }
    if (coupon.end_date && new Date(coupon.end_date) < now) {
      return res.json({ valid: false, message: 'This coupon has expired.' });
    }

    // 4. Usage limit
    if (coupon.usage_limit > 0 && coupon.used_count >= coupon.usage_limit) {
      return res.json({ valid: false, message: 'This coupon has reached its usage limit.' });
    }

    // 5. Min order amount
    if (coupon.min_order_amount > 0 && total < Number(coupon.min_order_amount)) {
      return res.json({
        valid: false,
        message: `Minimum order amount is PKR ${Number(coupon.min_order_amount).toLocaleString()}.`,
      });
    }

    // 6. Product / category restrictions
    if (coupon.applies_to === 'specific_product') {
      const productIds = cartItems.map(item => item.id);
      if (!productIds.includes(coupon.target_id)) {
        return res.json({
          valid: false,
          message: 'This coupon is not applicable to any product in your cart.',
        });
      }
    } else if (coupon.applies_to === 'specific_category') {
      const productIds = cartItems.map(item => item.id);
      const catResult = await pool.query(
        'SELECT category FROM products WHERE id = ANY($1)',
        [productIds]
      );
      const categories = catResult.rows.map(row => row.category);
      if (!categories.includes(coupon.target_id)) {
        return res.json({
          valid: false,
          message: 'This coupon is not applicable to any product in your cart.',
        });
      }
    }

    // 7. Calculate discount (safe parsing)
    const discountValue = parseFloat(coupon.discount_value);
    let discount = 0;
    if (coupon.discount_type === 'percentage') {
      discount = (total * discountValue) / 100;
      // max_discount: only apply if it's a positive number (null/0 means no cap)
      const maxDisc = parseFloat(coupon.max_discount);
      if (!isNaN(maxDisc) && maxDisc > 0 && discount > maxDisc) {
        discount = maxDisc;
      }
    } else {
      discount = discountValue;
    }
    discount = Math.min(discount, total);
    discount = Math.round(discount * 100) / 100;

    res.json({
      valid: true,
      discount,
      couponId: coupon.id,
      code: coupon.code,
      message: `Coupon applied! You saved PKR ${discount.toFixed(2)}.`,
    });

  } catch (error) {
    console.error('validateCoupon error:', error);
    res.status(500).json({ valid: false, message: 'Server error validating coupon.' });
  }
}

// --------------------- HELPER for checkout (re-validate and use) ---------------------
async function applyCouponToOrder(couponId, totalAmount, cartItems) {
  const result = await pool.query('SELECT * FROM coupons WHERE id = $1', [couponId]);
  if (result.rows.length === 0) return null;
  const coupon = result.rows[0];

  const now = new Date();
  if (!coupon.is_active) return null;
  if (coupon.start_date && new Date(coupon.start_date) > now) return null;
  if (coupon.end_date && new Date(coupon.end_date) < now) return null;
  if (coupon.usage_limit > 0 && coupon.used_count >= coupon.usage_limit) return null;

  const total = parseFloat(totalAmount);
  if (isNaN(total) || total <= 0) return null;
  if (coupon.min_order_amount > 0 && total < Number(coupon.min_order_amount)) return null;

  if (coupon.applies_to === 'specific_product') {
    const productIds = cartItems.map(item => item.id);
    if (!productIds.includes(coupon.target_id)) return null;
  } else if (coupon.applies_to === 'specific_category') {
    const productIds = cartItems.map(item => item.id);
    const catResult = await pool.query('SELECT category FROM products WHERE id = ANY($1)', [productIds]);
    const categories = catResult.rows.map(row => row.category);
    if (!categories.includes(coupon.target_id)) return null;
  }

  const discountValue = parseFloat(coupon.discount_value);
  let discount = 0;
  if (coupon.discount_type === 'percentage') {
    discount = (total * discountValue) / 100;
    const maxDisc = parseFloat(coupon.max_discount);
    if (!isNaN(maxDisc) && maxDisc > 0 && discount > maxDisc) discount = maxDisc;
  } else {
    discount = discountValue;
  }
  discount = Math.min(discount, total);
  discount = Math.round(discount * 100) / 100;

  await pool.query(`
    UPDATE coupons
    SET used_count = used_count + 1
    WHERE id = $1 AND (usage_limit = 0 OR used_count < usage_limit)
  `, [couponId]);

  return { discount, code: coupon.code };
}

module.exports = {
  adminGetCoupons,
  adminCreateCoupon,
  adminUpdateCoupon,
  adminDeleteCoupon,
  validateCoupon,
  applyCouponToOrder,
};