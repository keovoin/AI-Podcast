import type { LLMAdapter, TTSAdapter } from './adapters';
import { MockLLMAdapter } from './adapters/mock-llm';
import { MockTTSAdapter } from './adapters/mock-tts';
import { OpenAICompatibleLLMAdapter } from './adapters/openai-compatible-llm';
import { CustomRestLLMAdapter } from './adapters/custom-rest-llm';
import { AzureSpeechTTSAdapter } from './adapters/azure-speech-tts';
import { CustomRestTTSAdapter } from './adapters/custom-rest-tts';
import type { AdapterType } from '@/types/provider';

/**
 * Provider adapter registry.
 * Maps adapter types to their implementations.
 * Extension point for adding new adapters (Kiri TTS, CAMB.AI, Google TTS, OpenAI TTS).
 */

// LLM adapter instances (singletons)
const llmAdapters: Record<string, LLMAdapter> = {
  OPENAI_COMPATIBLE: new OpenAICompatibleLLMAdapter(),
  CUSTOM_REST: new CustomRestLLMAdapter(),
  MOCK: new MockLLMAdapter(),
};

// TTS adapter instances (singletons)
const ttsAdapters: Record<string, TTSAdapter> = {
  AZURE_SPEECH: new AzureSpeechTTSAdapter(),
  CUSTOM_REST: new CustomRestTTSAdapter(),
  MOCK: new MockTTSAdapter(),
};

/**
 * Get an LLM adapter by type.
 */
export function getLLMAdapter(adapterType: AdapterType): LLMAdapter {
  const adapter = llmAdapters[adapterType];
  if (!adapter) {
    throw new Error(`No LLM adapter registered for type: ${adapterType}`);
  }
  return adapter;
}

/**
 * Get a TTS adapter by type.
 */
export function getTTSAdapter(adapterType: AdapterType): TTSAdapter {
  const adapter = ttsAdapters[adapterType];
  if (!adapter) {
    throw new Error(`No TTS adapter registered for type: ${adapterType}`);
  }
  return adapter;
}

/**
 * Register a custom LLM adapter.
 * Extension point for new adapter types.
 */
export function registerLLMAdapter(type: string, adapter: LLMAdapter): void {
  llmAdapters[type] = adapter;
}

/**
 * Register a custom TTS adapter.
 * Extension point for new adapter types (Kiri TTS, CAMB.AI, Google TTS, OpenAI TTS).
 */
export function registerTTSAdapter(type: string, adapter: TTSAdapter): void {
  ttsAdapters[type] = adapter;
}

/**
 * Get all registered adapter types.
 */
export function getRegisteredAdapters(): {
  llm: string[];
  tts: string[];
} {
  return {
    llm: Object.keys(llmAdapters),
    tts: Object.keys(ttsAdapters),
  };
}

/**
 * Check if an adapter type is registered.
 */
export function isAdapterRegistered(type: string, category: 'LLM' | 'TTS'): boolean {
  if (category === 'LLM') {
    return type in llmAdapters;
  }
  return type in ttsAdapters;
}
