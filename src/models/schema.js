const pool = require('../config/db')

async function initializeSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price NUMERIC(10, 2) NOT NULL DEFAULT 0,
      description TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      image_back TEXT DEFAULT '',
      image_side TEXT DEFAULT '',
      is_featured BOOLEAN NOT NULL DEFAULT FALSE,
      is_visible BOOLEAN NOT NULL DEFAULT TRUE,
      stock_quantity INTEGER NOT NULL DEFAULT 10,
      is_draft BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT,
      customer_address TEXT,
      total_amount NUMERIC(12, 2) NOT NULL,
      order_items JSONB NOT NULL DEFAULT '[]',
      payment_method TEXT NOT NULL DEFAULT 'cod',
      status TEXT NOT NULL DEFAULT 'pending_confirmation',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      image_url TEXT NOT NULL,
      display_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hero_slides (
      id SERIAL PRIMARY KEY,
      image_url TEXT NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT DEFAULT '',
      display_order INTEGER DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  // Safe column additions for existing deployments
  await pool.query(`
    ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS customer_phone TEXT,
    ADD COLUMN IF NOT EXISTS customer_address TEXT,
    ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS order_items JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'online',
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC(10, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS province TEXT DEFAULT '';
  `)

  await pool.query(`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'handbags',
    ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS image_back TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS image_side TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS stock_quantity INTEGER NOT NULL DEFAULT 10,
    ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `)

  await pool.query(`
    ALTER TABLE categories
    ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `)

  await pool.query(`
    ALTER TABLE hero_slides
    ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `)

  console.log('✅ Database schema initialized.')
}

module.exports = { initializeSchema }
