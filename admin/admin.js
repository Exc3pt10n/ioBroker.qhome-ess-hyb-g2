"use strict";

function load(settings, onChange) {
  if (!settings) return;

  $(".value").each(function () {
    const $el = $(this);
    const id = $el.attr("id");
    if (!id || settings[id] === undefined) return;

    if ($el.attr("type") === "checkbox") {
      $el.prop("checked", settings[id]).on("change", () => onChange());
    } else {
      $el
        .val(settings[id])
        .on("change", () => onChange())
        .on("keyup", () => onChange());
    }
  });

  onChange(false);

  // Materialize: Labels korrekt aktualisieren
  if (window.M && M.updateTextFields) {
    M.updateTextFields();
  }
}

function save(callback) {
  const obj = {};

  $(".value").each(function () {
    const $el = $(this);
    const id = $el.attr("id");
    if (!id) return;

    if ($el.attr("type") === "checkbox") {
      obj[id] = $el.prop("checked");
    } else {
      obj[id] = $el.val();
    }
  });

  callback(obj);
}
