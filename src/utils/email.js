const https = require('https')

// Log check for production debugging
if (!process.env.BREVO_API_KEY) {
  console.warn('⚠️  WARNING: BREVO_API_KEY is missing from environment variables. Emails will not send.')
}

async function sendOrderNotificationEmail(orderId, customer, items, total, paymentMethod, status, shippingFee, province) {
  const subtotal = total - (shippingFee || 0)

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
      <h2 style="color: #c5a059; text-align: center; border-bottom: 2px solid #f9f5f0; padding-bottom: 15px;">New Order Alert!</h2>
      <p>A new order has been placed on <strong>Naseera Collection</strong>.</p>

      <h3 style="color: #4a3f35; border-bottom: 1px solid #eee; padding-bottom: 5px;">Order Details (ID: #${orderId})</h3>
      <p style="margin: 5px 0;"><strong>Status:</strong>
        <span style="color: #ffc107; font-weight: bold; text-transform: uppercase;">
          ${status.replace('_', ' ')}
        </span>
      </p>
      <p style="margin: 5px 0;"><strong>Payment:</strong> ${paymentMethod.toUpperCase()}</p>
      <p style="margin: 5px 0;"><strong>Province:</strong> ${province || 'Not specified'}</p>

      <h3 style="color: #4a3f35; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 20px;">Customer Information</h3>
      <p style="margin: 5px 0;"><strong>Name:</strong> ${customer.name}</p>
      <p style="margin: 5px 0;"><strong>Email:</strong> ${customer.email}</p>
      <p style="margin: 5px 0;"><strong>Phone:</strong> ${customer.phone}</p>
      <p style="margin: 5px 0;"><strong>Address:</strong> ${customer.address}</p>

      <h3 style="color: #4a3f35; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 20px;">Items Ordered</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr style="background-color: #f9f5f0;">
          <th style="padding: 10px; border: 1px solid #eee; text-align: left;">Product</th>
          <th style="padding: 10px; border: 1px solid #eee; text-align: center;">Qty</th>
          <th style="padding: 10px; border: 1px solid #eee; text-align: right;">Price</th>
        </tr>
        ${items.map(item => `
          <tr>
            <td style="padding: 10px; border: 1px solid #eee;">${item.name}</td>
            <td style="padding: 10px; border: 1px solid #eee; text-align: center;">${item.quantity}</td>
            <td style="padding: 10px; border: 1px solid #eee; text-align: right;">
              PKR ${Number(item.price).toLocaleString()}
            </td>
          </tr>
        `).join('')}
      </table>

      <div style="background: #fcfaf7; padding: 15px; border-radius: 8px; border: 1px solid #f0e6d2;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
          <span style="color: #8b7355;">Subtotal:</span>
          <span style="font-weight: 600;">PKR ${subtotal.toLocaleString()}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
          <span style="color: #8b7355;">Shipping Fee:</span>
          <span style="font-weight: 600;">PKR ${(shippingFee || 0).toLocaleString()}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 10px; padding-top: 10px; border-top: 1px solid #e5d5c3; font-size: 1.2rem;">
          <span style="color: #2c241b; font-weight: bold;">Total Amount:</span>
          <span style="color: #c5a059; font-weight: bold;">PKR ${Number(total).toLocaleString()}</span>
        </div>
      </div>

      <p style="text-align: center; margin-top: 30px; color: #8b7355; font-size: 0.8rem;">
        Thank you for using Naseera Collection!
      </p>
    </div>
  `

  const payload = JSON.stringify({
    sender: {
      name: 'Naseera Collection',
      email: process.env.EMAIL_USER,
    },
    to: [{ email: process.env.EMAIL_USER }],
    subject: `New Order Received! — Order #${orderId} (${status.toUpperCase()})`,
    htmlContent,
  })

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.brevo.com',
      path: '/v3/smtp/email',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'Content-Length': Buffer.byteLength(payload),
      },
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`✅ Order notification email sent for Order #${orderId}`)
        } else {
          console.error(`❌ Brevo API error for Order #${orderId}: ${res.statusCode} — ${data}`)
        }
        resolve()
      })
    })

    req.on('error', (err) => {
      console.error(`❌ Failed to send email for Order #${orderId}:`, err.message)
      resolve() // Don't reject — email failure should not break the order
    })

    req.setTimeout(10000, () => {
      console.error(`❌ Email request timed out for Order #${orderId}`)
      req.destroy()
      resolve()
    })

    req.write(payload)
    req.end()
  })
}

module.exports = { sendOrderNotificationEmail }
