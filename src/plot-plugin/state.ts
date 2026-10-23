import {
  SessionState, StudentState, FormulaView, DisplayedView,
} from './types';
import { MAX_FORMULA_LENGTH } from './math/evaluator';

export const MAX_FORMULAS = 10;

// Any moderator can close Plot, so it never gets stuck open when a student is
// presenter. [REVIEW REQUIRED] Access control: the server enforces the same
// rule (replaceOrDeletePermission "moderator" in manifest.json).
export function isModerator(user: { role: string }): boolean {
  return user.role === 'MODERATOR';
}

// The teacher is the presenter, and must also be a moderator so that a
// student made presenter never gets teacher controls or student data.
// [REVIEW REQUIRED] Access control: assumes BBB reports role as 'MODERATOR'.
export function isTeacher(user: { presenter: boolean; role: string }): boolean {
  return user.presenter && isModerator(user);
}

// The teacher types one formula per line; lines may end in LF, CR or CRLF.
// Returns the formulas to publish and warnings about lines that are left out.
export function parseFormulaText(text: string): { formulas: string[]; problems: string[] } {
  const usable: string[] = [];
  const problems: string[] = [];
  text.split(/\r\n|\r|\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    if (line.length > MAX_FORMULA_LENGTH) {
      problems.push(`Line ${i + 1} is longer than ${MAX_FORMULA_LENGTH} characters and is skipped.`);
      return;
    }
    usable.push(line);
  });
  const extra = usable.length - MAX_FORMULAS;
  if (extra > 0) {
    problems.push(`Only the first ${MAX_FORMULAS} formulas are used; ${extra} extra line${extra === 1 ? ' is' : 's are'} ignored.`);
  }
  return { formulas: usable.slice(0, MAX_FORMULAS), problems };
}

interface StudentEntry {
  createdBy: string;
  createdAt: string;
  payloadJson: StudentState;
}

// [REVIEW REQUIRED] Input validation: any participant can push to the student
// channel, so a tampered client can send any JSON. Malformed entries are dropped.
function isStudentState(payload: unknown): payload is StudentState {
  const p = payload as StudentState | null;
  return typeof p === 'object' && p !== null
    && Number.isInteger(p.index) && p.index >= 0
    && typeof p.expr === 'string' && p.expr.length <= MAX_FORMULA_LENGTH;
}

// Newest state per student. The student is identified by the server-set
// createdBy, never by anything in the payload.
export function latestStudentStates(entries: StudentEntry[]): Map<string, StudentState> {
  const newestFirst = entries
    .filter((e) => isStudentState(e.payloadJson))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const states = new Map<string, StudentState>();
  newestFirst.forEach((e) => {
    if (!states.has(e.createdBy)) {
      states.set(e.createdBy, { index: e.payloadJson.index, expr: e.payloadJson.expr });
    }
  });
  return states;
}

// If the presenter shortened the list below the selected index, fall back to formula 1.
function withinList(view: FormulaView, formulas: string[]): FormulaView {
  if (view.index >= 0 && view.index < formulas.length) return view;
  return { index: 0, expr: formulas[0] ?? '' };
}

// After the presenter edits the list, keep the selection on the same formula
// text (wherever it moved to), or fall back to formula 1 if it was removed.
// The presenter's own textbox edit survives only if its formula still exists.
export function reselectAfterEdit(
  oldFormulas: string[],
  newFormulas: string[],
  view: FormulaView,
): FormulaView {
  const oldFormula = oldFormulas[view.index];
  const movedTo = oldFormula === undefined ? -1 : newFormulas.indexOf(oldFormula);
  if (movedTo < 0) return { index: 0, expr: newFormulas[0] ?? '' };
  const edited = view.expr !== '' && view.expr !== oldFormula;
  return { index: movedTo, expr: edited ? view.expr : newFormulas[movedTo] };
}

export function studentView(session: SessionState, local: StudentState | null): DisplayedView {
  if (session.mode === 'teaching') {
    return { ...session.teacherView, editable: false };
  }
  return { ...withinList(local ?? session.teacherView, session.formulas), editable: true };
}

export function presenterView(
  session: SessionState,
  watchedUserId: string | null,
  students: Map<string, StudentState>,
): DisplayedView {
  const watched = watchedUserId ? students.get(watchedUserId) : undefined;
  if (session.mode === 'student' && watched) {
    return { ...watched, editable: false };
  }
  return { ...session.teacherView, editable: true };
}
