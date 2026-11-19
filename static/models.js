(() => {
  const bikes = window.DUCATI_BIKES || [];
  const categories = window.DUCATI_CATEGORIES || [{ id: "all", label: "All Bikes" }];
  const grid = document.getElementById("bikeGrid");
  const filterBar = document.getElementById("filterBar");
  const countLabel = document.getElementById("modelCount");

  if (!grid || !filterBar) return;

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

  const formatPrice = (bike) =>
    bike.price === null || bike.price === undefined
      ? "Price on request"
      : `From $${bike.price.toLocaleString("en-US")}`;

  const cardTemplate = (bike) => {
    const isRequest = bike.price === null || bike.price === undefined;
    const image = window.ducatiImage ? window.ducatiImage(bike.image, 630, 390) : bike.image;
    return `
      <article class="bike-card" data-category="${escapeHtml(bike.category)}">
        <div class="card-badge${isRequest ? " card-badge--limited" : ""}">${escapeHtml(bike.badge)}</div>
        <div class="card-image">
          <img src="${escapeHtml(image)}" alt="Ducati ${escapeHtml(bike.name)}" width="630" height="390" decoding="async" fetchpriority="low">
        </div>
        <div class="card-info">
          <h3>${escapeHtml(bike.name)}</h3>
          <p class="engine-tag">${escapeHtml(bike.engine)}</p>
          <p class="bike-blurb">${escapeHtml(bike.blurb)}</p>
          <div class="card-specs">
            <span><strong>${escapeHtml(bike.power)}</strong> Power</span>
            <span><strong>${escapeHtml(bike.torque)}</strong> ${bike.id === "desmo450-eds" ? "Wet weight" : "Torque"}</span>
          </div>
          <div class="card-footer">
            <span class="price${isRequest ? " price--request" : ""}">${formatPrice(bike)}</span>
            <a class="btn-buy" href="order.html?model=${encodeURIComponent(bike.id)}">Purchase</a>
          </div>
        </div>
      </article>`;
  };

  const renderCards = (filter = "all") => {
    const visibleBikes =
      filter === "all" ? bikes : bikes.filter((bike) => bike.category === filter);
    grid.innerHTML = visibleBikes.map(cardTemplate).join("");

    if (countLabel) {
      countLabel.textContent = `${visibleBikes.length} ${
        visibleBikes.length === 1 ? "model" : "models"
      } available`;
    }
  };

  const renderFilters = () => {
    filterBar.innerHTML = categories
      .map((category) => {
        const total =
          category.id === "all"
            ? bikes.length
            : bikes.filter((bike) => bike.category === category.id).length;
        return `<button class="filter-btn${category.id === "all" ? " active" : ""}" type="button" data-filter="${escapeHtml(
          category.id
        )}">${escapeHtml(category.label)} <span>${total}</span></button>`;
      })
      .join("");

    filterBar.addEventListener("click", (event) => {
      const button = event.target.closest(".filter-btn");
      if (!button) return;

      filterBar.querySelectorAll(".filter-btn").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      renderCards(button.dataset.filter);
    });
  };

  renderFilters();
  renderCards();
})();
