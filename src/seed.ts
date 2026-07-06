import { googleAI } from '@genkit-ai/google-genai';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { genkit } from 'genkit';

const app = initializeApp({
  credential: applicationDefault(),
  projectId: 'ragapprn-7c39d',
});
const firestore = getFirestore(app);
const ai = genkit({ plugins: [googleAI()] });

const policyChunks: string[] = [
  'Employees are entitled to 20 days of paid annual leave per calendar year, accrued monthly. Unused leave can be carried over up to 5 days into the next year.',
  'The standard work week is 40 hours, Monday through Friday, 9am to 5pm local time. Remote work is permitted up to 2 days per week with manager approval.',
  'All new hires must complete security and compliance training within their first 30 days via the internal LMS portal.',
  'Employees who are unwell should notify their manager before 9am and are entitled to 10 paid sick days per year.',
];

// Deletes every existing document in office_policies so re-running seed()
// doesn't pile up duplicates from previous runs.
async function clearCollection() {
  const snapshot = await firestore.collection('office_policies').get();

  if (snapshot.empty) {
    console.log('office_policies is already empty, nothing to clear.');
    return;
  }

  const batch = firestore.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();

  console.log(`Cleared ${snapshot.size} existing document(s) from office_policies.`);
}

async function seed() {
  await clearCollection();

  for (const text of policyChunks) {
    const [{ embedding }] = await ai.embed({
      embedder: googleAI.embedder('gemini-embedding-001'),
      content: text,
      options: { outputDimensionality: 768 },
    });

    await firestore.collection('office_policies').add({
      text,
      embedding: FieldValue.vector(embedding),
    });
  }

  console.log(`Seeded ${policyChunks.length} policy chunks into office_policies.`);
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});