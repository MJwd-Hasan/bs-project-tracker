# BSc Project Tracker 29

A shared project directory for the BSc Project Tracker 29 cohort. Students sign in with a verified Google account ending in @isrt.ac.bd, then submit a project title/domain and dataset(s). Everyone can view entries; only the submitting account can edit its own project.

## Features
- Submission fields: **Project Domain / Title** and **Dataset(s)**. The verified institutional email is attached automatically and displayed on the card.
- Each project is tied to its submitter's Firebase Authentication UID and verified institutional email. Only that Google account can edit the project; all entries remain publicly viewable.
- Project submissions are created by a Netlify Function that verifies the caller's Firebase ID token. Student edits are saved directly to Firestore under owner-checked security rules.
- Each entry receives a simple sequential integer Project Number (for example, **Project #12**); the Firestore document key remains internal.
- Similarity score: **80% title/domain word similarity + 20% dataset similarity**.
- Related projects are grouped at a 25% pairwise similarity threshold. This is a screening indicator, not proof of duplication.
- Firebase Email/Password authentication protects the admin panel.
- Admins can delete entries and the admin panel automatically assigns permanent integer numbers to legacy entries.

## Firebase setup and required update

The Firebase web configuration is in `firebase-config.js`. It identifies the Firebase project and is intended for browser use; never put service-account private keys in this file or commit them to GitHub.

1. Open [Firebase Console](https://console.firebase.google.com/) and select **bsc-project-tracker-29**.
2. Ensure **Cloud Firestore** is enabled.
3. In Firestore → **Rules**, publish the complete contents of this repository's `firestore.rules`. Project reads are public, student edits require the owner's verified institutional Google identity, and new submissions go through the Netlify Function.
4. In Authentication → **Sign-in method**, enable **Google** for student sign-in and **Email/Password** for the existing admin panel.
5. In Authentication → **Settings** → **Authorized domains**, ensure `project-tracker29.netlify.app` is listed. Add it if missing.
6. In Authentication → **Users**, create the admin user manually. There is no public sign-up form.
7. Copy that user's **UID**.
8. In Firestore → **Data**, create a collection named `admins`. Create a document with the exact UID as its document ID and a boolean field `enabled: true`.
9. In Firebase Console → Project settings → Service accounts, generate a private key for a service account. Add the complete JSON contents as the Netlify environment variable `FIREBASE_SERVICE_ACCOUNT_JSON` (Functions scope). This is required for **new submissions**. Never commit this JSON to GitHub or place it in `firebase-config.js`.
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

### Institutional student access and ownership

The public directory is readable without signing in. To submit or edit, students must use **Continue with Google** with a verified Google account ending in `@isrt.ac.bd`. The hosted-domain parameter is only a Google sign-in hint; the Netlify function and Firestore Security Rules enforce the actual domain restriction.

Each new project stores `ownerUid` and `ownerEmail`. The email is displayed automatically on the public card. The Edit button is shown only when the signed-in Firebase UID matches the project's `ownerUid`; Firestore rules independently enforce the same ownership check. Students can see every project but cannot edit another student's entry.

**Legacy entries:** projects created before institutional sign-in do not have a verified owner UID/email. They remain visible but are not editable by students under the new ownership rules. The student should contact the administrator to arrange a one-time ownership migration, or submit a new entry. Ownership cannot safely be inferred from an old display name.



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
- `projectTitle`: string
- `datasets`: string
- `ownerUid`: Firebase Authentication UID of the submitting student
- `ownerEmail`: verified `@isrt.ac.bd` email displayed publicly
- `projectNumber`: integer
- `createdAt`: server timestamp

**`admins/{uid}`**
- `enabled`: boolean

**`counters/projectSequence`**
- `value`: integer

## Security note

Project reads are public. Student submissions require a verified Google identity on the @isrt.ac.bd domain, and Firestore rules restrict edits to the matching owner UID. The Netlify submission function requires FIREBASE_SERVICE_ACCOUNT_JSON; keep it private and never commit it.
