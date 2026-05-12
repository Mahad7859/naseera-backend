require('dotenv').config({ path: '.env' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkOrders() {
  try {
    const res = await pool.query(`SELECT id, total_amount, shipping_fee, province FROM orders ORDER BY id DESC LIMIT 5;`);
    console.log('Recent orders raw data:');
    console.table(res.rows);
    process.exit(0);
  } catch (err) {
    console.error('Error checking orders:', err.message);
    process.exit(1);
  }
}

checkOrders();
