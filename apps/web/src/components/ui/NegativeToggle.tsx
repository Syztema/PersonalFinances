/** Interruptor de saldo negativo (sobregiro), compartido por los formularios de cuenta. */
export function NegativeToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-sm">
      <input
        type="checkbox"
        className="size-5 accent-primary"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      Saldo negativo (sobregiro)
    </label>
  );
}
