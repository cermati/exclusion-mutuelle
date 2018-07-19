/**
 * A class that represents an error that happens when unlocking the lock key
 *
 * @constructor
 * @author Muhamad Luthfie La Roeha <mroeha@cermati.com>
 * @param {String} message - The error message.
 * @param {extra} extra params
 */
function UnlockError(message, extra) {
  this.message = message;
  this.extra = extra;
  this.name = 'UnlockError';

  Error.captureStackTrace(this, UnlockError);
}

UnlockError.prototype = Object.create(Error.prototype);
UnlockError.prototype.constructor = UnlockError;

module.exports = UnlockError;

