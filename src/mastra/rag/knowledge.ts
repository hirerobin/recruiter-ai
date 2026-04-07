import { createVectorQueryTool } from '@mastra/rag'
import { openai } from '@ai-sdk/openai'

export const INDEX_NAME = 'job_embeddings'
export const EMBEDDING_MODEL = openai.embedding('text-embedding-3-small')
export const EMBEDDING_DIMENSION = 1536

/**
 * RAG tool used by the recruiter agent to query the job knowledge base.
 * Registered against the 'pgVector' store defined in src/mastra/index.ts.
 */
export const jobQueryTool = createVectorQueryTool({
  vectorStoreName: 'pgVector',
  indexName: INDEX_NAME,
  model: EMBEDDING_MODEL,
  includeSources: true,
  description:
    'Search the job knowledge base for relevant job listings, requirements, benefits, and recruiter contacts. Use this for any candidate question about available jobs.',
})
