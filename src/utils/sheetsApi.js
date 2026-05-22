const { google } = require('googleapis')

/**
 * Builds an authenticated Google Sheets JWT client using service account credentials.
 */
function getAuthClient() {
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n')

  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    privateKey,
    ['https://www.googleapis.com/auth/spreadsheets']
  )

  return auth
}

/**
 * Appends a completed order row to the Purse Inventory Google Sheet.
 *
 * @param {Object} orderData
 * @param {string|number} orderData.orderId       - The order ID
 * @param {string}        orderData.itemName      - Name of the product sold
 * @param {number}        orderData.costPrice     - How much it cost us to make/buy the bag
 * @param {number}        orderData.sellingPrice  - The price the customer paid
 * @param {number}        orderData.courierFee    - Shipping/courier cost charged to us
 */
async function updateFinancialSheet({ orderId, itemName, costPrice, sellingPrice, courierFee }) {
  // --- Calculations ---
  const totalCost = Number(costPrice) + Number(courierFee) + 0
  const profit = Number(sellingPrice) - totalCost
  const profitMargin = ((profit / Number(sellingPrice)) * 100).toFixed(1) + '%'

  // --- Current date in a readable format ---
  const currentDate = new Date().toLocaleDateString('en-GB') // e.g. 23/05/2026

  // --- Build the 14-column row (A to N) ---
  // A       B            C        D          E       F        G          H              I           J   K          L       M             N
  const row = [
    '',           // A - (leave blank, e.g. for a serial / checkbox column)
    currentDate,  // B - Date of completion
    orderId,      // C - Order ID
    itemName,     // D - Item name
    'Bag',        // E - Product type
    'Sold',       // F - Transaction type
    costPrice,    // G - Cost Price (PKR)
    sellingPrice, // H - Selling Price (PKR)
    courierFee,   // I - Courier Fee (PKR)
    0,            // J - Other costs (reserved / 0 for now)
    totalCost,    // K - Total Cost
    profit,       // L - Profit
    profitMargin, // M - Profit Margin %
    'Added by V2 API', // N - Source tag
  ]

  // --- Authenticate and append ---
  const auth = getAuthClient()
  const sheets = google.sheets({ version: 'v4', auth })

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: 'Purse Inventory!A:N',
    valueInputOption: 'USER_ENTERED', // lets Google parse dates and numbers correctly
    resource: {
      values: [row],
    },
  })

  console.log(`✅ Order #${orderId} logged to Google Sheets.`)
}

module.exports = { updateFinancialSheet }
