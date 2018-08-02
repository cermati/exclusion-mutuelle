const _ = require('lodash');
const Bluebird = require('bluebird').config({ cancellation: true });
const Redlock = require('redlock');

const { ExtendLockError, LockError, UnlockError } = require('./errors');

/**
 * Create mutex singleton.
 *
 * @author Muhamad Luthfie La Roeha <mroeha@cermati.com>
 * @param {Object} config
 * @param {Array<Redis>} config.redisClients - Array of Redis Client for storing lock key
 * @param {Number} config.redlockOptions - redlock configuration
 * @param {Number} config.minimumTtl - Minimum TTL for the redis lock
 * @param {Number} config.extendLockBufferOffset - The offset before TTL expire (when we want to extend the TTL)
 * @param {Number} config.maxExtendLockCount - The maximum limit that lock can be extended
 * @returns {Object}
 */
exports.initialize = ({
  redisClients,
  debugKey = 'exclusion-mutuelle',
  minimumTtl = 100, // in ms
  extendLockBufferOffset = 50, // in ms
  maxExtendLockCount = 20,
  redlockOptions = { retryCount: 0 }
}) => {
  const redlock = new Redlock(redisClients, redlockOptions);
  const debug = require('debug')(debugKey);

  return {
    /**
     * Run the given function `f` around mutex mechanism so that the function can use the resource
     * exclusively.
     *
     * @author Sendy Halim <sendy@cermati.com>
     * @param {Function} f - Function to be run.
     * @param {Object} config
     * @param {String|String[]} config.lockKey
     * @param {String} [config.lockTtl] - Lock TTL in ms, defaults to 1000ms.
     * @returns {Promise<Void>}
     */
    run: (f, { lockKey, lockTtl = 1000 }) => {
      let extendLockError = {};
      debug('[Mutex %s] Locking resource with ttl %s ms', lockKey, lockTtl);

      if (lockTtl < minimumTtl) {
        return Bluebird.reject(new Error(`TTL must be more than ${minimumTtl} ms!`));
      }

      const lockKeys = (_.isArray(lockKey)) ? lockKey : [lockKey];

      if (!_.every(lockKeys, _.isString)) {
        return Bluebird.reject(new Error('Lock key must be a string or an array of string'));
      }

      return Bluebird
        .map(lockKeys, key => redlock.lock(key, lockTtl))
        .then((locks) => {
          // Call the original function as it is
          const deferred = Bluebird.resolve(f());

          const intervalTime = lockTtl - extendLockBufferOffset;

          let extendLockCounter = 0;

          // Now we want to make sure that our function `f` will run exclusively 100%
          // we'll run a function to extend the lock every `lockTtl - config.extendLockBufferOffset` ms
          const interval = setInterval(() => {
            extendLockCounter++;

            if (extendLockCounter > maxExtendLockCount) {
              // When we cancel `f` within bluebird domain, it'll call `finally` callback
              deferred.cancel();

              extendLockError.message = `[Mutex ${lockKey}] Promise is cancelled because it's been extended for more than ${maxExtendLockCount} (extend count: ${extendLockCounter})`;

              return;
            }

            debug(
              '[Mutex %s] Start extending lock TTL for %s ms within interval %s',
              lockKey,
              lockTtl,
              intervalTime
            );

            return Bluebird
              .map(locks, lock => lock.extend(lockTtl))
              .then(() => {
                debug('[Mutex %s] Done extending lock TTL for %s ms', lockKey, lockTtl);
              })
              .catch(error => {
                // If error occurs at this point then there's a possible race condition
                // because we failed to extend the lock.
                // To prevent race condition, we'll try to cancel the promise.
                deferred.cancel();

                extendLockError = error;
              });
          }, intervalTime);

          // Finally will be called regardless of `deferred` got cancelled
          return deferred.finally(() => {
            debug(`[Mutex %s] Unlocking resource with TTL %s ms`, lockKey, lockTtl);

            clearInterval(interval);

            return Bluebird
              .map(locks, lock => lock.unlock())
              .then(() => {
                debug(`[Mutex %s] Done unlocking resource with TTL %s ms`, lockKey, lockTtl);
              })
              .catch((error) => {
                const unlockError = new UnlockError(`[Mutex ${lockKey}] Error when unlocking resource, no worries we\'ve set a TTL ${lockTtl} ms, it\'ll unlock automatically. Error ${error}`);
                unlockError.stack = error.stack;

                throw unlockError;
              })
              .then(() => {
                // We need to throw an error if it's cancelled.
                // Otherwise, the promise will hang because the `.then` handler that's
                // attached after `mutex.run` won't be called, one way to make sure that
                // it won't hang is by throwing an error so the `.catch` handler will
                // be called.
                if (deferred.isCancelled()) {
                  const error = new ExtendLockError(extendLockError.message);
                  error.stack = extendLockError.stack || error.stack;

                  throw error;
                }
              });
          });
        })
    }
  };
};

