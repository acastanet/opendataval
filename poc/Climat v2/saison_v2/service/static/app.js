const form = document.querySelector("#coordinates-form");
const status = document.querySelector("#status");
const wheel = document.querySelector("#wheel");
const placeholder = document.querySelector("#placeholder");
const downloads = document.querySelector(".downloads");
const downloadSvg = document.querySelector("#download-svg");
const downloadPng = document.querySelector("#download-png");
const submit = form.querySelector("button");
const coordinates = document.querySelector("#coordinates");
const wheelTitle = document.querySelector("#wheel-title");
let previewUrl = null;

coordinates.addEventListener("input", () => coordinates.setCustomValidity(""));

function endpoint(extension, latitude, longitude, title = "", download = false) {
  const parameters = new URLSearchParams({ lat: latitude, lon: longitude });
  if (title) parameters.set("title", title);
  if (download) parameters.set("download", "true");
  return `/api/v1/wheel.${extension}?${parameters}`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const match = coordinates.value.trim().match(
    /^(-?(?:\d+(?:\.\d+)?|\.\d+))\s*[,;]\s*(-?(?:\d+(?:\.\d+)?|\.\d+))$/
  );
  if (!match) {
    coordinates.setCustomValidity("Utilisez le format : latitude, longitude.");
    form.reportValidity();
    return;
  }
  coordinates.setCustomValidity("");
  const [, latitude, longitude] = match;
  const title = wheelTitle.value.trim();
  submit.disabled = true;
  downloads.hidden = true;
  status.classList.remove("error");
  status.textContent = "Collecte et calcul en cours… La première demande pour cette maille peut prendre quelques minutes.";

  try {
    const response = await fetch(endpoint("svg", latitude, longitude, title));
    if (!response.ok) {
      let message = `Erreur ${response.status}`;
      try {
        const payload = await response.json();
        if (typeof payload.detail === "string") {
          message = payload.detail;
        } else if (payload.detail?.message) {
          message = `${payload.detail.message} (${payload.detail.code})`;
        }
      } catch (_) {
        // La réponse n'est pas nécessairement en JSON.
      }
      throw new Error(message);
    }
    const blob = await response.blob();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(blob);
    wheel.src = previewUrl;
    wheel.hidden = false;
    placeholder.hidden = true;
    downloadSvg.href = endpoint("svg", latitude, longitude, title, true);
    downloadPng.href = endpoint("png", latitude, longitude, title, true);
    downloads.hidden = false;
    status.textContent = "Cadran prêt. Les prochaines demandes pour ce point utiliseront le cache.";
  } catch (error) {
    status.classList.add("error");
    status.textContent = error.message || "Impossible de générer le cadran.";
  } finally {
    submit.disabled = false;
  }
});
