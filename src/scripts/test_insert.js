require('dotenv').config({ path: '.env' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function testInsert() {
  try {
    const customer = { name: 'Test', email: 'test@example.com', phone: '123', address: 'Add', city: 'City', province: 'Punjab' };
    const items = [{ name: 'Item', quantity: 1, price: 100 }];
    const total = 200;
    const shippingFee = 100;

    const query = `INSERT INTO orders
      (customer_name, customer_email, customer_phone, customer_address,
       total_amount, order_items, payment_method, status, shipping_fee, province)
     VALUES ($1,$2,$3,$4,$5,$6,'cod','pending_confirmation',$7,$8)
     RETURNING id`;
    
    const values = [
      customer.name,
      customer.email,
      customer.phone || '',
      `${customer.address || ''}, ${customer.city || ''}`.trim().replace(/^,\s*/, ''),
      Number(total),
      JSON.stringify(items),
      Number(shippingFee || 0),
      customer.province || ''
    ];

    const res = await pool.query(query, values);
    console.log('Insert successful, ID:', res.rows[0].id);
    process.exit(0);
  } catch (err) {
    console.error('Insert failed with error:', err.message);
    process.exit(1);
  }
}

testInsert();
