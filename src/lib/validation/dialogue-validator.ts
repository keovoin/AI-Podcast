/**
 * Comprehensive dialogue validation engine.
 * Checks schema conformance, repetition, duration, speaker consistency,
 * and fact-ID references before audio generation.
 */

export interface DialogueTurn {
  id: string;
  turnIndex: number;
  speakerId: string;
  text: string;
  delivery?: {
    emotion?: string;
    pace?: string;
    pause_after_ms?: number;
  } | null;
  sourceFactIds?: string[] | null;
  estimatedSeconds?: number | null;
}

export interface ValidationIssue {
  type: 'error' | 'warning';
  category: 'schema' | 'repetition' | 'duration' | 'speaker' | 'fact' | 'quality';
  turnIndex?: number;
  turnId?: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  stats: {
    turnCount: number;
    totalEstimatedSeconds: number;
    speakerDistribution: Record<string, { turns: number; seconds: number; percentage: number }>;
    avgTurnLength: number;
    longestTurn: number;
    shortestTurn: number;
  };
}

export interface ValidationContext {
  speakerIds: string[];
  factIds: string[];
  targetDurationSeconds?: number;
  language?: string;
}

/**
 * Validate a complete dialogue for quality and correctness.
 */
export function validateDialogue(
  turns: DialogueTurn[],
  context: ValidationContext
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // Schema validation
  validateSchema(turns, context, errors, warnings);

  // Repetition detection
  validateRepetition(turns, errors, warnings);

  // Duration validation
  validateDuration(turns, context, errors, warnings);

  // Speaker consistency
  validateSpeakers(turns, context, errors, warnings);

  // Fact reference validation
  validateFacts(turns, context, errors, warnings);

  // Quality checks
  validateQuality(turns, errors, warnings);

  // Compute stats
  const stats = computeStats(turns, context);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats,
  };
}

function validateSchema(
  turns: DialogueTurn[],
  _context: ValidationContext,
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): void {
  if (turns.length < 2) {
    errors.push({
      type: 'error',
      category: 'schema',
      message: 'Dialogue must have at least 2 turns.',
    });
    return;
  }

  for (const turn of turns) {
    // Check turn ID format
    if (!turn.id || !/^turn_\d{4}$/.test(turn.id)) {
      // Not a hard error since DB-generated IDs may differ
      warnings.push({
        type: 'warning',
        category: 'schema',
        turnIndex: turn.turnIndex,
        turnId: turn.id,
        message: `Turn ID "${turn.id}" does not follow turn_NNNN format.`,
      });
    }

    // Empty text
    if (!turn.text || turn.text.trim().length === 0) {
      errors.push({
        type: 'error',
        category: 'schema',
        turnIndex: turn.turnIndex,
        turnId: turn.id,
        message: 'Turn has empty text.',
      });
    }

    // Missing speaker
    if (!turn.speakerId) {
      errors.push({
        type: 'error',
        category: 'schema',
        turnIndex: turn.turnIndex,
        turnId: turn.id,
        message: 'Turn has no speaker_id.',
      });
    }

    // Delivery check
    if (turn.delivery) {
      const validPaces = ['slow', 'normal', 'fast'];
      if (turn.delivery.pace && !validPaces.includes(turn.delivery.pace)) {
        warnings.push({
          type: 'warning',
          category: 'schema',
          turnIndex: turn.turnIndex,
          message: `Invalid pace "${turn.delivery.pace}". Expected: ${validPaces.join(', ')}`,
        });
      }
      if (turn.delivery.pause_after_ms !== undefined && turn.delivery.pause_after_ms > 5000) {
        warnings.push({
          type: 'warning',
          category: 'schema',
          turnIndex: turn.turnIndex,
          message: `Pause ${turn.delivery.pause_after_ms}ms is unusually long (>5s).`,
        });
      }
    }

    // Estimated seconds
    if (!turn.estimatedSeconds || turn.estimatedSeconds <= 0) {
      warnings.push({
        type: 'warning',
        category: 'schema',
        turnIndex: turn.turnIndex,
        message: 'Turn has no estimated duration.',
      });
    }
  }
}

function validateRepetition(
  turns: DialogueTurn[],
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): void {
  // Check for consecutive identical turns
  for (let i = 1; i < turns.length; i++) {
    if (turns[i]!.text === turns[i - 1]!.text) {
      errors.push({
        type: 'error',
        category: 'repetition',
        turnIndex: i,
        message: `Turn ${i} is identical to turn ${i - 1}.`,
      });
    }
  }

  // Check for repetitive phrases across turns
  const phraseCount: Record<string, number> = {};
  const REPETITION_THRESHOLD = 3;

  for (const turn of turns) {
    // Extract 4-word phrases
    const words = turn.text.toLowerCase().split(/\s+/);
    for (let i = 0; i <= words.length - 4; i++) {
      const phrase = words.slice(i, i + 4).join(' ');
      phraseCount[phrase] = (phraseCount[phrase] || 0) + 1;
    }
  }

  const repeatedPhrases = Object.entries(phraseCount)
    .filter(([_, count]) => count >= REPETITION_THRESHOLD)
    .map(([phrase, count]) => ({ phrase, count }));

  if (repeatedPhrases.length > 0) {
    warnings.push({
      type: 'warning',
      category: 'repetition',
      message: `Repetitive phrases detected: ${repeatedPhrases.slice(0, 3).map((p) => `"${p.phrase}" (${p.count}x)`).join(', ')}`,
    });
  }

  // Check for "That's a great point" / agreement spam
  const agreementPhrases = [
    'great point',
    'good point',
    'absolutely',
    'exactly right',
    'i completely agree',
    'that\'s so true',
  ];

  let agreementCount = 0;
  for (const turn of turns) {
    const lower = turn.text.toLowerCase();
    if (agreementPhrases.some((p) => lower.includes(p))) {
      agreementCount++;
    }
  }

  if (agreementCount > turns.length * 0.3) {
    warnings.push({
      type: 'warning',
      category: 'repetition',
      message: `Excessive agreement detected (${agreementCount}/${turns.length} turns). Natural conversation includes disagreement.`,
    });
  }
}

function validateDuration(
  turns: DialogueTurn[],
  context: ValidationContext,
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): void {
  const totalSeconds = turns.reduce((sum, t) => sum + (t.estimatedSeconds || 0), 0);

  if (context.targetDurationSeconds) {
    const tolerance = 0.3; // 30% tolerance
    const minDuration = context.targetDurationSeconds * (1 - tolerance);
    const maxDuration = context.targetDurationSeconds * (1 + tolerance);

    if (totalSeconds < minDuration) {
      warnings.push({
        type: 'warning',
        category: 'duration',
        message: `Estimated duration (${Math.round(totalSeconds)}s) is significantly shorter than target (${context.targetDurationSeconds}s).`,
      });
    }

    if (totalSeconds > maxDuration) {
      warnings.push({
        type: 'warning',
        category: 'duration',
        message: `Estimated duration (${Math.round(totalSeconds)}s) significantly exceeds target (${context.targetDurationSeconds}s).`,
      });
    }
  }

  // Check for unusually long turns
  for (const turn of turns) {
    if (turn.estimatedSeconds && turn.estimatedSeconds > 60) {
      warnings.push({
        type: 'warning',
        category: 'duration',
        turnIndex: turn.turnIndex,
        message: `Turn is ${Math.round(turn.estimatedSeconds)}s long. Consider splitting for natural pacing.`,
      });
    }
  }

  // Check for uniform turn lengths (unnatural)
  const lengths = turns.map((t) => t.estimatedSeconds || 0).filter((l) => l > 0);
  if (lengths.length > 4) {
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((sum, l) => sum + Math.pow(l - avg, 2), 0) / lengths.length;
    const stdDev = Math.sqrt(variance);
    const coeffOfVariation = stdDev / avg;

    if (coeffOfVariation < 0.15) {
      warnings.push({
        type: 'warning',
        category: 'duration',
        message: `Turn lengths are too uniform (CV: ${(coeffOfVariation * 100).toFixed(0)}%). Natural conversation has varied response lengths.`,
      });
    }
  }
}

function validateSpeakers(
  turns: DialogueTurn[],
  context: ValidationContext,
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): void {
  // Check all speaker IDs are valid
  for (const turn of turns) {
    if (turn.speakerId && !context.speakerIds.includes(turn.speakerId)) {
      errors.push({
        type: 'error',
        category: 'speaker',
        turnIndex: turn.turnIndex,
        message: `Unknown speaker_id "${turn.speakerId}". Valid IDs: ${context.speakerIds.join(', ')}`,
      });
    }
  }

  // Check speaker distribution
  const speakerTurns: Record<string, number> = {};
  for (const turn of turns) {
    speakerTurns[turn.speakerId] = (speakerTurns[turn.speakerId] || 0) + 1;
  }

  // Verify all speakers participate
  for (const id of context.speakerIds) {
    if (!speakerTurns[id]) {
      warnings.push({
        type: 'warning',
        category: 'speaker',
        message: `Speaker "${id}" has no turns in the dialogue.`,
      });
    }
  }

  // Check for one speaker dominating excessively
  const totalTurns = turns.length;
  for (const [speakerId, count] of Object.entries(speakerTurns)) {
    const ratio = count / totalTurns;
    if (ratio > 0.8 && context.speakerIds.length > 1) {
      warnings.push({
        type: 'warning',
        category: 'speaker',
        message: `Speaker "${speakerId}" dominates with ${Math.round(ratio * 100)}% of turns. Consider rebalancing.`,
      });
    }
  }

  // Check for same speaker speaking twice in a row (rare but can happen)
  let consecutiveCount = 0;
  for (let i = 1; i < turns.length; i++) {
    if (turns[i]!.speakerId === turns[i - 1]!.speakerId) {
      consecutiveCount++;
    }
  }
  // Allow some consecutive turns (reactions) but flag if excessive
  if (consecutiveCount > turns.length * 0.2) {
    warnings.push({
      type: 'warning',
      category: 'speaker',
      message: `${consecutiveCount} consecutive same-speaker turns detected. Ensure natural back-and-forth.`,
    });
  }
}

function validateFacts(
  turns: DialogueTurn[],
  context: ValidationContext,
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): void {
  if (context.factIds.length === 0) {
    // No facts available - ensure no turns reference non-existent facts
    for (const turn of turns) {
      const factRefs = (turn.sourceFactIds as string[] | null) || [];
      if (factRefs.length > 0) {
        errors.push({
          type: 'error',
          category: 'fact',
          turnIndex: turn.turnIndex,
          message: `Turn references facts ${factRefs.join(', ')} but no approved facts exist.`,
        });
      }
    }
    return;
  }

  // Validate all referenced fact IDs exist
  for (const turn of turns) {
    const factRefs = (turn.sourceFactIds as string[] | null) || [];
    for (const factId of factRefs) {
      if (!context.factIds.includes(factId)) {
        errors.push({
          type: 'error',
          category: 'fact',
          turnIndex: turn.turnIndex,
          message: `References non-existent fact "${factId}".`,
        });
      }
    }
  }

  // Warn if facts are available but never referenced
  const allRefs = new Set(
    turns.flatMap((t) => (t.sourceFactIds as string[] | null) || [])
  );
  const unusedFacts = context.factIds.filter((id) => !allRefs.has(id));
  if (unusedFacts.length > 0 && unusedFacts.length < context.factIds.length) {
    warnings.push({
      type: 'warning',
      category: 'fact',
      message: `${unusedFacts.length} approved facts are not referenced in the dialogue.`,
    });
  }
}

function validateQuality(
  turns: DialogueTurn[],
  _errors: ValidationIssue[],
  warnings: ValidationIssue[]
): void {
  // Check for filler-heavy turns
  const fillerPatterns = [/^(um|uh|well|so|like|you know)\b/i, /\b(um|uh)\b/gi];
  let fillerTurns = 0;
  for (const turn of turns) {
    for (const pattern of fillerPatterns) {
      if (pattern.test(turn.text)) {
        fillerTurns++;
        break;
      }
    }
  }
  if (fillerTurns > turns.length * 0.4) {
    warnings.push({
      type: 'warning',
      category: 'quality',
      message: `Excessive filler words in ${fillerTurns}/${turns.length} turns.`,
    });
  }

  // Check for all-caps (SHOUTING)
  for (const turn of turns) {
    if (turn.text.length > 20 && turn.text === turn.text.toUpperCase()) {
      warnings.push({
        type: 'warning',
        category: 'quality',
        turnIndex: turn.turnIndex,
        message: 'Turn text is all uppercase (shouting). Consider natural casing.',
      });
    }
  }

  // Check minimum substantive content
  for (const turn of turns) {
    if (turn.text.trim().split(/\s+/).length < 2) {
      warnings.push({
        type: 'warning',
        category: 'quality',
        turnIndex: turn.turnIndex,
        message: 'Turn has very little content (< 2 words). May sound unnatural.',
      });
    }
  }
}

function computeStats(
  turns: DialogueTurn[],
  context: ValidationContext
): ValidationResult['stats'] {
  const totalSeconds = turns.reduce((sum, t) => sum + (t.estimatedSeconds || 0), 0);
  const lengths = turns.map((t) => t.estimatedSeconds || 0);

  const speakerDistribution: Record<string, { turns: number; seconds: number; percentage: number }> = {};
  for (const id of context.speakerIds) {
    const speakerTurns = turns.filter((t) => t.speakerId === id);
    const speakerSeconds = speakerTurns.reduce((sum, t) => sum + (t.estimatedSeconds || 0), 0);
    speakerDistribution[id] = {
      turns: speakerTurns.length,
      seconds: Math.round(speakerSeconds * 10) / 10,
      percentage: totalSeconds > 0 ? Math.round((speakerSeconds / totalSeconds) * 100) : 0,
    };
  }

  return {
    turnCount: turns.length,
    totalEstimatedSeconds: Math.round(totalSeconds * 10) / 10,
    speakerDistribution,
    avgTurnLength: lengths.length > 0 ? Math.round((totalSeconds / lengths.length) * 10) / 10 : 0,
    longestTurn: lengths.length > 0 ? Math.max(...lengths) : 0,
    shortestTurn: lengths.filter((l) => l > 0).length > 0 ? Math.min(...lengths.filter((l) => l > 0)) : 0,
  };
}
