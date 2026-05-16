## Naseera Collection — Backend API

This is the Node.js/Express backend powering the Naseera Collection platform.

### Core Features
- **Stateless Auth**: JWT-based authentication for Admin and Supplier (Uncle) roles.
- **Product & Inventory**: Full CRUD for products, automated stock deduction, and scarcity tracking.
- **Order Management**: Status tracking (Informed, Packed, Shipped, Delivered) and printable receipt generation.
- **Transactional Email**: Integrated with **Brevo HTTP API** for reliable order notifications in serverless environments.
- **Storage**: Cloudinary CDN integration for automated image management.

### Setup & Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**:
   Create a `.env` file with the following:
   - `DATABASE_URL`: Neon PostgreSQL connection string.
   - `JWT_SECRET`: Secret key for token signing.
   - `EMAIL_USER`: Verified sender email in Brevo.
   - `BREVO_API_KEY`: Brevo API Key v3.
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: Media storage credentials.
   - `FRONTEND_URL`: CORS allowed origin (e.g., your Vercel URL).

3. **Database Initialization**:
   The backend automatically initializes the PostgreSQL schema on startup via `initializeSchema()`.

4. **Start Development Server**:
   ```bash
   npm run dev
   ```
   The API will be accessible at `http://localhost:4000`.

### Key Scripts
- `npm run dev`: Starts the server with `nodemon` for development.
- `npm start`: Production startup script.
- `node src/scripts/check_orders.js`: Utility to manually check and log order counts.
