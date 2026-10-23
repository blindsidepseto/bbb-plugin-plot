import {
  PluginApi, DataChannelTypes, DataChannelPushEntryFunctionUserRole, RESET_DATA_CHANNEL,
} from 'bigbluebutton-html-plugin-sdk';
import {
  SESSION_CHANNEL, STUDENT_CHANNEL, SessionState, StudentState,
} from './types';

export const EMPTY_SESSION: SessionState = {
  open: true,
  formulas: [],
  mode: 'teaching',
  teacherView: { index: 0, expr: '' },
};

// The presenter's shared session. Returns null when Plot is not open.
// [REVIEW REQUIRED] Access control: only moderators may write or clear this
// channel; enforced by the server from manifest.json, not by this code.
export function useSession(pluginApi: PluginApi) {
  const { data, pushEntry, deleteEntry } = pluginApi.useDataChannel!<SessionState>(
    SESSION_CHANNEL,
    DataChannelTypes.LATEST_ITEM,
  );
  const latest = data?.data?.[0]?.payloadJson;
  return {
    session: latest?.open ? latest : null,
    // pushEntry is undefined until the SDK has set up the channel.
    pushSession: (session: SessionState) => { if (pushEntry) pushEntry(session); },
    clearSession: () => deleteEntry([RESET_DATA_CHANNEL]),
  };
}

// Students' work. Each entry is addressed to moderators only, so a student's
// subscription never contains another student's entries, even if a student is
// made presenter.
// [REVIEW REQUIRED] Access control / data storage (children's data): every
// moderator in the meeting can read these entries, and the server keeps them
// until Plot is closed (clearStudents). Server-side retention after the meeting
// ends has not been verified.
// Only the teacher needs every entry (ALL_ITEMS); students subscribe with
// LATEST_ITEM just to get a push function, so non-teaching moderators hold at
// most one entry.
export function useStudentChannel(
  pluginApi: PluginApi,
  dataChannelType: DataChannelTypes.ALL_ITEMS | DataChannelTypes.LATEST_ITEM,
) {
  const { data, pushEntry, deleteEntry } = pluginApi.useDataChannel!<StudentState>(
    STUDENT_CHANNEL,
    dataChannelType,
  );
  return {
    entries: data?.data ?? [],
    sendToModerators: (state: StudentState) => {
      if (!pushEntry) return;
      pushEntry(state, { receivers: [{ role: DataChannelPushEntryFunctionUserRole.MODERATOR }] });
    },
    clearStudents: () => deleteEntry([RESET_DATA_CHANNEL]),
  };
}
