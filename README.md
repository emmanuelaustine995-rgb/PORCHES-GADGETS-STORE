# PORCHES GADGETS STORE

Responsive online gadgets shop with product search, category filters, cart, checkout, M-Pesa STK Push (Daraja), pay on delivery, order tracking, stock control and an admin dashboard.

## Deploy on Northflank
1. Push this repository to GitHub and create a Northflank **Combined Service** from the repository.
2. Build with the root `Dockerfile` and expose HTTP port `3000`.
3. Attach a persistent volume mounted at `/data` (required to retain products, stock and orders between restarts).
4. Set `DATA_DIR=/data`, `PORT=3000`, and `ADMIN_KEY` to a unique random secret of at least 16 characters.
5. Deploy and confirm `https://YOUR-DOMAIN/health` returns JSON with status `ok`.

## M-Pesa setup (Safaricom Daraja)
Set these as Northflank environment variables — never commit keys to GitHub:
- `MPESA_ENV=sandbox` while testing; use `production` only after Safaricom production approval.
- `MPESA_KEY`, `MPESA_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`
- `PUBLIC_URL` = the exact public HTTPS service URL (no trailing slash)
- `CALLBACK_SECRET` = a long random value used to protect the callback route
- `MPESA_TRANSACTION_TYPE=CustomerPayBillOnline` for PayBill. For a Till, use `CustomerBuyGoodsOnline` and set `MPESA_PARTY_B` to the Till number.

M-Pesa is automatically unavailable until all required settings are present. Customers can still select pay on delivery. Safaricom callback confirmation, not the browser redirect, marks an order as paid. Test in sandbox before switching to production.

## Admin
Open the **Admin** section on the storefront and enter the value of `ADMIN_KEY`. The key is held only in the page's memory and sent in the request header. Admin can add/edit/delete products, update stock, view customer orders and update order status.

## Data and operations
Products and orders are JSON files stored under `DATA_DIR`. Mount persistent storage at `/data` in Northflank and back it up regularly. JSON-file storage is suitable for a small single-instance store; use a managed database before running multiple replicas or handling high order volumes.

## Important before launch
- Replace sample products, prices and stock with verified inventory.
- Confirm delivery fees, contact details, returns/refunds policy and privacy notice.
- Run end-to-end Daraja sandbox tests, including failed/cancelled payment and callback delivery.
- HTTPS is required for the public Safaricom callback.
- This starter does not include customer accounts, automatic delivery pricing, automated refunds or a payment reconciliation dashboard.
