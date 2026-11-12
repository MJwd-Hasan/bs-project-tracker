# BSc Project Tracker 29

A shared project directory for the BSc Project Tracker 29 cohort. Students submit their name, project title/domain, and dataset(s); everyone can view entries and compare possible overlap.

## Features
- Submission fields: **Name**, **Project Domain / Title**, optional **Subtitle**, and **Dataset(s)**.
- Every public project entry has an **Edit** button. Anyone can open the entry in the form and update its name, title, subtitle, or datasets without signing in or using an edit link.
- Project submissions are created by a Netlify Function using a Firebase service account. Student edits are saved directly to Firestore under intentionally open public-update rules.
- Each entry receives a simple sequential integer Project Number (for example, **Project #12**); the Firestore document key remains internal.
- Similarity score: **80% title/domain word similarity + 20% dataset similarity**.
- Related projects are grouped at a 25% pairwise similarity threshold. This is a screening indicator, not proof of duplication.
- Firebase Email/Password authentication protects the admin panel.
- Admins can delete entries and the admin panel automatically assigns permanent integer numbers to legacy entries.

## Firebase setup and required update

The Firebase web configuration is in `firebase-config.js`. It identifies the Firebase project and is intended for browser use; never put service-account private keys in this file or commit them to GitHub.

1. Open [Firebase Console](https://console.firebase.google.com/) and select **bsc-project-tracker-29**.
2. Ensure **Cloud Firestore** is enabled.
3. In Firestore → **Rules**, publish the complete contents of this repository's `firestore.rules`. Public client-side project creation is disabled; new submissions go through the Netlify Function, while edits are allowed directly from the public site.
4. In Authentication → **Sign-in method**, enable **Email/Password**.
5. In Authentication → **Settings** → **Authorized domains**, ensure `project-tracker29.netlify.app` is listed. Add it if missing.
6. In Authentication → **Users**, create the admin user manually. There is no public sign-up form.
7. Copy that user's **UID**.
8. In Firestore → **Data**, create a collection named `admins`. Create a document with the exact UID as its document ID and a boolean field `enabled: true`.
9. In Firebase Console → Project settings → Service accounts, generate a private key for a service account. Add the complete JSON contents as the Netlify environment variable `FIREBASE_SERVICE_ACCOUNT_JSON` (Functions scope). This is required for **new submissions**, not for public edits. Never commit this JSON to GitHub or place it in `firebase-config.js`.
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

### Open public editing

Every project card has an **Edit** button. Selecting it loads that entry into the form; save to update the existing Firestore document. No private link, edit token, account, or authentication is required for student edits. The Firestore rules intentionally permit any visitor to update the public fields (name, project title, subtitle, and datasets). This means edits are not restricted to the original submitter: anyone can change or overwrite any entry. Use this mode only if the cohort accepts fully open collaboration. Admin deletion and the admin panel remain protected by Firebase Authentication.

Existing private edit-token records are no longer used and can be left in Firestore.

## Project numbers and existing records

New submissions allocate a sequential integer using a Firestore transaction and the `counters/projectSequence` document. This prevents two concurrent submissions from receiving the same number. The underlying random Firestore document ID is not shown to users.

Legacy project documents are retained. When an authorized admin opens the admin panel, it assigns permanent integer numbers to any legacy documents that do not yet have one and updates the sequence counter. Until that migration has run, legacy entries are shown with a temporary list number. Names from older documents are displayed when available; otherwise the page shows “Name not available”.

## Similarity method

- **Title/domain (80%)**: cosine similarity over normalized word-frequency vectors after basic token cleanup and stop-word removal.
- **Datasets (20%)**: Jaccard similarity over normalized dataset-name tokens.
- **Overall**: `0.8 × titleSimilarity + 0.2 × datasetSimilarity`.

The threshold is a practical display setting, not a validated academic cutoff. Similarity can miss semantic overlap when different wording is used; students and supervisors should review close matches.

## Optional open-source LLM judge

An optional Netlify Function provides a second-stage semantic title review using Groq's `openai/gpt-oss-120b` model.

To enable it, create a Groq API key, add it to Netlify as the `GROQ_API_KEY` environment variable (Functions scope), and redeploy. The function first requests ordinary JSON and validates the result; if parsing fails, it retries once using Groq JSON mode. The AI judge is a screening aid, not proof that two projects are duplicates.

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

**`admins/{uid}`**
- `enabled`: boolean

**`counters/projectSequence`**
- `value`: integer

## Security note

Project reads and student edits are public. Anyone can update the public project fields (student name, project title, subtitle, and datasets) directly from the Edit button; no unique edit link, account, or service-account key is required for editing. New project submissions still use the Netlify Function and require `FIREBASE_SERVICE_ACCOUNT_JSON`. Keep that service-account JSON private. Because editing and submissions are open to visitors, consider adding rate limiting, moderation, or CAPTCHA if spam or unwanted changes become an issue.
