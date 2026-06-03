/**
 * Translates internal/logistics statuses into customer-friendly language.
 */
export const getCustomerFacingStatus = (rawStatus) => {
  if (!rawStatus) return 'Processing';

  const status = rawStatus.toLowerCase();

  // Confirmed / Processing Phase
  if (
    status.includes('trax') || 
    status.includes('updating') || 
    ['pending', 'booked', 'informed', 'packed', 'pending_confirmation'].includes(status)
  ) {
    return 'Order Confirmed';
  }
  
  // Shipping Phase
  if (status.includes('picked') || status.includes('transit') || status.includes('dispatched') || status === 'shipped') {
    return 'Shipped & On The Way';
  }

  // Terminal Statuses
  if (status.includes('delivered')) return 'Delivered Successfully';
  
  if (status.includes('cancel') || status.includes('rejected') || status === 'returned' || status === 'refused') {
    return 'Order Cancelled';
  }

  return rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1); 
};