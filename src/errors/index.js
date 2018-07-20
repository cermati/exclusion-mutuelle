const Redlock = require('redlock');

const ExtendLockError = require('./extend-lock-error');
const UnlockError = require('./unlock-error');
const LockError = Redlock.LockError;

/**
 * Expose custom error
 */
exports.ExtendLockError = ExtendLockError;
exports.UnlockError = UnlockError;
exports.LockError = LockError;
