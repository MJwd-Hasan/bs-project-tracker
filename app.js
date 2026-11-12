import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const form = document.querySelector("#project-form");
const submitButton = document.querySelector("#submit-button");
const formStatus = document.querySelector("#form-status");
const editNotice = document.querySelector("#edit-notice");
const editToken = new URLSearchParams(location.hash.slice(1)).get("edit");
const projectApi = "/.netlify/functions/project";
const loadStatus = document.querySelector("#load-status");
const entriesContainer = document.querySelector("#project-entries");
const entryCount = document.querySelector("#entry-count");
let latestProjects = [];

try {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const projectsRef = collection(db, "projects");

  onSnapshot(query(projectsRef, orderBy("createdAt", "desc")), snapshot => {
    latestProjects = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    entryCount.textContent = `${latestProjects.length} ${latestProjects.length === 1 ? "entry" : "entries"}`;
    loadStatus.textContent = latestProjects.length ? "" : "No projects have been added yet.";
    renderProjects(latestProjects);
  }, error => {
    console.error("Firestore listener error:", error);
    loadStatus.textContent = `Could not load projects (${error.code || "connection error"}). Check Firebase and Firestore rules.`;
    entryCount.textContent = "Unavailable";
  });

  if (editToken) {
    editNotice.hidden = false;
    submitButton.disabled = true;
    submitButton.textContent = "Load project…";
    fetch(projectApi, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "load", token: editToken }) })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "This edit link is invalid or expired."); return data.project; })
      .then(project => {
        for (const key of ["name", "projectTitle", "subtitle", "datasets"]) form.elements.namedItem(key).value = project[key] || "";
        document.querySelector("#form-heading").textContent = "Edit your project";
        submitButton.textContent = "Save changes";
        submitButton.disabled = false;
        setStatus("Your project is loaded. Make your changes and save.", "success");
      })
      .catch(error => { setStatus(error.message, "error"); submitButton.disabled = true; });
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const project = Object.fromEntries(["name", "projectTitle", "subtitle", "datasets"].map(key => [key, clean(data.get(key))]));
    submitButton.disabled = true;
    submitButton.textContent = editToken ? "Saving…" : "Submitting…";
    setStatus("", "");
    try {
      const response = await fetch(projectApi, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editToken ? { action: "update", token: editToken, project } : { action: "create", project })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The request failed.");
      if (editToken) {
        setStatus("Your project has been updated successfully.", "success");
        submitButton.textContent = "Saved";
      } else {
        form.reset();
        const editUrl = new URL(location.href);
        editUrl.search = "";\n        editUrl.hash = "edit=" + encodeURIComponent(result.editToken);
        const link = document.createElement("a");
        link.href = editUrl.href; link.textContent = "Open your private edit link";
        link.className = "edit-link";
        const copy = document.createElement("button");
        copy.type = "button"; copy.className = "secondary-button"; copy.textContent = "Copy edit link";
        copy.addEventListener("click", async () => {
          try { await navigator.clipboard.writeText(editUrl.href); copy.textContent = "Copied"; }
          catch { setStatus("Copy was blocked. Use the private edit link above and bookmark it.", "error"); }
        });
        formStatus.replaceChildren(document.createTextNode(`Project submitted. Your Project ID is ${result.projectNumber}. Keep this private edit link to update your entry later: `), link, document.createTextNode(" "), copy);
        formStatus.className = "status success";
        document.querySelector("#project-list").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch (error) {
      console.error("Project submission/update error:", error);
      setStatus(error.message || "Could not save your project.", "error");
      submitButton.disabled = false;
      submitButton.textContent = editToken ? "Save changes" : "Submit project";
    }
  });
} catch (error) {
  console.error("Firebase initialization error:", error);
  loadStatus.textContent = `Firebase could not initialize (${error.code || "configuration error"}). Check firebase-config.js.`;
  entryCount.textContent = "Unavailable";
}

function clean(value) { return String(value ?? "").trim(); }
function setStatus(message, type) {
  formStatus.textContent = message;
  formStatus.className = "status" + (type ? " " + type : "");
}
function tokenize(value) {
  return clean(value).toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/).filter(word => word.length > 1 && !STOP_WORDS.has(word));
}
const STOP_WORDS = new Set(["the","and","for","with","from","into","using","use","based","study","analysis","of","in","on","to","a","an","by","at","via","data","dataset","project"]);
function cosineSimilarity(a, b) {
  const left = new Map(), right = new Map();
  for (const word of a) left.set(word, (left.get(word) || 0) + 1);
  for (const word of b) right.set(word, (right.get(word) || 0) + 1);
  const dot = [...left].reduce((sum, [word, count]) => sum + count * (right.get(word) || 0), 0);
  const normA = Math.sqrt([...left.values()].reduce((sum, n) => sum + n*n, 0));
  const normB = Math.sqrt([...right.values()].reduce((sum, n) => sum + n*n, 0));
  return normA && normB ? dot / (normA * normB) : 0;
}
function datasetSimilarity(a, b) {
  const left = new Set(tokenize(a)), right = new Set(tokenize(b));
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter(word => right.has(word)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}
function compareProjects(a, b) {
  const title = cosineSimilarity(tokenize(a.projectTitle), tokenize(b.projectTitle));
  const datasets = datasetSimilarity(a.datasets, b.datasets);
  return { score: Math.round((0.8 * title + 0.2 * datasets) * 100), title: Math.round(title * 100), datasets: Math.round(datasets * 100) };
}
function displayNumber(project, index) { return Number.isInteger(project.projectNumber) ? project.projectNumber : index + 1; }
function renderProjects(projects) {
  entriesContainer.replaceChildren();
  if (!projects.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Your cohort's project list will appear here.";
    entriesContainer.append(empty);
    return;
  }
  const records = projects.map((project, index) => ({ ...project, displayNumber: displayNumber(project, index), comparisons: [] }));
  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const comparison = compareProjects(records[i], records[j]);
      records[i].comparisons.push({ other: records[j], ...comparison });
      records[j].comparisons.push({ other: records[i], ...comparison });
    }
  }
  for (const record of records) record.comparisons.sort((a,b) => b.score - a.score);
  const visited = new Set(), groups = [];
  const byId = new Map(records.map(record => [record.id, record]));
  for (const record of records) {
    if (visited.has(record.id)) continue;
    const component = [], stack = [record];
    visited.add(record.id);
    while (stack.length) {
      const current = stack.pop();
      component.push(current);
      for (const match of current.comparisons) {
        if (match.score >= 25 && !visited.has(match.other.id)) {
          visited.add(match.other.id);
          stack.push(byId.get(match.other.id));
        }
      }
    }
    component.sort((a,b) => (b.comparisons[0]?.score || 0) - (a.comparisons[0]?.score || 0));
    groups.push(component);
  }
  groups.sort((a,b) => (b.length > 1 ? 1 : 0) - (a.length > 1 ? 1 : 0) || (b[0].comparisons[0]?.score || 0) - (a[0].comparisons[0]?.score || 0));
  let groupNumber = 0;
  for (const group of groups) {
    const wrapper = document.createElement("section");
    wrapper.className = "project-group";
    if (group.length > 1) {
      groupNumber++;
      const heading = document.createElement("h3");
      heading.className = "group-heading";
      heading.textContent = `Related projects · Group ${groupNumber}`;
      wrapper.append(heading);
    }
    for (const project of group) wrapper.append(renderProject(project));
    entriesContainer.append(wrapper);
  }
}
function renderProject(project) {
  const article = document.createElement("article");
  article.className = "entry-card";
  const top = document.createElement("div"); top.className = "entry-top";
  const id = document.createElement("span"); id.className = "project-id"; id.textContent = `Project #${project.displayNumber}`;
  const title = document.createElement("h3"); title.className = "entry-title"; title.textContent = project.projectTitle || "Untitled project";
  const subtitle = document.createElement("p"); subtitle.className = "entry-subtitle"; subtitle.textContent = project.subtitle || ""; subtitle.hidden = !project.subtitle;
  top.append(id);
  const meta = document.createElement("div"); meta.className = "entry-meta";
  meta.append(makeMeta("Submitted by", project.name || "Name not available"), makeMeta("Dataset(s)", project.datasets || "Not specified"));
  const best = project.comparisons[0];
  const comparison = document.createElement("div"); comparison.className = "similarity-result";
  const label = document.createElement("span"); label.className = "meta-label"; label.textContent = "Closest project match";
  const value = document.createElement("div"); value.className = "meta-value";
  if (best) {
    value.textContent = `Project #${best.other.displayNumber} · ${best.score}% overall (title ${best.title}%, datasets ${best.datasets}%)`;
    if (best.score >= 25) comparison.classList.add("similar");
  } else value.textContent = "No other entries to compare yet";
  comparison.append(label, value);
  if (best) {
    const aiButton = document.createElement("button");
    aiButton.type = "button"; aiButton.className = "ai-button"; aiButton.textContent = "AI judge";
    const aiResult = document.createElement("p"); aiResult.className = "ai-result";
    aiButton.addEventListener("click", async () => {
      aiButton.disabled = true; aiButton.textContent = "Reviewing…"; aiResult.textContent = "";
      try {
        const response = await fetch("/.netlify/functions/similarity-judge", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ titleA: project.projectTitle, titleB: best.other.projectTitle })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "AI review failed.");
        aiResult.textContent = `AI judge: ${result.score}% · ${result.verdict}. ${result.reason}`;
      } catch (error) { aiResult.textContent = error.message; }
      finally { aiButton.disabled = false; aiButton.textContent = "AI judge"; }
    });
    comparison.append(aiButton, aiResult);
  }
  meta.append(comparison);
  article.append(top, title, subtitle, meta);
  return article;
}
function makeMeta(label, value) {
  const wrap = document.createElement("div"), heading = document.createElement("span"), content = document.createElement("div");
  heading.className = "meta-label"; heading.textContent = label;
  content.className = "meta-value"; content.textContent = value;
  wrap.append(heading, content); return wrap;
}