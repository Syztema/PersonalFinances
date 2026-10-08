import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PrintHeader } from './PrintHeader';

describe('PrintHeader (spec §5.3)', () => {
  it('shows the period and when it was generated, in Bogotá time', () => {
    render(
      <PrintHeader from="2026-09-01" to="2026-09-30" now={new Date('2026-10-08T03:30:00Z')} />,
    );
    expect(screen.getByText('Finanzas — Reporte del 01/09/2026 al 30/09/2026')).toBeInTheDocument();
    expect(screen.getByText('Generado el 07/10/2026 a las 22:30')).toBeInTheDocument();
  });
});
