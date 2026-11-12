# BSc Project Tracker 29

A shared project directory for the BSc Project Tracker 29 cohort. Students submit their name, project title/domain, and dataset(s); everyone can view entries and compare possible overlap.

## Features
- Submission fields: **Name**, **Project Domain / Title**, optional **Subtitle**, and **Dataset(s)**.
- Students receive a private, unguessable edit link after submission. The link lets them load and update their own entry later without creating an account.
- Edit tokens are stored as SHA-256 hashes in a private Firestore collection; project writes are performed by a Netlify Function using a Firebase service account.
- Each entry receives a simple sequential integer Project Number (for example, **Project #12**); the Firestore document key remains internal.
- Similarity score: **80% title/domain word similarity + 20% dataset similarity**.
- Related projects are grouped at a 25% pairwise similarity threshold. This is a screening indicator, not proof of duplication.
- Firebase Email/Password authentication protects the admin panel.
- Admins can delete entries and the admin panel automatically assigns permanent integer numbers to legacy entries.

## Firebase setup and required update

The Firebase web configuration is in `firebase-config.js`. It identifies the Firebase project and is intended for browser use; never put service-account private keys in this file or commit them to GitHub.

1. Open [Firebase Console](https://console.firebase.google.com/) and select **bsc-project-tracker-29**.
2. Ensure **Cloud Firestore** is enabled.
3. In Firestore → **Rules**, publish the complete contents of this repository's `firestore.rules`. Public client-side project creation is disabled; project submissions and student edits now go through the Netlify Function.
4. In Authentication → **Sign-in method**, enable **Email/Password**.
5. In Authentication → **Settings** → **Authorized domains**, ensure `project-tracker29.netlify.app` is listed. Add it if missing.
6. In Authentication → **Users**, create the admin user manually. There is no public sign-up form.
7. Copy that user's **UID**.
8. In Firestore → **Data**, create a collection named `admins`. Create a document with the exact UID as its document ID and a boolean field `enabled: true`.
9. In Firebase Console → Project settings → Service accounts, generate a private key for a service account. Add the complete JSON contents as the Netlify environment variable `FIREBASE_SERVICE_ACCOUNT_JSON` (Functions scope). Never commit this JSON to GitHub or place it in `firebase-config.js`.
10. Trigger a Netlify redeploy so the Function receives the new variable.
11. Open `https://project-tracker29.netlify.app/admin.html` and sign in with the same email and password.

### Admin login troubleshooting

The admin page now displays specific Firebase authentication errors:
- **invalid-credential**: verify the email/password and that the user exists in Authentication → Users.
- **operation-not-allowed**: enable Email/Password provider.
- **unauthorized-domain**: add the Netlify domain to Authorized domains.
- **network-request-failed**: check network access, browser extensions, and content blockers.
- **Signed in, but not authorized**: create `admins/{UID}` with boolean `enabled: true`.
- **permission-denied while checking admin status**: publish the latest `firestore.rules`, then reload the page.

The UID shown on the admin page is the value to use as the `admins` document ID. Do not share the admin password.

### Student edit links

After a successful submission, the site displays a private edit link and a copy button. Students should bookmark or save that link; anyone who possesses it can edit that one project, so it must not be posted publicly. Open the link to load the existing entry, change the fields, and save. The edit token is high-entropy and only its SHA-256 hash is stored in Firestore. If the link is lost, an administrator must update the entry from the admin panel; there is no token recovery or public lookup.

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
- `subtitle`: optional string (up to 160 characters)
- `datasets`: string
- `projectNumber`: integer
- `createdAt`: server timestamp

**`projectEditKeys/{sha256-token}`**
- `projectId`: the associated project document ID
- `createdAt`: server timestamp

This collection is inaccessible to browser clients. The Netlify Function validates tokens and updates projects using the Firebase Admin SDK.

**`admins/{uid}`**
- `enabled`: boolean

**`counters/projectSequence`**
- `value`: integer

## Security note

Project reads are public. Submissions and student edits are handled by a Netlify Function using `FIREBASE_SERVICE_ACCOUNT_JSON`; direct client writes and access to edit-token records are denied by Firestore rules. Anyone holding a private edit link can edit its associated entry. Protect the service-account JSON and never share edit links publicly. Consider adding rate limiting or CAPTCHA if spam becomes an issue.
