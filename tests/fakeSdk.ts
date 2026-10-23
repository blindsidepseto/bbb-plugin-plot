// In-memory stand-in for bigbluebutton-html-plugin-sdk. It models what the
// plugin relies on from the server: per-user visibility of data-channel
// entries addressed with `receivers`, and push permissions from manifest.json.
import { useEffect, useState, useSyncExternalStore } from 'react';
import * as ReactDOM from 'react-dom/client';
import manifest from '../manifest.json';

export const RESET_DATA_CHANNEL = 'RESET_DATA_CHANNEL';

export enum DataChannelTypes {
  ALL_ITEMS = 'Hooks::DataChannel::AllItems',
  NEW_ITEMS = 'Hooks::DataChannel::NewItems',
  LATEST_ITEM = 'Hooks::DataChannel::LatestItem',
}

export enum DataChannelPushEntryFunctionUserRole {
  PRESENTER = 'PRESENTER',
  MODERATOR = 'MODERATOR',
  VIEWER = 'VIEWER',
}

export interface FakeUser {
  userId: string;
  name: string;
  presenter: boolean;
  role: 'MODERATOR' | 'VIEWER';
}

interface Receiver { userId?: string; role?: string }

interface FakeEntry {
  entryId: string;
  channelName: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  payloadJson: unknown;
  receivers: Receiver[];
}

export class AppsGalleryEntry {
  name: string;

  onClick: () => void;

  constructor(props: { name: string; icon: unknown; onClick: () => void }) {
    this.name = props.name;
    this.onClick = props.onClick;
  }
}

export class GenericContentMainArea {
  contentFunction: (element: HTMLElement) => ReactDOM.Root;

  constructor(props: { contentFunction: (element: HTMLElement) => ReactDOM.Root }) {
    this.contentFunction = props.contentFunction;
  }
}

export const pluginLogger = {
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
};

// ---- fake server -----------------------------------------------------------

export const server = {
  users: new Map<string, FakeUser>(), // keyed by plugin uuid (one per browser)
  entries: [] as FakeEntry[],
  appsGallery: new Map<string, AppsGalleryEntry[]>(),
  genericContent: new Map<string, GenericContentMainArea[]>(),
  rejectedPushes: [] as { userId: string; channelName: string }[],
  subscriptions: [] as { userId: string; channelName: string; type: DataChannelTypes }[],
  listeners: new Set<() => void>(),
  // When true, pushes wait in `held` until flush(), like a slow network.
  holdPushes: false,
  held: [] as FakeEntry[],
  flush() {
    this.entries.push(...this.held);
    this.held = [];
    this.notify();
  },
  version: 0,
  clock: 0,
  reset() {
    this.users.clear();
    this.entries = [];
    this.appsGallery.clear();
    this.genericContent.clear();
    this.rejectedPushes = [];
    this.subscriptions = [];
    this.holdPushes = false;
    this.held = [];
    this.clock = 0;
    this.notify();
  },
  notify() {
    this.version += 1;
    this.listeners.forEach((l: () => void) => l());
  },
};

const subscribe = (listener: () => void) => {
  server.listeners.add(listener);
  return () => server.listeners.delete(listener);
};

const useServerVersion = () => useSyncExternalStore(subscribe, () => server.version);

const channelConfig = (name: string) => manifest.dataChannels.find((c) => c.name === name);

const hasPermission = (permissions: string[], user: FakeUser, entry?: FakeEntry) => (
  permissions.includes('all')
  || (permissions.includes('presenter') && user.presenter)
  || (permissions.includes('moderator') && user.role === 'MODERATOR')
  || (permissions.includes('viewer') && user.role === 'VIEWER')
  || (permissions.includes('creator') && entry?.createdBy === user.userId)
);

const canSee = (user: FakeUser, entry: FakeEntry) => entry.receivers.length === 0
  || entry.receivers.some((r) => r.userId === user.userId
    || (r.role === 'PRESENTER' && user.presenter)
    || (r.role === user.role));

function makeApi(uuid: string) {
  const me = () => {
    const user = server.users.get(uuid);
    if (!user) throw new Error(`no fake user for ${uuid}`);
    return user;
  };

  return {
    setAppsGalleryItems: (items: AppsGalleryEntry[]) => { server.appsGallery.set(uuid, items); return []; },
    setGenericContentItems: (items: GenericContentMainArea[]) => {
      server.genericContent.set(uuid, items);
      server.notify();
      return [];
    },
    useCurrentUser: () => {
      useServerVersion();
      const user = me();
      return { loading: false, data: { ...user, extId: '', cameras: [] } };
    },
    useUsersBasicInfo: () => {
      useServerVersion();
      return {
        loading: false,
        data: {
          user: [...server.users.values()].map((u) => ({
            ...u, isModerator: u.role === 'MODERATOR',
          })),
        },
      };
    },
    useDataChannel: <T>(channelName: string, type: DataChannelTypes = DataChannelTypes.ALL_ITEMS) => {
      useServerVersion();
      // Like the real SDK (data-channel/hooks.js), pushEntry is undefined on
      // the first render and only arrives after the subscription is set up.
      const [pushReady, setPushReady] = useState(false);
      useEffect(() => { setPushReady(true); }, []);
      const user = me();
      const visible = server.entries
        .filter((e) => e.channelName === channelName && canSee(user, e))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) as unknown as
        { payloadJson: T; createdBy: string; createdAt: string; entryId: string }[];
      const data = type === DataChannelTypes.LATEST_ITEM ? visible.slice(0, 1) : visible;
      server.subscriptions.push({ userId: user.userId, channelName, type });
      return {
        data: { loading: false, data },
        pushEntry: !pushReady ? undefined : (payloadJson: T, options?: { receivers?: Receiver[] }) => {
          const config = channelConfig(channelName);
          if (!config || !hasPermission(config.pushPermission, user)) {
            server.rejectedPushes.push({ userId: user.userId, channelName });
            return;
          }
          server.clock += 1;
          const ts = new Date(Date.UTC(2026, 9, 23, 0, 0, server.clock)).toISOString();
          (server.holdPushes ? server.held : server.entries).push({
            entryId: `e${server.clock}`,
            channelName,
            createdBy: user.userId,
            createdAt: ts,
            updatedAt: ts,
            payloadJson: JSON.parse(JSON.stringify(payloadJson)),
            receivers: options?.receivers ?? [],
          });
          server.notify();
        },
        deleteEntry: (ids: string[]) => {
          const config = channelConfig(channelName);
          server.entries = server.entries.filter((e) => {
            if (e.channelName !== channelName) return true;
            const targeted = ids.includes(RESET_DATA_CHANNEL) || ids.includes(e.entryId);
            return !(targeted && config && hasPermission(config.replaceOrDeletePermission, user, e));
          });
          server.notify();
        },
        replaceEntry: jest.fn(),
      };
    },
  };
}

const apis = new Map<string, ReturnType<typeof makeApi>>();

export const BbbPluginSdk = {
  initialize: jest.fn(),
  getPluginApi: (uuid: string) => {
    if (!apis.has(uuid)) apis.set(uuid, makeApi(uuid));
    return apis.get(uuid);
  },
};
