const express = require('express');
const router = express.Router();
const { requireAdminAuth } = require('../middleware/auth');
const {
  adminGetCoupons,
  adminCreateCoupon,
  adminUpdateCoupon,
  adminDeleteCoupon,
  validateCoupon,
} = require('../controllers/couponController');

// Public route - validate a coupon code
router.post('/validate-coupon', validateCoupon);

// Admin routes (all require admin auth)
router.get('/admin/coupons', requireAdminAuth, adminGetCoupons);
router.post('/admin/coupons', requireAdminAuth, adminCreateCoupon);
router.put('/admin/coupons/:id', requireAdminAuth, adminUpdateCoupon);
router.delete('/admin/coupons/:id', requireAdminAuth, adminDeleteCoupon);

module.exports = router;