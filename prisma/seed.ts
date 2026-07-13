/**
 * Database seed script for development/demo.
 * Creates default user, mock providers, and sample project.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create default user
  const user = await prisma.user.upsert({
    where: { email: 'demo@ai-podcast.local' },
    update: {},
    create: {
      id: 'default-user',
      email: 'demo@ai-podcast.local',
      name: 'Demo User',
      role: 'ADMIN',
    },
  });
  console.log(`Created user: ${user.email}`);

  // Create mock LLM provider
  const mockLlm = await prisma.provider.upsert({
    where: { id: 'mock-llm-provider' },
    update: {},
    create: {
      id: 'mock-llm-provider',
      userId: user.id,
      name: 'Mock LLM (Testing)',
      category: 'LLM',
      adapterType: 'MOCK',
      model: 'mock-gpt-4',
      authType: 'NONE',
      timeoutMs: 30000,
      enabled: true,
      priority: 80,
      costMetadata: { costPerRequest: 0.001, currency: 'USD' },
      allowSensitive: true,
    },
  });

  await prisma.providerHealth.upsert({
    where: { providerId: mockLlm.id },
    update: {},
    create: {
      providerId: mockLlm.id,
      status: 'HEALTHY',
      lastChecked: new Date(),
      lastLatencyMs: 100,
      avgLatencyMs: 100,
      successRate: 1.0,
      totalRequests: 100,
      failedRequests: 0,
    },
  });

  await prisma.providerCapability.upsert({
    where: { providerId_capability: { providerId: mockLlm.id, capability: 'text-generation' } },
    update: {},
    create: {
      providerId: mockLlm.id,
      capability: 'text-generation',
      languages: ['km-KH', 'en-US'],
    },
  });

  console.log(`Created provider: ${mockLlm.name}`);

  // Create mock TTS provider
  const mockTts = await prisma.provider.upsert({
    where: { id: 'mock-tts-provider' },
    update: {},
    create: {
      id: 'mock-tts-provider',
      userId: user.id,
      name: 'Mock TTS (Testing)',
      category: 'TTS',
      adapterType: 'MOCK',
      authType: 'NONE',
      timeoutMs: 30000,
      enabled: true,
      priority: 80,
      voiceIds: ['mock-km-male-1', 'mock-km-female-1', 'mock-en-male-1', 'mock-en-female-1'],
      costMetadata: { costPerRequest: 0.0005, currency: 'USD' },
      allowSensitive: true,
    },
  });

  await prisma.providerHealth.upsert({
    where: { providerId: mockTts.id },
    update: {},
    create: {
      providerId: mockTts.id,
      status: 'HEALTHY',
      lastChecked: new Date(),
      lastLatencyMs: 50,
      avgLatencyMs: 50,
      successRate: 1.0,
      totalRequests: 200,
      failedRequests: 0,
    },
  });

  await prisma.providerCapability.upsert({
    where: { providerId_capability: { providerId: mockTts.id, capability: 'speech-synthesis' } },
    update: {},
    create: {
      providerId: mockTts.id,
      capability: 'speech-synthesis',
      languages: ['km-KH', 'en-US'],
      voiceCount: 4,
    },
  });

  console.log(`Created provider: ${mockTts.name}`);

  // Create sample speakers
  const speaker1 = await prisma.speaker.upsert({
    where: { id: 'speaker-host' },
    update: {},
    create: {
      id: 'speaker-host',
      userId: user.id,
      name: 'Piseth',
      role: 'Host',
      personality: 'Curious, friendly, asks insightful questions',
      voiceId: 'mock-km-male-1',
      formality: 40,
      energy: 60,
      humor: 30,
      assertiveness: 50,
    },
  });

  const speaker2 = await prisma.speaker.upsert({
    where: { id: 'speaker-guest' },
    update: {},
    create: {
      id: 'speaker-guest',
      userId: user.id,
      name: 'Sreymom',
      role: 'Expert Guest',
      personality: 'Knowledgeable, thoughtful, explains clearly',
      voiceId: 'mock-km-female-1',
      formality: 50,
      energy: 50,
      humor: 20,
      assertiveness: 60,
    },
  });

  console.log(`Created speakers: ${speaker1.name}, ${speaker2.name}`);

  // Create sample project
  const project = await prisma.project.upsert({
    where: { id: 'sample-project' },
    update: {},
    create: {
      id: 'sample-project',
      userId: user.id,
      title: 'AI in Cambodia',
      topic: 'The growing AI ecosystem in Cambodia',
      objective: 'Educate listeners about AI adoption in Cambodia',
      audience: 'Cambodian tech professionals',
      language: 'km',
      targetDuration: 300,
      style: 'conversational',
      routingMode: 'AUTO',
      status: 'DRAFT',
    },
  });

  // Link speakers to project
  await prisma.projectSpeaker.upsert({
    where: { projectId_speakerId: { projectId: project.id, speakerId: speaker1.id } },
    update: {},
    create: {
      projectId: project.id,
      speakerId: speaker1.id,
      speakingShare: 0.45,
      reactions: true,
      interruptions: false,
    },
  });

  await prisma.projectSpeaker.upsert({
    where: { projectId_speakerId: { projectId: project.id, speakerId: speaker2.id } },
    update: {},
    create: {
      projectId: project.id,
      speakerId: speaker2.id,
      speakingShare: 0.55,
      reactions: true,
      interruptions: false,
    },
  });

  console.log(`Created project: ${project.title}`);
  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
