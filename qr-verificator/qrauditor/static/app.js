const $ = (id) => document.getElementById(id);
const PAGE = 60;
let jobId = null, filter = "all", all = [], shown = PAGE, finished = false;

function setTheme(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem("theme", t); } catch {} }
try { const t = localStorage.getItem("theme"); if (t) setTheme(t); } catch {}
$("theme").onclick = () => {
  const root = document.documentElement.dataset.theme;
  const dark = root === "dark" || (!root && matchMedia("(prefers-color-scheme: dark)").matches);
  setTheme(dark ? "light" : "dark");
};

const showError = (msg) => { $("error").textContent = msg; $("error").hidden = !msg; };

async function upload(file) {
  showError("");
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".pdf")) return showError("Elige un archivo PDF.");
  all = []; shown = PAGE; finished = false; filter = "all"; render();
  $("drop-title").textContent = file.name;
  for (const id of ["verdict", "metrics", "results"]) $(id).hidden = false;
  $("verdict").className = "verdict";
  for (const id of ["dl-csv", "dl-xlsx"]) $(id).setAttribute("aria-disabled", "true");
  setVerdict("…", "Revisando tus QR…", "Subiendo el archivo");
  const body = new FormData(); body.append("file", file);
  const res = await fetch("/api/audit", { method: "POST", body });
  if (!res.ok) { $("verdict").hidden = true; return showError((await res.json()).detail || "No se pudo subir el archivo."); }
  jobId = (await res.json()).job_id;
  listen(jobId);
}

function listen(id) {
  const es = new EventSource(`/api/audit/${id}/events`);
  es.onmessage = (ev) => {
    const e = JSON.parse(ev.data);
    if (e.type === "progress") {
      setProgress(e.done, e.pages);
      setVerdict("…", "Revisando tus QR…", `${e.done} de ${e.pages} páginas`);
      all.push(...e.rows); renderMetrics(e.summary); render();
    } else if (e.type === "done") {
      es.close(); finished = true; renderMetrics(e.summary);
      all.sort((a, b) => (a.tone === b.tone ? a.page - b.page : a.tone === "bad" ? -1 : 1));
      finish(e.summary); render();
      $("dl-csv").href = `/api/audit/${id}/report.csv`; $("dl-xlsx").href = `/api/audit/${id}/report.xlsx`;
      for (const b of ["dl-csv", "dl-xlsx"]) $(b).removeAttribute("aria-disabled");
    } else if (e.type === "error") { es.close(); $("verdict").hidden = true; showError(e.message); }
  };
  es.onerror = () => es.close();
}

function setVerdict(icon, title, sub) { $("v-icon").textContent = icon; $("v-title").textContent = title; $("v-sub").textContent = sub; }
function setProgress(done, total) {
  const pct = Math.round((done / total) * 100);
  $("bar-fill").style.width = pct + "%"; $("bar").setAttribute("aria-valuenow", pct);
}

function finish(s) {
  const v = $("verdict"); v.classList.add("done");
  const secs = `Revisado en ${s.elapsed_s.toFixed(1)} s`;
  if (s.errors === 0 && s.total_qr > 0) {
    v.classList.add("good"); setVerdict("✓", "Todos los QR funcionan", `${s.ok} de ${s.total_qr} abren correctamente · ${secs}`);
  } else if (s.total_qr === 0) {
    v.classList.add("bad"); setVerdict("!", "No encontramos ningún QR", `Revisa que el PDF contenga códigos · ${secs}`);
  } else {
    v.classList.add("bad");
    setVerdict("!", `${s.errors} ${s.errors === 1 ? "QR necesita" : "QR necesitan"} revisión`, `${s.ok} de ${s.total_qr} funcionan · ${secs}`);
  }
}

function renderMetrics(s) {
  $("m-ok").textContent = s.ok; $("m-err").textContent = s.errors; $("m-total").textContent = s.total_qr;
}

const matches = (r) => filter === "all" || r.tone === filter;

function card(r) {
  const li = document.createElement("li"); li.className = `card ${r.tone}`;
  const thumb = document.createElement("div"); thumb.className = "thumb";
  const img = new Image(); img.loading = "lazy"; img.src = `/api/audit/${jobId}/page/${r.page}.png`;
  img.alt = `Vista de ${r.piece}`; thumb.append(img);
  const body = document.createElement("div"); body.className = "card-body";
  const status = document.createElement("div"); status.className = "status";
  const icon = document.createElement("i"); icon.setAttribute("aria-hidden", "true"); icon.textContent = r.tone === "good" ? "✓" : "✕";
  status.append(icon, r.headline);
  const piece = document.createElement("div"); piece.className = "piece"; piece.textContent = `${r.piece} · página ${r.page}`;
  const dest = document.createElement("div"); dest.className = "dest";
  dest.textContent = r.tone === "good" ? `Abre: ${r.destination}` : `Destino: ${r.destination}`;
  body.append(status, piece, dest);
  if (r.tone === "bad") { const a = document.createElement("p"); a.className = "advice"; a.textContent = r.advice; body.append(a); }
  const target = r.final_url || r.url;
  if (/^https?:\/\//i.test(target)) {
    const open = document.createElement("a"); open.className = "btn tonal open"; open.textContent = "Abrir enlace";
    open.href = target; open.target = "_blank"; open.rel = "noopener noreferrer"; body.append(open);
  }
  li.append(thumb, body); return li;
}

function render() {
  const count = (t) => all.filter((r) => t === "all" || r.tone === t).length;
  $("c-all").textContent = `(${count("all")})`; $("c-bad").textContent = `(${count("bad")})`; $("c-good").textContent = `(${count("good")})`;
  const list = all.filter(matches);
  const frag = document.createDocumentFragment();
  list.slice(0, shown).forEach((r) => frag.append(card(r)));
  $("grid").replaceChildren(frag);
  $("more").hidden = list.length <= shown;
  const empty = $("empty"); empty.hidden = list.length > 0 || !finished;
  empty.textContent = filter === "bad" ? "¡Sin problemas! Todos tus QR funcionan." : "Nada que mostrar con este filtro.";
}

document.querySelectorAll(".chip").forEach((c) => c.onclick = () => {
  filter = c.dataset.f; shown = PAGE;
  document.querySelectorAll(".chip").forEach((x) => x.setAttribute("aria-pressed", String(x === c)));
  render();
});
$("more").onclick = () => { shown += PAGE; render(); };
$("file").onchange = (e) => upload(e.target.files[0]);
const drop = $("drop");
["dragenter", "dragover"].forEach((n) => drop.addEventListener(n, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((n) => drop.addEventListener(n, () => drop.classList.remove("over")));
drop.addEventListener("drop", (e) => { e.preventDefault(); upload(e.dataTransfer.files[0]); });
