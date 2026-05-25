const { google } = require('googleapis');

// 1. Authenticate with Google using your Service Account credentials
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

exports.appendOrderToSheet = async (order, products) => {
  try {
    console.log(`🕵️ WARNING: The server is writing to this EXACT ID: ${process.env.SPREADSHEET_ID}`);

    const spreadsheetId = process.env.SPREADSHEET_ID;
    const dateAdded = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Calculate the month on the backend so Column C never breaks
    const monthValue = dateAdded.substring(0, 7); 

    console.log(`📦 Items being sent to Google for Order ${order.id}:`, JSON.stringify(products, null, 2));

    const rowsToAppend = products.flatMap((item) => {
      const rows = [];
      
      // Loop based on how many of this specific purse they bought
      for (let i = 0; i < (item.quantity || 1); i++) {
        let supplier = item.supplier_name;
        if (!supplier || supplier === 'Default Supplier') {
          supplier = 'Naveed';
        }

        rows.push([
          '', // A: # (Forces alignment from the very left)
          dateAdded, // B: Date Added
          monthValue, // C: Month (Calculated on backend)
          order.id, // D: Order ID
          item.name, // E: Item Name
          item.category || 'Bag', // F: Category
          'Pending', // G: Status
          supplier, // H: Supplier Name
          // 🚨 NEW: Smart Formula injected by the server!
          `=IF(INDIRECT("L"&ROW())<=0, "Paid", "Unpaid")`, // I: Supplier Payment
          item.wholesale_price || 0, // J: Original Price (Cost)
          0, // K: Amount Paid to Supplier
          null, // L: Amount Owed (Blue Formula)
          item.price, // M: Selling Price
          order.shipping_fee || order.shipping_cost || 0, // N: Courier Fee
          0, // O: Other Costs
          null, // P: TOTAL COST (Blue Formula)
          null, // Q: PROFIT (Blue Formula)
          null, // R: Profit Margin % (Blue Formula)
          'Auto-logged from checkout' // S: Notes
        ]);
      }
      return rows;
    });

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      // 🚨 FIX: Header is Row 6. Buffer is Row 7. We start injecting at Row 8!
      // Looking ONLY at Column A keeps it from running away from formulas.
      range: 'Purse Inventory!A8:A',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: rowsToAppend,
      },
    });

    console.log(`✅ Success! Google pasted the data in: ${response.data.updates.updatedRange}`);
  } catch (error) {
    console.error('❌ Google Sheets Error:', error.message);
  }
};