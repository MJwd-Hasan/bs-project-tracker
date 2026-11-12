import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
let adminApp;
let db;
function services() {
  if (db && adminApp) return { db, auth: getAuth(adminApp) };
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Project submission is not configured. Add FIREBASE_SERVICE_ACCOUNT_JSON to Netlify environment variables and redeploy.");
  const serviceAccount = JSON.parse(raw);
  adminApp = getApps()[0] || initializeApp({ credential: cert(serviceAccount) });
  db = getFirestore(adminApp);
  return { db, auth: getAuth(adminApp) };
}
function reply(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}
function validate(project) {
  const value = {
    projectTitle: String(project?.projectTitle ?? "").trim(),
    datasets: String(project?.datasets ?? "").trim()
  };
  if (!value.projectTitle || !value.datasets) throw new Error("Project title/domain and dataset(s) are required.");
  if (value.projectTitle.length > 240 || value.datasets.length > 1000) throw new Error("One or more fields exceed the allowed length.");
  return value;
}
export default async request => {
  if (request.method !== "POST") return reply({ error: "Method not allowed." }, 405);
  try {
    const match = (request.headers.get("authorization") || "").match(/^Bearer\\s+(.+)$/i);
    if (!match) return reply({ error: "Sign in with your @isrt.ac.bd Google account first." }, 401);
    const { db: store, auth } = services();
    const decoded = await auth.verifyIdToken(match[1]);
    const email = String(decoded.email || "").toLowerCase();
    if (decoded.email_verified !== true || !email.endsWith("@isrt.ac.bd") || decoded.firebase?.sign_in_provider !== "google.com") {
      return reply({ error: "Only verified Google accounts ending in @isrt.ac.bd may submit projects." }, 403);
    }
    const body = await request.json();
    if (body.action !== "create") return reply({ error: "Unknown action." }, 400);
    const project = validate(body.project);
    const projectRef = store.collection("projects").doc();
    let projectNumber;
    await store.runTransaction(async tx => {
      const counterRef = store.collection("counters").doc("projectSequence");
      const counter = await tx.get(counterRef);
      const previous = Number(counter.exists ? counter.data().value : 0) || 0;
      projectNumber = previous + 1;
      tx.set(counterRef, { value: projectNumber });
      tx.create(projectRef, {
        ...project, ownerUid: decoded.uid, ownerEmail: email,
        projectNumber, createdAt: FieldValue.serverTimestamp()
      });
    });
    return reply({ projectNumber });
  } catch (error) {
    const status = /required|allowed length|invalid/i.test(error.message) ? 400 : 500;
    console.error("Project API error:", error);
    return reply({ error: error.message || "Unable to process the project request." }, status);
  }
};
