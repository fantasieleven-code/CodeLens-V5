import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Phase0Page } from './Phase0Page.js';
import { useModuleStore } from '../stores/module.store.js';

const ORDER = ['phase0', 'moduleA', 'mb', 'selfAssess', 'moduleC'] as const;

describe('<Phase0Page />', () => {
  beforeEach(() => {
    useModuleStore.getState().reset();
    useModuleStore.getState().setSuite('full_stack', [...ORDER]);
    useModuleStore.getState().advance(); // → phase0
  });

  it('renders the skeleton card and finish-stub button', () => {
    render(<Phase0Page />);
    expect(screen.getByTestId('phase0-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('phase0-finish-stub')).toBeInTheDocument();
  });

  it('advances to the next module when finish-stub is clicked', () => {
    render(<Phase0Page />);
    expect(useModuleStore.getState().currentModule).toBe('phase0');
    fireEvent.click(screen.getByTestId('phase0-finish-stub'));
    expect(useModuleStore.getState().currentModule).toBe('moduleA');
  });
});
