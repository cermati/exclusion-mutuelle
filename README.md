# Exclusion Mutuelle
-----
Exclusion Mutuelle is a French language of `Mutual Exclusion`. This is an implementation of [mutex](https://en.wikipedia.org/wiki/Mutual_exclusion) using `redlock` and `redis`.


## Installation
```
npm install exclusion-mutuelle --save
```


## Configuration
```js
const mutex = require('exclusive-mutuelle');

const redisClients = [
  require('redis').createClient(6379, 'redis1.example.com'),
  require('redis').createClient(6379, 'redis2.example.com')
];

const mutexConfig = {
  redisClients, // array of redis client to store the lock key
  debugKey: 'exclusion-mutuelle', // debug key to show debug message
  minimumTtl: 100, // minimum time to live when using mutex (in ms)
  extendLockBufferOffset: 50, // Interval for redlock to extend periodically (in ms)
  maxExtendLockCount: 20, // Maximum count that lock can be extended
  redlockOptions: {
    retryCount: 0, // How many times to retry until the lock is acquired
    retryDelay: 1100 // Retry delay per attempt (in ms)
    // Please see https://github.com/mike-marcacci/node-redlock for details
  }
};

// mutexClient SHOULD be initiated as a singleton
const mutexClient = mutex.initialize(mutexConfig);
```

## Quick Usage
```js
...
const mutexClient = mutex.initialize(mutexConfig);

// Function to print a message after x ms
const printAfter = async (message, delay) => {
  await Bluebird.delay(delay);

  console.log(message);
};

const exclusiveFunc1 = () => printAfter('Function 1', 1000);
const exclusiveFunc2 = () => printAfter('Function 2', 300);

// This function with lock key `lock-key` will run exclusively
// Another function who use the same lock key, will not be able to run until this function finished
const deferred1 = mutexClient.run(exclusiveFunc1, {
  lockKey: 'lock-key',
  lockTtl: 15000
});

// This function will throw `LockError`, because the resource is still locked by `deferred1`
// or you can make this function wait for `deferred1` if you set the `retryCount` and `retryDelay` in `redlockOptions`
const deferred2 = mutexClient.run(
    exclusiveFunc2,
    { lockKey: 'lock-key', lockTtl: 1000 }
  )
  .catch(LockError, () => console.log('Throw an error with type LockError'))
  .catch(error => console.log('this error should not be printed'));

Bluebird
  .all([deferred1, deferred2])
  .then(() => console.log('success'))
  .catch(console.error)

```
