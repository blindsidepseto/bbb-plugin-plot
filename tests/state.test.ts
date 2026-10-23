import {
  sanitizeFormulas, latestStudentStates, studentView, presenterView, reselectAfterEdit, MAX_FORMULAS,
} from '../src/plot-plugin/state';
import { SessionState, StudentState } from '../src/plot-plugin/types';

const entry = (createdBy: string, createdAt: string, payloadJson: StudentState) => ({
  createdBy, createdAt, payloadJson,
});

const session = (overrides: Partial<SessionState> = {}): SessionState => ({
  open: true,
  formulas: ['sin(x)', 'x^2', 'cos(x)'],
  mode: 'teaching',
  teacherView: { index: 1, expr: 'x^2 + 1' },
  ...overrides,
});

describe('Formula list', () => {
  // Behaviour 4
  it('Given the presenter enters 11 formulas, then only the first 10 are accepted', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `x + ${i}`);
    const result = sanitizeFormulas(eleven);
    expect(MAX_FORMULAS).toBe(10);
    expect(result).toHaveLength(10);
    expect(result[9]).toBe('x + 9');
  });

  it('Given blank lines and surrounding spaces, then they are trimmed and blanks dropped', () => {
    expect(sanitizeFormulas(['  sin(x) ', '', '   ', 'x'])).toEqual(['sin(x)', 'x']);
  });
});

describe('Student states as seen by the presenter', () => {
  it('Given several entries per student, then only the newest per student is kept', () => {
    const states = latestStudentStates([
      entry('alice', '2026-10-23T10:00:00Z', { index: 0, expr: 'old' }),
      entry('bob', '2026-10-23T10:01:00Z', { index: 2, expr: 'bob' }),
      entry('alice', '2026-10-23T10:02:00Z', { index: 1, expr: 'new' }),
    ]);
    expect(states.get('alice')).toEqual({ index: 1, expr: 'new' });
    expect(states.get('bob')).toEqual({ index: 2, expr: 'bob' });
  });

  it('Given an entry, then the student is identified by the server-set createdBy, not the payload', () => {
    const states = latestStudentStates([
      entry('alice', '2026-10-23T10:00:00Z', { index: 0, expr: 'x', userId: 'bob' } as StudentState),
    ]);
    expect(states.has('alice')).toBe(true);
    expect(states.has('bob')).toBe(false);
  });
});

describe('Formula list edited by the presenter', () => {
  it('Given the selected formula moved position, then the selection follows it', () => {
    expect(reselectAfterEdit(['a', 'b', 'c'], ['b', 'c'], { index: 2, expr: 'c' }))
      .toEqual({ index: 1, expr: 'c' });
  });

  it('Given the selected formula was removed, then formula 1 is selected', () => {
    expect(reselectAfterEdit(['a', 'b', 'c'], ['a', 'b'], { index: 2, expr: 'c' }))
      .toEqual({ index: 0, expr: 'a' });
  });

  it('Given the presenter edited the textbox and the formula still exists, then the edit is kept', () => {
    expect(reselectAfterEdit(['a', 'b'], ['b'], { index: 1, expr: 'b + 1' }))
      .toEqual({ index: 0, expr: 'b + 1' });
  });

  it('Given the presenter edited the textbox but the formula was removed, then the edit is replaced', () => {
    expect(reselectAfterEdit(['a', 'b'], ['a'], { index: 1, expr: 'b + 1' }))
      .toEqual({ index: 0, expr: 'a' });
  });

  it('Given an empty list before, then formula 1 of the new list is selected', () => {
    expect(reselectAfterEdit([], ['a', 'b'], { index: 0, expr: '' }))
      .toEqual({ index: 0, expr: 'a' });
  });
});

describe('Malformed student entries (tampered client)', () => {
  it.each([
    ['null payload', null],
    ['non-string expr', { index: 0, expr: 42 }],
    ['negative index', { index: -1, expr: 'x' }],
    ['non-integer index', { index: 1.5, expr: 'x' }],
    ['string index', { index: '0', expr: 'x' }],
    ['over-long expr', { index: 0, expr: 'x'.repeat(201) }],
  ])('Given an entry with a %s, then it is ignored', (_label, payloadJson) => {
    const states = latestStudentStates([
      entry('alice', '2026-10-23T10:00:00Z', { index: 0, expr: 'ok' }),
      entry('alice', '2026-10-23T10:01:00Z', payloadJson as unknown as StudentState),
    ]);
    expect(states.get('alice')).toEqual({ index: 0, expr: 'ok' });
  });
});

describe('What a student sees', () => {
  it('Given teaching mode, then the student sees the teacher view, read-only', () => {
    expect(studentView(session(), { index: 2, expr: 'mine' })).toEqual({
      index: 1, expr: 'x^2 + 1', editable: false,
    });
  });

  it('Given student mode, then the student sees their own work, editable', () => {
    expect(studentView(session({ mode: 'student' }), { index: 2, expr: 'mine' })).toEqual({
      index: 2, expr: 'mine', editable: true,
    });
  });

  it('Given student mode and no local work yet, then the student starts from the teacher view', () => {
    expect(studentView(session({ mode: 'student' }), null)).toEqual({
      index: 1, expr: 'x^2 + 1', editable: true,
    });
  });

  it('Given the formula list shrank below the student selection, then the student resets to formula 1', () => {
    expect(studentView(session({ mode: 'student', formulas: ['sin(x)'] }), { index: 2, expr: 'mine' })).toEqual({
      index: 0, expr: 'sin(x)', editable: true,
    });
  });
});

describe('What the presenter sees', () => {
  const states = new Map<string, StudentState>([['alice', { index: 2, expr: 'cos(2x)' }]]);

  it('Given teaching mode, then the presenter sees and edits the teacher view', () => {
    expect(presenterView(session(), 'alice', states)).toEqual({
      index: 1, expr: 'x^2 + 1', editable: true,
    });
  });

  // Behaviour 7 (state part)
  it('Given student mode and a watched student, then the presenter sees that student, read-only', () => {
    expect(presenterView(session({ mode: 'student' }), 'alice', states)).toEqual({
      index: 2, expr: 'cos(2x)', editable: false,
    });
  });

  it('Given student mode and the watched student has no state, then the presenter sees the teacher view', () => {
    expect(presenterView(session({ mode: 'student' }), 'carol', states)).toEqual({
      index: 1, expr: 'x^2 + 1', editable: true,
    });
  });
});
