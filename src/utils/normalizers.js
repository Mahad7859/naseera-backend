function normalizeProduct(row) {
  return {
    ...row,
    price: Number(row.price),
    stockQuantity: Number(row.stock_quantity || 0),
    isDraft: row.is_draft,
    imageUrl: row.image_url,
    imageBack: row.image_back,
    imageSide: row.image_side,
    isFeatured: row.is_featured,
    isVisible: row.is_visible,
    discountPercentage: Number(row.discount_percentage || 0),
    length: row.length || '',
    width: row.width || '',
  }
}

function normalizeHeroSlide(row) {
  return {
    ...row,
    imageUrl: row.image_url,
    displayOrder: row.display_order,
    isActive: row.is_active,
  }
}

function normalizeOrder(row) {
  return {
    id: row.id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    customerAddress: row.customer_address,
    totalAmount: Number(row.total_amount),
    orderItems: row.order_items,
    paymentMethod: row.payment_method,
    status: row.status,
    createdAt: row.created_at,
    shippingFee: Number(row.shipping_fee || 0),
    province: row.province || ''
  }
}

function normalizeCategory(row) {
  return {
    ...row,
    imageUrl: row.image_url,
    displayOrder: row.display_order,
  }
}

module.exports = { normalizeProduct, normalizeHeroSlide, normalizeOrder, normalizeCategory }
