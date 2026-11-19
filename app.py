"""Ducati order server.

Serves the static Ducati site and accepts order submissions.

The frontend always has a safe fallback: it opens WhatsApp with the complete
order pre-filled. If WhatsApp Cloud API (Meta) or Twilio credentials are
configured, this server sends the same message automatically instead.

Run:
    pip install -r requirements.txt
    python app.py

Environment variables (optional):
    WHATSAPP_ACCESS_TOKEN       Meta WhatsApp Cloud API permanent token
    WHATSAPP_PHONE_NUMBER_ID    Meta phone number ID
    WHATSAPP_API_VERSION        Graph API version (default: v21.0)
    WHATSAPP_TO                 Destination number (default: 923113107375)

    TWILIO_ACCOUNT_SID          Twilio account SID
    TWILIO_AUTH_TOKEN           Twilio auth token
    TWILIO_WHATSAPP_FROM        e.g. whatsapp:+14155238886
"""

from __future__ import annotations

import base64
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, abort, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"
# Vercel serverless functions have a read-only project filesystem, so order
# records go to /tmp there. Locally they stay beside the app as before.
ORDERS_DIR = Path("/tmp/ducati-orders") if os.getenv("VERCEL") else BASE_DIR / "orders"

DEFAULT_WHATSAPP_TO = "923113107375"

# Server-side catalogue keeps prices authoritative. None means "on request".
BIKE_CATALOGUE = {
    "desertx": ("DesertX", 17995),
    "desertx-100": ("DesertX 100", None),
    "desertx-rally": ("DesertX Rally", 19995),
    "diavel-v4-rs": ("Diavel V4 RS", 39995),
    "diavel-v4-rs-100": ("Diavel V4 RS 100", None),
    "formula-73": ("Formula 73", 19995),
    "hypermotard-698-mono": ("Hypermotard 698 Mono", 13995),
    "hypermotard-698-mono-rve": ("Hypermotard 698 Mono RVE", 15495),
    "hypermotard-698-mono-nera": ("Hypermotard 698 Mono Nera", 14395),
    "hypermotard-v2-sp-100": ("Hypermotard V2 SP 100", None),
    "monster": ("Monster", 13295),
    "monster-dark": ("Monster Dark", 12995),
    "monster-100": ("Monster 100", None),
    "multistrada-v4-s-grand-tour": ("Multistrada V4 S Grand Tour", 30995),
    "multistrada-v4-rally": ("Multistrada V4 Rally", 31995),
    "multistrada-v4-pikes-peak": ("Multistrada V4 Pikes Peak", 33995),
    "multistrada-v4-rs": ("Multistrada V4 RS", 39995),
    "desmo250-mx": ("Desmo250 MX", 9995),
    "desmo450-edx": ("Desmo450 EDX", 12495),
    "desmo450-mx": ("Desmo450 MX", 11595),
    "desmo450-eds": ("Desmo450 EDS", 12995),
    "desmo450-mx-factory": ("Desmo450 MX Factory", 13995),
}

app = Flask(__name__, static_folder=str(STATIC_DIR), template_folder=str(TEMPLATES_DIR))


def load_dotenv() -> None:
    """Load a simple KEY=VALUE .env file without overwriting real env vars."""
    env_path = BASE_DIR / ".env"
    if not env_path.is_file():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def whatsapp_destination() -> str:
    number = os.getenv("WHATSAPP_TO", DEFAULT_WHATSAPP_TO)
    return re.sub(r"[^0-9]", "", number) or DEFAULT_WHATSAPP_TO


def format_money(value: int | None) -> str:
    return "Price on request" if value is None else f"${value:,}"


def build_message(order: dict) -> str:
    placed = datetime.fromisoformat(order["createdAt"]).strftime("%d %b %Y, %H:%M UTC")
    lines = [
        "NEW DUCATI ORDER",
        f"Order ID: {order['orderId']}",
        f"Placed: {placed}",
        "",
        "MOTORCYCLE",
        f"Model: Ducati {order['bike']}",
        f"Family: {order['category']}",
        f"Engine: {order['engine']}",
        f"Unit price: {order['unitPriceLabel']}",
        f"Quantity: {order['quantity']}",
        f"Estimated total: {order['totalLabel']}",
        "",
        "CUSTOMER",
        f"Name: {order['name']}",
        f"Phone: {order['phone']}",
        f"Email: {order['email']}",
        f"Country: {order['country']}",
        f"City: {order['city']}",
        f"Address: {order['address']}",
    ]

    if order.get("postalCode"):
        lines.append(f"Postal code: {order['postalCode']}")

    lines.extend(
        [
            "",
            "PREFERENCES",
            f"Colour / edition: {order.get('colour') or 'Not specified'}",
            f"Payment: {order.get('payment') or 'Not specified'}",
            f"Delivery: {order.get('delivery') or 'Not specified'}",
            f"Notes: {order.get('notes') or 'None'}",
            "",
            "Please confirm availability and the next steps.",
        ]
    )

    return "\n".join(lines)


def post_json(url: str, payload: dict, headers: dict) -> dict:
    body = json.dumps(payload).encode("utf-8")
    request_object = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", **headers},
        method="POST",
    )
    with urllib.request.urlopen(request_object, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def post_form(url: str, payload: dict, username: str, password: str) -> dict:
    body = urllib.parse.urlencode(payload).encode("utf-8")
    token = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
    request_object = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Basic {token}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    with urllib.request.urlopen(request_object, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def send_meta_whatsapp(message: str) -> dict | None:
    token = os.getenv("WHATSAPP_ACCESS_TOKEN")
    phone_number_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
    if not token or not phone_number_id:
        return None

    version = os.getenv("WHATSAPP_API_VERSION", "v21.0")
    url = f"https://graph.facebook.com/{version}/{phone_number_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": whatsapp_destination(),
        "type": "text",
        "text": {"preview_url": False, "body": message},
    }
    return post_json(url, payload, {"Authorization": f"Bearer {token}"})


def send_twilio_whatsapp(message: str) -> dict | None:
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    sender = os.getenv("TWILIO_WHATSAPP_FROM")
    if not account_sid or not auth_token or not sender:
        return None

    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
    payload = {
        "From": sender,
        "To": f"whatsapp:+{whatsapp_destination()}",
        "Body": message,
    }
    return post_form(url, payload, account_sid, auth_token)


def delivery_mode() -> str:
    if os.getenv("WHATSAPP_ACCESS_TOKEN") and os.getenv("WHATSAPP_PHONE_NUMBER_ID"):
        return "meta"
    if os.getenv("TWILIO_ACCOUNT_SID") and os.getenv("TWILIO_AUTH_TOKEN") and os.getenv("TWILIO_WHATSAPP_FROM"):
        return "twilio"
    return "manual"


def clean_text(value: object, limit: int = 200) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def validate_order(payload: dict) -> tuple[dict | None, str | None]:
    bike_id = clean_text(payload.get("bikeId"), 60)
    if bike_id not in BIKE_CATALOGUE:
        return None, "Please choose a valid Ducati model."

    name = clean_text(payload.get("name"), 100)
    email = clean_text(payload.get("email"), 160)
    phone = clean_text(payload.get("phone"), 40)
    country = clean_text(payload.get("country"), 80)
    city = clean_text(payload.get("city"), 80)
    address = clean_text(payload.get("address"), 220)
    postal_code = clean_text(payload.get("postalCode"), 24)
    colour = clean_text(payload.get("colour"), 80)
    payment = clean_text(payload.get("payment"), 80)
    delivery = clean_text(payload.get("delivery"), 80)
    notes = clean_text(payload.get("notes"), 1200)

    if len(name) < 2:
        return None, "Please enter your full name."
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        return None, "Please enter a valid email address."
    if len(re.sub(r"[^0-9]", "", phone)) < 6:
        return None, "Please enter a valid phone number."
    if len(country) < 2:
        return None, "Please enter your country."
    if len(city) < 2:
        return None, "Please enter your city."
    if len(address) < 3:
        return None, "Please enter your delivery address."

    try:
        quantity = int(payload.get("quantity", 1))
    except (TypeError, ValueError):
        quantity = 1
    quantity = max(1, min(quantity, 10))

    bike_name, unit_price = BIKE_CATALOGUE[bike_id]
    total = None if unit_price is None else unit_price * quantity

    order_id = re.sub(r"[^A-Za-z0-9-]", "", str(payload.get("orderId", "")))[:40]
    if not order_id:
        order_id = f"DUC-{datetime.now(timezone.utc):%Y%m%d}-{uuid.uuid4().hex[:4].upper()}"

    order = {
        "orderId": order_id,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "bikeId": bike_id,
        "bike": bike_name,
        "category": clean_text(payload.get("category"), 60) or "Ducati",
        "engine": clean_text(payload.get("engine"), 80),
        "unitPrice": unit_price,
        "unitPriceLabel": format_money(unit_price),
        "quantity": quantity,
        "total": total,
        "totalLabel": format_money(total),
        "name": name,
        "email": email,
        "phone": phone,
        "country": country,
        "city": city,
        "postalCode": postal_code,
        "address": address,
        "colour": colour,
        "payment": payment,
        "delivery": delivery,
        "notes": notes,
    }
    return order, None


@app.get("/")
@app.get("/index.html")
def home():
    return send_from_directory(TEMPLATES_DIR, "index.html")


@app.get("/models.html")
def models_page():
    return send_from_directory(TEMPLATES_DIR, "models.html")


@app.get("/order.html")
def order_page():
    return send_from_directory(TEMPLATES_DIR, "order.html")


@app.get("/templates/<path:filename>")
def template_file(filename: str):
    candidate = TEMPLATES_DIR / filename
    if not candidate.is_file():
        abort(404)
    return send_from_directory(TEMPLATES_DIR, filename)


@app.get("/api/health")
def health():
    mode = delivery_mode()
    return jsonify(
        {
            "status": "ok",
            "whatsappConfigured": mode != "manual",
            "provider": mode,
            "destination": f"+{whatsapp_destination()}",
        }
    )


@app.post("/api/order")
def create_order():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"ok": False, "error": "Invalid order payload."}), 400

    order, error = validate_order(payload)
    if error or order is None:
        return jsonify({"ok": False, "error": error}), 400

    message = build_message(order)
    whatsapp_url = (
        f"https://wa.me/{whatsapp_destination()}"
        f"?text={urllib.parse.quote(message, safe='')}"
    )

    mode = delivery_mode()
    sent = False
    provider_response = None
    provider_error = None

    if mode != "manual":
        try:
            if mode == "meta":
                provider_response = send_meta_whatsapp(message)
            else:
                provider_response = send_twilio_whatsapp(message)
            sent = provider_response is not None
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError) as exc:
            provider_error = str(exc)
        except Exception as exc:  # pragma: no cover - defensive
            provider_error = str(exc)

    record = {
        **order,
        "message": message,
        "status": "sent" if sent else "pending_whatsapp",
        "provider": mode,
        "providerResponse": provider_response,
        "providerError": provider_error,
        "whatsappUrl": whatsapp_url,
    }

    try:
        ORDERS_DIR.mkdir(parents=True, exist_ok=True)
        order_path = ORDERS_DIR / f"{order['orderId']}.json"
        order_path.write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")
    except OSError as exc:
        # Never lose an order response just because the host filesystem is
        # read-only; the WhatsApp payload is still returned to the customer.
        record["storageError"] = str(exc)

    return jsonify(
        {
            "ok": True,
            "orderId": order["orderId"],
            "mode": "sent" if sent else "manual",
            "provider": mode,
            "whatsappUrl": whatsapp_url,
            "message": message,
            "totalLabel": order["totalLabel"],
        }
    )


load_dotenv()

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host=os.getenv("HOST", "127.0.0.1"), port=port, debug=os.getenv("FLASK_DEBUG") == "1")
