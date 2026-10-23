// Data-channel names; must match manifest.json.
export const SESSION_CHANNEL = 'plot-session';
export const STUDENT_CHANNEL = 'plot-student-state';

// Delay before the presenter's typing is shared with students.
export const PUSH_DEBOUNCE_MS = 300;

export type PlotMode = 'teaching' | 'student';

// A selected formula (by position in the list) and the text in the textbox.
export interface FormulaView {
  index: number;
  expr: string;
}

// Shared by the presenter with everyone on SESSION_CHANNEL.
export interface SessionState {
  open: boolean;
  formulas: string[];
  mode: PlotMode;
  teacherView: FormulaView;
}

// Sent by a student to the presenter only, on STUDENT_CHANNEL. The sender is
// identified by the entry's server-set createdBy, so no user id is included.
export type StudentState = FormulaView;

export interface DisplayedView extends FormulaView {
  editable: boolean;
}

export interface PlotPluginProps {
  pluginUuid: string;
}
