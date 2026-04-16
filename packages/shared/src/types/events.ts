export type EventCategory =
  | 'FILE'
  | 'TERMINAL'
  | 'AI'
  | 'CHECKPOINT'
  | 'SESSION'
  | 'SIGNAL'
  | 'SYSTEM';

export interface EventLog {
  id: string;
  sessionId: string;
  category: EventCategory;
  type: string;
  payload: Record<string, unknown>;
  timestamp: Date;
}

export interface BehaviorSignal {
  id: string;
  sessionId: string;
  signalType: string;
  value: number;
  context: Record<string, unknown>;
  timestamp: Date;
}

// AR-9: Aligned with actual frontend hook signal names + legacy analysis types
export type SignalType =
  // Legacy analysis types
  | 'PASTE_FREQUENCY'
  | 'TAB_SWITCH'
  | 'TYPING_SPEED'
  | 'AI_COPY_RATIO'
  | 'EDIT_PATTERN'
  | 'IDLE_DURATION'
  // Frontend hook signals (useSignalCollector)
  | 'file_switch'
  | 'edit_burst'
  | 'paste_event'
  | 'terminal_command'
  | 'ai_query'
  | 'ai_response'
  | 'idle'
  | 'tab_hidden'
  | 'tab_visible'
  // Server-generated signals
  | 'V4_TURN_SIGNAL';
