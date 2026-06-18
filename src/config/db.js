const { Pool } = require('pg')

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.warn('DATABASE_URL is not set. Database queries will fail until .env is configured.')
}

const pool = new Pool({
  connectionString,
  ssl: connectionString ? { rejectUnauthorized: false } : false,
})

// Prevent transient database connection errors from crashing the backend process
pool.on('error', (err) => {
  console.error('Unexpected error on idle database client:', err.message)
})

module.exports = pool
