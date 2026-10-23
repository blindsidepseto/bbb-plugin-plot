import * as React from 'react';
import { useEffect, useRef } from 'react';
import * as ReactDOM from 'react-dom/client';
import {
  BbbPluginSdk, PluginApi, AppsGalleryEntry, GenericContentMainArea,
} from 'bigbluebutton-html-plugin-sdk';
import { PlotPluginProps } from './types';
import { useSession, EMPTY_SESSION } from './channels';
import { isTeacher } from './state';
import PlotPanel from './ui/PlotPanel';

function PlotPlugin({ pluginUuid: uuid }: PlotPluginProps): React.ReactElement | null {
  BbbPluginSdk.initialize(uuid);
  const pluginApi: PluginApi = BbbPluginSdk.getPluginApi(uuid);
  const currentUser = pluginApi.useCurrentUser!()?.data;
  // [REVIEW REQUIRED] Access control: decides who gets the Plot launcher.
  const teacher = !!currentUser && isTeacher(currentUser);
  const { session, pushSession } = useSession(pluginApi);
  const isOpen = !!session;
  // The launcher outlives renders; always call the latest push function.
  const pushSessionRef = useRef(pushSession);
  pushSessionRef.current = pushSession;

  // Only the teacher gets the launcher. The server also enforces this:
  // only moderators may write the session channel (manifest.json).
  useEffect(() => {
    pluginApi.setAppsGalleryItems(teacher ? [
      new AppsGalleryEntry({
        name: 'Plot',
        icon: 'whiteboard',
        onClick: () => { if (!isOpen) pushSessionRef.current(EMPTY_SESSION); },
      }),
    ] : []);
  }, [teacher, isOpen]);

  useEffect(() => {
    pluginApi.setGenericContentItems(isOpen ? [
      new GenericContentMainArea({
        contentFunction: (element: HTMLElement) => {
          const root = ReactDOM.createRoot(element);
          root.render(<PlotPanel pluginUuid={uuid} />);
          return root;
        },
      }),
    ] : []);
  }, [isOpen]);

  return null;
}

export default PlotPlugin;
