const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

async function adminLogin(req, res) {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' })
  }

  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD_HASH || !process.env.JWT_SECRET) {
    return res.status(500).json({ message: 'Server configuration error. Contact administrator.' })
  }

  // Always run bcrypt compare to prevent timing attacks
  const isUsernameValid = username === process.env.ADMIN_USERNAME
  const isPasswordValid = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH)

  if (!isUsernameValid || !isPasswordValid) {
    return res.status(401).json({ message: 'Invalid login credentials.' })
  }

  const token = jwt.sign(
    { username, role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  )

  return res.json({ token, username, role: 'admin' })
}

async function supplierLogin(req, res) {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password required.' })
  }

  const isUsernameValid = username === process.env.SUPPLIER_USERNAME
  const isPasswordValid = await bcrypt.compare(password, process.env.SUPPLIER_PASSWORD_HASH)

  if (!isUsernameValid || !isPasswordValid) {
    return res.status(401).json({ message: 'Invalid credentials.' })
  }

  const token = jwt.sign(
    { username, role: 'supplier' },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  )

  return res.json({ token, username, role: 'supplier' })
}

module.exports = { adminLogin, supplierLogin }
