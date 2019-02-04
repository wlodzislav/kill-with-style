# kill-with-style - Kill procesess gracefully with retries, signals and all children

Kill child processes gracefully and surely with all their children. With retries, custom signals, timeout and customizable retry/check intervals.

Fully tested. Supports MacOS/Linux/Windows.

```javascript
var kill = require("kill-with-style");

var childProcess = require("child_process");
var child = childProcess.spawn("...");

kill(child.pid, function (err) {
    if (err) {
        // process can't be killed or timedout
    }
    // process is dead
});

// Or with options

var options = {
    signal: "SIGKILL",
    retryCount: 5,
    retryInterval: 500
};

kill(child.pid, options, callback);
```

Install:

	npm install kill-with-style

If you trust child process to clean its own children, but it will take time, try to set longer timeout and 0 retries, that way it will patiently wait it to die after the first signal:

```
kill(child.pid, { timeout: 10000, retryCount: 0 }, callback);
```

If you trust, but want some guarantees, try to wait long enough and kill it with `SIGKILL` afterwards:

```
kill(child.pid, {
    signal: ["SIGINT", "SIGKILL"],
    retryCount: 1,
    retryInterval: 10000,
    timeout: 11000
}, callback);
```

Send `SIGINT`, wait 10000, send `SIGKILL`, wait 1000 until timeout.

## Features:

 - [x] Allow processes to gracefully exit and clean children themselves 
 - [x] Multiple retries to kill
 - [x] Retry to kill with specific interval, multiple intervals for each retry
 - [x] Custom signal, could set different signal for each try
 - [x] Set timeout
 - [x] Set check interval for processes that die after delay
 - [x] Use PGID on mac/linux to kill children that are spawned between sending parent signal and checking (for detached processes only)

## Options

All options except `.timeout` are applied when trying to kill children.

When setting timeouts keep in mind that children will be killed only afrer parent process is dead.

### .signal

By default = `"SIGINT"`. Isn't supported on Windows.

Set signal that will be send to child process. If value is array of signals, each signal will be use for the Nth try.

If `.signal` is array and its length is less then `.retryCount + 1` then the last signal will be used for all subsequent retries.

Examples:

```
	{ signal: "SIGINT" }
```

All attempts to kill will send `SIGINT` signal to child.

```
	{ signal: ["SIGINT", "SIGINT", "SIGKILL"], retryCount: 2 }
```

Send `SIGINT`, send `SIGINT`, send `SIGKILL`.

```
	{ signal: ["SIGINT", "SIGINT", "SIGKILL"], retryCount: 3 }
```

Send `SIGINT`, send `SIGINT`, send `SIGKILL`, send `SIGKILL`.

### .timeout

By default = `2000`. In milliseconds.

After specified millisecons module will stop trying to kill process and return error.

### .retryInterval

By default = `2000`. In milliseconds.

Interval between retries to kill process. Could be array to specify interval between each retries.

If `.retryInterval` is array and its length is less then `.retryCount` then the last interval will be used for all subsequent retries.

If both `.retryInterval` and `.retryCount` are specified will overwrite `.timeout` if it's shorter than all tries need. Example:

```
	{ retryInterval: 1000, retryCount: 2, timeout: 1500 }
	// overwrite .timeout = 1000 + 1000 + 1000
```

```
	{ retryInterval: 1000, retryCount: 2, timeout: 3000 }
	// .timeout = 3000, no overwrite
```

Examples:

```
	{ retryInterval: 200, retryCount: 2 }
```

Try to kill, wait 200, retry, wait 200, retry, wait until timeout.

```
	{ retryInterval: [500, 200, 100], retryCount: 3 }
```

Try to kill, wait 500, retry, wait 200, retry, wait 100, retry, wait until timeout.


```
	{ retryInterval: [500, 100], retryCount: 3 }
```

Try to kill, wait 500, retry, wait 100, retry, wait 100, retry, wait until timeout.

### .retryCount

By default = `3`.

Set number of retries to kill the process. Total tries will be `.retryCount + 1`.

If `.retryInterval` is not specified, it will be calculated as `.timeout / (.retryCount + 1)`.

### .checkInterval

By default = `50`. In milliseconds.

Interval of checks after sending signal. Will try to check if process is dead until next retry or timeout.

If `.checkInterval > .retryInterval` it will check if process is dead exactly once.

### .usePGID

By default = `true`.

Used only if process is detached, pid == pgid! When process is in own group all sub-children will have the same pgid.

Will use process group ID on mac/linux to track all children.

Isn't used on Windows.

## Getting Processes

Module uses `ps` on mac/linux and `WMIC` on windows and parses their output, exact commands are:

```
  ps -A -o ppid,pgid,pid
  wmic PROCESS GET ParentProcessId,ProcessId
```


