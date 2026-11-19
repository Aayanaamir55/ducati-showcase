(() => {
  const body = document.body;
  const menuToggle = document.getElementById("menuToggle");
  const menuPanel = document.getElementById("siteMenu");
  const menuBackdrop = document.getElementById("menuBackdrop");
  const menuLabel = menuToggle?.querySelector(".menu-toggle__text");
  const menuLinks = menuPanel?.querySelectorAll("a") ?? [];
  const firstMenuLink = menuPanel?.querySelector("a");

  if (!menuToggle || !menuPanel || !menuBackdrop) return;

  const setMenu = (open) => {
    body.classList.toggle("menu-open", open);
    menuToggle.setAttribute("aria-expanded", String(open));
    menuPanel.setAttribute("aria-hidden", String(!open));

    if (menuLabel) {
      menuLabel.textContent = open ? "Close" : "Menu";
    }

    if (open) {
      window.setTimeout(() => {
        if (body.classList.contains("menu-open")) {
          firstMenuLink?.focus({ preventScroll: true });
        }
      }, 250);
    } else {
      menuToggle.focus({ preventScroll: true });
    }
  };

  menuToggle.addEventListener("click", () => {
    setMenu(!body.classList.contains("menu-open"));
  });

  menuBackdrop.addEventListener("click", () => setMenu(false));

  menuLinks.forEach((link) => {
    link.addEventListener("click", () => setMenu(false));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && body.classList.contains("menu-open")) {
      setMenu(false);
    }
  });
})();
