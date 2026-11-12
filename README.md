# BSc Project Tracker 29

A small public project directory for the BSc Project Tracker 29 cohort. Students submit a project title/domain and dataset(s); everyone can view entries and compare possible overlaps.

## Features
- Minimal submission form: Project Domain / Title and Dataset(s) only.
- A unique Project ID is generated from each Firestore document ID (format: `BSP29-<ID>`).
- Similarity score for every entry's closest match: **80% title/domain word similarity + 20% dataset similarity**.
- Related projects are grouped together at a 25% similarity threshold. The score is a screening aid, not an academic decision or proof of duplication.
- Firebase Authentication-protected admin panel for deleting entries.
- Existing records containing the old name, class-roll, and supervisor fields remain readable; those fields are no longer collected or displayed.

## Firebase setup

This repository contains the Firebase web configuration already used by the previous version in `firebase-config.js`. If you change Firebase projects, replace those values with your own Web app configuration. Browser config values are not service-account secrets; never commit service-account JSON or private keys.

1. Open [Firebase Console](https://console.firebase.google.com/) and select the project used by this app.
2. Ensure **Cloud Firestore** is enabled.
3. In Firestore → **Rules**, replace the rules with the complete contents of this repository's `firestore.rules` and click **Publish**.
4. In Firebase Console → **Authentication** → **Sign-in method**, enable **Email/Password**.
5. In Authentication → **Users**, add the admin account manually. Do not expose a public sign-up form.
6. Copy the new admin user's **UID**.
7. In Firestore → **Data**, create a collection named `admins`. Create a document whose document ID is exactly that UID, with one boolean field: `enabled: true`.
8. Open `/admin.html` on the deployed site and sign in with that admin account.

The `admins/{uid}` grant must be created by a trusted project owner in the Firebase Console. The app's client-side rules deliberately deny creating or changing admin grants. An admin can read only their own grant and can delete project documents; normal visitors can read and submit but cannot delete or edit entries.

## Similarity method

The browser calculates:
- **Title/domain (80%)**: cosine similarity over normalized word-frequency vectors after basic token cleanup and stop-word removal.
- **Datasets (20%)**: Jaccard similarity over normalized dataset-name tokens.
- **Overall score**: (0.8 × titleSimilarity + 0.2 × datasetSimilarity), shown as a percentage.

Entries connected by a pairwise score of at least 25% are placed in the same related-project group. The threshold is a practical display setting, not a validated academic cutoff. Scores can miss semantic overlap when different words are used; students and supervisors should review close matches.

## Optional open-source LLM judge

An optional Netlify Function is included for a second-stage semantic title review using Hugging Face Inference Providers and the open-weight `Qwen/Qwen2.5-7B-Instruct-1M` model. It is separate from the deterministic 80/20 score and should be treated as an additional opinion, not an authoritative plagiarism detector.

To enable it:
1. Create a Hugging Face token with **Make calls to Inference Providers** permission.
2. In Netlify → Site configuration → Environment variables, add `HF_TOKEN` with that token.
3. Redeploy the site. The token stays server-side and is never sent to visitors.
4. The app's AI-review control can then request a semantic judge for a pair of project titles.

Hugging Face Inference Providers may require credits or paid usage depending on current account/provider availability. The core project tracker and numeric similarity feature do not depend on this service.

## Deploy with Netlify manually
1. Sign in at [Netlify](https://www.netlify.com/).
2. Choose **Add new project → Import an existing project**.
3. Connect GitHub and select `MJwd-Hasan/bs-project-tracker`.
4. Select branch `main`. No build command is required; publish directory is `.`.
5. Deploy. Netlify can redeploy automatically after future pushes to `main`.

Netlify is still a manual connection; this repository update does not connect or deploy the site.

## Firestore data structure

Collection: `projects`

| Field | Type |
|---|---|
| projectTitle | string |
| datasets | string |
| createdAt | server timestamp |

Old documents with `name`, `classRoll`, and `supervisor` fields are retained and ignored by the new interface. No migration or deletion of existing project documents is performed.

## Cost and security notes
- Firestore reads/submissions remain public; unrestricted public submissions can be spammed. Consider Firebase App Check or an authenticated submission workflow if abuse occurs.
- Only a Firebase account with an explicitly granted `admins/{uid}` document can delete entries.
- Hugging Face inference is optional and may not be free or always available. The main similarity score is computed locally in the browser.
