var childProcess = require("child_process");

var async = require("async");
var chalk = require("chalk");
var cy = chalk.cyan;
var r = chalk.red;


function getProcessChildren(ppid, callback) {
	var ps = childProcess.execSync("ps -A -o ppid,pid", { encoding: "utf8" });
	var pids = [];
	ps.split("\n").filter(Boolean).forEach(function (line) {
		var splitted = line.split(" ");
		if (+splitted[0] == ppid) {
			pids.push(+splitted[1]);
		}
	});
	callback(null, pids);
}

/*
	Last retry is always SIGKILL
*/
function kill(pid, options, _callback) {
	function isDead(pid) {
		var ps = childProcess.execSync("ps -A -o pid", { encoding: "utf8" });
		var isDead = ps.indexOf(pid) == -1;
		if (options.debug) { console.log("DEBUG: Check " + cy("pid=" + pid) + " " + (isDead ? cy("is dead") : r("is alive"))); }
		//try { console.log(childProcess.execSync("ps -A -o pid | grep " + pid + " | grep -v grep", { encoding: "utf8" })); } catch (err) {}
		return isDead;
	}

	if (arguments.length == 2) {
		_callback = arguments[1];
		options = {}
	}
	options.signal = options.signal || "SIGINT";
	options.checkInterval = options.checkInterval || 20;
	options.retryInterval = options.retryInterval || 500;
	options.retryCount = options.retryCount || 5;
	options.timeout = options.timeout || 5000;

	var once = false;
	var callback = function () {
		if (!once) {
			once = true;
			_callback.apply(null, arguments);
		}
	};

	function tryKillParent(pid, callback) {

		var tries = 0;
		function retry(signal) {
			tries++;
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
						retry(options.signal);
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
					callback();
				}
			}, options.checkInterval);
		}

		retry(options.signal);
	}

	function tryKillParentWithChildren(pid, callback) {
		getProcessChildren(pid, function (err, children) {
			if (options.debug) { console.log("DEBUG: Try to kill " + cy("pid=" + pid) + (children.length ? " with children " + cy(children.join(", ")) : "")); }

			tryKillParent(pid, function (err) {
				if (err) { return callback(err); }

				var aliveChildren = children.filter(function (pid) { return !isDead(pid); });
				if (aliveChildren.length) {
					async.each(aliveChildren, function (pid, callback) {
						if (!isDead(pid)) {
							tryKillParentWithChildren(pid, callback);
						} else {
							callback();
						}
					}, callback)
				} else {
					callback();
				}
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
