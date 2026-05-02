## Backend Setup

This backend provides:

- single-admin login
- product CRUD
- sale ad CRUD
- image upload endpoint
- Neon/Postgres storage

### 1. Install and configure

Copy `.env.example` to `.env` and fill in:

- `DATABASE_URL`
- `ADMIN_USERNAME`
- `JWT_SECRET`

Generate a password hash:

```bash
npm run hash-password -- "your-password"
```

Put the generated value into `ADMIN_PASSWORD_HASH`.

### 2. Start the API

```bash
npm install
npm run dev
```

The API runs on `http://localhost:4000`.

### 3. Admin features included

- Login
- Add new purses
- Edit prices
- Toggle visibility/featured products
- Create and edit sale ads
- Upload product images
## Backend (Planned)

This folder is reserved for the API/backend service.

Suggested next steps:
- Initialize with `npm init -y`
- Add `express` and basic route structure
- Add environment-based config (`.env`)
- Connect to your preferred database

For now, frontend development is the focus.
