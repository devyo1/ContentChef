import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createUpdater } from '../electron/updater.js';

function setup(extra = {}) {
  const driver = new EventEmitter();
  driver.checkForUpdates = async () => { driver.emit('update-not-available'); };
  const states = [], installs = [];
  driver.quitAndInstall = (...args) => installs.push(args);
  const controller = createUpdater({ updater: driver, packaged: true, version: '0.2.0', emit: (s) => states.push(s), ...extra });
  return { driver, controller, states, installs };
}
test('source and unsupported builds never check, download or install updates', async () => {
  for (const extra of [{ packaged: false }, { supported: false }]) {
    const { driver, controller } = setup(extra);
    driver.checkForUpdates = () => { throw new Error('must not run'); };
    assert.equal((await controller.check()).phase, 'disabled');
    assert.equal(controller.install(), false);
    assert.equal(driver.listenerCount('checking-for-update'), 0);
  }
});
test('release updates automatically download stable versions and install once when ready', async () => {
  const { driver, controller, installs } = setup();
  try {
    assert.equal(driver.autoDownload, true);
    assert.equal(driver.autoInstallOnAppQuit, true);
    assert.equal(driver.allowDowngrade, false);
    assert.equal(driver.allowPrerelease, false);
    assert.equal(controller.install(), false);
    await controller.check();
    assert.equal(controller.status().phase, 'current');
    driver.emit('update-available', { version: '0.3.0' });
    driver.emit('download-progress', { percent: 47.2 });
    assert.equal(controller.status().percent, 47.2);
    await controller.check();
    assert.equal(controller.status().phase, 'downloading');
    driver.emit('update-downloaded', { version: '0.3.0' });
    await controller.check();
    assert.equal(controller.status().phase, 'ready');
    assert.equal(controller.install(), true);
    assert.equal(controller.install(), false);
    assert.deepEqual(installs, [[true, true]]); // silent install, then reopen
  } finally { controller.dispose(); }
});
test('concurrent checks coalesce and failed checks can be retried', async () => {
  const { driver, controller } = setup();
  try {
    let checks = 0, release;
    driver.checkForUpdates = () => { checks++; return new Promise((resolve) => { release = resolve; }); };
    const first = controller.check(), second = controller.check();
    await Promise.resolve();
    assert.equal(checks, 1);
    driver.emit('update-not-available'); release();
    await Promise.all([first, second]);
    driver.checkForUpdates = async () => { throw new Error('404 missing latest.yml'); };
    await controller.check();
    assert.equal(controller.status().phase, 'error');
    assert.match(controller.status().error, /No published update/);
    driver.checkForUpdates = async () => { driver.emit('update-not-available'); };
    assert.equal((await controller.check()).phase, 'current');
    assert.equal(controller.status().error, null);
  } finally { controller.dispose(); }
});
test('failed or interrupted downloads never become installable and can be retried', async () => {
  const { driver, controller } = setup();
  try {
    driver.checkForUpdates = async () => {
      driver.emit('update-available', { version: '0.3.0' });
      return { downloadPromise: Promise.reject(new Error('checksum mismatch')) };
    };
    await controller.check();
    assert.equal(controller.status().phase, 'error');
    assert.equal(controller.install(), false);
    driver.checkForUpdates = async () => { driver.emit('update-downloaded', { version: '0.3.0' }); };
    await controller.check();
    assert.equal(controller.status().phase, 'ready');
    driver.quitAndInstall = () => { throw new Error('installer unavailable'); };
    assert.equal(controller.install(), false);
    assert.equal(controller.status().phase, 'error');
  } finally { controller.dispose(); }
});
test('disposing update checks removes listeners and prevents future work', async () => {
  const { driver, controller, states } = setup();
  controller.dispose();
  driver.checkForUpdates = () => { throw new Error('must not run'); };
  await controller.check();
  driver.emit('update-downloaded', { version: '9.0.0' });
  assert.equal(states.length, 0);
  assert.equal(controller.install(), false);
  assert.equal(driver.listenerCount('download-progress'), 0);
});
