// ===========================================================
// CrediSense — app logic
//
// If the backend is deployed separately from this page, set
// API_BASE to its full URL, e.g. "https://your-api.onrender.com".
// Leave it empty to call the same origin the page is served from
// (the default when FastAPI serves this static folder itself).
// ===========================================================
const API_BASE = "";

document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) lucide.createIcons();
  document.getElementById("year").textContent = new Date().getFullYear();

  initTheme();
  initMobileNav();
  initForm();
});

// -----------------------------------------------------------
// Theme: respects a saved preference, falls back to system
// preference on first visit, persists on every change.
// -----------------------------------------------------------
function initTheme() {
  const root = document.documentElement;
  const toggle = document.getElementById("theme-toggle");

  const saved = localStorage.getItem("credisense-theme");
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const initial = saved || (systemPrefersDark ? "dark" : "light");

  applyTheme(initial);

  toggle.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem("credisense-theme", next);
  });

  function applyTheme(theme) {
    if (theme === "dark") {
      root.setAttribute("data-theme", "dark");
      toggle.setAttribute("aria-label", "Switch to light mode");
    } else {
      root.removeAttribute("data-theme");
      toggle.setAttribute("aria-label", "Switch to dark mode");
    }
  }
}

// -----------------------------------------------------------
// Mobile nav
// -----------------------------------------------------------
function initMobileNav() {
  const toggle = document.getElementById("nav-toggle");
  const nav = document.getElementById("main-nav");

  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    });
  });
}

// -----------------------------------------------------------
// Toasts
// -----------------------------------------------------------
function showToast(message, type = "error") {
  const stack = document.getElementById("toast-stack");
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  const icon = type === "success" ? "check-circle-2" : "alert-circle";
  toast.innerHTML = `<i data-lucide="${icon}" class="icon"></i><span>${message}</span>`;
  stack.appendChild(toast);
  if (window.lucide) lucide.createIcons();

  setTimeout(() => {
    toast.classList.add("is-leaving");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  }, 4000);
}

// -----------------------------------------------------------
// Form: validation + submission
// -----------------------------------------------------------
function initForm() {
  const form = document.getElementById("risk-form");
  const submitBtn = document.getElementById("submit-btn");
  const resetBtn = document.getElementById("reset-btn");
  const analyzeAnotherBtn = document.getElementById("analyze-another-btn");

  const loadingState = document.getElementById("loading-state");
  const resultState = document.getElementById("result-state");

  const FIELD_NAMES = [
    "person_age",
    "person_income",
    "person_home_ownership",
    "person_emp_length",
    "loan_intent",
    "loan_grade",
    "loan_amnt",
    "loan_int_rate",
    "loan_percent_income",
    "cb_person_default_on_file",
    "cb_person_cred_hist_length",
  ];

  function clearFieldError(name) {
    const wrapper = form.querySelector(`[name="${name}"]`).closest(".field");
    wrapper.classList.remove("has-error");
  }

  function setFieldError(name, message) {
    const input = form.querySelector(`[name="${name}"]`);
    const wrapper = input.closest(".field");
    const errorEl = wrapper.querySelector(".field__error");
    errorEl.textContent = message;
    wrapper.classList.add("has-error");
  }

  function messageFor(input) {
    const v = input.validity;
    if (v.valueMissing) return "This field is required.";
    if (v.rangeUnderflow) return `Must be at least ${input.min}.`;
    if (v.rangeOverflow) return `Must be at most ${input.max}.`;
    if (v.stepMismatch || v.badInput || v.typeMismatch) return "Enter a valid value.";
    return "Enter a valid value.";
  }

  function validateForm() {
    let firstInvalid = null;
    let isValid = true;

    FIELD_NAMES.forEach((name) => {
      const input = form.querySelector(`[name="${name}"]`);
      clearFieldError(name);
      if (!input.checkValidity()) {
        isValid = false;
        setFieldError(name, messageFor(input));
        if (!firstInvalid) firstInvalid = input;
      }
    });

    if (firstInvalid) firstInvalid.focus();
    return isValid;
  }

  // clear a field's error as soon as the person fixes it
  FIELD_NAMES.forEach((name) => {
    const input = form.querySelector(`[name="${name}"]`);
    input.addEventListener("input", () => clearFieldError(name));
    input.addEventListener("change", () => clearFieldError(name));
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!validateForm()) {
      showToast("Check the highlighted fields and try again.");
      return;
    }

    const formData = new FormData(form);
    const payload = {
      person_age: Number(formData.get("person_age")),
      person_income: Number(formData.get("person_income")),
      person_home_ownership: formData.get("person_home_ownership"),
      person_emp_length: Number(formData.get("person_emp_length")),
      loan_intent: formData.get("loan_intent"),
      loan_grade: formData.get("loan_grade"),
      loan_amnt: Number(formData.get("loan_amnt")),
      loan_int_rate: Number(formData.get("loan_int_rate")),
      loan_percent_income: Number(formData.get("loan_percent_income")),
      cb_person_default_on_file: formData.get("cb_person_default_on_file"),
      cb_person_cred_hist_length: Number(formData.get("cb_person_cred_hist_length")),
    };

    setLoading(true);
    resultState.hidden = true;
    loadingState.hidden = false;

    try {
      const response = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.status === 422) {
        const body = await response.json().catch(() => null);
        console.error("Validation error from API:", body);
        throw new Error("The server rejected one of the values entered. Double-check the form and try again.");
      }

      if (response.status >= 500) {
        throw new Error("Something went wrong on the server. Please try again in a moment.");
      }

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}.`);
      }

      const data = await response.json();
      renderResult(data);
      showToast("Assessment complete.", "success");
    } catch (err) {
      const message =
        err.message === "Failed to fetch"
          ? "Couldn't reach the model API. Check your connection and try again."
          : err.message;
      showToast(message, "error");
    } finally {
      setLoading(false);
      loadingState.hidden = true;
    }
  });

  resetBtn.addEventListener("click", () => {
    FIELD_NAMES.forEach(clearFieldError);
    resultState.hidden = true;
  });

  analyzeAnotherBtn.addEventListener("click", () => {
    resultState.hidden = true;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    form.querySelector(`[name="${FIELD_NAMES[0]}"]`).focus();
  });

  function setLoading(isLoading) {
    submitBtn.classList.toggle("is-loading", isLoading);
    submitBtn.disabled = isLoading;
  }

  function renderResult(data) {
    const probability = data.default_probability;
    const threshold = data.threshold;
    const isHighRisk = data.default_prediction === 1;

    const verdictTag = document.getElementById("verdict-tag");
    const verdictText = document.getElementById("verdict-text");
    const verdictIcon = document.getElementById("verdict-icon");
    const probFigure = document.getElementById("prob-figure");
    const riskFill = document.getElementById("risk-fill");
    const riskThreshold = document.getElementById("risk-threshold");
    const thresholdFigure = document.getElementById("threshold-figure");
    const predictionFigure = document.getElementById("prediction-figure");

    resultState.hidden = false;

    verdictTag.classList.toggle("is-high", isHighRisk);
    verdictText.textContent = isHighRisk ? "High risk" : "Low risk";
    verdictIcon.setAttribute("data-lucide", isHighRisk ? "alert-triangle" : "check-circle-2");
    if (window.lucide) lucide.createIcons();

    riskFill.style.transition = "none";
    riskFill.style.width = "0%";
    void riskFill.getBoundingClientRect();
    riskFill.style.transition = "";

    requestAnimationFrame(() => {
      riskFill.style.width = `${(probability * 100).toFixed(1)}%`;
      riskFill.style.background = isHighRisk ? "var(--red)" : "var(--green)";
      riskThreshold.style.left = `${(threshold * 100).toFixed(1)}%`;
      animateCountUp(probFigure, probability * 100, 900);
    });

    thresholdFigure.textContent = `${(threshold * 100).toFixed(1)}%`;
    predictionFigure.textContent = data.Result;

    resultState.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function animateCountUp(el, target, duration) {
  const start = performance.now();
  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = `${(target * eased).toFixed(1)}%`;
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
