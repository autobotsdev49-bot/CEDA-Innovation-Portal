const layout = document.querySelector("[data-access-mode]");
const alternateForm = document.getElementById("alternate-access-form");
const storyTitle = document.getElementById("access-story-title");
const pageDescription = document.querySelector('meta[name="description"]');
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const routes = new Map([["/signin/", "signin"], ["/register/", "register"]]);
let transition;

function setPasswordVisibility(button, visible) {
  button.closest(".access-password").querySelector("input").type = visible ? "text" : "password";
  button.setAttribute("aria-label", `${visible ? "Hide" : "Show"} ${button.dataset.passwordToggle}`);
  button.querySelector("[data-password-show]").hidden = visible;
  button.querySelector("[data-password-hide]").hidden = !visible;
}

for (const panel of [layout, alternateForm.content]) {
  for (const button of panel.querySelectorAll("[data-password-toggle]")) button.hidden = false;
}

function showCurrentRoute() {
  const mode = routes.get(location.pathname);
  if (!mode || mode === layout.dataset.accessMode) return;

  const isRegistration = mode === "register";
  const current = layout.querySelector(".access-content");
  const next = alternateForm.content.firstElementChild;
  for (const button of current.querySelectorAll("[data-password-toggle]")) setPasswordVisibility(button, false);
  current.replaceWith(next);
  alternateForm.content.append(current);
  layout.dataset.accessMode = mode;
  layout.classList.toggle("access-registration", isRegistration);
  storyTitle.textContent = isRegistration ? "Start with a single account." : "Your ideas. One secure place.";
  document.title = `${isRegistration ? "Sign up" : "Sign in"} | CEDA Innovation Portal`;
  pageDescription.content = isRegistration
    ? "Create an account for the CEDA Innovator Portal."
    : "Sign in to your CEDA Innovator account.";
  window.scrollTo({ top: 0, behavior: "instant" });
  next.querySelector("h1").focus({ preventScroll: true });
}

function switchAccessMode() {
  transition?.skipTransition();
  if (reducedMotion.matches || typeof document.startViewTransition !== "function") {
    showCurrentRoute();
    return;
  }
  const running = document.startViewTransition(showCurrentRoute);
  transition = running;
  running.finished.then(() => {
    if (transition === running) transition = undefined;
  });
}

layout.addEventListener("click", (event) => {
  const passwordToggle = event.target.closest("[data-password-toggle]");
  if (passwordToggle) {
    setPasswordVisibility(passwordToggle, passwordToggle.querySelector("[data-password-hide]").hidden);
    return;
  }
  const link = event.target.closest(".access-switch a");
  if (!link || event.defaultPrevented || event.button !== 0 ||
      event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
      !routes.has(link.pathname) || link.origin !== location.origin) return;

  event.preventDefault();
  if (link.pathname === location.pathname) return;
  history.pushState(null, "", link.href);
  switchAccessMode();
});

window.addEventListener("popstate", switchAccessMode);
