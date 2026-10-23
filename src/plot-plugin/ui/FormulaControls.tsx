import * as React from 'react';
import { MAX_FORMULA_LENGTH } from '../math/evaluator';

interface FormulaListProps {
  formulas: string[];
  selected: number;
  disabled: boolean;
  onSelect: (index: number) => void;
}

export function FormulaList({
  formulas, selected, disabled, onSelect,
}: FormulaListProps): React.ReactElement {
  if (formulas.length === 0) {
    return <p>Waiting for the teacher to add formulas.</p>;
  }
  return (
    <div role="group" aria-label="Formulas" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {formulas.map((formula, index) => (
        <button
          // Formulas can repeat, so the position is part of the key.
          // eslint-disable-next-line react/no-array-index-key
          key={`${index}-${formula}`}
          type="button"
          aria-pressed={index === selected}
          disabled={disabled}
          onClick={() => onSelect(index)}
          style={{ fontWeight: index === selected ? 'bold' : 'normal' }}
        >
          {formula}
        </button>
      ))}
    </div>
  );
}

interface FormulaBoxProps {
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
  // When given, an "Update plot" button and the Enter key confirm the edit.
  onSubmit: (() => void) | null;
}

export function FormulaBox({
  value, readOnly, onChange, onSubmit,
}: FormulaBoxProps): React.ReactElement {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <span aria-hidden="true">y =</span>
      <input
        aria-label="Current formula"
        type="text"
        value={value}
        readOnly={readOnly}
        maxLength={MAX_FORMULA_LENGTH}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && onSubmit && !readOnly) onSubmit(); }}
        style={{ flex: 1 }}
      />
      {onSubmit && !readOnly && (
        <button type="button" onClick={onSubmit}>Update plot</button>
      )}
    </div>
  );
}
