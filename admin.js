import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, query, orderBy, deleteDoc, doc, getDoc, getDocs, writeBatch, setDoc } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
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
  setStatus("Connecting to Firebase Authentication…", "");
  try {
    await signInWithEmailAndPassword(auth, data.get("email").trim(), data.get("password"));
  } catch (error) {
    console.error("Firebase sign-in error:", error);
    setStatus(authErrorMessage(error), "error");
  } finally {
    loginButton.disabled = false; loginButton.textContent = "Sign in";
  }
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
  setStatus("Checking administrator permissions…", "");
  try {
    const grant = await getDoc(doc(db, "admins", user.uid));
    if (!grant.exists() || grant.data().enabled !== true) {
      loginForm.hidden = false; session.hidden = false;
      document.querySelector("#admin-identity").textContent = `Signed in as ${user.email || user.uid}. Firebase UID: ${user.uid}`;
      setStatus("Authentication succeeded, but this account is not an authorized admin. Create Firestore document admins/${user.uid} with boolean field enabled = true.", "error");
      entries.append(empty("This account can sign in but cannot manage entries until an admin grant is added."));
      return;
    }
    loginForm.hidden = true; session.hidden = false;
    document.querySelector("#admin-identity").textContent = `Authorized: ${user.email || user.uid}`;
    setStatus("Admin access verified.", "success");
    await migrateLegacyProjectNumbers();
    stopListening = onSnapshot(query(collection(db, "projects"), orderBy("createdAt", "desc")), snapshot => {
      count.textContent = `${snapshot.size} entries`;
      entries.replaceChildren();
      if (snapshot.empty) entries.append(empty("There are no entries to manage."));
      snapshot.forEach(item => entries.append(renderEntry(item.id, item.data())));
    }, error => {
      console.error("Admin project listener error:", error);
      setStatus(`Could not load projects (${error.code || "permission error"}). Check the latest Firestore rules.`, "error");
    });
  } catch (error) {
    console.error("Admin authorization/migration error:", error);
    setStatus(`Could not verify admin access (${error.code || "permission error"}). Publish the latest firestore.rules and verify admins/${user.uid} has enabled: true.`, "error");
  }
});

async function migrateLegacyProjectNumbers() {
  const snapshot = await getDocs(query(collection(db, "projects"), orderBy("createdAt", "desc")));
  let next = snapshot.docs.reduce((max, item) => Math.max(max, Number(item.data().projectNumber) || 0), 0);
  const missing = snapshot.docs.filter(item => !Number.isInteger(item.data().projectNumber));
  if (!missing.length) {
    await setDoc(doc(db, "counters", "projectSequence"), { value: next }, { merge: true });
    return;
  }
  // Keep the existing newest-first order when assigning numbers to older records.
  for (let offset = 0; offset < missing.length; offset += 400) {
    const batch = writeBatch(db);
    for (const item of missing.slice(offset, offset + 400)) {
      next += 1;
      batch.update(item.ref, { projectNumber: next });
    }
    if (offset + 400 >= missing.length) batch.set(doc(db, "counters", "projectSequence"), { value: next });
    await batch.commit();
  }
}

function renderEntry(id, project) {
  const card = document.createElement("article"); card.className = "entry-card";
  const idLine = document.createElement("div"); idLine.className = "project-id"; idLine.textContent = Number.isInteger(project.projectNumber) ? `Project #${project.projectNumber}` : "Project number pending";
  const title = document.createElement("h3"); title.className = "entry-title"; title.textContent = project.projectTitle || "Untitled project";
  const owner = document.createElement("p"); owner.className = "meta-value"; owner.textContent = "Submitted by: " + (project.name || "Name not available");
  const dataset = document.createElement("p"); dataset.className = "meta-value"; dataset.textContent = "Datasets: " + (project.datasets || "Not specified");
  const button = document.createElement("button"); button.className = "danger-button"; button.type = "button"; button.textContent = "Delete entry";
  button.addEventListener("click", async () => {
    const label = Number.isInteger(project.projectNumber) ? `Project #${project.projectNumber}` : "this project";
    if (!confirm(`Permanently delete ${label}? This cannot be undone.`)) return;
    button.disabled = true; button.textContent = "Deleting…";
    try { await deleteDoc(doc(db, "projects", id)); setStatus("Entry deleted.", "success"); }
    catch (error) { console.error(error); setStatus(`Delete failed (${error.code || "permission error"}). Check admin permissions and Firestore rules.`, "error"); button.disabled = false; button.textContent = "Delete entry"; }
  });
  const actions = document.createElement("div"); actions.className = "admin-entry-actions"; actions.append(button);
  card.append(idLine, title, owner, dataset, actions); return card;
}
function authErrorMessage(error) {
  const code = error?.code || "unknown";
  const messages = {
    "auth/invalid-credential": "Firebase rejected these credentials. Check the email and password; if they are correct, verify that this user exists in Firebase Authentication.",
    "auth/wrong-password": "Incorrect password. Check the password for this Firebase Authentication user.",
    "auth/user-not-found": "No Firebase Authentication user exists for this email. Add the admin user in Firebase Console → Authentication → Users.",
    "auth/invalid-email": "The email address is not valid.",
    "auth/too-many-requests": "Firebase temporarily blocked sign-in attempts. Wait a while and try again.",
    "auth/network-request-failed": "The browser could not reach Firebase Authentication. Check your connection, ad blockers, and allowed domains.",
    "auth/operation-not-allowed": "Email/Password sign-in is disabled. Enable it in Firebase Console → Authentication → Sign-in method.",
    "auth/unauthorized-domain": "This website domain is not authorized. Add project-tracker29.netlify.app in Firebase Authentication → Settings → Authorized domains.",
    "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "The Firebase API key is invalid. Check firebase-config.js against the Firebase Web app configuration."
  };
  return `${messages[code] || `Firebase sign-in failed (${code}). Check the browser console for the full error.`}`;
}
function empty(message) { const el = document.createElement("div"); el.className = "empty-state"; el.textContent = message; return el; }
function setStatus(message, type) { status.textContent = message; status.className = "status" + (type ? " " + type : ""); }