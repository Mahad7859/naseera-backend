const router = require('express').Router()
const { getProducts } = require('../controllers/productController')
const { getCategories } = require('../controllers/categoryController')
const { getHeroSlides } = require('../controllers/heroSlideController')
const { checkout } = require('../controllers/orderController')
const { checkoutLimiter } = require('../middleware/security')

router.get('/health', (_req, res) => res.json({ ok: true }))

router.get('/products', getProducts)
router.get('/categories', getCategories)
router.get('/hero-slides', getHeroSlides)

router.post('/checkout', checkoutLimiter, checkout)

module.exports = router
