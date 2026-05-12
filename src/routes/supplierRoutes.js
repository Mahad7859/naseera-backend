const router = require('express').Router()
const { requireSupplierAuth } = require('../middleware/auth')
const { loginLimiter } = require('../middleware/security')
const { supplierLogin } = require('../controllers/authController')
const { supplierUpdateStock, supplierCreateProduct } = require('../controllers/productController')

router.post('/login',                    loginLimiter,        supplierLogin)
router.patch('/products/:id/stock',      requireSupplierAuth, supplierUpdateStock)
router.post('/products',                 requireSupplierAuth, supplierCreateProduct)

module.exports = router
