const express = require('express');
const router = express.Router();
const { requireAdminAuth } = require('../middleware/auth');
const sheetsController = require('../controllers/sheetsController');

// All routes in this file require admin authentication
router.use(requireAdminAuth);

router.post('/sheets/log-new-order', sheetsController.logNewOrder);
router.post('/sheets/log-cash-transaction', sheetsController.logCashTransaction);
router.post('/sheets/log-investor-transaction', sheetsController.logInvestorTransaction);
router.post('/sheets/update-supplier-payment', sheetsController.updateSupplierPayment);

module.exports = router;