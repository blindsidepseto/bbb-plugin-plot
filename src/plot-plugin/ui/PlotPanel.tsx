import * as React from 'react';
import { BbbPluginSdk, PluginApi } from 'bigbluebutton-html-plugin-sdk';
import { PlotPluginProps } from '../types';
import { useSession } from '../channels';
import { isTeacher, isModerator } from '../state';
import TeacherPanel from './TeacherPanel';
import StudentPanel from './StudentPanel';

// Rendered by BBB into the main content area while Plot is open.
function PlotPanel({ pluginUuid }: PlotPluginProps): React.ReactElement | null {
  const pluginApi: PluginApi = BbbPluginSdk.getPluginApi(pluginUuid);
  const currentUser = pluginApi.useCurrentUser!()?.data;
  const { session, pushSession, clearSession } = useSession(pluginApi);

  if (!session || !currentUser) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        height: '100%',
        padding: 12,
        boxSizing: 'border-box',
        background: '#fff',
        color: '#222',
        overflow: 'auto',
      }}
    >
      <h2 style={{ margin: 0 }}>Plot</h2>
      {/* [REVIEW REQUIRED] Access control: only the teacher's panel reads student work. */}
      {isTeacher(currentUser) ? (
        <TeacherPanel
          pluginApi={pluginApi}
          session={session}
          pushSession={pushSession}
          clearSession={clearSession}
        />
      ) : (
        // [REVIEW REQUIRED] Access control: any moderator may close Plot for
        // everyone, which also deletes all student work on the server.
        <StudentPanel
          pluginApi={pluginApi}
          session={session}
          clearSession={isModerator(currentUser) ? clearSession : null}
        />
      )}
    </div>
  );
}

export default PlotPanel;
