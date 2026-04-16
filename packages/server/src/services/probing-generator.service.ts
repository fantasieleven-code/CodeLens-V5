/**
 * Probing Question Generator (MH-2)
 *
 * Takes scoring results and generates targeted probing questions for follow-up.
 * Three probe categories:
 *   1. Weak dimension verification (score < 50)
 *   2. Ambiguous signal clarification (score 50-70, conflicting evidence)
 *   3. High-score ceiling probing (score > 80, test upper limits)
 *
 * Max 6 probes, priority-sorted.
 */

import { aiRouter } from './ai-router.service.js';
import { extractJSON } from '../lib/extract-json.js';
import { logger } from '../lib/logger.js';
import type { ScoringDimension } from '@codelens-v5/shared';

// ─── Types ───

export interface ProbeQuestion {
  dimension: ScoringDimension;
  category: 'verification' | 'clarification' | 'ceiling';
  priority: number; // 1=highest
  question: string;
  probeGoal: string;
  expectedTopics: string[];
  followupIfWeak: string;
  followupIfStrong: string;
}

interface DimensionInput {
  dimension: ScoringDimension;
  score: number;
  evidence: string[];
  rationale: string;
}

// ─── Prompts ───

const PROBE_GENERATION_PROMPT = `You are generating targeted probing questions for a follow-up technical interview.

Based on the candidate's five-dimension scores and evidence, generate focused probing questions.

Rules:
1. Weak dimensions (score < 50): Generate VERIFICATION probes to confirm the weakness
2. Ambiguous dimensions (score 50-70): Generate CLARIFICATION probes to resolve uncertainty
3. Strong dimensions (score > 80): Generate CEILING probes to test upper limits
4. Max 6 probes total, prioritized
5. Questions must reference the candidate's specific code/answers
6. Include expected answer topics and follow-up variants

Output JSON:
{
  "probes": [
    {
      "dimension": "V1-V5",
      "category": "verification|clarification|ceiling",
      "priority": 1,
      "question": "The specific probing question",
      "probe_goal": "What signal we're looking for",
      "expected_topics": ["topic1", "topic2"],
      "followup_if_weak": "What to ask if they struggle",
      "followup_if_strong": "What to ask if they do well"
    }
  ]
}`;

// ─── Service ───

class ProbingGeneratorService {
  /**
   * Generate probing questions from scoring results.
   */
  async generate(
    sessionId: string,
    dimensions: DimensionInput[],
    codeContext?: string,
  ): Promise<ProbeQuestion[]> {
    // Categorize dimensions
    const weak = dimensions.filter((d) => d.score < 50);
    const ambiguous = dimensions.filter((d) => d.score >= 50 && d.score <= 70);
    const strong = dimensions.filter((d) => d.score > 80);

    const contextParts = [
      '## Scoring Results',
      ...dimensions.map(
        (d) =>
          `### ${d.dimension} (Score: ${d.score}/100)\nEvidence: ${d.evidence.join('; ')}\nRationale: ${d.rationale}`,
      ),
      '',
      `## Analysis`,
      `Weak (need verification): ${weak.map((d) => d.dimension).join(', ') || 'None'}`,
      `Ambiguous (need clarification): ${ambiguous.map((d) => d.dimension).join(', ') || 'None'}`,
      `Strong (ceiling test): ${strong.map((d) => d.dimension).join(', ') || 'None'}`,
    ];

    if (codeContext) {
      contextParts.push('', '## Code Context', codeContext.slice(0, 3000));
    }

    contextParts.push('', 'Generate 4-6 probes. Prioritize weak dimensions, then ambiguous, then ceiling.');

    try {
      let fullResponse = '';
      const stream = aiRouter.chatStream({
        role: 'scoring',
        messages: [
          { role: 'system', content: PROBE_GENERATION_PROMPT },
          { role: 'user', content: contextParts.join('\n') },
        ],
        sessionId,
      });

      for await (const chunk of stream) {
        fullResponse += chunk.content;
      }

      const result = extractJSON<{
        probes: Array<{
          dimension: string;
          category: string;
          priority: number;
          question: string;
          probe_goal: string;
          expected_topics: string[];
          followup_if_weak: string;
          followup_if_strong: string;
        }>;
      }>(fullResponse);

      if (result.success && result.data?.probes) {
        return result.data.probes.slice(0, 6).map((p) => ({
          dimension: p.dimension as ScoringDimension,
          category: p.category as ProbeQuestion['category'],
          priority: p.priority,
          question: p.question,
          probeGoal: p.probe_goal,
          expectedTopics: p.expected_topics || [],
          followupIfWeak: p.followup_if_weak || '',
          followupIfStrong: p.followup_if_strong || '',
        }));
      }
    } catch (error) {
      logger.error('[probing-gen] Failed to generate probes:', error);
    }

    // Fallback: generate basic probes from scoring data
    return this.generateFallbackProbes(dimensions);
  }

  private generateFallbackProbes(dimensions: DimensionInput[]): ProbeQuestion[] {
    const probes: ProbeQuestion[] = [];
    const sorted = [...dimensions].sort((a, b) => a.score - b.score);

    for (const dim of sorted.slice(0, 3)) {
      const category: ProbeQuestion['category'] =
        dim.score < 50 ? 'verification' : dim.score <= 70 ? 'clarification' : 'ceiling';

      probes.push({
        dimension: dim.dimension,
        category,
        priority: probes.length + 1,
        question: this.getDefaultQuestion(dim.dimension, category),
        probeGoal: `Verify ${dim.dimension} ability`,
        expectedTopics: [],
        followupIfWeak: 'Can you walk me through a specific example?',
        followupIfStrong: 'What would you do differently at 100x scale?',
      });
    }

    return probes;
  }

  private getDefaultQuestion(dim: ScoringDimension, category: ProbeQuestion['category']): string {
    const questions: Record<string, Record<string, string>> = {
      V1: {
        verification: 'Walk me through the main data flow in this codebase. What happens when a request comes in?',
        clarification: 'You mentioned understanding the service layer. Can you explain how error handling propagates?',
        ceiling: 'If you were onboarding a new team member, how would you explain this codebase architecture?',
      },
      V2: {
        verification: 'When the AI suggested a solution, how did you decide whether to use it?',
        clarification: 'Did you notice anything unusual about the AI suggestions during the bug-fixing phase?',
        ceiling: 'What patterns do you look for when evaluating AI-generated code for correctness?',
      },
      V3: {
        verification: 'Walk me through how you designed your solution for the new feature requirement.',
        clarification: 'Why did you choose to extend rather than refactor the existing code?',
        ceiling: 'If we needed to add a similar feature next week, how would your design accommodate that?',
      },
      V4: {
        verification: 'Why did you make the architectural choices you made? What alternatives did you consider?',
        clarification: 'What trade-offs were you balancing in your implementation approach?',
        ceiling: 'If this system needed to handle 100x the traffic, what would break first?',
      },
      V5: {
        verification: 'Walk me through your debugging process step by step. What was your first hypothesis?',
        clarification: 'How did you narrow down the root cause? What tools or techniques did you use?',
        ceiling: 'If you encountered a similar bug in production with limited logging, how would your approach change?',
      },
    };

    return questions[dim]?.[category] || `Tell me more about your approach to ${dim}.`;
  }
}

export const probingGenerator = new ProbingGeneratorService();
