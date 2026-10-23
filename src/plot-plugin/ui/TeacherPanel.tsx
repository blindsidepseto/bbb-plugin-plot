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
  MAX_FORMULAS, sanitizeFormulas, latestStudentStates, presenterView, reselectAfterEdit,
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
  const [draftFormulas, setDraftFormulas] = useState<string[]>(
    session.formulas.length ? session.formulas : [''],
  );
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
    const formulas = sanitizeFormulas(draftFormulas);
    const teacherView = reselectAfterEdit(
      sent.current.formulas,
      formulas,
      sent.current.teacherView,
    );
    setDraftFormulas(formulas.length ? formulas : ['']);
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

      <details open={local.formulas.length === 0}>
        <summary>{`Formulas (${local.formulas.length}/${MAX_FORMULAS})`}</summary>
        {draftFormulas.map((formula, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={i} style={{ display: 'flex', gap: 4 }}>
            <input
              aria-label={`Edit formula ${i + 1}`}
              type="text"
              value={formula}
              onChange={(e) => setDraftFormulas(
                draftFormulas.map((f, j) => (j === i ? e.target.value : f)),
              )}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              aria-label={`Remove formula ${i + 1}`}
              disabled={draftFormulas.length === 1}
              onClick={() => setDraftFormulas(draftFormulas.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={draftFormulas.length >= MAX_FORMULAS}
          onClick={() => setDraftFormulas([...draftFormulas, ''])}
        >
          Add formula
        </button>
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
