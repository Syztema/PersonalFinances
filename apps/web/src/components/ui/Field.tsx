import {
  createContext,
  useContext,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '../../lib/cn';

export const inputClass =
  'w-full min-h-11 rounded-xl border border-border bg-surface px-3 text-base text-fg outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20';

interface FieldLink {
  controlId?: string;
  messageId?: string;
  invalid: boolean;
}

const FieldContext = createContext<FieldLink | null>(null);

/**
 * Spec Fase 3 §7.1: el control cuyo `id` es el `htmlFor` de su `Field` queda descrito por el error
 * (o la ayuda) con `aria-describedby`, y con `aria-invalid` si hay error.
 */
export function useFieldControl(id: string | undefined): {
  'aria-describedby'?: string;
  'aria-invalid'?: true;
} {
  const field = useContext(FieldContext);
  if (!field || !id || field.controlId !== id) return {};
  return {
    ...(field.messageId && { 'aria-describedby': field.messageId }),
    ...(field.invalid && { 'aria-invalid': true as const }),
  };
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  const messageId = htmlFor && (error || hint) ? `${htmlFor}-message` : undefined;
  return (
    <FieldContext.Provider value={{ controlId: htmlFor, messageId, invalid: Boolean(error) }}>
      <div className="space-y-1.5">
        <label htmlFor={htmlFor} className="block text-sm font-medium">
          {label}
        </label>
        {children}
        {error ? (
          <p id={messageId} className="text-sm text-negative">
            {error}
          </p>
        ) : hint ? (
          <p id={messageId} className="text-xs text-muted">
            {hint}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const link = useFieldControl(props.id);
  return <input {...link} {...props} className={cn(inputClass, className)} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const link = useFieldControl(props.id);
  return <textarea rows={3} {...link} {...props} className={cn(inputClass, 'py-2', className)} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const link = useFieldControl(props.id);
  return <select {...link} {...props} className={cn(inputClass, className)} />;
}
