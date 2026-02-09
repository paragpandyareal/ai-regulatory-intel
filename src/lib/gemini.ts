import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export const geminiFlash = genAI.getGenerativeModel({ 
  model: 'gemini-1.5-flash',
  generationConfig: {
    temperature: 0.1, // Low temp for consistent, factual outputs
  },
});

export const geminiEmbedding = genAI.getGenerativeModel({ 
  model: 'text-embedding-004',
});

export { genAI };
