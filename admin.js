import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, query, orderBy, deleteDoc, doc, getDoc } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig), db = getFirestore(app), auth = getAuth(app);
const loginForm = document.querySelector("#login-form"), loginButton = document.querySelector("#login-button");
const status = document.querySelector("#admin-status"), entries = document.querySelector("#admin-entries");
const count = document.querySelector("#admin-count"), session = document.querySelector("#admin-session");
let stopListening = null;

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  const data = new FormData(loginForm);
  loginButton.disabled = true; loginButton.textContent = "Signing in…";
  try { await signInWithEmailAndPassword(auth, data.get("email"), data.get("password")); }
  catch (error) { setStatus("Sign-in failed. Check the email and password, then try again.", "error"); }
  finally { loginButton.disabled = false; loginButton.textContent = "Sign in"; }
});
document.querySelector("#logout-button").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async user => {
  if (stopListening) { stopListening(); stopListening = null; }
  entries.replaceChildren(); count.textContent = "";
  if (!user) {
    loginForm.hidden = false; session.hidden = true;
    entries.append(empty("Sign in as an authorized admin to manage entries."));
    return;
  }
  try {
    const grant = await getDoc(doc(db, "admins", user.uid));
    if (!grant.exists() || grant.data().enabled !== true) {
      loginForm.hidden = false; session.hidden = false;
      document.querySelector("#admin-identity").textContent = `Signed in as ${user.email || user.uid}, but this account has no admin permission. Firebase UID: ${user.uid}`;
      setStatus("This account is not authorized. Ask the project owner to add an admins document with enabled: true for this UID.", "error");
      entries.append(empty("No admin permissions. Entries cannot be deleted."));
      return;
    }
    loginForm.hidden = true; session.hidden = false;
    document.querySelector("#admin-identity").textContent = `Authorized: ${user.email || user.uid}`;
    setStatus("Admin access verified.", "success");
    stopListening = onSnapshot(query(collection(db, "projects"), orderBy("createdAt", "desc")), snapshot => {
      count.textContent = `${snapshot.size} entries`;
      entries.replaceChildren();
      if (snapshot.empty) entries.append(empty("There are no entries to manage."));
      snapshot.forEach(item => entries.append(renderEntry(item.id, item.data())));
    }, error => setStatus("Could not load projects. Check Firestore rules.", "error"));
  } catch (error) {
    console.error(error); setStatus("Could not verify admin access. Publish the latest Firestore rules first.", "error");
  }
});

function renderEntry(id, project) {
  const card = document.createElement("article"); card.className = "entry-card";
  const idLine = document.createElement("div"); idLine.className = "project-id"; idLine.textContent = "BSP29-" + id.toUpperCase();
  const title = document.createElement("h3"); title.className = "entry-title"; title.textContent = project.projectTitle || "Untitled project";
  const dataset = document.createElement("p"); dataset.className = "meta-value"; dataset.textContent = "Datasets: " + (project.datasets || "Not specified");
  const button = document.createElement("button"); button.className = "danger-button"; button.type = "button"; button.textContent = "Delete entry";
  button.addEventListener("click", async () => {
    if (!confirm(`Permanently delete ${"BSP29-" + id.toUpperCase()}? This cannot be undone.`)) return;
    button.disabled = true; button.textContent = "Deleting…";
    try { await deleteDoc(doc(db, "projects", id)); setStatus("Entry deleted.", "success"); }
    catch (error) { console.error(error); setStatus("Delete failed. Check admin permissions and Firestore rules.", "error"); button.disabled = false; button.textContent = "Delete entry"; }
  });
  const actions = document.createElement("div"); actions.className = "admin-entry-actions"; actions.append(button);
  card.append(idLine, title, dataset, actions); return card;
}
function empty(message) { const el = document.createElement("div"); el.className = "empty-state"; el.textContent = message; return el; }
function setStatus(message, type) { status.textContent = message; status.className = "status" + (type ? " " + type : ""); }