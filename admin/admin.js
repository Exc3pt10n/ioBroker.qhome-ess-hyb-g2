// admin/admin.js
"use strict";

function load(settings, onChange) {
  for (const key in settings) {
    if (!settings.hasOwnProperty(key)) continue;
    const el = document.getElementById(key);
    if (!el) continue;

    if (el.type === "checkbox") {
      el.checked = settings[key];
    } else {
      el.value = settings[key];
    }

    el.addEventListener("change", () => onChange());
  }

  onChange(false);
}

function save(callback) {
  const obj = {};
  const inputs = document.querySelectorAll("input, select");

  inputs.forEach((el) => {
    if (!el.id) return;
    if (el.type === "checkbox") {
      obj[el.id] = el.checked;
    } else {
      obj[el.id] = el.value;
    }
  });

  callback(obj);
}
