for (const area of document.querySelectorAll("[data-filter-area]")) {
  const controls = area.querySelector("[data-filter]");
  const input = controls.querySelector("input");
  const categoryControls = area.querySelector("[data-category-controls]");
  const category = categoryControls?.querySelector("select");
  const items = [...area.querySelector("[data-results]").children];
  const empty = area.querySelector("[data-empty]");

  function filter() {
    const query = input.value.trim().toLowerCase();
    let matchCount = 0;
    for (const item of items) {
      const matches = item.textContent.toLowerCase().includes(query)
        && (!category?.value || item.dataset.category === category.value);
      item.hidden = !matches;
      if (matches) matchCount++;
    }
    empty.hidden = matchCount > 0;
  }

  controls.hidden = false;
  if (categoryControls) categoryControls.hidden = false;
  input.addEventListener("input", filter);
  category?.addEventListener("change", filter);
  filter();
}

function openLinkedDetails() {
  const target = document.getElementById(location.hash.slice(1));
  if (target instanceof HTMLDetailsElement) target.open = true;
}
openLinkedDetails();
window.addEventListener("hashchange", openLinkedDetails);

const feedbackForm = document.querySelector("[data-feedback]");
if (feedbackForm) {
  const message = feedbackForm.querySelector("textarea");
  const status = feedbackForm.querySelector("[data-feedback-status]");
  feedbackForm.hidden = false;
  message.addEventListener("input", () => message.setCustomValidity(""));
  feedbackForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const suggestion = message.value.trim();
    if (!suggestion) {
      message.setCustomValidity("Enter a suggestion before opening your email draft.");
      message.reportValidity();
      return;
    }
    const subject = encodeURIComponent("CEDA Innovation Portal suggestion");
    const body = encodeURIComponent(suggestion.replace(/\r?\n/g, "\r\n"));
    status.textContent = "Send the draft from your email app. If it does not open, use the email address below.";
    window.location.href = `mailto:${feedbackForm.dataset.recipient}?subject=${subject}&body=${body}`;
  });
}

for (const menu of document.querySelectorAll(".mobile-nav")) {
  menu.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !menu.open) return;
    menu.open = false;
    menu.querySelector("summary").focus();
  });
}
