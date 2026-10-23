import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { PluginApi, DataChannelTypes } from 'bigbluebutton-html-plugin-sdk';
import { SessionState, StudentState } from '../types';
import { studentView } from '../state';
import { useStudentChannel } from '../channels';
import { FormulaList, FormulaBox } from './FormulaControls';
import PlotView from './PlotView';

interface StudentPanelProps {
  pluginApi: PluginApi;
  session: SessionState;
  // Given only to moderators who are not the teacher, so they can close Plot.
  clearSession: (() => void) | null;
}

function StudentPanel({ pluginApi, session, clearSession }: StudentPanelProps): React.ReactElement {
  const { sendToModerators, clearStudents } = useStudentChannel(
    pluginApi,
    DataChannelTypes.LATEST_ITEM,
  );
  // Whether this student has shared any work, so a reset is shared too.
  const hasSent = useRef(false);
  // The student's confirmed selection and formula (student mode only).
  const [local, setLocal] = useState<StudentState | null>(null);
  // Unconfirmed typing in the textbox; null means "show the confirmed formula".
  const [draft, setDraft] = useState<string | null>(null);

  // A new formula list from the teacher starts everyone from the teacher's formula.
  const formulasKey = JSON.stringify(session.formulas);
  useEffect(() => {
    setLocal(null);
    setDraft(null);
    if (hasSent.current) {
      const { index, expr } = studentView(session, null);
      sendToModerators({ index, expr });
    }
  }, [formulasKey]);

  const view = studentView(session, local);
  const text = view.editable ? (draft ?? view.expr) : view.expr;

  const confirm = (state: StudentState) => {
    setLocal(state);
    setDraft(null);
    hasSent.current = true;
    // [REVIEW REQUIRED] Data storage (children's data): stored on the server
    // and readable by moderators until Plot is closed.
    sendToModerators(state);
  };

  return (
    <>
      {clearSession && (
        <button
          type="button"
          onClick={() => { clearStudents(); clearSession(); }}
          style={{ alignSelf: 'flex-end' }}
        >
          Close Plot
        </button>
      )}
      <p>
        {session.mode === 'teaching'
          ? 'Teaching mode: you are following the teacher.'
          : 'Student mode: pick a formula and try changing it.'}
      </p>
      <FormulaList
        formulas={session.formulas}
        selected={view.index}
        disabled={!view.editable}
        onSelect={(index) => confirm({ index, expr: session.formulas[index] })}
      />
      <FormulaBox
        value={text}
        readOnly={!view.editable}
        onChange={setDraft}
        onSubmit={() => confirm({ index: view.index, expr: text })}
      />
      <PlotView expr={view.expr} />
    </>
  );
}

export default StudentPanel;
