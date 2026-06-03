const pool = require('../config/db');
const { google } = require('googleapis');

// ==========================================
// 🔐 GOOGLE SHEETS AUTHENTICATION
// ==========================================
const getSheetsClient = async () => {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
};

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// ==========================================
// 1️⃣ LOG NEW ORDER (Purse Inventory)
// ==========================================
exports.logNewOrder = async (req, res) => {
  try {
    const { date, orderId, itemName, category, status, supplierName, payStatus, originalPrice, amountPaid, sellingPrice, courierFee, otherCosts, notes } = req.body;
    const sheets = await getSheetsClient();

    const inventoryData = [[
      '',               // A: (Empty/Numbering)
      date,             // B: Date Added
      '',               // C: Month (Auto-Formula)
      orderId,          // D: Order ID
      itemName,         // E: Item Name
      category,         // F: Category
      status,           // G: Status
      supplierName,     // H: Supplier Name
      payStatus,        // I: Supplier Payment
      originalPrice,    // J: Original Price
      amountPaid,       // K: Amount Paid
      '',               // L: Amount Owed (Auto-Formula)
      sellingPrice,     // M: Selling Price
      courierFee,       // N: Courier Fee
      otherCosts,       // O: Other Costs
      '',               // P: Total Cost (Auto-Formula)
      '',               // Q: Profit (Auto-Formula)
      '',               // R: Profit Margin (Auto-Formula)
      notes || ''       // S: Notes
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Purse Inventory!A7:S',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: inventoryData },
    });

    res.status(200).json({ message: 'Order logged to Purse Inventory successfully' });
  } catch (error) {
    console.error('❌ Error logging order:', error);
    res.status(500).json({ error: 'Failed to log order' });
  }
};

// ==========================================
// 2️⃣ LOG GENERIC CASH BOOK TRANSACTION 
// (Sales, Ads, Daily Expenses, Personal Use)
// ==========================================
exports.logCashTransaction = async (req, res) => {
  try {
    const { date, type, description, amountIn, amountOut, source, paidTo, notes } = req.body;
    const sheets = await getSheetsClient();

    // Determine the exact Transaction Type based on description (e.g. Meta Ads -> Ad Spend)
    const transactionType = description === 'Meta Ads' ? 'Ad Spend' : type;

    const cashBookData = [[
      date,             // A: Date
      transactionType,  // B: Transaction Type (🚨 DYNAMIC! Sends 'Ad Spend' or 'Expense')
      description,      // C: Description
      amountIn || '',   // D: Amount IN
      amountOut || '',  // E: Amount OUT (PKR)
      '',               // F: Balance (Auto-Formula)
      source || '',     // G: Source / Investor
      paidTo || '',     // H: For Who / Paid To
      notes || ''       // I: Notes
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Cash Book!A8:I',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: cashBookData },
    });

    res.status(200).json({ message: `${type} logged to Cash Book successfully` });
  } catch (error) {
    console.error('❌ Error logging cash transaction:', error);
    res.status(500).json({ error: 'Failed to log cash transaction' });
  }
};

// ==========================================
// 3️⃣ LOG INVESTOR DEPOSIT / REPAYMENT
// ==========================================
exports.logInvestorTransaction = async (req, res) => {
  try {
    const { date, investorName, amount, isDeposit, purpose, notes } = req.body;
    const sheets = await getSheetsClient();
    
    // 🚨 FIX 1: Force the amount to be a true Mathematical Number so Sheets can SUM it!
    const numericAmount = Number(amount); 

    // 1. Write to Investor Ledger (Matching your SCREENSHOT layout)
    const investorData = [[
      date,                               // A: Date
      investorName,                       // B: Investor Name
      isDeposit ? numericAmount : '',     // C: Amount Invested (IN)
      purpose,                            // D: Purpose (e.g., "Monthly Ad Investment")
      !isDeposit ? numericAmount : '',    // E: Amount Repaid (OUT)
      notes || ''                         // F: Notes
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Investor Ledger!A11:F',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: investorData },
    });

    // 2. Write to Cash Book
    const cashBookData = [[
      date,                                                 // A: Date
      isDeposit ? 'Investment' : 'Investment Repayment',    // B: Transaction Type
      `${purpose} - ${investorName}`,                       // C: Description (🚨 FIX 2: Uses your actual purpose!)
      isDeposit ? numericAmount : '',                       // D: Amount IN
      !isDeposit ? numericAmount : '',                      // E: Amount OUT
      '',                                                   // F: Balance
      investorName,                                         // G: Source
      !isDeposit ? investorName : '',                       // H: Paid To
      notes || ''                                           // I: Notes
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Cash Book!A8:I',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: cashBookData },
    });

    res.status(200).json({ message: 'Investor transaction logged successfully' });
  } catch (error) {
    console.error('❌ Error logging investor transaction:', error);
    res.status(500).json({ error: 'Failed to log investor transaction' });
  }
};

// ==========================================
// 4️⃣ UPDATE SUPPLIER PAYMENT 
// (Finds Row in Purse Inventory & Updates + Logs Cash Book)
// ==========================================
exports.updateSupplierPayment = async (req, res) => {
  try {
    const { date, orderId, newAmountPaid, supplierName, notes } = req.body;
    const sheets = await getSheetsClient();

    // Step 1: Read the existing Purse Inventory to find the right Order ID
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Purse Inventory!D7:D1000', // Only fetching Order IDs
    });

    const rows = response.data.values;
    if (!rows) throw new Error('No data found in Purse Inventory');

    // Find the exact row index for the matching Order ID
    const rowIndex = rows.findIndex(row => row[0] === orderId);
    if (rowIndex === -1) throw new Error(`Order ID ${orderId} not found in sheet`);

    // Calculate exact cell to update (Row 7 + index)
    const exactRowNumber = 7 + rowIndex;

    // Step 2: Update ONLY Column K (Amount Paid) for that specific row
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Purse Inventory!K${exactRowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[newAmountPaid]] },
    });

    // Step 3: Log the actual cash leaving the business to the Cash Book
    const cashBookData = [[
      date,                     // A: Date
      'Supplier Payment',       // B: Transaction Type
      `Payment to ${supplierName} for Order ${orderId}`, // C: Description
      '',                       // D: Amount IN
      newAmountPaid,            // E: Amount OUT
      '',                       // F: Balance
      '',                       // G: Source
      supplierName,             // H: Paid To
      notes || ''               // I: Notes
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Cash Book!A8:I',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: cashBookData },
    });

    res.status(200).json({ message: 'Supplier payment updated in both sheets successfully' });
  } catch (error) {
    console.error('❌ Error updating supplier payment:', error);
    res.status(500).json({ error: error.message || 'Failed to update supplier payment' });
  }
};

// ==========================================
// 5️⃣ UPDATE ORDER STATUS TO DELIVERED
// (Marks order as delivered in Purse Inventory sheet)
// ==========================================
exports.updateOrderDeliveryStatus = async (req, res) => {
  try {
    const { orderId, newStatus = 'Delivered' } = req.body;
    const sheets = await getSheetsClient();

    // Step 0: Update Local Database first
    await pool.query(
      'UPDATE orders SET status = $1, trax_status = $2 WHERE id = $3',
      ['delivered', 'Settled', orderId]
    );

    // Step 1: Fetch all Order IDs from Purse Inventory (Column D)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Purse Inventory!D7:D1000',
    });

    const rows = response.data.values;
    if (!rows) throw new Error('No data found in Purse Inventory');

    // Step 2: Find the row index matching the Order ID
    const rowIndex = rows.findIndex(row => row[0] === String(orderId));
    if (rowIndex === -1) throw new Error(`Order ID ${orderId} not found in Purse Inventory`);

    // Step 3: Calculate the exact row number (starts at row 7)
    const exactRowNumber = 7 + rowIndex;

    // Step 4: Update Status column (Column G) for that row
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Purse Inventory!G${exactRowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[newStatus]] },
    });

    console.log(`✅ Order #${orderId} marked as ${newStatus} in Google Sheets (Row ${exactRowNumber})`);
    res.status(200).json({ 
      success: true, 
      message: `Order #${orderId} marked as ${newStatus} in Google Sheets` 
    });
  } catch (error) {
    console.error('❌ Error updating order delivery status:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to update order status' 
    });
  }
};