const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
})

async function sendOrderNotificationEmail(orderId, customer, items, total, paymentMethod, status, shippingFee, province) {
  const subtotal = total - (shippingFee || 0);
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER,
    subject: `New Order Received! — Order #${orderId} (${status.toUpperCase()})`,
    html: `
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
