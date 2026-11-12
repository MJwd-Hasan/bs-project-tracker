# BSc Project Tracker 29

A shared project directory for the BSc Project Tracker 29 cohort. Students submit their name, project title/domain, and dataset(s); everyone can view entries and compare possible overlap.

## Features
- Submission fields: **Name**, **Project Domain / Title**, and **Dataset(s)**.
- Each entry receives a simple sequential integer Project Number (for example, **Project #12**); the Firestore document key remains internal.
- Similarity score: **80% title/domain word similarity + 20% dataset similarity**.
- Related projects are grouped at a 25% pairwise similarity threshold. This is a screening indicator, not proof of duplication.
- Firebase Email/Password authentication protects the admin panel.
- Admins can delete entries and the admin panel automatically assigns permanent integer numbers to legacy entries.

## Firebase setup and required update

The Firebase web configuration is in `firebase-config.js`. It identifies the Firebase project and is intended for browser use; never put service-account private keys in this file or commit them to GitHub.

1. Open [Firebase Console](https://console.firebase.google.com/) and select **bsc-project-tracker-29**.
2. Ensure **Cloud Firestore** is enabled.
3. In Firestore → **Rules**, publish the complete contents of this repository's `firestore.rules`. This is required for the current Name + integer-number schema and counter transaction.
4. In Authentication → **Sign-in method**, enable **Email/Password**.
5. In Authentication → **Settings** → **Authorized domains**, ensure `project-tracker29.netlify.app` is listed. Add it if missing.
6. In Authentication → **Users**, create the admin user manually. There is no public sign-up form.
7. Copy that user's **UID**.
8. In Firestore → **Data**, create a collection named `admins`. Create a document with the exact UID as its document ID and a boolean field `enabled: true`.
9. Open `https://project-tracker29.netlify.app/admin.html` and sign in with the same email and password.

### Admin login troubleshooting

The admin page now displays specific Firebase authentication errors:
- **invalid-credential**: verify the email/password and that the user exists in Authentication → Users.
- **operation-not-allowed**: enable Email/Password provider.
- **unauthorized-domain**: add the Netlify domain to Authorized domains.
- **network-request-failed**: check network access, browser extensions, and content blockers.
- **Signed in, but not authorized**: create `admins/{UID}` with boolean `enabled: true`.
- **permission-denied while checking admin status**: publish the latest `firestore.rules`, then reload the page.

The UID shown on the admin page is the value to use as the `admins` document ID. Do not share the admin password.

## Project numbers and existing records

New submissions allocate a sequential integer using a Firestore transaction and the `counters/projectSequence` document. This prevents two concurrent submissions from receiving the same number. The underlying random Firestore document ID is not shown to users.

Legacy project documents are retained. When an authorized admin opens the admin panel, it assigns permanent integer numbers to any legacy documents that do not yet have one and updates the sequence counter. Until that migration has run, legacy entries are shown with a temporary list number. Names from older documents are displayed when available; otherwise the page shows “Name not available”.

## Similarity method

- **Title/domain (80%)**: cosine similarity over normalized word-frequency vectors after basic token cleanup and stop-word removal.
- **Datasets (20%)**: Jaccard similarity over normalized dataset-name tokens.
- **Overall**: `0.8 × titleSimilarity + 0.2 × datasetSimilarity`.

The threshold is a practical display setting, not a validated academic cutoff. Similarity can miss semantic overlap when different wording is used; students and supervisors should review close matches.

## Optional open-source LLM judge

An optional Netlify Function provides a second-stage semantic title review using Hugging Face Inference Providers and the open-weight `Qwen/Qwen2.5-7B-Instruct-1M` model.

To enable it, create a Hugging Face token with Inference Providers permission, add it to Netlify as the `HF_TOKEN` environment variable, and redeploy. Provider availability and inference may require credits or paid usage. The core tracker does not depend on this feature.

## Netlify deployment

The repository is configured for a static Netlify deployment with a Functions directory. If GitHub auto-deploy is connected, pushes to `main` should trigger a deploy. Otherwise, trigger a manual deploy in Netlify.

## Firestore collections

**`projects`**
- `name`: string
- `projectTitle`: string
- `datasets`: string
- `projectNumber`: integer
- `createdAt`: server timestamp

**`admins/{uid}`**
- `enabled`: boolean

**`counters/projectSequence`**
- `value`: integer

## Security note

Project reads and submissions are public. This is convenient for a cohort directory but permits spam submissions. Admin grants cannot be created or modified from the public client; create them only in Firebase Console. Consider Firebase App Check or an authenticated submission workflow if abuse becomes an issue.
