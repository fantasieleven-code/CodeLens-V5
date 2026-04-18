import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecommendationSection } from './RecommendationSection.js';
import {
  aFullStackBoundaryFixture,
  bFullStackDangerFixture,
  sPlusArchitectFixture,
} from '../__fixtures__/index.js';

describe('<RecommendationSection />', () => {
  it('renders grade-derived text without modifiers for a clean S+ decision', () => {
    render(<RecommendationSection viewModel={sPlusArchitectFixture} />);
    const text = screen.getByTestId('recommendation-text').textContent ?? '';
    expect(text).not.toContain('需人工复核');
    expect(text).not.toContain('低置信');
    expect(text.length).toBeGreaterThan(0);
  });

  it('appends "低置信,建议人工终审" when confidence is low', () => {
    render(<RecommendationSection viewModel={aFullStackBoundaryFixture} />);
    expect(screen.getByTestId('recommendation-text')).toHaveTextContent(
      /低置信/,
    );
    // blockingFactor present → renders 阻挡升级 panel below the text.
    expect(screen.getByTestId('recommendation-section').textContent).toContain(
      '阻挡升级的因素',
    );
  });

  it('appends "需人工复核" when dangerFlag is present (B fixture)', () => {
    render(<RecommendationSection viewModel={bFullStackDangerFixture} />);
    expect(screen.getByTestId('recommendation-text')).toHaveTextContent(
      /需人工复核/,
    );
  });
});
