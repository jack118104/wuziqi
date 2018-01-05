'use strict';
require('mocha-generators').install();

const assert = require('chai').assert;
const coroutine = require('express-coroutine').coroutine;
const Lock = require('../../src/global/libs/lock');
const { redis } = require('../../src/global');

describe('Libs - Redis Lock', () => {
  const lock = new Lock(redis, { ttl: 1 });

  beforeEach(function* () {
    yield lock.release();
  });
  
  it('Test - Default Lock acquire and release', function* () {
    assert.ok(yield lock.acquire());
    assert.isNull(yield lock.acquire());
    yield lock.release();
    assert.ok(yield lock.acquire());
  });

  it('Test - Default Lock concurrent', function* () {
    const all = yield Promise.all([lock.acquire(), lock.acquire(), lock.acquire()]);
    assert.equal(all.length, 3);
    const res = all.filter(r => !!r);
    assert.equal(res.length, 1);
  });

  it('Test - Default Lock timeout', function* () {
    assert.ok(yield lock.acquire());
    assert.isNull(yield lock.acquire());
    yield coroutine.delay(100);
    assert.isNull(yield lock.acquire());
    yield coroutine.delay(901);
    assert.ok(yield lock.acquire());
  });

});
