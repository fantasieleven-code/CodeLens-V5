import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModuleAPage } from './ModuleAPage.js';
import { useModuleStore } from '../stores/module.store.js';

const ORDER = ['phase0', 'moduleA', 'mb', 'selfAssess', 'moduleC'] as const;

describe('<ModuleAPage />', () => {
  beforeEach(() => {
    useModuleStore.getState().reset();
    useModuleStore.getState().setSuite('full_stack', [...ORDER]);
    useModuleStore.getState().advance(); // → phase0
    useModuleStore.getState().advance(); // → moduleA
  });

  it('renders the skeleton card and finish-stub button', () => {
    render(<ModuleAPage />);
    expect(screen.getByTestId('moduleA-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('moduleA-finish-stub')).toBeInTheDocument();
  });

  it('advances to the next module when finish-stub is clicked', () => {
    render(<ModuleAPage />);
    expect(useModuleStore.getState().currentModule).toBe('moduleA');
    fireEvent.click(screen.getByTestId('moduleA-finish-stub'));
    expect(useModuleStore.getState().currentModule).toBe('mb');
  });
});
