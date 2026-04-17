import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModuleBPage } from './ModuleBPage.js';
import { useModuleStore } from '../stores/module.store.js';

const ORDER = ['phase0', 'moduleA', 'mb', 'selfAssess', 'moduleC'] as const;

describe('<ModuleBPage />', () => {
  beforeEach(() => {
    useModuleStore.getState().reset();
    useModuleStore.getState().setSuite('full_stack', [...ORDER]);
    useModuleStore.getState().advance(); // phase0
    useModuleStore.getState().advance(); // moduleA
    useModuleStore.getState().advance(); // mb
  });

  it('renders the skeleton card and finish-stub button', () => {
    render(<ModuleBPage />);
    expect(screen.getByTestId('mb-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('mb-finish-stub')).toBeInTheDocument();
  });

  it('advances to the next module when finish-stub is clicked', () => {
    render(<ModuleBPage />);
    expect(useModuleStore.getState().currentModule).toBe('mb');
    fireEvent.click(screen.getByTestId('mb-finish-stub'));
    expect(useModuleStore.getState().currentModule).toBe('selfAssess');
  });
});
