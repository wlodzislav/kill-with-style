var childProcess = require("child_process");

var async = require("async");
var chalk = require("chalk");
var cy = chalk.cyan;
var r = chalk.red;
var gr = chalk.green;

function padN(n, i) {
	return n < 10 ? "0" + n : n;
}

function debug(message) {
	var d = new Date();
	console.log("DEBUG "
		+ ("" + d.getHours()).padStart(2, "0")
		+ ":" + ("" + d.getMinutes()).padStart(2, "0")
		+ ":" + ("" + d.getSeconds()).padStart(2, "0")
		+ "." + ("" + d.getMilliseconds()).padStart(3, "0")
		+ " " +message);
}

function parsePSOutput(fields, output) {
	return output.split("\n").slice(1).filter(Boolean).map(function (line) {
		var entry = {};
		line.split(/\s+/).filter(Boolean).forEach(function (field, i) {
			if (+field == field) {
				field = +field;
			}
			entry[fields[i]] = field;
		})
		return entry;
	});
}


function comparePID(a, b) {
	return a.pid - b.pid;
}

function getProcessChildren(parentPID, options, callback) {
	if (options.debug) {
		debug("Get children for " + cy("pid=" + parentPID));
	}
	var usePGID = options.usePGID;
	childProcess.exec("ps -A -o ppid,pgid,pid", { encoding: "utf8" }, function (err, psOutput) {
		if (err) { return callback(err); }
		var ps = parsePSOutput(["ppid", "pgid", "pid"], psOutput);
		var children = {};
		var parentEntryIndex = ps.findIndex(function (entry) {
			return entry.pid == parentPID; });

		if (parentEntryIndex != -1) {
			parentEntry = ps[parentEntryIndex];
			ps.splice(parentEntryIndex, 1);
		}

		if (!parentEntry || parentEntry.pgid != parentPID) {
			if (options.debug && usePGID) {
				if (!parentEntry) {
					debug("Parent " + cy("pid=" + parentPID) + " is dead " + r(".usePGID = false") + " for getting children");
				}
				if (parentEntry.pgid != parentPID) {
					debug("Parent " + cy("pid=" + parentPID) + " pid !== pgid " + r(".usePGID = false") + " for getting children");
				}
			}
			usePGID = false;
		}

		ps.sort(comparePID).forEach(function (entry) {
			if (entry.ppid == parentPID || children[entry.ppid]) {
				children[entry.pid] = entry;
			}
			if (usePGID && entry.pgid == parentPID) {
				children[entry.pid] = entry;
			}
		});
		var childPIDs = Object.keys(children).map(Number);
		callback(null, childPIDs);
	});
}

/*
	Last retry is always SIGKILL
*/

function shallowCopy(obj) {
	var copy = {};
	for (var key in obj) {
		copy[key] = obj[key];
	}
	return copy;
}

function fillLast(arr, n) {
	for (var i = arr.length; i < n; i++) {
		arr.push(arr[arr.length - 1]);
	}
	return arr;
}

function normalizeOptions(options) {
	var defaultRetryInterval = 500;
	var defaultRetryCount = 3;
	var defaultTimeout = 2000;

	options = shallowCopy(options);
	if (typeof(options.signal) == "string") {
		options.signal = [options.signal];
	}

	if (options.retryInterval) { // + retryCount + timeout
		if (Array.isArray(options.retryInterval)) {
			options.retryCount = Math.max(options.retryCount || 0, options.retryInterval.length);
		} else {
			options.retryInterval = [options.retryInterval];
			if (!options.hasOwnProperty("retryCount")) {
				options.timeout = options.timeout || defaultTimeout;
				options.retryCount = Math.floor((options.timeout - 1) / options.retryInterval[0]);
			}
		}
		options.retryInterval = fillLast(options.retryInterval, options.retryCount);
		var retryIntervalsSum = options.retryInterval.reduce(function(a, b) { return a + b; }, 0);
		if (!options.timeout || options.timeout <= retryIntervalsSum) {
			var lastInterval = options.retryInterval[options.retryInterval.length - 1];
			options.timeout = retryIntervalsSum + lastInterval;
		}

	} else if (options.retryCount != undefined) { // + timeout
		options.timeout = options.timeout || defaultTimeout;
		if (options.retryCount == 0) {
			options.retryInterval = [];
		} else {
			options.retryInterval = Math.floor(options.timeout / (options.retryCount + 1));
			options.retryInterval = fillLast([options.retryInterval], options.retryCount);
		}

	} else if (options.timeout) {
		if (options.timeout <= defaultRetryInterval) {
			options.retryInterval = [];
			options.retryCount = 0;
		} else {
			options.retryInterval = [defaultRetryInterval];
			options.retryCount = Math.floor((options.timeout - 1) / options.retryInterval[0]);
		}
	} else {
		options.timeout = defaultTimeout;
		options.retryInterval = [defaultRetryInterval];
		options.retryCount = defaultRetryCount;
	}

	options.checkInterval = options.checkInterval || 50;
	options.signal = fillLast(options.signal || ["SIGINT"], options.retryCount + 1);
	options.usePGID = options.usePGID || true;
	return options;
}

function kill(pid, options, _callback) {
	if (arguments.length == 2) {
		_callback = arguments[1];
		options = {}
	}

	options = normalizeOptions(options);

	if (options.debug) { debug("kill(" + cy(pid) + ", " + JSON.stringify(options)) + ")"; }

	var callback = function () {
		clearTimeout(timeoutTimeout);
		if (_callback) {
			_callback.apply(null, arguments);
		}
	};

	function checkDeadSync(pid, callback) {
		var psOutput = childProcess.execSync("ps -A -o pid", { encoding: "utf8" });
		var ps = parsePSOutput(["pid"], psOutput);
		var isDead = !ps.find(function (entry) { return entry.pid == pid;});
		if (options.debug) { debug("Check " + cy("pid=" + pid) + " " + (isDead ? cy("is dead") : r("is alive"))); }
		if (callback) {
			setTimeout(function () {
				callback(null, isDead);
			}, 0); // why changing timeout breaks all?
		} else {
			return isDead;
		}
	}

	function checkDeadAsync(pid, callback) {
		childProcess.exec("ps -A -o pid", { encoding: "utf8" }, function (err, psOutput) {
			if (err) { return callback(err); }
			var ps = parsePSOutput(["pid"], psOutput);
			var isDead = !ps.find(function (entry) { return entry.pid == pid;});
			if (options.debug) { debug("Check " + cy("pid=" + pid) + " " + (isDead ? cy("is dead") : r("is alive"))); }
			callback(null, isDead);
		});
	}
	
	var checkDead = checkDeadSync;

	function tryKillParent(pid, callback) {
		if (killed.indexOf(pid) != -1) {
			return callback();
		};

		var retryTimeout;
		var retries = 0;

		function sendSignal() {
			var signal = options.signal[retries] || options.signal[options.signal.length - 1];
			try {
				if (options.debug) { debug("Send " + cy("signal=" + signal) + " to " + cy("pid=" + pid)); }
				process.kill(pid, signal);
			} catch (err) {}
		}

		function retry() {
			if (options.debug) { debug("Retry to kill " + cy("pid=" + pid)); }
			retries++;
			sendSignal();
			checkDeadContinuous();
		}

		var checkDeadTimeout;
		function checkDeadContinuous() {
			clearTimeout(checkDeadTimeout);
			checkDead(pid, function cc(err, isDead) {
				// PROBLEM: retry+checkDeadContinuous happens between checkDead and cc
				// that way cc executes 2 times and sets 2 next timeouts
				if (err) {
					clearTimeout(retryTimeout);
					clearTimeout(checkDeadTimeout);
					return callback(err);
				}

				if (isDead) {
					clearTimeout(retryTimeout);
					killed.push(pid);
					if (options.debug) { debug("Killed " + gr("pid=" + pid)); }
					callback();
				} else {
					clearTimeout(checkDeadTimeout);
					checkDeadTimeout = setTimeout(function checkDeadAgain() {
						checkDead(pid, function (err, isDead) {
							if (err) {
								clearTimeout(retryTimeout);
								clearTimeout(checkDeadTimeout);
								return callback(err);
							}

							if (isDead) {
								clearTimeout(retryTimeout);
								clearTimeout(checkDeadTimeout);
								if (options.debug) { debug("Killed " + gr("pid=" + pid)); }
								killed.push(pid);
								return callback();
							}
							checkDeadTimeout = setTimeout(checkDeadAgain, options.checkInterval);
							onTimeout.push(clearTimeout.bind(null, checkDeadTimeout));
						});
					}, options.checkInterval);
					onTimeout.push(clearTimeout.bind(null, checkDeadTimeout));
				}
			});
		}

		if (options.retryCount != 0) {
			retryTimeout = setTimeout(function onRetryTimeout() {
				retry();
				if (retries < options.retryCount) {
					var interval = options.retryInterval[retries] || options.retryInterval[options.retryInterval.length - 1];
					retryTimeout = setTimeout(onRetryTimeout, interval);
				}
			}, options.retryInterval[0]);
		}

		sendSignal();
		checkDeadContinuous();
	}

	var pidsScheduled = [];
	var killed = [];
	function tryKillParentWithChildren(pid, callback) {
		pidsScheduled.push(pid);
		getProcessChildren(pid, options, function (err, children) {
			if (options.debug) { debug("Try to kill " + cy("pid=" + pid) + (children.length ? " with children " + cy(children.join(", ")) : "")); }

			children = children.filter(function (c) { return pidsScheduled.indexOf(c) == -1; });

			tryKillParent(pid, function (err) {
				if (err) { return callback(err); }

				if (options.debug) {
					debug("Try to kill children of " + cy("pid=" + pid));
				}
				async.each(children, function (pid, callback) {
					tryKillParentWithChildren(pid, callback);
				}, callback);
			});
		});
	}

	function tryKillChildren(children, callback) {
	}

	var onTimeout = [];
	var timeoutTimeout = setTimeout(function () {
		if (options.debug) { debug(r("Timedout") + " killing " + cy("pid=" + pid)); }
		onTimeout.forEach(function (c) { c(); });

		var err = new Error("Timeout. Can't kill process with pid = " + pid);
		callback(err);
	}, options.timeout);

	tryKillParentWithChildren(pid, callback);
}

kill._normalizeOptions = normalizeOptions;

module.exports = kill;
