(() => {
  const bikes = window.DUCATI_BIKES || [];
  const form = document.getElementById("orderForm");
  if (!form || !bikes.length) return;

  const modelSelect = document.getElementById("orderModel");
  const quantityInput = document.getElementById("orderQuantity");
  const submitButton = document.getElementById("orderSubmit");

  const summaryImage = document.getElementById("summaryImage");
  const summaryCategory = document.getElementById("summaryCategory");
  const summaryName = document.getElementById("summaryName");
  const summaryEngine = document.getElementById("summaryEngine");
  const summarySpecs = document.getElementById("summarySpecs");
  const summaryPrice = document.getElementById("summaryPrice");
  const summaryQty = document.getElementById("summaryQty");
  const summaryTotal = document.getElementById("summaryTotal");

  const successOverlay = document.getElementById("orderSuccess");
  const successOrderId = document.getElementById("successOrderId");
  const successCopy = document.getElementById("successCopy");
  const successSummary = document.getElementById("successSummary");
  const successWhatsapp = document.getElementById("successWhatsapp");

  const TARGET_WHATSAPP = "923113107375";
  let currentBike = bikes[0];

  const escapeHtml = (value) =>
    String(value).replace(/[&<>"']/g, (character) => {
      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return entities[character];
    });

  const formatPrice = (price) =>
    price === null || price === undefined ? "Price on request" : `$${price.toLocaleString("en-US")}`;

  const getQuantity = () => {
    const value = Number.parseInt(quantityInput.value, 10);
    if (Number.isNaN(value) || value < 1) return 1;
    return Math.min(value, 10);
  };

  const getTotal = () =>
    currentBike.price === null || currentBike.price === undefined
      ? null
      : currentBike.price * getQuantity();

  const populateModelSelect = () => {
    const categories = window.DUCATI_CATEGORIES || [];
    const groups = categories.filter((category) => category.id !== "all");

    modelSelect.innerHTML = groups
      .map((category) => {
        const options = bikes
          .filter((bike) => bike.category === category.id)
          .map(
            (bike) =>
              `<option value="${escapeHtml(bike.id)}">${escapeHtml(bike.name)}</option>`
          )
          .join("");
        return options
          ? `<optgroup label="${escapeHtml(category.label)}">${options}</optgroup>`
          : "";
      })
      .join("");

    const requested = new URLSearchParams(window.location.search).get("model");
    const match = bikes.find((bike) => bike.id === requested);
    modelSelect.value = match ? match.id : bikes[0].id;
  };

  const updateSummary = () => {
    const selected = bikes.find((bike) => bike.id === modelSelect.value) || bikes[0];
    currentBike = selected;
    const quantity = getQuantity();
    const total = getTotal();

    summaryImage.src = window.ducatiImage
      ? window.ducatiImage(selected.image, 420, 315)
      : selected.image;
    summaryImage.alt = `Ducati ${selected.name}`;
    summaryCategory.textContent = `Ducati ${selected.categoryLabel}`;
    summaryName.textContent = selected.name;
    summaryEngine.textContent = selected.engine;
    summarySpecs.innerHTML = `
      <span><strong>${escapeHtml(selected.power)}</strong> Power</span>
      <span><strong>${escapeHtml(selected.torque)}</strong> ${
        selected.id === "desmo450-eds" ? "Wet weight" : "Torque"
      }</span>`;
    summaryPrice.textContent = formatPrice(selected.price);
    summaryQty.textContent = String(quantity);
    summaryTotal.textContent = formatPrice(total);

    modelSelect.closest(".field")?.classList.toggle(
      "field--request",
      selected.price === null || selected.price === undefined
    );
  };

  const makeOrderId = () => {
    const now = new Date();
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("");
    const random = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `DUC-${stamp}-${random}`;
  };

  const collectOrder = (orderId) => {
    const data = new FormData(form);
    const quantity = getQuantity();
    const total = getTotal();

    return {
      orderId,
      bikeId: currentBike.id,
      bike: currentBike.name,
      category: currentBike.categoryLabel,
      engine: currentBike.engine,
      unitPrice: currentBike.price,
      unitPriceLabel: formatPrice(currentBike.price),
      quantity,
      total,
      totalLabel: formatPrice(total),
      name: String(data.get("name") || "").trim(),
      email: String(data.get("email") || "").trim(),
      phone: String(data.get("phone") || "").trim(),
      country: String(data.get("country") || "").trim(),
      city: String(data.get("city") || "").trim(),
      postalCode: String(data.get("postalCode") || "").trim(),
      address: String(data.get("address") || "").trim(),
      colour: String(data.get("colour") || "").trim(),
      payment: String(data.get("payment") || "").trim(),
      delivery: String(data.get("delivery") || "").trim(),
      notes: String(data.get("notes") || "").trim(),
      createdAt: new Date().toISOString(),
    };
  };

  const buildMessage = (order) => {
    const placed = new Date(order.createdAt).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const lines = [
      "NEW DUCATI ORDER",
      `Order ID: ${order.orderId}`,
      `Placed: ${placed}`,
      "",
      "MOTORCYCLE",
      `Model: Ducati ${order.bike}`,
      `Family: ${order.category}`,
      `Engine: ${order.engine}`,
      `Unit price: ${order.unitPriceLabel}`,
      `Quantity: ${order.quantity}`,
      `Estimated total: ${order.totalLabel}`,
      "",
      "CUSTOMER",
      `Name: ${order.name}`,
      `Phone: ${order.phone}`,
      `Email: ${order.email}`,
      `Country: ${order.country}`,
      `City: ${order.city}`,
      `Address: ${order.address}`,
    ];

    if (order.postalCode) lines.push(`Postal code: ${order.postalCode}`);

    lines.push(
      "",
      "PREFERENCES",
      `Colour / edition: ${order.colour || "Not specified"}`,
      `Payment: ${order.payment || "Not specified"}`,
      `Delivery: ${order.delivery || "Not specified"}`,
      `Notes: ${order.notes || "None"}`,
      "",
      "Please confirm availability and the next steps."
    );

    return lines.join("\n");
  };

  const showSuccess = (order, whatsappUrl, mode) => {
    successOrderId.textContent = order.orderId;
    successSummary.innerHTML = `
      <div class="success-summary__row">
        <span>Motorcycle</span>
        <strong>Ducati ${escapeHtml(order.bike)}</strong>
      </div>
      <div class="success-summary__row">
        <span>Quantity</span>
        <strong>${order.quantity}</strong>
      </div>
      <div class="success-summary__row">
        <span>Estimated total</span>
        <strong>${escapeHtml(order.totalLabel)}</strong>
      </div>
      <div class="success-summary__row">
        <span>Customer</span>
        <strong>${escapeHtml(order.name)}</strong>
      </div>`;
    successWhatsapp.href = whatsappUrl;

    if (mode === "sent") {
      successCopy.textContent =
        "Your order has been sent to the Ducati sales team on WhatsApp. Keep your order ID for reference.";
    } else {
      successCopy.textContent =
        "WhatsApp is opening with your complete order. Press the send button in WhatsApp to deliver it to our sales team.";
    }

    successOverlay.hidden = false;
    document.body.classList.add("order-success-open");
    window.setTimeout(() => successWhatsapp.focus({ preventScroll: true }), 120);

    // Best-effort automatic hand-off. If the browser blocks the popup,
    // the confirmation card keeps a visible "Open WhatsApp" button.
    if (mode !== "sent") {
      window.setTimeout(() => {
        const opened = window.open(whatsappUrl, "_blank", "noopener,noreferrer");
        if (!opened) return;
      }, 450);
    }
  };

  const closeSuccess = () => {
    successOverlay.hidden = true;
    document.body.classList.remove("order-success-open");
  };

  populateModelSelect();
  updateSummary();

  modelSelect.addEventListener("change", updateSummary);
  quantityInput.addEventListener("input", updateSummary);
  quantityInput.addEventListener("change", () => {
    quantityInput.value = String(getQuantity());
    updateSummary();
  });

  successOverlay.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-success]")) closeSuccess();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !successOverlay.hidden) closeSuccess();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.reportValidity()) return;

    const order = collectOrder(makeOrderId());
    const message = buildMessage(order);
    const fallbackUrl = `https://wa.me/${TARGET_WHATSAPP}?text=${encodeURIComponent(message)}`;

    submitButton.disabled = true;
    submitButton.textContent = "Preparing order...";

    let whatsappUrl = fallbackUrl;
    let mode = "manual";

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 5000);
      const response = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...order, message }),
        signal: controller.signal,
      });
      window.clearTimeout(timeout);

      if (response.ok) {
        const result = await response.json();
        if (result.whatsappUrl) whatsappUrl = result.whatsappUrl;
        if (result.mode === "sent") mode = "sent";
      }
    } catch (error) {
      // Static preview or no backend: fall back to the wa.me hand-off.
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Confirm & Send Order";
    }

    showSuccess(order, whatsappUrl, mode);
  });
})();
