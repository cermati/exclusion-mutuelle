/**
 * A class that represents an error that happens when we're extending lock more than the given limit.
 *
 * @constructor
 * @author Sendy Halim <sendy@cermati.com>
 * @param {String} message - The error message.
 * @param {Number} extendLockLimit
 */
function ExtendLockError(message, extendLockLimit) {
  this.message = message;
  this.extendLockLimit = extendLockLimit;
  this.name = 'ExtendLockError';

  Error.captureStackTrace(this, ExtendLockError);
}

ExtendLockError.prototype = Object.create(Error.prototype);
ExtendLockError.prototype.constructor = ExtendLockError;

module.exports = ExtendLockError;

