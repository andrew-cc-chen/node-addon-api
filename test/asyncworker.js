'use strict';
const buildType = process.config.target_defaults.default_configuration;
const assert = require('assert');
const common = require('./common');

// we only check async hooks on 8.x an higher were
// they are closer to working properly
const nodeVersion = process.versions.node.split('.')[0]
let async_hooks = undefined;
function checkAsyncHooks() {
  if (nodeVersion >=8) {
    if (async_hooks == undefined) {
      async_hooks = require('async_hooks');
    }
    return true;
  }
  return false;
}

test(require(`./build/${buildType}/binding.node`));
test(require(`./build/${buildType}/binding_noexcept.node`));
test(require(`./build/${buildType}/coverage.node`));

function installAsyncHooksForTest() {
  return new Promise((resolve, reject) => {
    let id;
    const events = [];
    const hook = async_hooks.createHook({
      init(asyncId, type, triggerAsyncId, resource) {
        if (id === undefined && type === 'TestResource') {
          id = asyncId;
          events.push({ eventName: 'init', type, triggerAsyncId, resource });
        }
      },
      before(asyncId) {
        if (asyncId === id) {
          events.push({ eventName: 'before' });
        }
      },
      after(asyncId) {
        if (asyncId === id) {
          events.push({ eventName: 'after' });
        }
      },
      destroy(asyncId) {
        if (asyncId === id) {
          events.push({ eventName: 'destroy' });
          hook.disable();
          resolve(events);
        }
      }
    }).enable();
  });
}

function test(binding) {
  if (!checkAsyncHooks()) {
    binding.asyncworker.doWork(true, {}, function (e) {
      assert.strictEqual(typeof e, 'undefined');
      assert.strictEqual(typeof this, 'object');
      assert.strictEqual(this.data, 'test data');
    }, 'test data');

    binding.asyncworker.doWork(false, {}, function (e) {
      assert.ok(e instanceof Error);
      assert.strictEqual(e.message, 'test error');
      assert.strictEqual(typeof this, 'object');
      assert.strictEqual(this.data, 'test data');
    }, 'test data');
    return;
  }

  {
    const hooks = installAsyncHooksForTest();
    const triggerAsyncId = async_hooks.executionAsyncId();
    binding.asyncworker.doWork(true, { foo: 'foo' }, function (e) {
      assert.strictEqual(typeof e, 'undefined');
      assert.strictEqual(typeof this, 'object');
      assert.strictEqual(this.data, 'test data');
    }, 'test data');

    hooks.then(actual => {
      assert.deepStrictEqual(actual, [
        { eventName: 'init',
          type: 'TestResource',
          triggerAsyncId: triggerAsyncId,
          resource: { foo: 'foo' } },
        { eventName: 'before' },
        { eventName: 'after' },
        { eventName: 'destroy' }
      ]);
    }).catch(common.mustNotCall());
  }

  {
    const hooks = installAsyncHooksForTest();
    const triggerAsyncId = async_hooks.executionAsyncId();

    binding.asyncworker.doWork(false, { foo: 'foo' }, function (e) {
      assert.ok(e instanceof Error);
      assert.strictEqual(e.message, 'test error');
      assert.strictEqual(typeof this, 'object');
      assert.strictEqual(this.data, 'test data');
    }, 'test data');

    hooks.then(actual => {
      assert.deepStrictEqual(actual, [
        { eventName: 'init',
          type: 'TestResource',
          triggerAsyncId: triggerAsyncId,
          resource: { foo: 'foo' } },
        { eventName: 'before' },
        { eventName: 'after' },
        { eventName: 'destroy' }
      ]);
    }).catch(common.mustNotCall());
  }
}
