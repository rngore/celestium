import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.tsx';

afterEach(() => {
  cleanup();
});

// Mock Three.js WebGL viewports in jsdom while keeping all real UI controls & mathematical solvers active
vi.mock('../src/components/three/EngineeringOrbitViewport.tsx', () => ({
  EngineeringOrbitViewport: () => (
    <div data-testid="mock-orbit-viewport">Engineering 3D Orbit Viewport</div>
  ),
}));

vi.mock('../src/components/three/SolarSystemViewport.tsx', () => ({
  SolarSystemViewport: ({ selectedId }: { selectedId: string | null }) => (
    <div data-testid="mock-solar-viewport">Solar Viewport ({selectedId ?? 'none'})</div>
  ),
}));

vi.mock('../src/components/three/UniverseGpsViewport.tsx', () => ({
  UniverseGpsViewport: ({ mode }: { mode: string }) => (
    <div data-testid="mock-xnav-viewport">XNAV Viewport ({mode})</div>
  ),
}));

describe('CELESTIUM Engineering Workbench Navigation & Workflows', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/api/sources')) {
          return new Response(JSON.stringify({ sources: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 404 });
      })
    );
  });

  it('renders the 7 primary engineering workspaces and starts on Mission Workbench', async () => {
    render(<App />);

    const sidebar = within(screen.getByLabelText('Primary Sidebar Navigation'));
    expect(screen.getByText('CELESTIUM')).toBeInTheDocument();
    expect(sidebar.getByRole('button', { name: 'Mission Workbench' })).toBeInTheDocument();
    expect(sidebar.getByRole('button', { name: 'Trajectory Analysis' })).toBeInTheDocument();
    expect(sidebar.getByRole('button', { name: 'Autonomous Navigation' })).toBeInTheDocument();
    expect(sidebar.getByRole('button', { name: 'Communication Analysis' })).toBeInTheDocument();
    expect(sidebar.getByRole('button', { name: 'Spacecraft & Ephemerides' })).toBeInTheDocument();
    expect(sidebar.getByRole('button', { name: 'Model Inspector' })).toBeInTheDocument();
    expect(sidebar.getByRole('button', { name: 'Reports' })).toBeInTheDocument();

    expect(screen.getByTestId('mock-orbit-viewport')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Python CLI \(\.zip\)/i })).toHaveAttribute(
      'href',
      '/api/downloads/celestium-cli.zip'
    );

    // Switch to Scenario C (Earth-to-Moon)
    fireEvent.click(screen.getByRole('button', { name: /Scenario C — Earth-to-Moon/i }));
    expect(screen.getAllByText(/Cislunar Transfer & Occultation Analysis/i).length).toBeGreaterThan(0);
  });

  it('navigates across Trajectory Analysis, Autonomous Navigation, Model Inspector, and Reports', async () => {
    render(<App />);
    const sidebar = within(screen.getByLabelText('Primary Sidebar Navigation'));

    // Trajectory Analysis + Lambert
    fireEvent.click(sidebar.getByRole('button', { name: 'Trajectory Analysis' }));
    expect(screen.getByText(/Rel\. Energy Drift/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hohmann & Lambert' }));
    expect(
      screen.getByRole('heading', { name: /Universal-Variable Lambert Solver/i })
    ).toBeInTheDocument();

    // Autonomous Navigation
    fireEvent.click(sidebar.getByRole('button', { name: 'Autonomous Navigation' }));
    expect(await screen.findByTestId('mock-xnav-viewport')).toBeInTheDocument();
    expect(screen.getByText(/Pulsar Timing Phase Model/i)).toBeInTheDocument();

    // Model Inspector
    fireEvent.click(sidebar.getByRole('button', { name: 'Model Inspector' }));
    expect(screen.getByText(/Live Computed Intermediate Steps/i)).toBeInTheDocument();

    // Reports
    fireEvent.click(sidebar.getByRole('button', { name: 'Reports' }));
    expect(screen.getByRole('button', { name: /Download PDF Report/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Trajectory CSV/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Download Python CLI \(\.zip\)/i })).toHaveAttribute(
      'href',
      '/api/downloads/celestium-cli.zip'
    );
  });
});
