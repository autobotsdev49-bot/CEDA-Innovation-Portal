const storageKey = "ceda.emailCooldown.v2";
const intervals = [60, 300, 3600];
const recent = new Map();
const quotaKey = "ceda.projectEmailRetry";
let projectQuota;

try {
  for (const [email, state] of JSON.parse(sessionStorage.getItem(storageKey) || "[]")) {
    if (state.scope !== "quota") {
      recent.set(email, state);
    } else if (!state.estimated && state.deadline > (projectQuota?.deadline ?? 0)) {
      projectQuota = state;
    }
  }
  const savedQuota = JSON.parse(sessionStorage.getItem(quotaKey) || "null");
  if (savedQuota && savedQuota.deadline >= (projectQuota?.deadline ?? 0)) projectQuota = savedQuota;
} catch {
  recent.clear();
}

function normalize(email) {
  return email.trim().toLowerCase();
}

export function cooldownFor(email, now = Date.now()) {
  const personal = recent.get(normalize(email));
  return secondsRemaining(projectQuota, now) > secondsRemaining(personal, now) ? projectQuota : personal;
}

export function recordCooldown(email, result, now = Date.now()) {
  const address = normalize(email);
  const previous = recent.get(address);
  if (result.status === "limited" && result.scope === "quota") {
    if (!secondsRemaining(projectQuota, now)) {
      projectQuota = {
        deadline: now + result.retryAfterSeconds * 1000,
        scope: "quota",
        estimated: result.estimated,
      };
      try {
        sessionStorage.setItem(quotaKey, JSON.stringify(projectQuota));
      } catch {
        // The current page still has the retry deadline.
      }
    }
    return projectQuota;
  }
  const priorStage = previous?.sentAt && now - previous.sentAt < 3_600_000 ? previous.stage : 0;
  const sent = result.status === "pending";
  const stage = sent ? Math.min(priorStage + 1, intervals.length) : priorStage;
  const seconds = sent ? intervals[stage - 1] : result.retryAfterSeconds;
  const state = {
    stage,
    sentAt: sent ? now : previous?.sentAt || 0,
    deadline: now + seconds * 1000,
    scope: sent ? "email" : result.scope,
    estimated: !sent && result.estimated,
  };
  recent.delete(address);
  recent.set(address, state);

  try {
    sessionStorage.setItem(storageKey, JSON.stringify([...recent]));
  } catch {
    // The current page can still show the countdown when storage is unavailable.
  }
  return state;
}

export function secondsRemaining(state, now = Date.now()) {
  return Math.max(0, Math.ceil(((state?.deadline || 0) - now) / 1000));
}

export function formatRetryWait(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const remainder = seconds % 60;
  return [hours && `${hours}h`, minutes && `${minutes}m`, remainder && `${remainder}s`]
    .filter(Boolean).join(" ");
}

export function cooldownMessage(state) {
  if (state?.scope === "quota") {
    return "The portal’s email service has reached its sending limit. The wait below tells you when to try again.";
  }
  if (state?.scope === "shared") {
    return "The signup service is limiting requests. People on the same network may share this limit.";
  }
  return "Wait before requesting another verification email for this address.";
}
