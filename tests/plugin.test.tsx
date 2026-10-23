import * as React from 'react';
import { Root } from 'react-dom/client';
import {
  render, screen, within, act, fireEvent,
} from '@testing-library/react';
import Plotly from 'plotly.js-basic-dist-min';
import { server, FakeUser, BbbPluginSdk } from './fakeSdk';
import semver from 'semver';
import manifest from '../manifest.json';
import sdkPackage from 'bigbluebutton-html-plugin-sdk/package.json';
import PlotPlugin from '../src/plot-plugin/component';
import { SESSION_CHANNEL, STUDENT_CHANNEL, PUSH_DEBOUNCE_MS } from '../src/plot-plugin/types';

jest.mock('bigbluebutton-html-plugin-sdk', () => jest.requireActual('./fakeSdk'));

const TEACHER: FakeUser = {
  userId: 'u-teacher', name: 'Teacher', presenter: true, role: 'MODERATOR',
};
const ALICE: FakeUser = {
  userId: 'u-alice', name: 'Student A', presenter: false, role: 'VIEWER',
};
const BOB: FakeUser = {
  userId: 'u-bob', name: 'Student B', presenter: false, role: 'VIEWER',
};

// Each user is a separate "browser": the plugin root plus the main-area
// element BBB hands to contentFunction.
const browsers = new Map<string, { content: HTMLElement; root: Root | null }>();

function join(user: FakeUser) {
  server.users.set(user.userId, user);
  const content = document.createElement('div');
  content.setAttribute('data-browser', user.userId);
  document.body.appendChild(content);
  browsers.set(user.userId, { content, root: null });
  render(<PlotPlugin pluginUuid={user.userId} />);
}

function unmount(browser: { root: Root | null }) {
  const b = browser;
  act(() => b.root?.unmount());
  b.root = null;
}

// Mirrors BBB: mount the generic content when the plugin registers it,
// unmount it when the plugin clears it.
function syncMainArea() {
  browsers.forEach((b, uuid) => {
    const items = server.genericContent.get(uuid) ?? [];
    const browser = b;
    if (items.length && !browser.root) {
      act(() => { browser.root = items[0].contentFunction(browser.content); });
    } else if (!items.length && browser.root) {
      unmount(browser);
    }
  });
}

const view = (user: FakeUser) => within(browsers.get(user.userId)!.content);

function openPlot() {
  act(() => { server.appsGallery.get(TEACHER.userId)![0].onClick(); });
  syncMainArea();
}

function setFormulas(formulas: string[]) {
  const t = view(TEACHER);
  formulas.forEach((f, i) => {
    if (i > 0) fireEvent.click(t.getByRole('button', { name: 'Add formula' }));
    fireEvent.change(t.getByLabelText(`Edit formula ${i + 1}`), { target: { value: f } });
  });
  act(() => { fireEvent.click(t.getByRole('button', { name: 'Apply formulas' })); });
}

function typeCurrentFormula(user: FakeUser, value: string) {
  fireEvent.change(view(user).getByLabelText('Current formula'), { target: { value } });
}

beforeEach(() => {
  jest.useFakeTimers();
  server.reset();
  (Plotly.react as jest.Mock).mockClear();
  [TEACHER, ALICE, BOB].forEach(join);
});

afterEach(() => {
  browsers.forEach((b) => { unmount(b); b.content.remove(); });
  browsers.clear();
  jest.useRealTimers();
});

describe('Manifest permissions', () => {
  it('Then only moderators can write, replace or clear the shared session', () => {
    const session = manifest.dataChannels.find((c) => c.name === SESSION_CHANNEL);
    expect(session!.pushPermission).toEqual(['moderator']);
    expect(session!.replaceOrDeletePermission).toEqual(['moderator']);
  });

  it('Then student entries can only be replaced or deleted by their creator or a moderator', () => {
    const students = manifest.dataChannels.find((c) => c.name === STUDENT_CHANNEL);
    expect(students!.replaceOrDeletePermission).toEqual(['creator', 'moderator']);
  });

  it('Then the required SDK version matches the SDK the plugin is built with', () => {
    expect(semver.satisfies(sdkPackage.version, manifest.requiredSdkVersion)).toBe(true);
  });

  it('Then nothing is written to recordings', () => {
    expect((manifest as { eventPersistence?: { isEnabled: boolean } }).eventPersistence?.isEnabled ?? false)
      .toBe(false);
  });
});

describe('Given a meeting with a presenter and two students', () => {
  // Behaviour 8
  it('Then a student has no "Plot" launcher and no teacher controls', () => {
    expect(server.appsGallery.get(ALICE.userId) ?? []).toHaveLength(0);
    expect(server.appsGallery.get(TEACHER.userId)!.map((e) => e.name)).toEqual(['Plot']);
    openPlot();
    expect(view(ALICE).queryByRole('button', { name: 'Close Plot' })).toBeNull();
    expect(view(ALICE).queryByRole('button', { name: 'Student mode' })).toBeNull();
    expect(view(ALICE).queryByLabelText('Edit formula 1')).toBeNull();
  });

  it('Then before the presenter opens Plot, nobody sees it', () => {
    syncMainArea();
    expect(browsers.get(ALICE.userId)!.root).toBeNull();
    expect(browsers.get(TEACHER.userId)!.root).toBeNull();
  });

  it('When a student tries to write the shared session directly, then the server rejects it', () => {
    openPlot();
    const before = server.entries.length;
    // A tampered student client calling pushEntry on the presenter-only channel.
    let push: ((payload: object) => void) | undefined;
    function Tampered() {
      push = BbbPluginSdk.getPluginApi(ALICE.userId)!.useDataChannel(SESSION_CHANNEL).pushEntry;
      return null;
    }
    render(<Tampered />);
    act(() => push!({ open: false }));
    expect(server.entries.length).toBe(before);
    expect(server.rejectedPushes).toEqual([{ userId: ALICE.userId, channelName: SESSION_CHANNEL }]);
  });

  // Behaviour 4 (UI part)
  it('When the presenter has 10 formulas, then "Add formula" is disabled', () => {
    openPlot();
    setFormulas(Array.from({ length: 10 }, (_, i) => `x + ${i}`));
    expect(view(TEACHER).getByRole('button', { name: 'Add formula' })).toBeDisabled();
  });

  // Behaviour 5
  it('When the presenter changes the formula in teaching mode, then students see the same formula and plot, read-only', () => {
    openPlot();
    setFormulas(['sin(x)', 'x^2']);
    fireEvent.click(view(TEACHER).getByRole('button', { name: 'x^2' }));
    typeCurrentFormula(TEACHER, 'x^2 + 3');
    act(() => { jest.advanceTimersByTime(PUSH_DEBOUNCE_MS); });

    const alice = view(ALICE);
    expect(alice.getByLabelText('Current formula')).toHaveValue('x^2 + 3');
    expect(alice.getByLabelText('Current formula')).toHaveAttribute('readonly');
    expect(alice.getByRole('button', { name: 'x^2' })).toHaveAttribute('aria-pressed', 'true');
    expect(alice.getByText('y = x^2 + 3')).toBeInTheDocument();
    expect(alice.queryByRole('button', { name: 'Update plot' })).toBeNull();
  });

  it('When the teacher selects a formula and types before the server echoes the selection, then students see the selected formula with the typed text', () => {
    openPlot();
    setFormulas(['sin(x)', 'x^2']);
    act(() => { server.holdPushes = true; });
    fireEvent.click(view(TEACHER).getByRole('button', { name: 'x^2' }));
    typeCurrentFormula(TEACHER, 'x^2 + 3');
    act(() => { jest.advanceTimersByTime(PUSH_DEBOUNCE_MS); });
    act(() => { server.holdPushes = false; server.flush(); });

    expect(view(ALICE).getByLabelText('Current formula')).toHaveValue('x^2 + 3');
    expect(view(ALICE).getByRole('button', { name: 'x^2' })).toHaveAttribute('aria-pressed', 'true');
    expect(view(TEACHER).getByRole('button', { name: 'x^2' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('When the teacher clicks a formula right after applying a new list, before the server echoes it, then the clicked formula is the one sent', () => {
    openPlot();
    setFormulas(['sin(x)', 'x^2']);
    act(() => { server.holdPushes = true; });
    fireEvent.click(view(TEACHER).getByRole('button', { name: 'Remove formula 1' }));
    act(() => { fireEvent.click(view(TEACHER).getByRole('button', { name: 'Apply formulas' })); });
    // The teacher's buttons already show the new list, and clicking one sends it.
    expect(view(TEACHER).queryByRole('button', { name: 'sin(x)' })).toBeNull();
    fireEvent.click(view(TEACHER).getByRole('button', { name: 'x^2' }));
    act(() => { server.holdPushes = false; server.flush(); });

    expect(view(ALICE).getByLabelText('Current formula')).toHaveValue('x^2');
    expect(view(ALICE).getByRole('button', { name: 'x^2' })).toHaveAttribute('aria-pressed', 'true');
  });

  // Behaviour 6
  it('When a student selects and edits a formula in student mode, then their plot updates and only moderators receive it', () => {
    openPlot();
    setFormulas(['sin(x)', 'x^2', 'cos(x)']);
    act(() => { fireEvent.click(view(TEACHER).getByRole('button', { name: 'Student mode' })); });

    const alice = view(ALICE);
    fireEvent.click(alice.getByRole('button', { name: 'cos(x)' }));
    expect(alice.getByLabelText('Current formula')).toHaveValue('cos(x)');
    expect(alice.getByLabelText('Current formula')).not.toHaveAttribute('readonly');
    typeCurrentFormula(ALICE, 'cos(2x)');
    act(() => { fireEvent.click(alice.getByRole('button', { name: 'Update plot' })); });

    expect(alice.getByText('y = cos(2x)')).toBeInTheDocument();

    const sent = server.entries.filter((e) => e.channelName === STUDENT_CHANNEL);
    expect(sent.length).toBeGreaterThan(0);
    sent.forEach((e) => expect(e.receivers).toEqual([{ role: 'MODERATOR' }]));
    expect(sent[sent.length - 1].payloadJson).toEqual({ index: 2, expr: 'cos(2x)' });

    // Bob's screen is unaffected by Alice's work.
    expect(view(BOB).queryByText('y = cos(2x)')).toBeNull();
  });

  it('When a student types without confirming, then nothing is sent', () => {
    openPlot();
    setFormulas(['sin(x)']);
    act(() => { fireEvent.click(view(TEACHER).getByRole('button', { name: 'Student mode' })); });
    const before = server.entries.filter((e) => e.channelName === STUDENT_CHANNEL).length;
    typeCurrentFormula(ALICE, 'sin(3x)');
    act(() => { jest.advanceTimersByTime(PUSH_DEBOUNCE_MS * 10); });
    expect(server.entries.filter((e) => e.channelName === STUDENT_CHANNEL)).toHaveLength(before);
  });

  it('When the teacher makes a student presenter, then that student gets no teacher controls and cannot see classmates\' work', () => {
    openPlot();
    setFormulas(['sin(x)']);
    act(() => { fireEvent.click(view(TEACHER).getByRole('button', { name: 'Student mode' })); });
    act(() => { fireEvent.click(view(BOB).getByRole('button', { name: 'Update plot' })); });

    act(() => {
      server.users.set(TEACHER.userId, { ...TEACHER, presenter: false });
      server.users.set(ALICE.userId, { ...ALICE, presenter: true });
      server.notify();
    });

    // Alice's own subscription to the student channel holds none of Bob's work.
    let aliceSees: unknown[] = [];
    function AliceProbe() {
      aliceSees = BbbPluginSdk.getPluginApi(ALICE.userId)!
        .useDataChannel(STUDENT_CHANNEL).data.data;
      return null;
    }
    render(<AliceProbe />);
    expect(server.entries.some((e) => e.createdBy === BOB.userId)).toBe(true);
    expect(aliceSees).toEqual([]);

    const alice = view(ALICE);
    expect(server.appsGallery.get(ALICE.userId) ?? []).toHaveLength(0);
    expect(alice.queryByRole('button', { name: 'Close Plot' })).toBeNull();
    expect(alice.queryByLabelText('Watch student')).toBeNull();
    expect(alice.getByLabelText('Current formula')).not.toHaveAttribute('readonly');
  });

  it('When a student is presenter, then a moderator who is not presenting can still close Plot for everyone', () => {
    openPlot();
    setFormulas(['sin(x)']);
    act(() => { fireEvent.click(view(TEACHER).getByRole('button', { name: 'Student mode' })); });
    act(() => { fireEvent.click(view(BOB).getByRole('button', { name: 'Update plot' })); });
    act(() => {
      server.users.set(TEACHER.userId, { ...TEACHER, presenter: false });
      server.users.set(ALICE.userId, { ...ALICE, presenter: true });
      server.notify();
    });

    // Neither the presenting student nor the other student can close it.
    expect(view(ALICE).queryByRole('button', { name: 'Close Plot' })).toBeNull();
    expect(view(BOB).queryByRole('button', { name: 'Close Plot' })).toBeNull();
    // The moderator has no teacher controls, but can close.
    expect(view(TEACHER).queryByRole('button', { name: 'Student mode' })).toBeNull();
    act(() => { fireEvent.click(view(TEACHER).getByRole('button', { name: 'Close Plot' })); });
    syncMainArea();

    expect(server.entries).toHaveLength(0);
    [TEACHER, ALICE, BOB].forEach((u) => expect(browsers.get(u.userId)!.root).toBeNull());
  });

  it('When the teacher applies a new formula list in student mode, then students reset to the teacher\'s formula', () => {
    openPlot();
    setFormulas(['sin(x)', 'x^2']);
    act(() => { fireEvent.click(view(TEACHER).getByRole('button', { name: 'Student mode' })); });
    fireEvent.click(view(ALICE).getByRole('button', { name: 'x^2' }));
    typeCurrentFormula(ALICE, 'x^2 - 4');
    act(() => { fireEvent.click(view(ALICE).getByRole('button', { name: 'Update plot' })); });
    typeCurrentFormula(ALICE, 'unsent typing');

    fireEvent.change(view(TEACHER).getByLabelText('Edit formula 2'), { target: { value: 'tan(x)' } });
    act(() => { fireEvent.click(view(TEACHER).getByRole('button', { name: 'Apply formulas' })); });

    expect(view(ALICE).getByLabelText('Current formula')).toHaveValue('sin(x)');
    expect(view(ALICE).getByRole('button', { name: 'sin(x)' })).toHaveAttribute('aria-pressed', 'true');

    // The teacher watching Alice sees the reset too, not her old work.
    fireEvent.change(view(TEACHER).getByLabelText('Watch student'), { target: { value: ALICE.userId } });
    expect(view(TEACHER).getByLabelText('Current formula')).toHaveValue('sin(x)');
  });

  it('Then only the teacher downloads all student work; other clients subscribe to at most the latest entry', () => {
    openPlot();
    const studentSubs = server.subscriptions.filter((s) => s.channelName === STUDENT_CHANNEL);
    expect(studentSubs.filter((s) => s.type === 'Hooks::DataChannel::AllItems').map((s) => s.userId))
      .toEqual(expect.arrayContaining([TEACHER.userId]));
    expect(studentSubs.some((s) => s.userId !== TEACHER.userId && s.type === 'Hooks::DataChannel::AllItems'))
      .toBe(false);
  });

  // Behaviour 7
  it('When the presenter selects a student in student mode, then the presenter sees that student\'s latest formula', () => {
    openPlot();
    setFormulas(['sin(x)', 'x^2']);
    act(() => { fireEvent.click(view(TEACHER).getByRole('button', { name: 'Student mode' })); });
    fireEvent.click(view(ALICE).getByRole('button', { name: 'x^2' }));
    typeCurrentFormula(ALICE, 'x^2 - 4');
    act(() => { fireEvent.click(view(ALICE).getByRole('button', { name: 'Update plot' })); });

    const teacher = view(TEACHER);
    fireEvent.change(teacher.getByLabelText('Watch student'), { target: { value: ALICE.userId } });

    expect(teacher.getByLabelText('Current formula')).toHaveValue('x^2 - 4');
    expect(teacher.getByLabelText('Current formula')).toHaveAttribute('readonly');
    expect(teacher.getByText('y = x^2 - 4')).toBeInTheDocument();
  });

  it('When the presenter watches, then only students who have sent work are listed', () => {
    openPlot();
    setFormulas(['sin(x)']);
    act(() => { fireEvent.click(view(TEACHER).getByRole('button', { name: 'Student mode' })); });
    act(() => { fireEvent.click(view(ALICE).getByRole('button', { name: 'Update plot' })); });

    const options = within(view(TEACHER).getByLabelText('Watch student')).getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual(['Nobody (my own view)', 'Student A']);
  });

  it('When a formula is invalid, then the user sees an error instead of a plot', () => {
    openPlot();
    setFormulas(['sin(x)']);
    typeCurrentFormula(TEACHER, 'x + z');
    expect(view(TEACHER).getByRole('alert')).toHaveTextContent('z');
  });

  // Behaviour 9
  it('When the presenter closes Plot, then it disappears for everyone and both channels are cleared', () => {
    openPlot();
    setFormulas(['sin(x)']);
    act(() => { fireEvent.click(view(TEACHER).getByRole('button', { name: 'Student mode' })); });
    act(() => { fireEvent.click(view(ALICE).getByRole('button', { name: 'Update plot' })); });

    act(() => { fireEvent.click(view(TEACHER).getByRole('button', { name: 'Close Plot' })); });
    syncMainArea();

    expect(server.entries).toHaveLength(0);
    [TEACHER, ALICE, BOB].forEach((u) => expect(browsers.get(u.userId)!.root).toBeNull());
  });
});
