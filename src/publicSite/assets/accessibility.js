/**
 * CEDA Innovation Portal - Accessibility preferences
 * Handles: dark/light theme toggle + 5-step font scaling + TalkBack speech read aloud + Gemini AI Deep Thinking + Voice Control
 * Placement: Desktop header (public + all signed-in workspaces + auth) and mobile menu
 * Storage: localStorage keys ceda.theme, ceda.fontsize, ceda.talkback, ceda.voice
 */

(function () {
  "use strict";

  // Storage keys
  const THEME_KEY = "ceda.theme";
  const FONTSIZE_KEY = "ceda.fontsize";
  const TALKBACK_KEY = "ceda.talkback";
  const VOICE_KEY = "ceda.voice";

  // State read from storage
  function readTheme() {
    try { return localStorage.getItem(THEME_KEY) || "light"; } catch { return "light"; }
  }
  function readFontSize() {
    try { return localStorage.getItem(FONTSIZE_KEY) || "default"; } catch { return "default"; }
  }
  function readTalkback() {
    try { return localStorage.getItem(TALKBACK_KEY) === "true"; } catch { return false; }
  }
  function readVoiceEnabled() {
    try { return localStorage.getItem(VOICE_KEY) === "true"; } catch { return false; }
  }

  // Apply theme to html element
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
  }

  // Apply font size to html element
  function applyFontSize(size) {
    if (size === "default") {
      delete document.documentElement.dataset.fontsize;
    } else {
      document.documentElement.dataset.fontsize = size;
    }
    try { localStorage.setItem(FONTSIZE_KEY, size); } catch {}
  }

  // Apply TalkBack state
  function applyTalkback(enabled) {
    if (enabled) {
      document.documentElement.dataset.talkback = "true";
      try { localStorage.setItem(TALKBACK_KEY, "true"); } catch {}
      speak("TalkBack enabled. Click or focus any card or section to read it aloud.");
    } else {
      delete document.documentElement.dataset.talkback;
      try { localStorage.setItem(TALKBACK_KEY, "false"); } catch {}
      stopSpeaking();
      announce("TalkBack disabled");
    }
  }

  // Announce changes to screen readers via aria-live region
  function announce(msg) {
    const el = document.getElementById("a11y-announce");
    if (!el) return;
    el.textContent = "";
    requestAnimationFrame(() => requestAnimationFrame(() => { el.textContent = msg; }));
  }

  // Web Speech Synthesis (TalkBack read aloud)
  function speak(text) {
    if (!("speechSynthesis" in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      const clean = String(text).replace(/\s+/g, " ").trim();
      if (!clean) return;
      const utt = new SpeechSynthesisUtterance(clean);
      utt.rate = 1.0;
      utt.pitch = 1.0;
      const voices = window.speechSynthesis.getVoices();
      const engVoice = voices.find(v => v.lang.startsWith("en-") || v.lang === "en");
      if (engVoice) utt.voice = engVoice;
      window.speechSynthesis.speak(utt);
    } catch {}
  }

  function stopSpeaking() {
    if (!("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      document.querySelectorAll(".a11y-speaking").forEach(el => el.classList.remove("a11y-speaking"));
    } catch {}
  }

  function getPageContextText() {
    const h1 = document.querySelector("h1");
    const lead = document.querySelector(".lead, .access-intro, .admin-modal-intro");
    const activeSection = document.querySelector("main section:not([hidden]), .admin-content > div:not([hidden]), .access-content");
    const parts = [];
    if (document.title) parts.push(`Page: ${document.title}`);
    if (h1 && h1.textContent) parts.push(`Heading: ${h1.textContent.trim()}`);
    if (lead && lead.textContent) parts.push(`Summary: ${lead.textContent.trim()}`);
    if (activeSection) {
      const summaryText = Array.from(activeSection.querySelectorAll("h2, h3, p"))
        .filter(el => !el.hidden && el.offsetParent !== null)
        .slice(0, 6)
        .map(el => el.textContent.trim())
        .filter(Boolean)
        .join(". ");
      if (summaryText) parts.push(summaryText);
    }
    return parts.join(". ");
  }

  function readCurrentPage() {
    if (!("speechSynthesis" in window)) {
      announce("Speech synthesis is not supported in this browser.");
      return;
    }
    if (window.speechSynthesis.speaking) {
      stopSpeaking();
      announce("Reading stopped.");
      return;
    }
    const fullText = getPageContextText();
    if (fullText) {
      speak(fullText);
    } else {
      speak(document.title);
    }
  }

  // ==========================================
  // Gemini AI Smart Thinking & Deep Assistance
  // ==========================================
  async function askGeminiAPI({ question = "", context = "", mode = "qa" }) {
    try {
      const res = await fetch("/api/gemini-ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, context, mode }),
        signal: AbortSignal.timeout(9000)
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.answer) return data.answer;
      }
    } catch {}
    return "CEDA Botswana supports citizen innovators with grant funding, technical backing, and commercial scale-up across eligible sectors like agriculture, technology, and manufacturing.";
  }

  async function summarizePageWithGemini() {
    stopSpeaking();
    updateVoiceStatus("Gemini AI is analyzing and summarizing this page...", true);
    announce("Gemini AI is analyzing this page.");
    speak("Analyzing page with Gemini AI.");

    const pageContext = getPageContextText();
    const summary = await askGeminiAPI({ context: pageContext, mode: "summary" });

    updateVoiceStatus(`AI Summary: "${summary}"`, true);
    announce(summary);
    speak(summary);
  }

  async function handleVoiceAIQuery(question) {
    stopSpeaking();
    const cleanQ = question.replace(/^(?:ask|tell me|explain)\s+(?:gemini|optimus|ai)?\s*/i, "").trim();
    updateVoiceStatus(`Asking Gemini AI: "${cleanQ}"...`, true);
    announce("Asking Gemini AI.");
    speak("Thinking.");

    const pageContext = getPageContextText();
    const answer = await askGeminiAPI({ question: cleanQ, context: pageContext, mode: "qa" });

    updateVoiceStatus(`Gemini: "${answer}"`, true);
    announce(answer);
    speak(answer);
  }

  // ==========================================
  // Phase 3: Universal Voice Control Engine
  // ==========================================
  let voiceRecognition = null;
  let voiceActive = false;
  let voiceStatusText = "Voice control inactive. Click to start hands-free navigation.";
  let numberedElements = [];

  function updateVoiceStatus(text, isListening = false) {
    voiceStatusText = text;
    document.querySelectorAll("[data-a11y-voice-status]").forEach(el => {
      el.textContent = text;
      if (isListening) {
        el.setAttribute("data-listening", "true");
      } else {
        el.removeAttribute("data-listening");
      }
    });
  }

  function isSpeechRecognitionSupported() {
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function initVoiceRecognition() {
    if (!isSpeechRecognitionSupported()) return null;
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognizer = new SpeechRec();
    recognizer.continuous = true;
    recognizer.interimResults = false;
    recognizer.lang = "en-US";

    recognizer.onstart = function () {
      voiceActive = true;
      syncAllPressed();
      updateVoiceStatus("Listening... (Say 'help', 'click [item]', or ask a question)", true);
      announce("Voice control active. Listening for commands.");
    };

    recognizer.onresult = function (event) {
      const lastIndex = event.results.length - 1;
      const transcript = event.results[lastIndex][0].transcript.trim();
      if (transcript) {
        updateVoiceStatus(`Heard: "${transcript}"`, true);
        handleVoiceCommand(transcript);
      }
    };

    recognizer.onerror = function (event) {
      if (event.error === "no-speech") {
        updateVoiceStatus("Listening... (Say a command)", true);
        return;
      }
      if (event.error === "not-allowed") {
        voiceActive = false;
        try { localStorage.setItem(VOICE_KEY, "false"); } catch {}
        syncAllPressed();
        updateVoiceStatus("Microphone access denied. Please allow microphone in browser.");
        announce("Microphone access denied.");
        return;
      }
      updateVoiceStatus(`Voice notice: ${event.error}`, false);
    };

    recognizer.onend = function () {
      if (voiceActive) {
        try {
          recognizer.start();
        } catch {
          voiceActive = false;
          syncAllPressed();
          updateVoiceStatus("Voice control stopped. Click to restart.");
        }
      } else {
        syncAllPressed();
        updateVoiceStatus("Voice control inactive. Click to start.");
      }
    };

    return recognizer;
  }

  function toggleVoiceControl() {
    if (!isSpeechRecognitionSupported()) {
      const msg = "Voice control requires Google Chrome, Edge, or a browser with Web Speech API support.";
      updateVoiceStatus(msg, false);
      announce(msg);
      speak(msg);
      return;
    }

    if (voiceActive) {
      voiceActive = false;
      try { localStorage.setItem(VOICE_KEY, "false"); } catch {}
      if (voiceRecognition) {
        try { voiceRecognition.stop(); } catch {}
      }
      hideNumbers();
      syncAllPressed();
      updateVoiceStatus("Voice control stopped.");
      announce("Voice control stopped.");
      speak("Voice control stopped.");
    } else {
      if (!voiceRecognition) {
        voiceRecognition = initVoiceRecognition();
      }
      voiceActive = true;
      try { localStorage.setItem(VOICE_KEY, "true"); } catch {}
      try {
        voiceRecognition.start();
        syncAllPressed();
        speak("Voice control activated. You can speak commands or ask questions now.");
      } catch {
        // already started
      }
    }
  }

  // Number Overlay Mode ("Show Numbers" / "Hide Numbers")
  function showNumbers() {
    hideNumbers();
    const query = [
      "a[href]",
      "button",
      "summary",
      "input[type='button']",
      "input[type='submit']",
      "input[type='checkbox']",
      "input[type='radio']",
      "[role='button']",
      "[role='tab']",
      "[role='link']",
      ".portal-card",
      ".sector-card",
      ".admin-metric",
      ".tab-item",
      ".admin-nav-item"
    ].join(", ");

    const all = Array.from(document.querySelectorAll(query)).filter(el => {
      if (el.closest(".a11y-wrapper, .mobile-nav-a11y")) return false;
      if (el.disabled || el.hidden) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight;
    });

    if (all.length === 0) {
      updateVoiceStatus("No clickable elements visible on screen.", true);
      speak("No clickable elements visible on screen.");
      return;
    }

    numberedElements = all;
    all.forEach((el, idx) => {
      const badge = document.createElement("div");
      badge.className = "a11y-voice-badge";
      badge.textContent = String(idx + 1);
      const rect = el.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      const left = rect.left + window.scrollX;
      badge.style.top = `${Math.max(0, top - 6)}px`;
      badge.style.left = `${Math.max(0, left - 6)}px`;
      document.body.appendChild(badge);
    });

    const msg = `Showing ${all.length} numbered elements. Say a number like "1" to click it.`;
    updateVoiceStatus(msg, true);
    announce(msg);
    speak(`Showing ${all.length} numbered elements. Say a number to click.`);
  }

  function hideNumbers() {
    document.querySelectorAll(".a11y-voice-badge").forEach(el => el.remove());
    numberedElements = [];
  }

  function clickNumberedElement(num) {
    const idx = parseInt(num, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= numberedElements.length) {
      updateVoiceStatus(`Number ${num} is not on screen.`, true);
      speak(`Number ${num} is not on screen.`);
      return false;
    }
    const el = numberedElements[idx];
    hideNumbers();
    return triggerElementClick(el, `number ${num}`);
  }

  // Trigger click with visible highlight animation
  function triggerElementClick(el, label) {
    if (!el) return false;
    try {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("a11y-voice-target");
      setTimeout(() => el.classList.remove("a11y-voice-target"), 1200);
      if (typeof el.focus === "function") el.focus();
      el.click();
      const displayLabel = label || el.textContent.trim().slice(0, 30) || "element";
      const msg = `Clicked: ${displayLabel}`;
      updateVoiceStatus(msg, true);
      announce(msg);
      speak(`Clicked ${displayLabel}`);
      return true;
    } catch {
      return false;
    }
  }

  // Match and click any visible element by text
  function clickElementByVoice(targetPhrase) {
    const target = targetPhrase.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    if (!target) return false;

    const query = [
      "a[href]",
      "button",
      "summary",
      "input[type='button']",
      "input[type='submit']",
      "[role='button']",
      "[role='tab']",
      "[role='link']",
      ".portal-card",
      ".sector-card",
      ".admin-metric",
      ".tab-item",
      ".admin-nav-item",
      ".faq-list details summary",
      "label"
    ].join(", ");

    const items = Array.from(document.querySelectorAll(query)).filter(el => {
      if (el.closest(".a11y-wrapper, .mobile-nav-a11y")) return false;
      if (el.disabled || el.hidden) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

    let bestEl = null;
    let bestScore = 0;
    let bestText = "";

    items.forEach(el => {
      const text = (
        el.getAttribute("aria-label") ||
        el.getAttribute("title") ||
        el.getAttribute("value") ||
        el.innerText ||
        el.textContent ||
        ""
      ).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

      if (!text) return;

      let score = 0;
      if (text === target) {
        score = 100;
      } else if (text.startsWith(target)) {
        score = 80;
      } else if (text.includes(target)) {
        score = 60;
      } else {
        const targetWords = target.split(/\s+/).filter(w => w.length > 2);
        if (targetWords.length > 0) {
          const matchCount = targetWords.filter(w => text.includes(w)).length;
          if (matchCount === targetWords.length) {
            score = 45;
          } else if (matchCount > 0) {
            score = 20 * (matchCount / targetWords.length);
          }
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestEl = el;
        bestText = text;
      }
    });

    if (bestEl && bestScore >= 40) {
      return triggerElementClick(bestEl, bestText.slice(0, 30));
    }
    return false;
  }

  // Voice Form Typing Engine
  function handleVoiceTyping(clean) {
    const fieldMatch = clean.match(/^(?:type|enter|fill)\s+(.+?)\s+(?:in|into|for)\s+(.+)$/i);
    if (fieldMatch) {
      const val = fieldMatch[1].trim();
      const fieldName = fieldMatch[2].toLowerCase().trim();

      const inputs = Array.from(document.querySelectorAll("input:not([type='hidden']), textarea, select")).filter(el => {
        return !el.disabled && el.offsetParent !== null;
      });

      let targetInput = null;
      for (const inp of inputs) {
        const placeholder = (inp.getAttribute("placeholder") || "").toLowerCase();
        const name = (inp.getAttribute("name") || "").toLowerCase();
        const id = (inp.id || "").toLowerCase();
        const ariaLabel = (inp.getAttribute("aria-label") || "").toLowerCase();
        let labelText = "";
        if (inp.id) {
          const lbl = document.querySelector(`label[for='${inp.id}']`);
          if (lbl) labelText = lbl.textContent.toLowerCase();
        }
        if (
          placeholder.includes(fieldName) ||
          name.includes(fieldName) ||
          id.includes(fieldName) ||
          ariaLabel.includes(fieldName) ||
          labelText.includes(fieldName)
        ) {
          targetInput = inp;
          break;
        }
      }

      if (targetInput) {
        targetInput.focus();
        targetInput.value = val;
        targetInput.dispatchEvent(new Event("input", { bubbles: true }));
        targetInput.dispatchEvent(new Event("change", { bubbles: true }));
        const msg = `Entered "${val}" into ${fieldName}`;
        updateVoiceStatus(msg, true);
        announce(msg);
        speak(`Entered ${val}`);
        return true;
      }
    }

    const typeMatch = clean.match(/^(?:type|enter|write)\s+(.+)$/i);
    if (typeMatch) {
      const val = typeMatch[1].trim();
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
        active.value = active.value ? `${active.value} ${val}` : val;
        active.dispatchEvent(new Event("input", { bubbles: true }));
        active.dispatchEvent(new Event("change", { bubbles: true }));
        const msg = `Typed "${val}"`;
        updateVoiceStatus(msg, true);
        announce(msg);
        speak(msg);
        return true;
      }
    }

    if (clean === "clear" || clean === "clear input" || clean === "clear text" || clean === "erase") {
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
        active.value = "";
        active.dispatchEvent(new Event("input", { bubbles: true }));
        active.dispatchEvent(new Event("change", { bubbles: true }));
        updateVoiceStatus("Field cleared.", true);
        announce("Field cleared.");
        speak("Field cleared.");
        return true;
      }
    }

    return false;
  }

  // Universal Voice Command Processor
  function handleVoiceCommand(rawTranscript) {
    const raw = String(rawTranscript).trim();
    const clean = raw.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
    if (!clean) return;

    // 1. Number Selection ("3", "number 3", "click 3", "press 5")
    const numMatch = clean.match(/^(?:number|click|press|select|choose|tap)?\s*(\d+)$/i);
    if (numMatch && numberedElements.length > 0) {
      if (clickNumberedElement(numMatch[1])) return;
    }

    // 2. Show / Hide Numbers
    if (clean === "show numbers" || clean === "show labels" || clean === "numbers" || clean === "show tags") {
      showNumbers();
      return;
    }
    if (clean === "hide numbers" || clean === "hide labels" || clean === "remove numbers") {
      hideNumbers();
      updateVoiceStatus("Numbers hidden.", true);
      speak("Numbers hidden.");
      return;
    }

    // 3. Gemini AI Smart Thinking & Page Summary
    if (clean.includes("summarize page") || clean.includes("explain page") || clean.includes("summarize this page") || clean === "ai read" || clean === "ai summary") {
      summarizePageWithGemini();
      return;
    }

    // 4. Gemini AI Smart Q&A Queries
    const isQuestion = (
      clean.startsWith("ask ") ||
      clean.startsWith("explain ") ||
      clean.startsWith("what is ") ||
      clean.startsWith("what are ") ||
      clean.startsWith("how do i ") ||
      clean.startsWith("how can i ") ||
      clean.startsWith("can i ") ||
      clean.startsWith("who is ") ||
      clean.startsWith("tell me about ") ||
      raw.endsWith("?")
    );

    if (isQuestion) {
      handleVoiceAIQuery(raw);
      return;
    }

    // 5. Help & Commands
    if (clean.includes("help") || clean.includes("what can i say") || clean === "commands") {
      const helpMsg = "You can say: click [button name], show numbers, ask [question], summarize page with AI, type [text] into [field], scroll down or up, dark mode, light mode, or bigger text.";
      updateVoiceStatus("Available commands announced.", true);
      announce(helpMsg);
      speak(helpMsg);
      return;
    }

    // 6. Form typing & input entry
    if (handleVoiceTyping(clean)) return;

    // 7. Submit Form
    if (clean === "submit" || clean === "submit form" || clean === "press submit") {
      const submitBtn = document.querySelector("button[type='submit'], input[type='submit'], button.btn-primary, button.access-submit");
      if (submitBtn) {
        triggerElementClick(submitBtn, "submit form");
        return;
      }
    }

    // 8. Explicit Click / Press / Open / Tap
    const clickMatch = clean.match(/^(?:click|press|tap|open|select|choose)\s+(.+)$/i);
    if (clickMatch) {
      const targetPhrase = clickMatch[1].trim();
      if (clickElementByVoice(targetPhrase)) return;
    }

    // 9. Theme Controls
    if (clean.includes("dark mode") || clean.includes("dark theme") || clean.includes("night mode") || clean === "dark") {
      applyTheme("dark");
      syncAllPressed();
      const msg = "Dark mode enabled.";
      updateVoiceStatus(msg, true);
      announce(msg);
      speak(msg);
      return;
    }
    if (clean.includes("light mode") || clean.includes("light theme") || clean.includes("day mode") || clean === "light") {
      applyTheme("light");
      syncAllPressed();
      const msg = "Light mode enabled.";
      updateVoiceStatus(msg, true);
      announce(msg);
      speak(msg);
      return;
    }

    // 10. Text Size Scaling
    const order = ["sm", "default", "lg", "xl", "xxl"];
    const current = readFontSize();
    const currIdx = order.indexOf(current) >= 0 ? order.indexOf(current) : 1;

    if (clean.includes("bigger text") || clean.includes("larger text") || clean.includes("increase font") || clean.includes("increase text") || clean === "zoom in") {
      const nextIdx = Math.min(order.length - 1, currIdx + 1);
      const nextSize = order[nextIdx];
      applyFontSize(nextSize);
      syncAllPressed();
      const label = SIZE_STEPS.find(s => s.key === nextSize)?.title || "Larger text";
      updateVoiceStatus(`Text size enlarged: ${label}`, true);
      announce(label);
      speak(label);
      return;
    }
    if (clean.includes("smaller text") || clean.includes("decrease font") || clean.includes("decrease text") || clean === "zoom out") {
      const prevIdx = Math.max(0, currIdx - 1);
      const prevSize = order[prevIdx];
      applyFontSize(prevSize);
      syncAllPressed();
      const label = SIZE_STEPS.find(s => s.key === prevSize)?.title || "Smaller text";
      updateVoiceStatus(`Text size reduced: ${label}`, true);
      announce(label);
      speak(label);
      return;
    }
    if (clean.includes("default text") || clean.includes("normal text") || clean.includes("reset text") || clean.includes("standard text")) {
      applyFontSize("default");
      syncAllPressed();
      const msg = "Text size reset to default.";
      updateVoiceStatus(msg, true);
      announce(msg);
      speak(msg);
      return;
    }
    if (clean.includes("maximum text") || clean.includes("largest text") || clean.includes("extra large")) {
      applyFontSize("xxl");
      syncAllPressed();
      const msg = "Text size set to maximum.";
      updateVoiceStatus(msg, true);
      announce(msg);
      speak(msg);
      return;
    }

    // 11. TalkBack & Read Aloud Controls
    if (clean.includes("talkback on") || clean.includes("enable talkback") || clean.includes("turn on talkback")) {
      applyTalkback(true);
      syncAllPressed();
      updateVoiceStatus("TalkBack enabled.", true);
      return;
    }
    if (clean.includes("talkback off") || clean.includes("disable talkback") || clean.includes("turn off talkback")) {
      applyTalkback(false);
      syncAllPressed();
      updateVoiceStatus("TalkBack disabled.", true);
      return;
    }
    if (clean.includes("read page") || clean.includes("read aloud") || clean.includes("read screen") || clean.includes("read content")) {
      updateVoiceStatus("Reading page content aloud...", true);
      readCurrentPage();
      return;
    }
    if (clean.includes("stop reading") || clean.includes("stop speaking") || clean === "quiet" || clean === "silence" || clean === "stop") {
      stopSpeaking();
      updateVoiceStatus("Reading stopped.", true);
      announce("Reading stopped.");
      return;
    }

    // 12. Scrolling Controls
    if (clean.includes("scroll down") || clean.includes("page down") || clean === "down") {
      window.scrollBy({ top: Math.round(window.innerHeight * 0.75), behavior: "smooth" });
      updateVoiceStatus("Scrolled down.", true);
      return;
    }
    if (clean.includes("scroll up") || clean.includes("page up") || clean === "up") {
      window.scrollBy({ top: -Math.round(window.innerHeight * 0.75), behavior: "smooth" });
      updateVoiceStatus("Scrolled up.", true);
      return;
    }
    if (clean.includes("scroll to top") || clean.includes("top of page") || clean === "scroll top" || clean === "top") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      updateVoiceStatus("Scrolled to top.", true);
      return;
    }
    if (clean.includes("scroll to bottom") || clean.includes("bottom of page") || clean === "scroll bottom" || clean === "bottom") {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      updateVoiceStatus("Scrolled to bottom.", true);
      return;
    }

    // 13. Search Command
    if (clean.startsWith("search for ") || clean.startsWith("find ")) {
      const query = clean.replace(/^(search for|find)\s+/, "").trim();
      if (query) {
        const searchInput = document.querySelector('input[type="search"], input[name="search"], input[placeholder*="search" i], .updates-toolbar input, .filters input');
        if (searchInput) {
          searchInput.focus();
          searchInput.value = query;
          searchInput.dispatchEvent(new Event("input", { bubbles: true }));
          searchInput.dispatchEvent(new Event("change", { bubbles: true }));
          updateVoiceStatus(`Searching for "${query}"...`, true);
          speak(`Searching for ${query}`);
          const form = searchInput.closest("form");
          if (form) {
            form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
          }
          return;
        }
      }
    }

    // 14. Direct Page Navigation
    const navRoutes = [
      { trigger: "home", url: "/" },
      { trigger: "help", url: "/help/" },
      { trigger: "faq", url: "/help/" },
      { trigger: "eligibility", url: "/eligibility/" },
      { trigger: "how it works", url: "/how-it-works/" },
      { trigger: "sectors", url: "/sectors/" },
      { trigger: "contact", url: "/contact/" },
      { trigger: "sign in", url: "/signin/" },
      { trigger: "login", url: "/signin/" },
      { trigger: "sign up", url: "/register/" },
      { trigger: "register", url: "/register/" },
      { trigger: "apply", url: "/register/" },
      { trigger: "updates", url: "/updates/" },
      { trigger: "dashboard", url: "/account/" },
      { trigger: "account", url: "/account/" },
      { trigger: "workspace", url: "/account/" },
      { trigger: "proposals", url: "/account/" },
      { trigger: "admin", url: "/admin/" },
      { trigger: "assessor", url: "/assessor/" },
      { trigger: "committee", url: "/committee/" },
      { trigger: "support", url: "/support/" }
    ];

    for (const route of navRoutes) {
      if (clean === `go to ${route.trigger}` || clean === `open ${route.trigger}` || clean === route.trigger) {
        updateVoiceStatus(`Navigating to ${route.trigger}...`, true);
        speak(`Opening ${route.trigger}`);
        setTimeout(() => { window.location.href = route.url; }, 400);
        return;
      }
    }

    if (clean === "go back" || clean === "back") {
      updateVoiceStatus("Going back...", true);
      speak("Going back");
      setTimeout(() => { window.history.back(); }, 350);
      return;
    }

    if (clean === "refresh" || clean === "reload" || clean === "refresh page") {
      updateVoiceStatus("Refreshing page...", true);
      speak("Refreshing");
      setTimeout(() => { window.location.reload(); }, 350);
      return;
    }

    // 15. Accessibility Panel Controls
    if (clean.includes("close panel") || clean.includes("close menu") || clean === "close") {
      document.querySelectorAll(".a11y-wrapper .a11y-panel").forEach(p => p.setAttribute("aria-hidden", "true"));
      document.querySelectorAll(".a11y-wrapper .a11y-btn").forEach(b => b.setAttribute("aria-expanded", "false"));
      updateVoiceStatus("Panel closed.", true);
      return;
    }

    if (clean.includes("voice off") || clean.includes("stop voice") || clean.includes("disable voice") || clean.includes("stop listening")) {
      toggleVoiceControl();
      return;
    }

    // 16. Smart Fallback: Try clicking visible UI elements first
    if (clickElementByVoice(clean)) {
      return;
    }

    // 17. Deep Thinking Fallback: Route any unanswered phrase to Gemini AI
    handleVoiceAIQuery(raw);
  }

  // SVG icons (inline, no external request)
  const ICON = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    a11y: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="5" r="1.5"/><path d="M5 9l7 1 7-1M9 21l1-6 2 3 2-3 1 6"/></svg>',
    speaker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3z"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
  };

  const SIZE_STEPS = [
    { key: "sm", label: "A-", title: "Smaller text size" },
    { key: "default", label: "A", title: "Default text size" },
    { key: "lg", label: "A+", title: "Large text" },
    { key: "xl", label: "A++", title: "Extra-large text" },
    { key: "xxl", label: "A+++", title: "Maximum text" },
  ];

  // Build the panel HTML
  function buildPanel(idSuffix) {
    const panelId = `a11y-panel-${idSuffix}`;
    const theme = readTheme();
    const size = readFontSize();
    const talkback = readTalkback();

    const themeButtons = ["light", "dark"].map(t => `
      <button type="button"
        class="a11y-theme-btn"
        data-a11y-theme="${t}"
        aria-pressed="${theme === t}"
        title="${t === "light" ? "Light mode" : "Dark mode"}">
        ${t === "light" ? ICON.sun : ICON.moon}
        ${t === "light" ? "Light" : "Dark"}
      </button>`).join("");

    const sizeButtons = SIZE_STEPS.map(s => `
      <button type="button"
        class="a11y-size-btn"
        data-a11y-size="${s.key}"
        aria-pressed="${size === s.key}"
        title="${s.title}"
        style="font-size:${s.key === "sm" ? ".72rem" : s.key === "default" ? ".8rem" : s.key === "lg" ? ".9rem" : s.key === "xl" ? "1rem" : "1.08rem"}">
        ${s.label}
      </button>`).join("");

    return `
      <div class="a11y-wrapper" id="a11y-wrapper-${idSuffix}">
        <button type="button"
          class="a11y-btn"
          aria-expanded="false"
          aria-controls="${panelId}"
          aria-label="Accessibility preferences"
          title="Accessibility preferences">
          ${ICON.a11y}
        </button>
        <div id="${panelId}" class="a11y-panel" aria-hidden="true" role="dialog" aria-label="Accessibility preferences">
          <p class="a11y-panel-title">Accessibility</p>
          <p class="a11y-section-label">Theme</p>
          <div class="a11y-theme-row">${themeButtons}</div>
          <p class="a11y-section-label">Text size</p>
          <div class="a11y-size-row">${sizeButtons}</div>
          <p class="a11y-section-label">TalkBack (Speech & Gemini AI)</p>
          <div class="a11y-talkback-row">
            <button type="button"
              class="a11y-talkback-toggle"
              data-a11y-talkback
              aria-pressed="${talkback}"
              title="Turn TalkBack speech assistance on or off">
              ${ICON.speaker} <span>TalkBack</span>
            </button>
            <button type="button"
              class="a11y-read-btn"
              data-a11y-read-page
              title="Read current page or active section aloud">
              ${ICON.play} <span>Read</span>
            </button>
            <button type="button"
              class="a11y-ai-btn"
              data-a11y-ai-summary
              title="Ask Gemini AI to analyze and summarize this page aloud">
              ${ICON.sparkle} <span>AI Read</span>
            </button>
          </div>
          <p class="a11y-section-label">Voice Control (Hands-free)</p>
          <div class="a11y-voice-row">
            <button type="button"
              class="a11y-voice-toggle"
              data-a11y-voice
              aria-pressed="${voiceActive}"
              title="Enable voice control for hands-free navigation">
              ${ICON.mic} <span>Voice Control</span>
            </button>
          </div>
          <div class="a11y-voice-status" data-a11y-voice-status aria-live="polite">
            ${voiceStatusText}
          </div>
        </div>
      </div>`;
  }

  // Build the mobile-nav inline controls
  function buildMobileControls() {
    const theme = readTheme();
    const size = readFontSize();
    const talkback = readTalkback();

    const themeButtons = ["light", "dark"].map(t => `
      <button type="button"
        class="a11y-theme-btn"
        data-a11y-theme="${t}"
        aria-pressed="${theme === t}"
        title="${t === "light" ? "Light mode" : "Dark mode"}">
        ${t === "light" ? ICON.sun : ICON.moon}
        ${t === "light" ? "Light" : "Dark"}
      </button>`).join("");

    const sizeButtons = SIZE_STEPS.map(s => `
      <button type="button"
        class="a11y-size-btn"
        data-a11y-size="${s.key}"
        aria-pressed="${size === s.key}"
        title="${s.title}"
        style="font-size:${s.key === "sm" ? ".68rem" : s.key === "default" ? ".75rem" : s.key === "lg" ? ".82rem" : s.key === "xl" ? ".9rem" : ".96rem"}">
        ${s.label}
      </button>`).join("");

    return `
      <div class="mobile-nav-a11y">
        <span class="mobile-a11y-label">${ICON.a11y} Accessibility</span>
        <div class="mobile-a11y-theme-row">${themeButtons}</div>
        <div class="mobile-a11y-size-row">${sizeButtons}</div>
        <div class="mobile-a11y-talkback-row">
          <button type="button"
            class="a11y-talkback-toggle"
            data-a11y-talkback
            aria-pressed="${talkback}"
            title="Turn TalkBack speech assistance on or off">
            ${ICON.speaker} <span>TalkBack</span>
          </button>
          <button type="button"
            class="a11y-read-btn"
            data-a11y-read-page
            title="Read current page aloud">
            ${ICON.play} <span>Read</span>
          </button>
          <button type="button"
            class="a11y-ai-btn"
            data-a11y-ai-summary
            title="Ask Gemini AI to summarize this page aloud">
            ${ICON.sparkle} <span>AI Read</span>
          </button>
        </div>
        <div class="mobile-a11y-voice-row">
          <button type="button"
            class="a11y-voice-toggle"
            data-a11y-voice
            aria-pressed="${voiceActive}"
            title="Enable voice control">
            ${ICON.mic} <span>Voice Control</span>
          </button>
        </div>
        <div class="a11y-voice-status" data-a11y-voice-status aria-live="polite">
          ${voiceStatusText}
        </div>
      </div>`;
  }

  // Sync all pressed states across all instances
  function syncAllPressed() {
    const theme = readTheme();
    const size = readFontSize();
    const talkback = readTalkback();
    document.querySelectorAll("[data-a11y-theme]").forEach(btn => {
      btn.setAttribute("aria-pressed", String(btn.dataset.a11yTheme === theme));
    });
    document.querySelectorAll("[data-a11y-size]").forEach(btn => {
      btn.setAttribute("aria-pressed", String(btn.dataset.a11ySize === size));
    });
    document.querySelectorAll("[data-a11y-talkback]").forEach(btn => {
      btn.setAttribute("aria-pressed", String(talkback));
    });
    document.querySelectorAll("[data-a11y-voice]").forEach(btn => {
      btn.setAttribute("aria-pressed", String(voiceActive));
    });
  }

  // Wire up event delegation on a container
  function wireContainer(container) {
    container.addEventListener("click", (e) => {
      const themeBtn = e.target.closest("[data-a11y-theme]");
      const sizeBtn = e.target.closest("[data-a11y-size]");
      const talkbackBtn = e.target.closest("[data-a11y-talkback]");
      const readBtn = e.target.closest("[data-a11y-read-page]");
      const aiBtn = e.target.closest("[data-a11y-ai-summary]");
      const voiceBtn = e.target.closest("[data-a11y-voice]");

      if (themeBtn) {
        const t = themeBtn.dataset.a11yTheme;
        applyTheme(t);
        syncAllPressed();
        announce(`${t === "dark" ? "Dark" : "Light"} mode on`);
      }
      if (sizeBtn) {
        const s = sizeBtn.dataset.a11ySize;
        applyFontSize(s);
        syncAllPressed();
        const label = SIZE_STEPS.find(x => x.key === s)?.title || "Text size changed";
        announce(label);
      }
      if (talkbackBtn) {
        const next = !readTalkback();
        applyTalkback(next);
        syncAllPressed();
      }
      if (readBtn) {
        readCurrentPage();
      }
      if (aiBtn) {
        summarizePageWithGemini();
      }
      if (voiceBtn) {
        toggleVoiceControl();
      }
    });
  }

  // Panel open/close for desktop wrapper
  function wirePanel(wrapperEl) {
    const btn = wrapperEl.querySelector(".a11y-btn");
    const panel = wrapperEl.querySelector(".a11y-panel");
    if (!btn || !panel) return;

    function open() {
      btn.setAttribute("aria-expanded", "true");
      panel.setAttribute("aria-hidden", "false");
    }
    function close() {
      btn.setAttribute("aria-expanded", "false");
      panel.setAttribute("aria-hidden", "true");
      hideNumbers();
    }

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = btn.getAttribute("aria-expanded") === "true";
      if (isOpen) {
        close();
      } else {
        open();
      }
    });

    document.addEventListener("click", (e) => {
      if (!wrapperEl.contains(e.target)) close();
    });
    wrapperEl.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        close();
        btn.focus();
        stopSpeaking();
        hideNumbers();
      }
    });
  }

  // Mount a panel into a target element
  function mountPanel(target, idSuffix, prepend = false) {
    if (!target || target.querySelector(".a11y-wrapper")) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = buildPanel(idSuffix);
    const wrapper = tmp.firstElementChild;
    if (prepend && target.firstChild) {
      target.insertBefore(wrapper, target.firstChild);
    } else {
      target.appendChild(wrapper);
    }
    wirePanel(wrapper);
    wireContainer(wrapper);
  }

  // Inject into all active headers (Public, Workspaces, Auth)
  function injectAll() {
    const headerMount = document.getElementById("a11y-header-mount");
    if (headerMount) mountPanel(headerMount, "public");

    const accessMount = document.getElementById("a11y-access-mount");
    if (accessMount) mountPanel(accessMount, "access");

    const headerActions = document.querySelector(".header-actions");
    if (headerActions && !headerActions.querySelector(".a11y-wrapper")) {
      mountPanel(headerActions, "header-actions", true);
    }

    document.querySelectorAll(".admin-header").forEach((header, idx) => {
      if (header.querySelector(".a11y-wrapper")) return;
      const right = header.querySelector(".admin-header-right");
      if (right) {
        mountPanel(right, `ws-${idx}`, true);
      } else {
        mountPanel(header, `ws-hdr-${idx}`, false);
      }
    });

    document.querySelectorAll(".access-brand").forEach((brandEl, idx) => {
      if (brandEl.querySelector(".a11y-wrapper")) return;
      mountPanel(brandEl, `access-brand-${idx}`, false);
    });

    document.querySelectorAll(".mobile-nav").forEach((mobileNav) => {
      if (mobileNav.querySelector(".mobile-nav-a11y")) return;
      const nav = mobileNav.querySelector("nav");
      if (!nav) return;
      const tmp = document.createElement("div");
      tmp.innerHTML = buildMobileControls();
      nav.appendChild(tmp.firstElementChild);
      wireContainer(nav);
    });

    syncAllPressed();
  }

  // Hidden live region for screen-reader announcements
  function ensureAnnounceRegion() {
    if (document.getElementById("a11y-announce")) return;
    const el = document.createElement("div");
    el.id = "a11y-announce";
    el.className = "a11y-announce";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.setAttribute("aria-atomic", "true");
    document.body.appendChild(el);
  }

  // Global TalkBack click & focus reader
  function setupTalkbackListeners() {
    document.addEventListener("click", (e) => {
      if (!readTalkback()) return;
      if (e.target.closest(".a11y-wrapper, .mobile-nav-a11y")) return;
      const item = e.target.closest("button, a, label, h1, h2, h3, h4, p, .admin-metric, .admin-overview-panel, .portal-card, .sector-card, .admin-user-stat");
      if (!item) return;
      const textToRead = item.getAttribute("aria-label") || item.textContent || "";
      if (textToRead.trim()) {
        stopSpeaking();
        item.classList.add("a11y-speaking");
        speak(textToRead);
        setTimeout(() => item.classList.remove("a11y-speaking"), 4000);
      }
    });

    document.addEventListener("focusin", (e) => {
      if (!readTalkback()) return;
      if (e.target.closest(".a11y-wrapper, .mobile-nav-a11y")) return;
      const item = e.target.closest("button, a, input, select, textarea");
      if (!item) return;
      const label = item.getAttribute("aria-label") || item.getAttribute("placeholder") || item.textContent || "";
      const role = item.getAttribute("role") || item.tagName.toLowerCase();
      if (label.trim()) {
        speak(`${role}: ${label.trim()}`);
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        stopSpeaking();
        hideNumbers();
      }
    });
  }

  // Boot
  function boot() {
    applyTheme(readTheme());
    applyFontSize(readFontSize());
    if (readTalkback()) document.documentElement.dataset.talkback = "true";
    if (readVoiceEnabled() && isSpeechRecognitionSupported()) {
      updateVoiceStatus("Voice control ready. Click to activate microphone.");
    }

    ensureAnnounceRegion();
    injectAll();
    setupTalkbackListeners();

    if (typeof MutationObserver !== "undefined") {
      let timeoutId = null;
      const observer = new MutationObserver(() => {
        if (timeoutId) return;
        timeoutId = setTimeout(() => {
          timeoutId = null;
          injectAll();
        }, 100);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
