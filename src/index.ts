import { defineFirestoreRetriever } from '@genkit-ai/firebase';
import { googleAI } from '@genkit-ai/google-genai';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onCallGenkit } from 'firebase-functions/https';
import { defineSecret } from 'firebase-functions/params';
import { genkit, z } from 'genkit';

// Secret holding your Gemini API key.
// Set it with: firebase functions:secrets:set GOOGLE_GENAI_API_KEY
const googleAIApiKey = defineSecret('GEMINI_API_KEY');

// ---------------------------------------------------------------------------
// Firebase Admin + Firestore
// ---------------------------------------------------------------------------
const app = initializeApp({ projectId: 'ragapprn-7c39d' });
const firestore = getFirestore(app);

// ---------------------------------------------------------------------------
// Genkit instance
// ---------------------------------------------------------------------------
const ai = genkit({
  plugins: [googleAI()],
  model: googleAI.model('gemini-flash-latest'),
});

// ---------------------------------------------------------------------------
// Firestore-backed retriever
// ---------------------------------------------------------------------------
const officePolicyRetriever = defineFirestoreRetriever(ai, {
  name: 'officePolicyRetriever',
  firestore,
  collection: 'office_policies',
  contentField: 'text',
  vectorField: 'embedding',
  embedder: googleAI.embedder('gemini-embedding-001', { outputDimensionality: 768 }),
  distanceMeasure: 'COSINE',
});

// ---------------------------------------------------------------------------
// Input / output schemas
// ---------------------------------------------------------------------------
const AskInputSchema = z.object({
  question: z.string().min(1, 'question cannot be empty'),
});

const AskOutputSchema = z.object({
  answer: z.string(),
  sources: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// The RAG flow
// ---------------------------------------------------------------------------
export const askOfficeBotFlow = ai.defineFlow(
  {
    name: 'askOfficeBotFlow',
    inputSchema: AskInputSchema,
    outputSchema: AskOutputSchema,
  },
  async ({ question }) => {
    const docs = await ai.retrieve({
      retriever: officePolicyRetriever,
      query: question,
      options: { limit: 5 },
    });

    if (docs.length === 0) {
      return {
        answer:
          "I couldn't find anything about that in the office policies I have access to. Please check with HR directly.",
        sources: [],
      };
    }

    const { text } = await ai.generate({
      model: googleAI.model('gemini-flash-latest'),
      prompt: `You are an HR/onboarding assistant. Answer the employee's question using ONLY the
context below. If the answer is not contained in the context, say you don't know
and suggest they contact HR directly. Do not make anything up.

Context:
${docs.map((d, i) => `[${i + 1}] ${d.text}`).join('\n\n')}

Question: ${question}`,
    });

    return {
      answer: text,
      sources: docs.map((d) => `${d.text.slice(0, 120)}...`),
    };
  },
);

// ---------------------------------------------------------------------------
// Expose the flow as a callable HTTPS Cloud Function
// ---------------------------------------------------------------------------
export const askOfficeBot = onCallGenkit(
  { secrets: [googleAIApiKey] },
  askOfficeBotFlow,
);