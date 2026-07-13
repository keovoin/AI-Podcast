export interface DialogueDelivery {
  emotion: string;
  pace: 'slow' | 'normal' | 'fast';
  pause_after_ms: number;
}

export interface DialogueTurnSchema {
  id: string;
  speaker_id: string;
  text: string;
  delivery: DialogueDelivery;
  source_fact_ids: string[];
  estimated_seconds: number;
}

export interface EpisodeDialogue {
  episode: {
    title: string;
    language: string;
    target_duration_seconds: number;
  };
  turns: DialogueTurnSchema[];
}

export interface OutlineSegment {
  id: string;
  title: string;
  duration_seconds: number;
  lead_speaker_id: string;
  questions: string[];
  locked: boolean;
}

export interface EpisodeOutlineSchema {
  segments: OutlineSegment[];
  total_duration_seconds: number;
}
