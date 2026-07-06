# RAG HR Chatbot — Backend

A Retrieval-Augmented Generation (RAG) backend for an HR/Onboarding chatbot, built with **Firebase Cloud Functions**, **Google Genkit**, and **Firestore vector search**.

Given a natural-language question (e.g. *"How many sick days do I get?"*), this backend:
1. Embeds the question into a vector using Google's `gemini-embedding-001` model
2. Runs a vector similarity search against a Firestore collection of company policies
3. Feeds the most relevant policy text to `gemini-flash-latest` as context
4. Returns a grounded, hallucination-resistant answer

## Tech stack

- **Firebase Cloud Functions** (TypeScript) — hosts the callable API
- **Genkit** (`@genkit-ai/google-genai`, `@genkit-ai/firebase`) — orchestrates retrieval + generation
- **Cloud Firestore** — stores policy text + vector embeddings, with a vector index for similarity search
- **Gemini API** — `gemini-embedding-001` (embeddings) and `gemini-flash-latest` (chat)

## Project structure

```
functions/
├── src/
│   ├── index.ts   # Defines askOfficeBotFlow + exports askOfficeBot (callable function)
│   └── seed.ts    # One-time/local script to embed & upload policy text into Firestore
├── .secret.local  # (gitignored) local Gemini API key for the emulator — you must create this
└── firebase.json  # Emulator configuration
```

## Prerequisites

- Node.js (v20+)
- [Firebase CLI](https://firebase.google.com/docs/cli): `npm install -g firebase-tools`
- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) (`gcloud`)
- A Firebase project with **Firestore** enabled (Production mode)
- A [Gemini API key](https://aistudio.google.com/apikey)

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Authenticate with Google Cloud** (two separate logins are needed — one for your code, one for the CLI tool)
   ```bash
   gcloud auth application-default login
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   gcloud auth application-default set-quota-project YOUR_PROJECT_ID
   ```

3. **Create the Firestore vector index** (required for similarity search)
   ```bash
   gcloud firestore indexes composite create --project=YOUR_PROJECT_ID \
     --collection-group=office_policies --query-scope=COLLECTION \
     --field-config=vector-config='{"dimension":"768","flat": "{}"}',field-path=embedding
   ```
   Check status with: `gcloud firestore indexes composite list --project=YOUR_PROJECT_ID`

4. **Set your Gemini API key locally** — create a file named `.secret.local` in this folder (already gitignored):
   ```
   GEMINI_API_KEY=your-real-key-here
   ```

5. **Update the hardcoded project ID** in `src/index.ts` and `src/seed.ts` (`initializeApp({ projectId: '...' })`) to match your own Firebase project.

## Seeding policy data

Edit the `policyChunks` array in `src/seed.ts` with your real HR policy text (one topic/paragraph per entry), then run:

```bash
npm run build
npx tsx src/seed.ts
```

This clears any existing documents in `office_policies` and re-embeds + uploads the new list — safe to re-run anytime you update policy text.

## Running locally (Functions Emulator)

```bash
npm run build
firebase emulators:start --only functions
```

Your function will be available at:
```
http://127.0.0.1:5001/YOUR_PROJECT_ID/us-central1/askOfficeBot
```

This uses your **real, production Firestore data** (not a local emulated database) — only the function execution itself is emulated, so no Blaze plan is required for local development.

## Testing without a frontend

You can also test the flow directly using the Genkit Developer UI:

```bash
export GEMINI_API_KEY="your-real-key-here"
genkit start -- npx tsx --watch src/index.ts
```

Then open `http://localhost:4000`, go to **Flows → askOfficeBotFlow**, and run it with:
```json
{ "question": "How many sick days do I get?" }
```

## Known issue: intermittent "socket hang up"

Occasionally, the Functions Emulator's first request after startup (or an intermittent later one) may hang for ~60 seconds and fail with `Error: socket hang up`. This is a documented flakiness in the underlying Google Auth token-refresh call, not a bug in this code. **Fix:** stop the emulator (`Ctrl+C`) and restart it — this reliably resolves it.

## Deploying to production

Deployment requires upgrading your Firebase project to the **Blaze (pay-as-you-go)** plan (needed for both Cloud Functions deployment and Secret Manager). Once upgraded:

```bash
firebase functions:secrets:set GEMINI_API_KEY
firebase deploy --only functions
```

⚠️ Before deploying publicly, add authentication/App Check to `onCallGenkit` in `index.ts` — the current version has no request verification and should not be exposed publicly as-is.

## Related repo

The React Native frontend that consumes this backend lives at: https://github.com/amanLRays/RagHrChatbotApp
