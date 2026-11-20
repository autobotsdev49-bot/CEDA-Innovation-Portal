import { signupConfig } from "./signupConfig.js";
import { verifiedAccountProfile, logoutSignup } from "./signupApi.js";
import { accountToken, clearAccountToken, saveAccountToken } from "./verificationSession.js";

const status = document.querySelector("[data-admin-status]");
const workspace = document.querySelector("[data-admin-workspace]");
const rows = document.querySelector("[data-users]");
let page = 0;
let search = "";
let editing;
let factor;
let busy = false;

function announce(message) { status.textContent = message; }
const sectionLinks = [...document.querySelectorAll('.admin-sidebar nav a[href^="#"]')];
function updateActiveSection() {
  const sectionId = location.hash.slice(1) || "overview";
  for (const link of sectionLinks) {
    if (link.hash === "#" + sectionId) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}
for (const link of sectionLinks) link.addEventListener("click", () => {
  for (const item of sectionLinks) item.removeAttribute("aria-current");
  link.setAttribute("aria-current", "page");
});
window.addEventListener("hashchange", updateActiveSection);
updateActiveSection();
async function request(path, body, method = "POST") {
  const token = accountToken();
  if (!signupConfig || !token) throw new Error("Sign in to continue.");
  const response = await fetch(new URL(path, signupConfig.url), {
    method, headers: { apikey: signupConfig.key, Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store", credentials: "omit", redirect: "error", signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.message ?? data?.error ?? "";
    if (/Multi-factor/.test(message)) throw new Error("Verify your authenticator in Account security before changing user access.");
    if (response.status === 401) throw new Error("Your session expired. Sign in again.");
    if (response.status === 403) throw new Error("You do not have access to this action.");
    if (/Account already exists/.test(message)) throw new Error("This email already has an account. Use the user directory to update its access.");
    if (/invitation was reserved|Invitation could not be prepared/.test(message)) throw new Error(message);
    if (response.status === 409 || /duplicate key/.test(message)) throw new Error("This record already exists. Refresh and check the current entries.");
    throw new Error("The action could not be completed. Check the values and try again.");
  }
  return data;
}
const rpc = (name, body = {}) => request("/rest/v1/rpc/" + name, body);

async function run(action) {
  if (busy) return;
  busy = true;
  workspace.querySelectorAll("button").forEach(button => { button.disabled = true; });
  try { await action(); }
  catch (error) { announce(error.message); }
  finally {
    busy = false;
    workspace.querySelectorAll("button").forEach(button => { button.disabled = false; });
    document.querySelector("[data-previous]").disabled = page === 0;
  }
}
function appendCell(row, text) {
  const cell = row.insertCell();
  cell.textContent = text;
  return cell;
}
async function loadUsers() {
  const users = await rpc("admin_directory", { search_text: search, page_number: page });
  rows.replaceChildren();
  for (const user of users) {
    const row = rows.insertRow();
    appendCell(row, user.full_name);
    appendCell(row, user.email);
    appendCell(row, user.account_role + (user.lead_assessor ? " · Lead" : ""));
    appendCell(row, user.account_status);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Edit access";
    button.addEventListener("click", () => {
      editing = user.id;
      const form = document.querySelector("[data-role-form]");
      form.elements.role.value = user.account_role;
      form.elements.lead.checked = user.lead_assessor;
      for (const option of form.elements.sectors.options) option.selected = user.sector_ids.includes(option.value);
      document.querySelector("[data-edit-name]").textContent = user.full_name;
      document.querySelector("[data-edit-role]").hidden = false;
      form.elements.role.focus();
    });
    appendCell(row, "").append(button);
  }
  if (!users.length) {
    const cell = rows.insertRow().insertCell();
    cell.colSpan = 5;
    cell.textContent = "No users found on this page.";
  }
  document.querySelector("[data-page]").textContent = "Page " + (page + 1);
}
async function loadSectors() {
  const sectors = await rpc("admin_sectors");
  const list = document.querySelector("[data-sector-list]");
  list.replaceChildren();
  for (const sector of sectors) {
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = sector.name + " · " + sector.status;
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => {
      const form = document.querySelector("[data-sector-form]");
      form.elements.id.value = sector.id;
      form.elements.name.value = sector.name;
      form.elements.status.value = sector.status;
      form.elements.name.focus();
    });
    item.append(label, edit);
    list.append(item);
  }
  for (const select of workspace.querySelectorAll('select[name="sectors"]')) {
    select.replaceChildren();
    for (const sector of sectors.filter(item => item.status !== "archived")) {
      const option = document.createElement("option");
      option.value = sector.id;
      option.textContent = sector.name;
      select.append(option);
    }
  }
}
function accessValues(form) {
  return {
    new_role: form.elements.role.value,
    lead: form.elements.lead.checked,
    sectors: [...form.elements.sectors.selectedOptions].map(option => option.value),
    reason: form.elements.reason.value.trim(),
  };
}
document.querySelector("[data-user-search]").addEventListener("submit", event => {
  event.preventDefault(); search = event.target.elements.search.value.trim(); page = 0;
  void run(async () => { await loadUsers(); announce("Directory updated."); });
});
for (const [selector, increment] of [["[data-previous]", -1], ["[data-next]", 1]]) {
  document.querySelector(selector).addEventListener("click", () => void run(async () => {
    page = Math.max(0, page + increment); await loadUsers(); announce("Directory updated.");
  }));
}
document.querySelector("[data-sector-form]").addEventListener("submit", event => {
  event.preventDefault(); const form = event.target;
  void run(async () => {
    await rpc("admin_save_sector", { sector_name: form.elements.name.value.trim(), sector_status: form.elements.status.value, reason: form.elements.reason.value.trim(), sector_id: form.elements.id.value || null });
    form.reset(); await loadSectors(); announce("Sector saved.");
  });
});
document.querySelector("[data-role-form]").addEventListener("submit", event => {
  event.preventDefault(); const form = event.target;
  void run(async () => {
    await rpc("admin_assign_role", { target_id: editing, ...accessValues(form) });
    document.querySelector("[data-edit-role]").hidden = true; await loadUsers(); announce("Access updated and audited.");
  });
});
document.querySelector("[data-cancel-edit]").addEventListener("click", () => { document.querySelector("[data-edit-role]").hidden = true; });
document.querySelector("[data-create-user]").addEventListener("submit", event => {
  event.preventDefault(); const form = event.target;
  void run(async () => {
    await request("/functions/v1/admininvite", { address: form.elements.email.value.trim(), display_name: form.elements.fullName.value.trim(), ...accessValues(form) });
    form.reset(); await loadUsers(); announce("Invitation sent. The user can set a password using the email link.");
  });
});
document.querySelector("[data-enroll-factor]").addEventListener("click", () => void run(async () => {
  const user = await request("/auth/v1/user", undefined, "GET");
  const existing = (user.factors ?? []).find(item => item.factor_type === "totp" && item.status === "verified");
  if (existing) { factor = existing.id; announce("Enter the code from your authenticator."); return; }
  const data = await request("/auth/v1/factors", { factor_type: "totp", friendly_name: "CEDA Admin" });
  factor = data.id;
  const qr = document.querySelector("[data-factor-qr]");
  const svg = data.totp.qr_code;
  qr.src = svg.startsWith("data:image/svg+xml;") ? svg : "data:image/svg+xml;base64," + btoa(svg);
  document.querySelector("[data-factor-setup]").hidden = false;
  announce("Scan the code with your authenticator, then enter its six-digit code.");
}));
document.querySelector("[data-mfa-form]").addEventListener("submit", event => {
  event.preventDefault(); const form = event.target;
  void run(async () => {
    if (!factor) throw new Error("Select Set up authenticator first.");
    const challenge = await request("/auth/v1/factors/" + factor + "/challenge", {});
    const verified = await request("/auth/v1/factors/" + factor + "/verify", { challenge_id: challenge.id, code: form.elements.code.value });
    if (!verified.access_token || !saveAccountToken(verified.access_token)) throw new Error("Your verified session could not be saved. Sign in again.");
    form.reset(); document.querySelector("[data-factor-setup]").hidden = true;
    document.querySelector("[data-factor-qr]").removeAttribute("src");
    announce("Multi-factor verification complete.");
  });
});
document.querySelector("[data-admin-logout]").addEventListener("click", async () => {
  const token = accountToken(); clearAccountToken(); workspace.hidden = true;
  try { if (signupConfig && token) await logoutSignup(signupConfig, token); } finally { location.replace("/signin/"); }
});
void run(async () => {
  const profile = signupConfig && accountToken() && await verifiedAccountProfile(signupConfig, accountToken());
  if (!profile) { location.replace("/signin/"); return; }
  if (profile.account_role !== "admin") { location.replace("/account/"); return; }
  document.querySelector("[data-admin-name]").textContent = profile.full_name || "Administrator";
  document.querySelector("[data-admin-email]").textContent = profile.email || "";
  await loadUsers(); await loadSectors();
  workspace.hidden = false; announce("Administrator workspace ready.");
});
