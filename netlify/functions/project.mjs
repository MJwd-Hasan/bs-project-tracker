import { createHash, randomBytes } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
let db;

function database() {
  if (db) return db;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Project editing is not configured yet. Add FIREBASE_SERVICE_ACCOUNT_JSON to Netlify environment variables and redeploy.");
  const serviceAccount = JSON.parse(raw);
  const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount) });
  db = getFirestore(app);
  return db;
}
function reply(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}
function clean(value, max) {
  return String(value ?? "").trim().slice(0, max);
}
function validate(project) {
  const value = {
    name: clean(project?.name, 100),
    projectTitle: clean(project?.projectTitle, 240),
    subtitle: clean(project?.subtitle, 160),
    datasets: clean(project?.datasets, 1000)
  };
  if (!value.name || !value.projectTitle || !value.datasets) throw new Error("Name, project title/domain, and dataset(s) are required.");
  if (value.name.length > 100 || value.projectTitle.length > 240 || value.subtitle.length > 160 || value.datasets.length > 1000) throw new Error("One or more fields exceed the allowed length.");
  return value;
}
function tokenHash(token) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) throw new Error("The edit link is invalid.");
  return createHash("sha256").update(token).digest("hex");
}

export default async request => {
  if (request.method !== "POST") return reply({ error: "Method not allowed." }, 405);
  try {
    const body = await request.json();
    const store = database();
    if (body.action === "create") {
      const project = validate(body.project);
      const token = randomBytes(32).toString("hex");
      const hash = tokenHash(token);
      const projectRef = store.collection("projects").doc();
      const keyRef = store.collection("projectEditKeys").doc(hash);
      let projectNumber;
      await store.runTransaction(async tx => {
        const counterRef = store.collection("counters").doc("projectSequence");
        const counter = await tx.get(counterRef);
        const previous = Number(counter.exists ? counter.data().value : 0) || 0;
        projectNumber = previous + 1;
        tx.set(counterRef, { value: projectNumber });
        tx.create(projectRef, { ...project, projectNumber, createdAt: FieldValue.serverTimestamp() });
        tx.create(keyRef, { projectId: projectRef.id, createdAt: FieldValue.serverTimestamp() });
      });
      return reply({ projectNumber, editToken: token });
    }

    if (body.action === "load" || body.action === "update") {
      const hash = tokenHash(body.token);
      const key = await store.collection("projectEditKeys").doc(hash).get();
      if (!key.exists) return reply({ error: "This edit link is invalid. Use the private link generated when the project was submitted." }, 404);
      const projectRef = store.collection("projects").doc(key.data().projectId);
      const projectSnapshot = await projectRef.get();
      if (!projectSnapshot.exists) return reply({ error: "The project no longer exists." }, 404);
      if (body.action === "load") {
        const data = projectSnapshot.data();
        return reply({ project: { name: data.name || "", projectTitle: data.projectTitle || "", subtitle: data.subtitle || "", datasets: data.datasets || "" } });
      }
      const project = validate(body.project);
      await projectRef.update(project);
      return reply({ ok: true });
    }
    return reply({ error: "Unknown action." }, 400);
  } catch (error) {
    const status = /required|allowed length|invalid/i.test(error.message) ? 400 : 500;
    console.error("Project API error:", error);
    return reply({ error: error.message || "Unable to process the project request." }, status);
  }
};
