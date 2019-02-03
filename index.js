var childProcess = require("child_process");

var async = require("async");
var chalk = require("chalk");
var cy = chalk.cyan;
var r = chalk.red;
var gr = chalk.green;


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
		console.log("DEBUG: Get children for " + cy("pid=" + parentPID));
	}
	var usePGID = options.usePGID;
	var psOutput = childProcess.execSync("ps -A -o ppid,pgid,pid", { encoding: "utf8" });
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
				console.log("DEBUG: Parent " + cy("pid=" + parentPID) + " is dead " + r(".usePGID = false") + " for getting children");
			}
			if (parentEntry.pgid != parentPID) {
				console.log("DEBUG: Parent " + cy("pid=" + parentPID) + " pid !== pgid " + r(".usePGID = false") + " for getting children");
			}
		}
		usePGID = false;
	}

	ps.sort(comparePID).forEach(function (entry) {
		if (entry.ppid == parentPID || children[entry.ppid]) {
			children[entry.pid] = entry;
		}
		if (usePGID, entry.pgid == parentPID) {
			children[entry.pid] = entry;
		}
	});
	var childPIDs = Object.keys(children).map(Number);
	callback(null, childPIDs);
}

/*
	Last retry is always SIGKILL
*/
function kill(pid, options, _callback) {

	function isDead(pid) {
		var psOutput = childProcess.execSync("ps -A -o pid", { encoding: "utf8" });
		//console.log(psOutput);
		var ps = parsePSOutput(["pid"], psOutput);
		var isDead = !ps.find(function (entry) { return entry.pid == pid;});
		if (options.debug) { console.log("DEBUG: Check " + cy("pid=" + pid) + " " + (isDead ? cy("is dead") : r("is alive"))); }
		//try { console.log(childProcess.execSync("ps -A -o pid | grep " + pid + " | grep -v grep", { encoding: "utf8" })); } catch (err) {}
		return isDead;
	}

	if (arguments.length == 2) {
		_callback = arguments[1];
		options = {}
	}

	if (typeof(options.signal) == "string") {
		options.signal = [options.signal];
	}

	options.signal = options.signal || ["SIGINT"];
	options.checkInterval = options.checkInterval || 20;
	options.retryInterval = options.retryInterval || 500;
	options.retryCount = options.retryCount || 5;
	options.timeout = options.timeout || 5000;
	options.usePGID = options.usePGID || true;

	var once = false;
	var callback = function () {
		if (!once) {
			once = true;
			if (_callback) {
				_callback.apply(null, arguments);
			}
		}
	};

	function tryKillParent(pid, callback) {

		var tries = 0;
		function retry() {
			tries++;
			var signal = options.signal[tries] || options.signal[options.signal.length - 1];
			try {
				if (options.debug) { console.log("DEBUG: Send " + cy("signal=" + signal) + " to " + cy("pid=" + pid)); }
				process.kill(pid, signal);
			} catch (err) {}

			checkDead();
		}

		function checkDead() {
			var startCheckingDead = Date.now();
			var checkDeadIterval = setInterval(function () {
				if (Date.now() - startCheckingDead > options.retryInterval) {
					clearInterval(checkDeadIterval);
					if (tries < options.retryCount - 1) {
						retry();
						checkDead();
					} else if (tries < options.retryCount) {
						checkDead();
					} else {
						var err = new Error("Can't kill process with pid = " + pid);
						callback(err);
					}
				}
				if (isDead(pid)) {
					clearInterval(checkDeadIterval);
					if (options.debug) {
						console.log("DEBUG: Killed " + gr("pid=" + pid));
					}
					callback();
				}
			}, options.checkInterval);
		}

		retry();
	}

	function tryKillParentWithChildren(pid, callback) {
		getProcessChildren(pid, options, function (err, children) {
			if (options.debug) { console.log("DEBUG: Try to kill " + cy("pid=" + pid) + (children.length ? " with children " + cy(children.join(", ")) : "")); }

			tryKillParent(pid, function (err) {
				if (err) { return callback(err); }

				if (options.debug) {
					console.log("DEBUG: Try to kill children of " + cy("pid=" + pid));
				}
				async.each(children, function (pid, callback) {
					if (!isDead(pid)) {
						tryKillParentWithChildren(pid, callback);
					} else {
						callback();
					}
				}, callback);
			});
		});
	}

	var timeoutTimeout = setTimeout(function () {
		var err = new Error("Timeout. Can't kill process with pid = " + pid);
		callback(err);
	}, options.timeout);

	tryKillParentWithChildren(pid, callback);
}

module.exports = kill;
