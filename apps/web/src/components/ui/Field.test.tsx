import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Field, Select, TextArea, TextInput } from './Field';
import { MoneyInput } from './MoneyInput';

describe('Field', () => {
  it('links the error to its control and marks it invalid', () => {
    render(
      <Field label="Nombre" htmlFor="name" error="Escribe un nombre">
        <TextInput id="name" />
      </Field>,
    );
    const input = screen.getByLabelText('Nombre');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Escribe un nombre');
  });

  it('describes the control with the hint when there is no error', () => {
    render(
      <Field label="Cuotas" htmlFor="installments" hint="Si la pagas completa, deja 1.">
        <TextInput id="installments" />
      </Field>,
    );
    const input = screen.getByLabelText('Cuotas');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).toHaveAccessibleDescription('Si la pagas completa, deja 1.');
  });

  it('links money inputs, text areas and selects too', () => {
    render(
      <>
        <Field label="Valor" htmlFor="amount" error="El valor debe ser mayor que 0">
          <MoneyInput id="amount" value={null} onChange={vi.fn()} />
        </Field>
        <Field label="Notas" htmlFor="notes" error="Máximo 500 caracteres">
          <TextArea id="notes" />
        </Field>
        <Field label="Cuenta" htmlFor="account" error="Elige una cuenta">
          <Select id="account">
            <option value="">Elige una cuenta</option>
          </Select>
        </Field>
      </>,
    );
    expect(screen.getByLabelText('Valor')).toHaveAccessibleDescription(
      'El valor debe ser mayor que 0',
    );
    expect(screen.getByLabelText('Notas')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Cuenta')).toHaveAccessibleDescription('Elige una cuenta');
  });

  it('leaves alone a control whose id is not the field one', () => {
    render(
      <Field label="Tipo" htmlFor="kind" error="Elige un tipo">
        <TextInput id="other" aria-label="Otro campo" />
      </Field>,
    );
    const other = screen.getByRole('textbox', { name: 'Otro campo' });
    expect(other).not.toHaveAttribute('aria-invalid');
    expect(other).not.toHaveAttribute('aria-describedby');
  });
});
