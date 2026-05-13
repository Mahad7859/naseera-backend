const SibApiV3Sdk = require('sib-api-v3-sdk');

// Configure Brevo API client
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

// Log check for production debugging
if (!process.env.BREVO_API_KEY) {
  console.warn('⚠️  WARNING: BREVO_API_KEY is missing from environment variables. Emails will not send via Brevo API.');
} else {
  console.log('✅ Brevo HTTP API Client Initialized.');
}


/**
 * Sends an order notification email to the admin.
 */
async function sendOrderNotificationEmail(orderId, customer, items, total, paymentMethod, status, shippingFee, province, city) {
  // Ensure all numeric values are actually numbers to avoid toLocaleString errors
  const numTotal = Number(total || 0)
  const numShipping = Number(shippingFee || 0)
  const subtotal = numTotal - numShipping

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        .email-wrapper { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: #2c241b; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .header { background-color: #2c241b; padding: 30px; text-align: center; }
        .header h1 { color: #c5a059; margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 3px; font-weight: 300; }
        .content { padding: 40px 30px; }
        .order-banner { background-color: #fcfaf7; border: 1px solid #f0e6d2; padding: 20px; border-radius: 4px; margin-bottom: 30px; text-align: center; }
        .order-id { font-size: 18px; font-weight: bold; color: #4a3f35; margin-bottom: 5px; }
        .order-status { display: inline-block; padding: 4px 12px; background-color: #c5a059; color: white; border-radius: 20px; font-size: 12px; text-transform: uppercase; font-weight: bold; }
        
        .section-title { font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #8b7355; border-bottom: 1px solid #f0e6d2; padding-bottom: 8px; margin: 30px 0 15px; font-weight: bold; }
        
        .info-grid { width: 100%; border-collapse: collapse; }
        .info-label { width: 30%; color: #8b7355; font-size: 13px; padding: 5px 0; vertical-align: top; }
        .info-value { width: 70%; font-weight: 600; font-size: 14px; padding: 5px 0; color: #2c241b; }
        
        .item-row { border-bottom: 1px solid #f9f5f0; }
        .item-img { width: 60px; height: 60px; object-fit: cover; border-radius: 4px; border: 1px solid #f0e6d2; }
        .item-details { padding: 15px 0; vertical-align: middle; }
        .item-name { font-weight: 600; font-size: 14px; display: block; }
        .item-meta { color: #8b7355; font-size: 12px; }
        .item-price { text-align: right; font-weight: 600; font-size: 14px; padding: 15px 0; color: #c5a059; }
        
        .totals-table { width: 100%; margin-top: 20px; }
        .total-row td { padding: 5px 0; font-size: 14px; }
        .total-row.grand-total td { padding-top: 15px; border-top: 2px solid #f0e6d2; font-size: 18px; font-weight: bold; color: #2c241b; }
        
        .footer { background-color: #f9f5f0; padding: 30px; text-align: center; color: #8b7355; font-size: 12px; }
        .footer p { margin: 5px 0; }
      </style>
    </head>
    <body>
      <div class="email-wrapper">
        <div class="header">
          <h1>Naseera Collection</h1>
        </div>
        
        <div class="content">
          <div class="order-banner">
            <div class="order-id">New Order Received!</div>
            <div class="order-status">${status.replace('_', ' ')}</div>
          </div>
          
          <div class="section-title">Order Information</div>
          <table class="info-grid">
            <tr>
              <td class="info-label">Order ID</td>
              <td class="info-value">#${orderId}</td>
            </tr>
            <tr>
              <td class="info-label">Payment Method</td>
              <td class="info-value">${paymentMethod.toUpperCase()}</td>
            </tr>
            <tr>
              <td class="info-label">Shipping To</td>
              <td class="info-value">${city ? `${city}, ` : ''}${province || 'Not specified'}</td>
            </tr>
          </table>
          
          <div class="section-title">Customer Details</div>
          <table class="info-grid">
            <tr>
              <td class="info-label">Name</td>
              <td class="info-value">${customer.name}</td>
            </tr>
            <tr>
              <td class="info-label">Phone</td>
              <td class="info-value">${customer.phone}</td>
            </tr>
            <tr>
              <td class="info-label">Email</td>
              <td class="info-value">${customer.email}</td>
            </tr>
            <tr>
              <td class="info-label">Address</td>
              <td class="info-value">${customer.address}</td>
            </tr>
          </table>
          
          <div class="section-title">Summary</div>
          <table style="width: 100%; border-collapse: collapse;">
            ${(items || []).map(item => {
              const itemImg = item.image_url || item.imageUrl || item.image;
              return `
                <tr class="item-row">
                  <td style="width: 70px; padding: 15px 0;">
                    ${itemImg ? `<img src="${itemImg}" class="item-img" alt="${item.name}">` : '<div style="width: 60px; height: 60px; background: #f9f5f0; border-radius: 4px;"></div>'}
                  </td>
                  <td class="item-details">
                    <span class="item-name">${item.name}</span>
                    <span class="item-meta">Quantity: ${item.quantity || 1}</span>
                  </td>
                  <td class="item-price">
                    PKR ${Number((item.price || 0) * (item.quantity || 1)).toLocaleString()}
                  </td>
                </tr>
              `;
            }).join('')}
          </table>
          
          <table class="totals-table">
            <tr class="total-row">
              <td style="color: #8b7355;">Subtotal</td>
              <td style="text-align: right; font-weight: 600;">PKR ${Number(subtotal).toLocaleString()}</td>
            </tr>
            <tr class="total-row">
              <td style="color: #8b7355;">Shipping</td>
              <td style="text-align: right; font-weight: 600;">PKR ${numShipping.toLocaleString()}</td>
            </tr>
            <tr class="total-row grand-total">
              <td>Total Amount</td>
              <td style="text-align: right; color: #c5a059;">PKR ${numTotal.toLocaleString()}</td>
            </tr>
          </table>
        </div>
        
        <div class="footer">
          <p><strong>Naseera Collection</strong></p>
          <p>Handcrafted Elegance | Faisalabad, Pakistan</p>
          <p>© 2026 Naseera Collection. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `

  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail(); // Use SendSmtpEmail for transactional emails

  sendSmtpEmail.sender = {
    name: "Naseera Collection",
    email: process.env.EMAIL_USER // This email must be a verified sender in Brevo
  };
  sendSmtpEmail.to = [{ email: process.env.EMAIL_USER, name: "Naseera Admin" }];
  sendSmtpEmail.replyTo = { email: customer.email, name: customer.name };
  sendSmtpEmail.subject = `New Order! #${orderId} — ${customer.name}`;
  sendSmtpEmail.htmlContent = htmlContent;

  try {
    const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`✅ Brevo HTTP API Email Sent: Order #${orderId}. Response: ${JSON.stringify(data)}`);
    return true;
  } catch (error) {
    console.error(`❌ Brevo HTTP API Email Error for Order #${orderId}:`, error.message);
    // Log the full error response from Brevo if available
    if (error.response && error.response.text) {
      console.error('Brevo API Error Details:', error.response.text);
    }
    return false;
  }
}

module.exports = { sendOrderNotificationEmail };
