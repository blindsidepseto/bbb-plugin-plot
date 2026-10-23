import * as React from 'react';
import {
  useEffect, useMemo, useRef, useState,
} from 'react';
import { PluginApi, DataChannelTypes } from 'bigbluebutton-html-plugin-sdk';
import { useStudentChannel } from '../channels';
import {
  SessionState, PlotMode, PUSH_DEBOUNCE_MS,
} from '../types';
import {
  MAX_FORMULAS, parseFormulaText, latestStudentStates,
  presenterView, reselectAfterEdit,
} from '../state';
import { FormulaList, FormulaBox } from './FormulaControls';
import PlotView from './PlotView';

interface TeacherPanelProps {
  pluginApi: PluginApi;
  session: SessionState;
  pushSession: (session: SessionState) => void;
  clearSession: () => void;
}

function TeacherPanel({
  pluginApi, session, pushSession, clearSession,
}: TeacherPanelProps): React.ReactElement {
  const [draftText, setDraftText] = useState(session.formulas.join('\n'));
  // Warnings are worked out from the text as it is typed, before anything is applied.
  const parsed = parseFormulaText(draftText);
  // Starts open when there are no formulas yet; afterwards only the teacher toggles it.
  const [editorOpen, setEditorOpen] = useState(session.formulas.length === 0);
  const [draftExpr, setDraftExpr] = useState(session.teacherView.expr);
  const [watched, setWatched] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The teacher's own copy of the session: shown on screen and the base of
  // every push, so clicks never act on a server echo that lags behind.
  // `session` (the echo) is only the starting point.
  const [local, setLocal] = useState<SessionState>(session);
  const sent = useRef<SessionState>(session);
  const update = (next: SessionState) => {
    sent.current = next;
    setLocal(next);
  };

  const usersInfo = pluginApi.useUsersBasicInfo!();
  const { entries: studentEntries, clearStudents } = useStudentChannel(
    pluginApi,
    DataChannelTypes.ALL_ITEMS,
  );
  const students = useMemo(() => latestStudentStates(studentEntries), [studentEntries]);
  const names = new Map((usersInfo?.data?.user ?? []).map((u) => [u.userId, u.name]));

  const cancelPendingPush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancelPendingPush, []);

  const publish = (patch: Partial<SessionState>) => {
    cancelPendingPush();
    update({ ...sent.current, ...patch });
    pushSession(sent.current);
  };

  // Typing is shared with students after a short pause, not on every key.
  const onType = (expr: string) => {
    setDraftExpr(expr);
    cancelPendingPush();
    update({ ...sent.current, teacherView: { ...sent.current.teacherView, expr } });
    timer.current = setTimeout(() => {
      timer.current = null;
      pushSession(sent.current);
    }, PUSH_DEBOUNCE_MS);
  };

  const selectFormula = (index: number) => {
    const expr = sent.current.formulas[index];
    setDraftExpr(expr);
    publish({ teacherView: { index, expr } });
  };

  const applyFormulas = () => {
    const { formulas } = parsed;
    const teacherView = reselectAfterEdit(
      sent.current.formulas,
      formulas,
      sent.current.teacherView,
    );
    setDraftExpr(teacherView.expr);
    publish({ formulas, teacherView });
  };

  const setMode = (mode: PlotMode) => {
    if (mode === 'teaching') setWatched(null);
    publish({ mode });
  };

  const close = () => {
    cancelPendingPush();
    clearStudents();
    clearSession();
  };

  const view = presenterView(local, watched, students);
  const shownExpr = view.editable ? draftExpr : view.expr;

  return (
    <>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {(['teaching', 'student'] as PlotMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={local.mode === mode}
            onClick={() => setMode(mode)}
          >
            {mode === 'teaching' ? 'Teaching mode' : 'Student mode'}
          </button>
        ))}
        <button type="button" onClick={close} style={{ marginLeft: 'auto' }}>Close Plot</button>
      </div>

      <details open={editorOpen} onToggle={(e) => setEditorOpen(e.currentTarget.open)}>
        <summary>{`Formulas (${local.formulas.length}/${MAX_FORMULAS})`}</summary>
        <textarea
          aria-label="Formulas, one per line"
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          rows={MAX_FORMULAS}
          placeholder={'sin(x)\nx^2\ncos(2x)'}
          spellCheck={false}
          style={{
            display: 'block', width: '100%', boxSizing: 'border-box', fontFamily: 'monospace',
          }}
        />
        {/* Always mounted so screen readers announce changes to it. */}
        <p role="status" style={{ color: '#8a4b00', margin: '4px 0' }}>
          {parsed.problems.join(' ')}
        </p>
        <button type="button" onClick={applyFormulas}>Apply formulas</button>
      </details>

      {local.mode === 'student' && (
        <label htmlFor="plot-watch-student">
          Watch student
          {' '}
          <select
            id="plot-watch-student"
            value={watched ?? ''}
            onChange={(e) => setWatched(e.target.value || null)}
          >
            <option value="">Nobody (my own view)</option>
            {Array.from(students.keys()).map((userId) => (
              <option key={userId} value={userId}>{names.get(userId) ?? 'Unknown user'}</option>
            ))}
          </select>
        </label>
      )}

      <FormulaList
        formulas={local.formulas}
        selected={view.index}
        disabled={!view.editable}
        onSelect={selectFormula}
      />
      <FormulaBox value={shownExpr} readOnly={!view.editable} onChange={onType} onSubmit={null} />
      <PlotView expr={shownExpr} />
    </>
  );
}

export default TeacherPanel;
