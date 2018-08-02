const _ = require('lodash');
const Bluebird = require('bluebird');
const chai = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();
const Redlock = require('redlock');

const { ExtendLockError, LockError, UnlockError } = require('../src/errors');

chai.use(require('sinon-chai'));
chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe('run()', () => {
  const unlockerStub = {
    unlock: _.noop,
    extend: _.noop
  };

  const RedLockStub = function () {  };
  RedLockStub.LockError = LockError;
  RedLockStub.prototype.lock = _.noop;

  const rewiredMutexModule = proxyquire(
      '../src/index',
      { 'redlock': RedLockStub }
    )
    .initialize({ redisClients: [] });

  context('when lock key is invalid', () => {
    const dummyFunction = sinon.stub();

    context('and the lock key is an object', () => {
      it('should reject with an error', () => {
        const deferred = rewiredMutexModule.run(dummyFunction, {
          lockKey: { object: 'lorem ipsum' }
        });

        expect(deferred).to.be.rejected;
        expect(dummyFunction).not.to.be.called;
      });
    });

    context('and the lock key is an array of object', () => {
      it('should reject with an error', () => {
        const deferred = rewiredMutexModule.run(dummyFunction, {
          lockKey: [{ object: 'lorem ipsum' }]
        });

        expect(deferred).to.be.rejected;
        expect(dummyFunction).not.to.be.called;
      });
    });

    context('and the lock key is an empty array', () => {
      it('should reject with an error', async () => {
        const deferred = rewiredMutexModule.run(dummyFunction, {
          lockKey: []
        });

        await expect(deferred).to.be.rejected;
        expect(dummyFunction).not.to.be.called;
      });
    });
  });

  context('when no error occurs', () => {
    const dummyFunction = sinon.stub();

    before('setup stubs', async () => {
      sinon
        .stub(unlockerStub, 'unlock')
        .resolves();

      sinon.stub(global, 'setInterval')
      sinon.stub(global, 'clearInterval')

      sinon
        .stub(RedLockStub.prototype, 'lock')
        .usingPromise(Bluebird.Promise).resolves(unlockerStub);

      await rewiredMutexModule.run(dummyFunction, {
        lockKey: 'lock-key'
      });
    });

    after('reset stubs', () => {
      unlockerStub.unlock.restore();
      global.setInterval.restore();
      global.clearInterval.restore();
      RedLockStub.prototype.lock.restore();
    });

    it('should call lock', () => {
      expect(RedLockStub.prototype.lock).to.be.calledOnce;
    });

    it('should call unlock', () => {
      expect(unlockerStub.unlock).to.be.calledOnce;
    });

    it('should call provided function', () => {
      expect(dummyFunction).to.be.calledOnce;
    });

    it('should call global.setInterval', () => {
      expect(global.setInterval).to.be.calledOnce;
    });

    it('should call global.clearInterval', () => {
      expect(global.clearInterval).to.be.calledOnce;
    });
  });

  context('when lock throws Redlock.LockError', () => {
    context('and it has `attempts` property', () => {
      const dummyFunction = sinon.stub();

      before('setup stubs', () => {
        sinon.stub(global, 'setInterval')
        sinon.stub(global, 'clearInterval')

        sinon
          .stub(RedLockStub.prototype, 'lock')
          .usingPromise(Bluebird.Promise)
          .rejects(new LockError('asd', 5));
      });

      after('restore stubs', () => {
        global.setInterval.restore();
        global.clearInterval.restore();
        RedLockStub.prototype.lock.restore();
      });

      it('should reject the returned promise with LockError', () => {
        const deferred = rewiredMutexModule.run(dummyFunction, {
          lockKey: 'lock-key'
        });

        return expect(deferred).to.be.rejectedWith(LockError);
      });
    });

    context('and it doesn\'t have `attempts` property', () => {
      const dummyFunction = sinon.stub();

      before('setup stubs', () => {
        sinon.stub(global, 'setInterval')
        sinon.stub(global, 'clearInterval')

        sinon
          .stub(RedLockStub.prototype, 'lock')
          .usingPromise(Bluebird.Promise)
          .rejects(new LockError('asd'));
      });

      after('restore stubs', () => {
        global.setInterval.restore();
        global.clearInterval.restore();
        RedLockStub.prototype.lock.restore();
      });

      it('should not reject the returned promise', () => {
        const deferred = rewiredMutexModule.run(dummyFunction, {
          lockKey: 'lock-key'
        });

        return expect(deferred).to.be.rejected;
      });

      it('should not call the provided function', () => {
        return rewiredMutexModule
          .run(dummyFunction, {
            lockKey: 'lock-key'
          })
          .catch(() => {
            expect(global.setInterval).to.be.not.called;
            expect(global.clearInterval).to.be.not.called;
            expect(dummyFunction).to.be.not.called;
          })
      });
    });
  });

  context('when the provided function throws an error', () => {
    const errorDummyFunction = sinon
      .stub()
      .usingPromise(Bluebird.Promise)
      .rejects(new Error('Some random error'));

    before('setup stubs', () => {
      sinon.stub(global, 'setInterval')
      sinon.stub(global, 'clearInterval')

      sinon
        .stub(unlockerStub, 'unlock')
        .resolves();

      sinon
        .stub(RedLockStub.prototype, 'lock')
        .usingPromise(Bluebird.Promise)
        .resolves(unlockerStub);
    });

    after('restore stubs', () => {
      global.setInterval.restore();
      global.clearInterval.restore();
      unlockerStub.unlock.restore();
      RedLockStub.prototype.lock.restore();
    });

    it('should call unlock and clear the interval function', async () => {
      await Bluebird.resolve()
        .then(() => rewiredMutexModule.run(errorDummyFunction, {
          lockKey: 'lock-key'
        }))
        .catch(_.noop);

      expect(unlockerStub.unlock).to.be.calledOnce;
      expect(global.setInterval).to.be.calledOnce;
      expect(global.clearInterval).to.be.calledOnce;
    });

    it('should reject the returned promise if the provided function throws an error', () => {
      const deferred = rewiredMutexModule.run(errorDummyFunction, {
        lockKey: 'lock-key'
      });

      return expect(deferred).to.be.rejected;
    });
  });

  context('when lock.unlock() throws error', () => {
    const dummyFunction = sinon.stub();

    before('setup stubs', () => {
      sinon
        .stub(unlockerStub, 'unlock')
        .usingPromise(Bluebird.Promise)
        .rejects(new Error('Unlocking error'));

      sinon
        .stub(RedLockStub.prototype, 'lock')
        .usingPromise(Bluebird.Promise)
        .resolves(unlockerStub);
    });

    after('restore stubs', () => {
      unlockerStub.unlock.restore();
      RedLockStub.prototype.lock.restore();
    });

    it('should be rejected with UnlockError', () => {
      const deferred = rewiredMutexModule.run(dummyFunction, {
        lockKey: 'lock-key'
      });

      return expect(deferred).to.be.rejectedWith(UnlockError);
    });
  });

  context('when the provided ttl is less than MINIMUM_TTL', () => {
    const dummyFunction = sinon.stub();
    let deferred;

    before('setup stubs', () => {
      sinon.stub(global, 'setInterval')

      sinon
        .stub(RedLockStub.prototype, 'lock')
        .usingPromise(Bluebird.Promise).resolves(unlockerStub);
    });

    before('run function within mutex', () => {
      deferred = rewiredMutexModule.run(dummyFunction, {
        lockKey: 'lock-key',
        lockTtl: 99
      });
    });

    after('reset stubs', () => {
      global.setInterval.restore();
      RedLockStub.prototype.lock.restore();
    });

    it('should throw error', () => {
      return expect(deferred).to.be.rejected;
    });

    it('should not call lock', () => {
      expect(RedLockStub.prototype.lock).to.be.not.called;
    });

    it('should not call setInterval', () => {
      expect(global.setInterval).to.be.not.called;
    });
  });

  context('when the provided function runs longer than lockTtl', () => {
    before('setup stubs', () => {
      sinon
        .stub(unlockerStub, 'unlock')
        .usingPromise(Bluebird.Promise)
        .resolves();

      sinon
        .stub(unlockerStub, 'extend')
        .usingPromise(Bluebird.Promise)
        .resolves();

      sinon.spy(global, 'clearInterval')

      sinon
        .stub(RedLockStub.prototype, 'lock')
        .usingPromise(Bluebird.Promise)
        .resolves(unlockerStub);
    });

    before('run function within mutex', () => {
      return rewiredMutexModule.run(() => Bluebird.delay(1200), {
        lockKey: 'lock-key',
        lockTtl: 300
      });
    })

    after('reset stubs', () => {
      unlockerStub.unlock.restore();
      unlockerStub.extend.restore();
      global.clearInterval.restore();
      RedLockStub.prototype.lock.restore();
    });

    it('should call lock', () => {
      expect(RedLockStub.prototype.lock).to.be.calledOnce;
    });

    it('should call unlock', () => {
      expect(unlockerStub.unlock).to.be.calledOnce;
    });

    it('should call global.clearInterval', () => {
      expect(global.clearInterval).to.be.calledOnce;
    });

    it('should extend lock TTL 4 times', () => {
      expect(unlockerStub.extend).to.be.callCount(4);
    });
  });

  context('when the lock is extended more than 20 times', () => {
    let deferred;

    before('setup stubs', () => {
      sinon
        .stub(unlockerStub, 'unlock')
        .usingPromise(Bluebird.Promise)
        .resolves();

      sinon
        .stub(unlockerStub, 'extend')
        .usingPromise(Bluebird.Promise)
        .resolves();

      sinon.spy(global, 'clearInterval')

      sinon
        .stub(RedLockStub.prototype, 'lock')
        .usingPromise(Bluebird.Promise)
        .resolves(unlockerStub);
    });

    before('run function within mutex', () => {
      deferred = rewiredMutexModule.run(() => Bluebird.delay(2200), {
        lockKey: 'lock-key',
        lockTtl: 110
      });
    })

    after('reset stubs', () => {
      unlockerStub.unlock.restore();
      unlockerStub.extend.restore();
      global.clearInterval.restore();
      RedLockStub.prototype.lock.restore();
    });

    it('should throw ExtendLockError', () => {
      return expect(deferred).to.be.rejectedWith(ExtendLockError);
    });

    it('should call lock', () => {
      expect(RedLockStub.prototype.lock).to.be.calledOnce;
    });

    it('should call unlock', () => {
      expect(unlockerStub.unlock).to.be.calledOnce;
    });

    it('should call global.clearInterval', () => {
      expect(global.clearInterval).to.be.calledOnce;
    });

    it('should extend lock TTL 20 times', () => {
      expect(unlockerStub.extend).to.be.callCount(20);
    });
  });

  context('when using multiple lock key', () => {
    const lockKeys = ['lock-key1', 'lock-key2', 'lock-key3'];
    const lockKeyCount = lockKeys.length;

    context('and no error occurs', () => {
      const dummyFunction = sinon.stub();

      before('setup stubs', async () => {
        sinon
          .stub(unlockerStub, 'unlock')
          .resolves();

        sinon.stub(global, 'setInterval')
        sinon.stub(global, 'clearInterval')

        sinon
          .stub(RedLockStub.prototype, 'lock')
          .usingPromise(Bluebird.Promise).resolves(unlockerStub);

        await rewiredMutexModule.run(dummyFunction, {
          lockKey: lockKeys
        });
      });

      after('reset stubs', () => {
        unlockerStub.unlock.restore();
        global.setInterval.restore();
        global.clearInterval.restore();
        RedLockStub.prototype.lock.restore();
      });

      it('should call lock', () => {
        expect(RedLockStub.prototype.lock).to.have.callCount(lockKeyCount);
      });

      it('should call unlock', () => {
        expect(unlockerStub.unlock).to.have.callCount(lockKeyCount);
      });

      it('should call provided function', () => {
        expect(dummyFunction).to.be.calledOnce;
      });

      it('should call global.setInterval', () => {
        expect(global.setInterval).to.be.calledOnce;
      });

      it('should call global.clearInterval', () => {
        expect(global.clearInterval).to.be.calledOnce;
      });
    });

    context('when the provided function throws an error', () => {
      const errorDummyFunction = sinon
        .stub()
        .usingPromise(Bluebird.Promise)
        .rejects(new Error('Some random error'));

      before('setup stubs', () => {
        sinon.stub(global, 'setInterval')
        sinon.stub(global, 'clearInterval')

        sinon
          .stub(unlockerStub, 'unlock')
          .resolves();

        sinon
          .stub(RedLockStub.prototype, 'lock')
          .usingPromise(Bluebird.Promise)
          .resolves(unlockerStub);
      });

      after('restore stubs', () => {
        global.setInterval.restore();
        global.clearInterval.restore();
        unlockerStub.unlock.restore();
        RedLockStub.prototype.lock.restore();
      });

      it('should call unlock and clear the interval function', async () => {
        await Bluebird.resolve()
          .then(() => rewiredMutexModule.run(errorDummyFunction, {
            lockKey: lockKeys
          }))
          .catch(_.noop);

        expect(unlockerStub.unlock).to.have.callCount(lockKeyCount);
        expect(global.setInterval).to.be.calledOnce;
        expect(global.clearInterval).to.be.calledOnce;
      });

      it('should reject the returned promise if the provided function throws an error', () => {
        const deferred = rewiredMutexModule.run(errorDummyFunction, {
          lockKey: lockKeys
        });

        return expect(deferred).to.be.rejected;
      });
    });

    context('when the provided function runs longer than lockTtl', () => {
      before('setup stubs', () => {
        sinon
          .stub(unlockerStub, 'unlock')
          .usingPromise(Bluebird.Promise)
          .resolves();

        sinon
          .stub(unlockerStub, 'extend')
          .usingPromise(Bluebird.Promise)
          .resolves();

        sinon.spy(global, 'clearInterval')

        sinon
          .stub(RedLockStub.prototype, 'lock')
          .usingPromise(Bluebird.Promise)
          .resolves(unlockerStub);
      });

      before('run function within mutex', () => {
        return rewiredMutexModule.run(() => Bluebird.delay(1200), {
          lockKey: lockKeys,
          lockTtl: 300
        });
      })

      after('reset stubs', () => {
        unlockerStub.unlock.restore();
        unlockerStub.extend.restore();
        global.clearInterval.restore();
        RedLockStub.prototype.lock.restore();
      });

      it('should call lock', () => {
        expect(RedLockStub.prototype.lock).to.have.callCount(lockKeyCount);
      });

      it('should call unlock', () => {
        expect(unlockerStub.unlock).to.have.callCount(lockKeyCount);
      });

      it('should call global.clearInterval', () => {
        expect(global.clearInterval).to.be.calledOnce;
      });

      it('should extend lock TTL 4 times', () => {
        expect(unlockerStub.extend).to.be.callCount(4 * lockKeyCount);
      });
    });

    context('when the lock is extended more than lock key count * 20 times', () => {
      let deferred;

      before('setup stubs', () => {
        sinon
          .stub(unlockerStub, 'unlock')
          .usingPromise(Bluebird.Promise)
          .resolves();

        sinon
          .stub(unlockerStub, 'extend')
          .usingPromise(Bluebird.Promise)
          .resolves();

        sinon.spy(global, 'clearInterval')

        sinon
          .stub(RedLockStub.prototype, 'lock')
          .usingPromise(Bluebird.Promise)
          .resolves(unlockerStub);
      });

      before('run function within mutex', () => {
        deferred = rewiredMutexModule.run(() => Bluebird.delay(2200), {
          lockKey: lockKeys,
          lockTtl: 110
        });
      })

      after('reset stubs', () => {
        unlockerStub.unlock.restore();
        unlockerStub.extend.restore();
        global.clearInterval.restore();
        RedLockStub.prototype.lock.restore();
      });

      it('should throw ExtendLockError', () => {
        return expect(deferred).to.be.rejectedWith(ExtendLockError);
      });

      it('should call lock', () => {
        expect(RedLockStub.prototype.lock).to.have.callCount(lockKeyCount);
      });

      it('should call unlock', () => {
        expect(unlockerStub.unlock).to.have.callCount(lockKeyCount);
      });

      it('should call global.clearInterval', () => {
        expect(global.clearInterval).to.be.calledOnce;
      });

      it('should extend lock TTL 20 times', () => {
        expect(unlockerStub.extend).to.be.callCount(20 * lockKeyCount);
      });
    });
  });

});

