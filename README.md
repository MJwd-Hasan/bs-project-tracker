# BSc Project Tracker 29

A small public project directory for the BSc Project Tracker 29 cohort. Students can submit project details and everyone can view the shared entries.

## Fields
- Name (required)
- Class Roll (required)
- Supervisor Name (optional)
- Project Domain / Title (required)
- Dataset(s) (required)

The app is a static HTML/CSS/JavaScript site. Firebase Cloud Firestore stores entries; Netlify can host the static site. No Firebase account setup or Netlify deployment has been performed.

## 1. Create a free Firebase project
1. Open https://console.firebase.google.com/ and sign in.
2. Select **Add project** and create a project, for example bsc-project-tracker-29. Google Analytics is not required.
3. In Project Overview, click **Add app** and choose the Web icon (</>).
4. Give it a nickname such as BSc Project Tracker 29 Web and register the app. Firebase Hosting is not needed.
5. Firebase displays a web config object with apiKey, authDomain, projectId, storageBucket, messagingSenderId, and appId. Copy these values.

## 2. Enable Cloud Firestore
1. In Firebase Console, open **Build → Firestore Database**.
2. Click **Create database** and choose **Production mode**.
3. Choose a database location near your users; this choice cannot easily be changed later.
4. Once created, open the **Rules** tab.
5. Replace the rules with the complete contents of this repository's firestore.rules file, then click **Publish**.

The rules allow anyone to read project entries and submit a new entry, but do not allow editing or deleting existing entries. This is intentionally a public, no-login tracker. Anyone with access can submit data, so it is not spam-proof. Consider adding authentication or App Check if abuse becomes an issue.

## 3. Add Firebase config
Open firebase-config.js in GitHub and replace each placeholder with the matching value from the Firebase Web app config.

Use your own values in this structure:
    export const firebaseConfig = {
      apiKey: "AIza...",
      authDomain: "your-project.firebaseapp.com",
      projectId: "your-project",
      storageBucket: "your-project.firebasestorage.app",
      messagingSenderId: "123456789",
      appId: "1:123456789:web:abcdef"
    };

These are browser configuration values, not a service-account private key. Never put a Firebase service-account JSON file or private key in this public repository.

## 4. Deploy with Netlify manually
1. Sign in at https://www.netlify.com/.
2. Choose **Add new project → Import an existing project**.
3. Connect GitHub and select MJwd-Hasan/bs-project-tracker.
4. Select the main branch. The included netlify.toml publishes the repository root; no build command is needed.
5. Deploy. Netlify will provide a public URL.

Netlify can redeploy automatically when changes are pushed to main.

## 5. Test
1. Open the Netlify URL and submit a test entry.
2. Open the same URL in another browser or private window; the entry should appear there too.
3. If entries do not load, check the browser console, Firebase config values, and published Firestore rules.

## Firestore data structure
Collection: projects

| Field | Type |
|---|---|
| name | string |
| classRoll | string |
| supervisor | string |
| projectTitle | string |
| datasets | string |
| createdAt | server timestamp |

The app listens to the collection in real time, newest submissions first.

## Cost
Firebase offers no-cost quotas, but availability and limits depend on the product, region, and current plan. Check https://firebase.google.com/pricing and consider setting a budget alert in Google Cloud. This app uses Firestore only and does not require paid Firebase Hosting.
