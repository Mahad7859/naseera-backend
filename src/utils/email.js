const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
})

async function sendOrderNotificationEmail(orderId, customer, items, total, paymentMethod, status) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER,
    subject: `New Order Received! — Order #${orderId} (${status.toUpperCase()})`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #c5a059;">New Order Alert!</h2>
        <p>A new order has been placed on your store.</p>

        <h3 style="color: #4a3f35;">Order Details (ID: ${orderId})</h3>
        <p><strong>Status:</strong>
          <span style="color: ${status === 'paid' ? '#28a745' : '#ffc107'}; font-weight: bold;">
            ${status.replace('_', ' ').toUpperCase()}
          </span>
        </p>
        <p><strong>Payment Method:</strong> ${paymentMethod.toUpperCase()}</p>
        <p><strong>Total Amount:</strong> PKR ${Number(total).toLocaleString()}</p>

        <h3 style="color: #4a3f35;">Customer Information</h3>
        <p><strong>Name:</strong> ${customer.name}</p>
        <p><strong>Email:</strong> ${customer.email}</p>
        <p><strong>Phone:</strong> ${customer.phone}</p>
        <p><strong>Address:</strong> ${customer.address}</p>

        <h3 style="color: #4a3f35;">Items Ordered</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr style="background-color: #f8f8f8;">
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Product</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Quantity</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: right;">Price</th>
          </tr>
          ${items.map(item => `
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;">${item.name}</td>
              <td style="padding: 8px; border: 1px solid #ddd;">${item.quantity}</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">
                PKR ${Number(item.price).toLocaleString()}
              </td>
            </tr>
          `).join('')}
        </table>
        <p>Thank you for using Naseera Collection!</p>
      </div>
    `,
  }

  try {
    await transporter.sendMail(mailOptions)
    console.log(`✅ Order notification email sent for Order #${orderId}`)
  } catch (emailError) {
    console.error(`❌ Failed to send email for Order #${orderId}:`, emailError.message)
    // Don't throw — email failure should not break the order
  }
}

module.exports = { sendOrderNotificationEmail }
