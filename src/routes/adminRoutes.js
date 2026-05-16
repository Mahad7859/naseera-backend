const router = require('express').Router()
const multer = require('multer')
const { requireAdminAuth, requireAnyAuth } = require('../middleware/auth')
const { loginLimiter } = require('../middleware/security')

const { adminLogin } = require('../controllers/authController')
const {
  adminGetProducts, adminCreateProduct, adminUpdateProduct,
  adminDeleteProduct, adminGetDrafts,
} = require('../controllers/productController')
const { adminGetOrders, adminUpdateOrderStatus } = require('../controllers/orderController')
const {
  adminGetCategories, adminCreateCategory,
  adminUpdateCategory, adminDeleteCategory,
} = require('../controllers/categoryController')
const {
  adminGetHeroSlides, adminCreateHeroSlide,
  adminUpdateHeroSlide, adminDeleteHeroSlide,
} = require('../controllers/heroSlideController')
const { uploadImage } = require('../controllers/uploadController')

const upload = multer({ storage: multer.memoryStorage() })

// Auth
router.post('/login', loginLimiter, adminLogin)

// Products
router.get('/products',        requireAnyAuth, adminGetProducts)
router.post('/products',       requireAdminAuth, adminCreateProduct)
router.put('/products/:id',    requireAdminAuth, adminUpdateProduct)
router.delete('/products/:id', requireAdminAuth, adminDeleteProduct)
router.get('/drafts',          requireAdminAuth, adminGetDrafts)

// Orders
router.get('/orders',                    requireAnyAuth, adminGetOrders)
router.patch('/orders/:id/status',       requireAnyAuth, adminUpdateOrderStatus)

// Categories
router.get('/categories',        requireAnyAuth, adminGetCategories)
router.post('/categories',       requireAdminAuth, adminCreateCategory)
router.put('/categories/:id',    requireAdminAuth, adminUpdateCategory)
router.delete('/categories/:id', requireAdminAuth, adminDeleteCategory)

// Hero Slides
router.get('/hero-slides',        requireAdminAuth, adminGetHeroSlides)
router.post('/hero-slides',       requireAdminAuth, adminCreateHeroSlide)
router.put('/hero-slides/:id',    requireAdminAuth, adminUpdateHeroSlide)
router.delete('/hero-slides/:id', requireAdminAuth, adminDeleteHeroSlide)

// Image Upload
router.post('/upload-image', requireAnyAuth, upload.single('image'), uploadImage)

module.exports = router
