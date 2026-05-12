const axios = require('axios');

async function testCheckout() {
  try {
    const payload = {
      customer: {
        name: 'Automation Test',
        email: 'test@naseera.com',
        phone: '03001234567',
        address: '123 Test St',
        province: 'Punjab',
        city: 'Lahore'
      },
      items: [
        { id: 1, name: 'Handbag', price: 5000, quantity: 1 }
      ],
      total: 5180,
      shippingFee: 180
    };

    console.log('Sending checkout request...');
    const res = await axios.post('http://localhost:4000/api/checkout', payload);
    console.log('Success! Order ID:', res.data.orderId);
    
    // Now check if it's in the DB with correct shipping_fee
    // (We'll use our other script for that)
  } catch (err) {
    console.error('Checkout failed:', err.response?.data || err.message);
  }
}

testCheckout();
