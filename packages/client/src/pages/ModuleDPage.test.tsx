import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModuleDPage } from './ModuleDPage.js';
import { useModuleStore } from '../stores/module.store.js';

/**
 * architect suite is the one that includes moduleD in its order.
 */
const ORDER = ['phase0', 'moduleA', 'moduleD', 'selfAssess', 'moduleC'] as const;

describe('<ModuleDPage />', () => {
  beforeEach(() => {
    useModuleStore.getState().reset();
    useModuleStore.getState().setSuite('architect', [...ORDER]);
    useModuleStore.getState().advance(); // phase0
    useModuleStore.getState().advance(); // moduleA
    useModuleStore.getState().advance(); // moduleD
  });

  it('renders the skeleton card and finish-stub button', () => {
    render(<ModuleDPage />);
    expect(screen.getByTestId('moduleD-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('moduleD-finish-stub')).toBeInTheDocument();
  });

  it('advances to the next module when finish-stub is clicked', () => {
    render(<ModuleDPage />);
    expect(useModuleStore.getState().currentModule).toBe('moduleD');
    fireEvent.click(screen.getByTestId('moduleD-finish-stub'));
    expect(useModuleStore.getState().currentModule).toBe('selfAssess');
  });
});
