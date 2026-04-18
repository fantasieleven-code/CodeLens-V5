import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MDHeroSection } from './MDHeroSection.js';
import { sPlusArchitectFixture, aFullStackBoundaryFixture } from '../__fixtures__/index.js';

describe('<MDHeroSection />', () => {
  it('renders submodules, interfaces, constraints and orchestration prompts for the architect fixture', () => {
    render(<MDHeroSection viewModel={sPlusArchitectFixture} />);
    const root = screen.getByTestId('md-hero-section');
    expect(root).toHaveTextContent('模块 D · 系统设计');
    expect(screen.getByTestId('md-submodules')).toBeInTheDocument();
    expect(screen.getByTestId('md-interfaces')).toBeInTheDocument();
    expect(screen.getByTestId('md-orchestration')).toBeInTheDocument();
  });

  it('returns null when moduleD submission is missing (full_stack suite)', () => {
    // full_stack fixture has no moduleD — confirms the guard.
    const { container } = render(<MDHeroSection viewModel={aFullStackBoundaryFixture} />);
    expect(container.firstChild).toBeNull();
  });
});
