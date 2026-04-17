import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModuleShell } from './ModuleShell.js';
import { useModuleStore } from '../stores/module.store.js';

const ORDER = ['phase0', 'moduleA', 'mb', 'selfAssess', 'moduleC'] as const;

describe('<ModuleShell />', () => {
  beforeEach(() => {
    useModuleStore.getState().reset();
  });

  it('renders children inside the shell chrome', () => {
    useModuleStore.getState().setSuite('full_stack', [...ORDER]);
    useModuleStore.getState().advance(); // → phase0

    render(
      <ModuleShell>
        <div data-testid="child-content">hello</div>
      </ModuleShell>,
    );

    expect(screen.getByTestId('module-shell')).toBeInTheDocument();
    expect(screen.getByTestId('child-content')).toHaveTextContent('hello');
    expect(screen.getByTestId('module-shell-pause-toggle')).toBeInTheDocument();
  });

  it('disables the pause toggle in intro / complete / null', () => {
    render(
      <ModuleShell>
        <div />
      </ModuleShell>,
    );
    expect(
      (screen.getByTestId('module-shell-pause-toggle') as HTMLButtonElement).disabled,
    ).toBe(true);

    useModuleStore.getState().setSuite('full_stack', [...ORDER]);
    // intro
    expect(
      (screen.getByTestId('module-shell-pause-toggle') as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('enables the pause toggle mid-module and shows the overlay when paused', () => {
    useModuleStore.getState().setSuite('full_stack', [...ORDER]);
    useModuleStore.getState().advance(); // → phase0

    const onPauseChange = vi.fn();
    render(
      <ModuleShell onPauseChange={onPauseChange}>
        <div />
      </ModuleShell>,
    );

    const toggle = screen.getByTestId('module-shell-pause-toggle') as HTMLButtonElement;
    expect(toggle.disabled).toBe(false);
    expect(screen.queryByTestId('module-shell-pause-overlay')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(useModuleStore.getState().isPaused).toBe(true);
    expect(onPauseChange).toHaveBeenCalledWith(true);
    expect(screen.getByTestId('module-shell-pause-overlay')).toBeInTheDocument();

    // Resume via the overlay button.
    fireEvent.click(screen.getByTestId('module-shell-overlay-resume'));
    expect(useModuleStore.getState().isPaused).toBe(false);
    expect(onPauseChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByTestId('module-shell-pause-overlay')).not.toBeInTheDocument();
  });
});
