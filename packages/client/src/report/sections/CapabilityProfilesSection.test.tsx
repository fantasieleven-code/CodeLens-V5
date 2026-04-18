import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CapabilityProfile } from '@codelens-v5/shared';
import { CapabilityProfilesSection } from './CapabilityProfilesSection.js';
import {
  sPlusArchitectFixture,
  bFullStackDangerFixture,
} from '../__fixtures__/index.js';
import type { ReportViewModel } from '../types.js';

describe('<CapabilityProfilesSection />', () => {
  it('renders 4 autonomous profiles for S+ architect', () => {
    render(<CapabilityProfilesSection viewModel={sPlusArchitectFixture} />);
    const ids = ['independent_delivery', 'ai_collaboration', 'system_thinking', 'learning_agility'];
    for (const id of ids) {
      expect(screen.getByTestId(`capability-profile-${id}`)).toBeInTheDocument();
      expect(screen.getByTestId(`capability-profile-label-${id}`)).toHaveTextContent('自主');
    }
    expect(screen.getByTestId('capability-profile-score-independent_delivery')).toHaveTextContent('90.8');
    expect(screen.getByTestId('capability-profile-score-ai_collaboration')).toHaveTextContent('86.5');
    expect(screen.getByTestId('capability-profile-score-system_thinking')).toHaveTextContent('93.0');
    expect(screen.getByTestId('capability-profile-score-learning_agility')).toHaveTextContent('90.0');
  });

  it('renders 4 "有潜力" profiles for B dangerFlag fixture', () => {
    render(<CapabilityProfilesSection viewModel={bFullStackDangerFixture} />);
    const ids = ['independent_delivery', 'ai_collaboration', 'system_thinking', 'learning_agility'];
    for (const id of ids) {
      expect(screen.getByTestId(`capability-profile-label-${id}`)).toHaveTextContent('有潜力');
    }
  });

  it('renders a dash instead of crashing when a profile score is undefined', () => {
    // Pattern H scenario: scoring returned all-null evidence and the score
    // never resolved. The component must keep rendering the rest of the card.
    const brokenProfile = {
      ...sPlusArchitectFixture.capabilityProfiles[0],
      score: undefined,
    } as unknown as CapabilityProfile;
    const viewModel: ReportViewModel = {
      ...sPlusArchitectFixture,
      capabilityProfiles: [brokenProfile],
    };

    render(<CapabilityProfilesSection viewModel={viewModel} />);

    expect(
      screen.getByTestId(`capability-profile-score-${brokenProfile.id}`),
    ).toHaveTextContent('—');
    expect(
      screen.getByTestId(`capability-profile-${brokenProfile.id}`),
    ).toBeInTheDocument();
  });
});
