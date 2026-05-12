require('dotenv').config({ path: '.env' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkSchema() {
  try {
    const res = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'orders';
    `);
    console.log('Columns in orders table:', res.rows.map(r => r.column_name));
    process.exit(0);
  } catch (err) {
    console.error('Error checking schema:', err.message);
    process.exit(1);
  }
}

checkSchema();
