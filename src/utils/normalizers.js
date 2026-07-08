function normalizeProduct(row) {
  return {
    ...row,
    price: Number(row.price),
    wholesalePrice: Number(row.wholesale_price || 0),
    stockQuantity: Number(row.stock_quantity || 0),
    isDraft: row.is_draft,
    imageUrl: row.image_url,
    imageBack: row.image_back,
    imageSide: row.image_side,
    imageHandheld: row.image_handheld || '',
    isFeatured: row.is_featured,
    isVisible: row.is_visible,
    discountPercentage: Number(row.discount_percentage || 0),
    length: row.length || '',
    width: row.width || '',
    size: row.size || 'Medium',
    groupId: row.group_id || '',
    colorName: row.color_name || '',
    colorHex: row.color_hex || '#ffffff',
    tags: row.tags || '',
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
    subtotal: Number(row.subtotal || 0),
    discountAmount: Number(row.discount_amount || 0),
    couponCode: row.coupon_code || null,
    orderItems: row.order_items,
    paymentMethod: row.payment_method,
    status: row.status,
    createdAt: row.created_at,
    shippingFee: Number(row.shipping_fee || 0),
    province: row.province || '',
    cityId: row.city_id || null,
    trackingNumber: row.tracking_number || null,
    traxStatus: row.trax_status || null,
    traxBatchId: row.trax_batch_id || null,
    traxAmountReceived: Number(row.trax_amount_received || 0),
    supplierPaymentStatus: row.supplier_payment_status || 'Unpaid',
    costPrice: Number(row.cost_price || 0),
    localGroupId: row.local_group_id || null,
    traxSheetId: row.trax_sheet_id || null,
    manifestId: row.manifest_id || null,
    manifestPdfUrl: row.trax_sheet_id ? `/admin/orders/manifest/${row.trax_sheet_id}` : null,
  }
}

function normalizeCategory(row) {
  return {
    ...row,
    imageUrl: row.image_url,
    mobileImageUrl: row.mobile_image_url || '',
    displayOrder: row.display_order,
  }
}

module.exports = { normalizeProduct, normalizeHeroSlide, normalizeOrder, normalizeCategory }
