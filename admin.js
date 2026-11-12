import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, query, orderBy, deleteDoc, doc, getDoc, getDocs, writeBatch, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const loginForm = document.querySelector("#login-form");
const loginButton = document.querySelector("#login-button");
const status = document.querySelector("#admin-status");
const entries = document.querySelector("#admin-entries");
const count = document.querySelector("#admin-count");
const session = document.querySelector("#admin-session");
let stopListening = null;
let authCheckInProgress = false;

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  const data = new FormData(loginForm);
  loginButton.disabled = true;
  loginButton.textContent = "Signing in…";
  setStatus("Contacting Firebase Authentication…", "");
  try {
    await withTimeout(
      signInWithEmailAndPassword(auth, String(data.get("email") || "").trim(), data.get("password")),
      15000,
      "Firebase Authentication did not respond within 15 seconds. Check your connection, Firebase authorized domains, and browser extensions."
    );
    setStatus("Credentials accepted. Checking Firestore administrator access…", "");
  } catch (error) {
    console.error("Firebase sign-in error:", error);
    setStatus(authErrorMessage(error), "error");
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Sign in";
  }
});

document.querySelector("#logout-button").addEventListener("click", async () => {
  try { await signOut(auth); }
  catch (error) { setStatus(`Sign-out failed (${error.code || "unknown error"}).`, "error"); }
});

onAuthStateChanged(auth, async user => {
  if (authCheckInProgress) return;
  authCheckInProgress = true;
  if (stopListening) { stopListening(); stopListening = null; }
  entries.replaceChildren();
  count.textContent = "";

  if (!user) {
    loginForm.hidden = false;
    session.hidden = true;
    setStatus("Not signed in. Use your Firebase admin email and password.", "");
    entries.append(empty("Sign in as an authorized admin to manage entries."));
    authCheckInProgress = false;
    return;
  }

  // Authentication is complete at this point. The next check is Firestore,
  // not Firebase Authentication; keep the signed-in identity visible.
  loginForm.hidden = true;
  session.hidden = false;
  document.querySelector("#admin-identity").textContent =
    `Signed in as ${user.email || "Firebase user"}. Firebase UID: ${user.uid}`;
  setStatus("Authentication successful. Checking your Firestore admin permission…", "");

  try {
    const grant = await withTimeout(
      getDoc(doc(db, "admins", user.uid)),
      12000,
      "Firebase Authentication succeeded, but Firestore did not respond within 12 seconds. Check that Cloud Firestore exists, your browser can reach Firestore, and the latest Firestore rules are published."
    );

    if (!grant.exists() || grant.data().enabled !== true) {
      loginForm.hidden = false;
      session.hidden = false;
      setStatus(
        `You are signed in, but this account is not authorized as an admin. In Firestore, create admins/${user.uid} with a boolean field enabled = true. Do not create this document in Authentication.`,
        "error"
      );
      entries.append(empty("Admin permission is missing for this signed-in account."));
      authCheckInProgress = false;
      return;
    }

    document.querySelector("#admin-identity").textContent = `Admin verified: ${user.email || user.uid}`;
    setStatus("Admin permission verified. Loading project entries…", "success");

    stopListening = onSnapshot(
      query(collection(db, "projects"), orderBy("createdAt", "desc")),
      snapshot => {
        count.textContent = `${snapshot.size} entries`;
        entries.replaceChildren();
        if (snapshot.empty) entries.append(empty("There are no entries to manage."));
        snapshot.forEach(item => entries.append(renderEntry(item.id, item.data())));
      },
      error => {
        console.error("Admin project listener error:", error);
        setStatus(firestoreErrorMessage(error, "load project entries"), "error");
      }
    );

    // Number migration is non-blocking: the admin interface remains usable
    // while legacy records are assigned integer IDs.
    migrateLegacyProjectNumbers().catch(error => {
      console.error("Legacy project-number migration failed:", error);
      setStatus(firestoreErrorMessage(error, "migrate old project numbers"), "error");
    });
  } catch (error) {
    console.error("Firestore admin check failed:", error);
    setStatus(firestoreErrorMessage(error, "check admin permissions"), "error");
    entries.append(empty("Authentication is working, but the Firestore permission check failed or timed out. Follow the error above."));
  } finally {
    authCheckInProgress = false;
  }
});

async function migrateLegacyProjectNumbers() {
  const snapshot = await withTimeout(
    getDocs(query(collection(db, "projects"), orderBy("createdAt", "desc"))),
    15000,
    "Project-number migration timed out while reading Firestore."
  );
  let next = snapshot.docs.reduce((max, item) => Math.max(max, Number(item.data().projectNumber) || 0), 0);
  const missing = snapshot.docs.filter(item => !Number.isInteger(item.data().projectNumber));
  if (!missing.length) {
    if (next > 0) await setDoc(doc(db, "counters", "projectSequence"), { value: next }, { merge: true });
    return;
  }
  for (let offset = 0; offset < missing.length; offset += 400) {
    const batch = writeBatch(db);
    for (const item of missing.slice(offset, offset + 400)) {
      next += 1;
      batch.update(item.ref, { projectNumber: next });
    }
    if (offset + 400 >= missing.length) batch.set(doc(db, "counters", "projectSequence"), { value: next });
    await withTimeout(batch.commit(), 15000, "Project-number migration timed out while saving changes.");
  }
  setStatus("Admin access verified. Legacy project numbers have been assigned.", "success");
}

function renderEntry(id, project) {
  const card = document.createElement("article"); card.className = "entry-card";
  const idLine = document.createElement("div"); idLine.className = "project-id";
  idLine.textContent = Number.isInteger(project.projectNumber) ? `Project #${project.projectNumber}` : "Project number pending";
  const title = document.createElement("h3"); title.className = "entry-title"; title.textContent = project.projectTitle || "Untitled project";
  const owner = document.createElement("p"); owner.className = "meta-value"; owner.textContent = "Student email: " + (project.ownerEmail || "Legacy entry · owner not linked");
  const dataset = document.createElement("p"); dataset.className = "meta-value"; dataset.textContent = "Datasets: " + (project.datasets || "Not specified");

  const actions = document.createElement("div"); actions.className = "admin-entry-actions";
  const editButton = document.createElement("button"); editButton.className = "secondary-button"; editButton.type = "button"; editButton.textContent = "Edit";
  const deleteButton = document.createElement("button"); deleteButton.className = "danger-button"; deleteButton.type = "button"; deleteButton.textContent = "Delete entry";
  actions.append(editButton, deleteButton);

  const editForm = document.createElement("form");
  editForm.className = "admin-edit-form";
  editForm.hidden = true;
  const fields = [
    { name: "projectTitle", label: "Project Domain / Title", value: project.projectTitle || "", max: 240 },
    { name: "datasets", label: "Dataset(s)", value: project.datasets || "", max: 1000 }
  ];
  for (const field of fields) {
    const label = document.createElement("label");
    const caption = document.createElement("span"); caption.textContent = field.label;
    const input = document.createElement("textarea");
    input.name = field.name;
    input.value = field.value;
    input.maxLength = field.max;
    input.required = field.name !== "subtitle";
    input.rows = field.name === "projectTitle" ? 4 : 2;
    label.append(caption, input);
    editForm.append(label);
  }
  const editActions = document.createElement("div"); editActions.className = "admin-entry-actions";
  const saveButton = document.createElement("button"); saveButton.type = "submit"; saveButton.textContent = "Save changes";
  const cancelButton = document.createElement("button"); cancelButton.type = "button"; cancelButton.className = "secondary-button"; cancelButton.textContent = "Cancel";
  editActions.append(saveButton, cancelButton);
  editForm.append(editActions);

  editButton.addEventListener("click", () => {
    editForm.hidden = false;
    editButton.hidden = true;
    deleteButton.hidden = true;
    editForm.elements.namedItem("projectTitle").focus();
  });
  cancelButton.addEventListener("click", () => {
    editForm.hidden = true;
    editButton.hidden = false;
    deleteButton.hidden = false;
    for (const field of fields) editForm.elements.namedItem(field.name).value = field.value;
  });
  editForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!editForm.reportValidity()) return;
    const data = new FormData(editForm);
    const changes = Object.fromEntries(fields.map(field => [field.name, String(data.get(field.name) || "").trim()]));
    if (["projectTitle", "datasets"].some(key => !changes[key])) {
      setStatus("Project title and dataset(s) are required.", "error");
      return;
    }
    saveButton.disabled = true; saveButton.textContent = "Saving…";
    try {
      await withTimeout(updateDoc(doc(db, "projects", id), changes), 15000, "Saving the project timed out. Check Firestore connectivity and try again.");
      setStatus("Project entry updated successfully.", "success");
      editForm.hidden = true;
      editButton.hidden = false;
      deleteButton.hidden = false;
    } catch (error) {
      console.error("Project update failed:", error);
      setStatus(firestoreErrorMessage(error, "update this project"), "error");
    } finally {
      saveButton.disabled = false; saveButton.textContent = "Save changes";
    }
  });

  deleteButton.addEventListener("click", async () => {
    const label = Number.isInteger(project.projectNumber) ? `Project #${project.projectNumber}` : "this project";
    if (!confirm(`Permanently delete ${label}? This cannot be undone.`)) return;
    deleteButton.disabled = true; deleteButton.textContent = "Deleting…";
    try { await deleteDoc(doc(db, "projects", id)); setStatus("Entry deleted.", "success"); }
    catch (error) { console.error(error); setStatus(firestoreErrorMessage(error, "delete entry"), "error"); deleteButton.disabled = false; deleteButton.textContent = "Delete entry"; }
  });
  card.append(idLine, title, owner, dataset, actions, editForm);
  return card;
}
function withTimeout(promise, milliseconds, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })
  ]).finally(() => clearTimeout(timer));
}

function authErrorMessage(error) {
  const code = error?.code || "unknown";
  const messages = {
    "auth/invalid-credential": "Firebase rejected these credentials. Verify the email/password and confirm the user exists under Firebase Authentication → Users.",
    "auth/wrong-password": "Incorrect password for this Firebase Authentication user.",
    "auth/user-not-found": "No Firebase Authentication user exists for this email. Create the admin user under Authentication → Users.",
    "auth/invalid-email": "The email address is not valid.",
    "auth/too-many-requests": "Firebase temporarily blocked sign-in attempts. Wait before trying again.",
    "auth/network-request-failed": "The browser could not reach Firebase Authentication. Check internet access, extensions, and content blockers.",
    "auth/operation-not-allowed": "Email/Password sign-in is disabled. Enable it in Firebase Console → Authentication → Sign-in method.",
    "auth/unauthorized-domain": "The Netlify domain is not authorized. Add project-tracker29.netlify.app under Authentication → Settings → Authorized domains.",
    "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "The Firebase API key is invalid. Compare firebase-config.js with the Firebase Web app configuration."
  };
  return messages[code] || `Firebase sign-in failed (${code}). Check the browser console for details.`;
}

function firestoreErrorMessage(error, action) {
  const code = error?.code || "timeout";
  if (code === "permission-denied") {
    return `Firebase Authentication succeeded, but Firestore denied the request to ${action}. Publish this repository's latest firestore.rules. Also confirm admins/${auth.currentUser?.uid || "YOUR_UID"} exists with enabled set to boolean true.`;
  }
  if (code === "unavailable" || code === "deadline-exceeded" || code === "timeout") {
    return `Firebase Authentication succeeded, but Firestore could not ${action} (${code}). Check Firestore database setup, internet access, and browser extensions; then reload.`;
  }
  return `Firebase Authentication succeeded, but Firestore could not ${action} (${code}): ${error?.message || "unknown error"}`;
}

function empty(message) {
  const el = document.createElement("div");
  el.className = "empty-state";
  el.textContent = message;
  return el;
}
function setStatus(message, type) {
  status.textContent = message;
  status.className = "status" + (type ? " " + type : "");
}