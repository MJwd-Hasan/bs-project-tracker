import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const form = document.querySelector("#project-form");
const submitButton = document.querySelector("#submit-button");
const formStatus = document.querySelector("#form-status");
const loadStatus = document.querySelector("#load-status");
const entriesContainer = document.querySelector("#project-entries");
const entryCount = document.querySelector("#entry-count");

try {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const projectsRef = collection(db, "projects");

  onSnapshot(query(projectsRef, orderBy("createdAt", "desc")), snapshot => {
    const projects = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    entryCount.textContent = `${projects.length} ${projects.length === 1 ? "entry" : "entries"}`;
    loadStatus.textContent = projects.length ? "" : "No projects have been added yet.";
    renderProjects(projects);
  }, error => {
    console.error(error);
    loadStatus.textContent = "Could not load entries. Check Firebase configuration and Firestore rules.";
    entryCount.textContent = "Unavailable";
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const project = {
      projectTitle: clean(data.get("projectTitle")),
      datasets: clean(data.get("datasets")),
      createdAt: serverTimestamp()
    };
    submitButton.disabled = true;
    submitButton.textContent = "Submitting…";
    setStatus("", "");
    try {
      const created = await addDoc(projectsRef, project);
      form.reset();
      setStatus(`Project submitted. Your Project ID is BSP29-${created.id.toUpperCase()}.`, "success");
      document.querySelector("#project-list").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      console.error(error);
      setStatus("Submission failed. Check your Firebase setup and try again.", "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Submit project";
    }
  });
} catch (error) {
  console.error(error);
  loadStatus.textContent = "Firebase could not be initialized. Check firebase-config.js.";
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
function projectId(id) { return "BSP29-" + String(id).toUpperCase(); }
function renderProjects(projects) {
  entriesContainer.replaceChildren();
  if (!projects.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Your cohort's project list will appear here.";
    entriesContainer.append(empty);
    return;
  }
  const records = projects.map(project => ({ ...project, comparisons: [] }));
  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const comparison = compareProjects(records[i], records[j]);
      records[i].comparisons.push({ other: records[j], ...comparison });
      records[j].comparisons.push({ other: records[i], ...comparison });
    }
  }
  for (const record of records) record.comparisons.sort((a,b) => b.score - a.score);
  // Connected components keep related projects next to one another. A 25% edge
  // creates a group; entries without such a match remain in the ungrouped list.
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
    component.sort((a,b) => {
      const aTop = a.comparisons[0]?.score || 0, bTop = b.comparisons[0]?.score || 0;
      return bTop - aTop;
    });
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
  const id = document.createElement("span"); id.className = "project-id"; id.textContent = projectId(project.id);
  const title = document.createElement("h3"); title.className = "entry-title"; title.textContent = project.projectTitle || "Untitled project";
  top.append(id);
  const meta = document.createElement("div"); meta.className = "entry-meta";
  meta.append(makeMeta("Dataset(s)", project.datasets || "Not specified"));
  const best = project.comparisons[0];
  const comparison = document.createElement("div"); comparison.className = "similarity-result";
  const label = document.createElement("span"); label.className = "meta-label"; label.textContent = "Closest project match";
  const value = document.createElement("div"); value.className = "meta-value";
  if (best) {
    value.textContent = `${projectId(best.other.id)} · ${best.score}% overall (title ${best.title}%, datasets ${best.datasets}%)`;
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
  article.append(top, title, meta);
  return article;
}
function makeMeta(label, value) {
  const wrap = document.createElement("div"), heading = document.createElement("span"), content = document.createElement("div");
  heading.className = "meta-label"; heading.textContent = label;
  content.className = "meta-value"; content.textContent = value;
  wrap.append(heading, content); return wrap;
}