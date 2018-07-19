const Redlock = require('redlock');

const ExtendLockError = require('./extend-lock');
const UnlockError = require('./unlock');
const LockError = Redlock.LockError;

/**
 * Expose custom error
 */
exports.ExtendLockError = ExtendLockError;
exports.UnlockError = UnlockError;
exports.LockError = LockError;
