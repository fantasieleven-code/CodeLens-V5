import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RadarSection } from './RadarSection.js';
import { sPlusArchitectFixture } from '../__fixtures__/index.js';

describe('<RadarSection />', () => {
  it('renders the radar heading + wrapper', () => {
    render(<RadarSection viewModel={sPlusArchitectFixture} />);
    const root = screen.getByTestId('radar-section');
    expect(root).toBeInTheDocument();
    expect(root).toHaveTextContent('六维度雷达');
  });

  it('mounts exactly one SVG chart', () => {
    const { container } = render(<RadarSection viewModel={sPlusArchitectFixture} />);
    expect(container.querySelectorAll('svg').length).toBe(1);
  });
});
