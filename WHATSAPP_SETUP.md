# Ducati Order + WhatsApp Setup

## Run the website

```powershell
pip install -r requirements.txt
python app.py
```

Open `http://127.0.0.1:5000/`.

The pages can also be served as plain static files. In that case the order
button opens WhatsApp with the full order pre-filled.

## How the order flow works

1. A customer clicks **Purchase** on any model card.
2. `order.html` opens with that model selected.
3. The customer enters their details and confirms.
4. The order is saved to `orders/` and a WhatsApp message is prepared.
5. If a provider is configured, the server sends the message automatically.
6. If no provider is configured, WhatsApp opens with the message ready to send.

Destination number: **+92 311 3107375** (`923113107375`).

## Automatic sending

### Option A — Meta WhatsApp Cloud API

1. Create a Meta app with the WhatsApp product.
2. Copy the permanent access token and phone number ID.
3. Create a `.env` file (copy `.env.example`) and fill in:

```env
WHATSAPP_ACCESS_TOKEN=your-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_TO=923113107375
```

4. Restart `app.py`.

Important: Meta only allows free-form text messages inside an open 24-hour
customer service window. For business-initiated messages you normally need an
approved message template. If the send fails, the order is still saved and the
site falls back to the `wa.me` hand-off.

### Option B — Twilio WhatsApp

```env
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
WHATSAPP_TO=923113107375
```

Restart `app.py`. Twilio sandbox recipients must join the sandbox first.

## Check the configuration

```powershell
curl http://127.0.0.1:5000/api/health
```

The response shows whether automatic sending is configured.

## Orders

Every confirmed order is saved as JSON in `orders/<order-id>.json`, including
the full message, provider result, and any provider error.
