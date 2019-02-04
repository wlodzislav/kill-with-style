var assert = require("assert");
var kill = require("../index");
var childProcess = require("child_process");
var chalk = require("chalk");

function isSpawned(name) {
	var ps = childProcess.execSync("ps -A -o command", { encoding: "utf8" });
	return ps.indexOf(name) != -1;
}

function spawnedNumber(name) {
	var pids = childProcess.execSync("ps -A -o pid,command | grep " + name + " | grep -v grep | awk '{print $1}'", { shell: true, encoding: "utf8" });
	return pids.split("\n").filter(Boolean).length;
}

function isKilled(name) {
	return !isSpawned(name);
}

function killBash(name) {
	try {
		var pids = childProcess.execSync("ps -A -o pid,command | grep " + name + " | grep -v grep | awk '{print $1}'", { shell: true, encoding: "utf8" });
		if (pids.length) {
			childProcess.execSync("kill " + pids.split("\n").join(" "), { shell: true, encoding: "utf8" })
		}
	} catch (err) {
	}
}

function killCallback(done, err) {
	//console.log("killCallback");
	if (arguments.length == 1) {
		err = arguments[0];
		done = function () {};
	}
	if (err) {
		return done(err);
	}
	if (!isKilled("kws-parent")) {
		return done(new Error("Not killed"));
	}
	if (!isKilled("kws-child")) {
		return done(new Error("Not killed"));
	}
	done();
}

function splitMessages(parent, callback) {
	parent.stdout.on("data", function (data) {
		data.toString().split("\n").filter(Boolean).forEach(callback);
	});
}

function onMessage(parent, message, callback) {
	splitMessages(parent, function (data) {
		if (data.startsWith(message + "=")) {
			callback.apply(null, data.replace(message + "=", "").split(","));
		} else if (data.startsWith(message)) {
			callback();
		}
	});
}

function waitFor(predicat, callback) {
	var interval = setInterval(function () {
		if (predicat()) {
			clearInterval(interval);
			callback();
		}
	}, 50);
}

function inDelta(actual, expected, delta) {
	return (actual > expected - delta && actual < expected + delta);
}

function assertEqualsDelta(actual, expected, delta) {
	var isEqual;
	if (Array.isArray(expected)) {
		isEqual = actual.every(function (v, i) {
			return inDelta(v, expected[i], delta);
		});
	} else {
		isEqual = inDelta(actual, expected, delta);
	}
	if (!isEqual) {
		throw new Error("Expected " + JSON.stringify(actual) + (Array.isArray(expected) ? " every value" : "") + " to be equal " + JSON.stringify(expected) + " in +-" + delta);
	}
}

if (isSpawned("kws-parent") || isSpawned("kws-child")) {
	console.log(chalk.red("Try to kill kws-* processes from the previous run"));
	killBash("kws-");
	if (isSpawned("kws-parent") || isSpawned("kws-child")) {
		throw new Error("Error: Can't run tests, kill all kws-* processes manually");
	}
}

afterEach(function () {
	killBash("kws-");
});

beforeEach(function () {
	if(isSpawned("kws-parent") || isSpawned("kws-child")) {
		throw new Error("Error: Can't run tests, kill all kws-* processes manually");
	}
});

describe("children without signal handlers", function () {
	it("not detached", function (done) {
		var child = childProcess.spawn("./kws-parent", { cwd: __dirname });
		child.on("error", done);
		assert(isSpawned("kws-parent"));

		onMessage(child, "running", function () {
			kill(child.pid, killCallback.bind(null, done));
		});
	});

	it("detached", function (done) {
		var child = childProcess.spawn("./kws-parent", {
			cwd: __dirname,
			detached: true
		});
		child.on("error", done);
		assert(isSpawned("kws-parent"));

		onMessage(child, "running", function () {
			kill(child.pid, killCallback.bind(null, done));
		});
	});

	it("inside shell", function (done) {
		var child = childProcess.spawn("./kws-parent", { cwd: __dirname, shell: true });
		child.on("error", done);
		assert(isSpawned("kws-parent"));

		onMessage(child, "running", function () {
			kill(child.pid, killCallback.bind(null, done));
		});
	});

	it("with children", function (done) {
		var child = childProcess.spawn("./kws-parent --children 2", { cwd: __dirname, shell: true });
		child.on("error", done);
		assert(isSpawned("kws-parent"));
		onMessage(child, "spawned-children", function () {
			assert.equal(spawnedNumber("kws-child"), 2);
			kill(child.pid, killCallback.bind(null, done));
		});
	});

	it("children with children", function (done) {
		var child = childProcess.spawn("./kws-parent --children 2,1", { cwd: __dirname, shell: true });
		child.on("error", done);
		assert(isSpawned("kws-parent"));
		waitFor(function () {
			return spawnedNumber("kws-child") == 4;
		}, function () {
			kill(child.pid, { debug: false }, killCallback.bind(null, done));
		});
	});
});

describe(".signal", function () {
	it(".signal=SIGTERM, retries = 0", function (done) {
		var child = childProcess.spawn("./kws-parent", { cwd: __dirname, shell: true });
		child.on("error", done);
		assert(isSpawned("kws-parent"));
		var signals = [];
		onMessage(child, "signal", function (signal) {
			signals.push(signal);
		});
		onMessage(child, "running", function () {
			kill(child.pid, { signal: "SIGTERM"}, function (err) {
				assert.deepEqual(signals, ["SIGTERM"]);
				killCallback(done, err);
			});
		});
	});

	it(".signal=SIGTERM, retries = 2", function (done) {
		var child = childProcess.spawn("./kws-parent --retries 2", { cwd: __dirname, shell: true });
		child.on("error", done);
		assert(isSpawned("kws-parent"));
		var signals = [];
		onMessage(child, "signal", function (signal) {
			signals.push(signal);
		});
		onMessage(child, "running", function () {
			kill(child.pid, { signal: "SIGTERM", retryCount: 2 }, function (err) {
				assert.deepEqual(signals, ["SIGTERM", "SIGTERM", "SIGTERM"]);
				killCallback(done, err);
			});
		});
	});

	it(".signal=[SIGINT,SIGTERM], retries = 2", function (done) {
		var child = childProcess.spawn("./kws-parent --retries 2", { cwd: __dirname, shell: true });
		child.on("error", done);
		assert(isSpawned("kws-parent"));
		var signals = [];
		onMessage(child, "signal", function (signal) {
			signals.push(signal);
		});
		onMessage(child, "running", function () {
			kill(child.pid, { signal: ["SIGINT", "SIGTERM"], retryCount: 2 }, function (err) {
				assert.deepEqual(signals, ["SIGINT", "SIGTERM", "SIGTERM"]);
				killCallback(done, err);
			});
		});
	});

	it(".signal=[SIGINT,SIGTERM,SIGTERM], retries = 2", function (done) {
		var child = childProcess.spawn("./kws-parent --retries 2", { cwd: __dirname, shell: true });
		child.on("error", done);
		assert(isSpawned("kws-parent"));
		var signals = [];
		onMessage(child, "signal", function (signal) {
			signals.push(signal);
		});
		onMessage(child, "running", function () {
			kill(child.pid, { signal: ["SIGINT", "SIGTERM", "SIGTERM"], retryCount: 2 }, function (err) {
				assert.deepEqual(signals, ["SIGINT", "SIGTERM", "SIGTERM"]);
				killCallback(done, err);
			});
		});
	});
});

describe(".retryCount", function () {
	it("retryCount = 3, retries = 4", function (done) {
		var child = childProcess.spawn("./kws-parent --retries 4", { cwd: __dirname, shell: true });
		child.on("error", done);
		assert(isSpawned("kws-parent"));
		var retries = 0;
		onMessage(child, "retry", function () {
			retries += 1;
		});
		onMessage(child, "running", function () {
			kill(child.pid, { retryCount: 3}, function (err) {
				assert.equal(retries, 3);
				kill(child.pid, { retryCount: 0}, function (err) {
					killCallback(done, err);
				});
			});
		});
	});

	it("retryCount = 3, retries = 3", function (done) {
		var child = childProcess.spawn("./kws-parent --retries 3", { cwd: __dirname, shell: true });
		child.on("error", done);
		assert(isSpawned("kws-parent"));
		var retries = 0;
		onMessage(child, "retry", function () {
			retries += 1;
		});
		onMessage(child, "running", function () {
			kill(child.pid, { retryCount: 3, debug: false }, function (err) {
				assert.equal(retries, 3);
				killCallback(done, err);
			});
		});
	});
});

describe(".retryInterval", function () {
	it("retryInterval = 1000", function (done) {
		var child = childProcess.spawn("./kws-parent --retries 3", { cwd: __dirname, shell: true });
		child.on("error", done);
		assert(isSpawned("kws-parent"));
		var lastTryDate;
		var retryInterval = [];
		onMessage(child, "signal", function (signal, date) {
			if (lastTryDate) {
				retryInterval.push(date - lastTryDate);
			}
			lastTryDate = date;
		});
		onMessage(child, "running", function () {
			kill(child.pid, { retryCount: 3, retryInterval: 1000 }, function (err) {
				assertEqualsDelta(retryInterval, [1000, 1000, 1000], 500);
				killCallback(done, err);
			});
		});
	});

	it("retryInterval = [1000, 100, 2000]", function (done) {
		var child = childProcess.spawn("./kws-parent --retries 3", { cwd: __dirname, shell: true });
		child.on("error", done);
		assert(isSpawned("kws-parent"));
		var lastTryDate;
		var retryInterval = [];
		onMessage(child, "signal", function (signal, date) {
			if (lastTryDate) {
				retryInterval.push(date - lastTryDate);
			}
			lastTryDate = date;
		});
		onMessage(child, "running", function () {
			kill(child.pid, { retryCount: 3, retryInterval: [1000, 100, 2000] }, function (err) {
				assertEqualsDelta(retryInterval, [1000, 100, 2000], 500);
				killCallback(done, err);
			});
		});
	});
});

describe("options priority", function () {
	it(".retryInterval=500", function () {
		var actual = kill._normalizeOptions({
			retryInterval: 500
		});

		var expected = {
			retryInterval: [500, 500, 500],
			retryCount: 3,
			timeout: 2000,
			signal: ["SIGINT", "SIGINT", "SIGINT", "SIGINT"],
			checkInterval: 50,
			usePGID: true
		};

		assert.deepEqual(actual, expected);
	});

	it(".retryInterval=[100, 200]", function () {
		var actual = kill._normalizeOptions({
			retryInterval: [100, 200]
		});

		var expected = {
			retryInterval: [100, 200],
			retryCount: 2,
			timeout: 100 + 200 + 200,
			signal: ["SIGINT", "SIGINT", "SIGINT"],
			checkInterval: 50,
			usePGID: true
		};

		assert.deepEqual(actual, expected);
	});

	it(".retryInterval=100 + .retryCount == .retryInterval.length", function () {
		var actual = kill._normalizeOptions({
			retryInterval: 100,
			retryCount: 2
		});

		var expected = {
			retryInterval: [100, 100],
			retryCount: 2,
			timeout: 100 + 100 + 100,
			signal: ["SIGINT", "SIGINT", "SIGINT"],
			checkInterval: 50,
			usePGID: true
		};

		assert.deepEqual(actual, expected);
	});

	it(".retryInterval=[100, 200] + .retryCount > .retryInterval.length", function () {
		var actual = kill._normalizeOptions({
			retryInterval: [100, 200],
			retryCount: 3
		});

		var expected = {
			retryInterval: [100, 200, 200],
			retryCount: 3,
			timeout: 100 + 200 + 200 + 200,
			signal: ["SIGINT", "SIGINT", "SIGINT", "SIGINT"],
			checkInterval: 50,
			usePGID: true
		};

		assert.deepEqual(actual, expected);
	});

	it(".retryInterval=[100, 200] + .retryCount < .retryInterval.length", function () {
		var actual = kill._normalizeOptions({
			retryInterval: [100, 200],
			retryCount: 1
		});

		var expected = {
			retryInterval: [100, 200],
			retryCount: 2,
			timeout: 100 + 200 + 200,
			signal: ["SIGINT", "SIGINT", "SIGINT"],
			checkInterval: 50,
			usePGID: true
		};

		assert.deepEqual(actual, expected);
	});

	it(".retryInterval=500 + .timeout=1500", function () {
		var actual = kill._normalizeOptions({
			retryInterval: 500,
			timeout: 1500
		});

		var expected = {
			retryInterval: [500, 500],
			retryCount: 2,
			timeout: 1500,
			signal: ["SIGINT", "SIGINT", "SIGINT"],
			checkInterval: 50,
			usePGID: true
		};

		assert.deepEqual(actual, expected);
	});

	it(".retryInterval=[100, 200], .timeout > sum of .retryInterval", function () {
		var actual = kill._normalizeOptions({
			retryInterval: [100, 200],
			timeout: 400
		});

		var expected = {
			retryInterval: [100, 200],
			retryCount: 2,
			timeout: 400,
			signal: ["SIGINT", "SIGINT", "SIGINT"],
			checkInterval: 50,
			usePGID: true
		};

		assert.deepEqual(actual, expected);
	});

	it(".retryInterval=[100, 200], .timeout <= sum of .retryInterval", function () {
		var actual = kill._normalizeOptions({
			retryInterval: [100, 200],
			timeout: 300
		});

		var expected = {
			retryInterval: [100, 200],
			retryCount: 2,
			timeout: 100 + 200 + 200,
			signal: ["SIGINT", "SIGINT", "SIGINT"],
			checkInterval: 50,
			usePGID: true
		};

		assert.deepEqual(actual, expected);
	});

	it(".retryInterval=100 + .retryCount + .timeout > all retries + 1", function () {
		var actual = kill._normalizeOptions({
			retryInterval: 100,
			retryCount: 2,
			timeout: 300
		});

		var expected = {
			retryInterval: [100, 100],
			retryCount: 2,
			timeout: 300,
			signal: ["SIGINT", "SIGINT", "SIGINT"],
			checkInterval: 50,
			usePGID: true
		};

		assert.deepEqual(actual, expected);
	});

	it(".retryInterval=100 + .retryCount + .timeout <= all retries + 1", function () {
		var actual = kill._normalizeOptions({
			retryInterval: 100,
			retryCount: 2,
			timeout: 200
		});

		var expected = {
			retryInterval: [100, 100],
			retryCount: 2,
			timeout: 300,
			signal: ["SIGINT", "SIGINT", "SIGINT"],
			checkInterval: 50,
			usePGID: true
		};

		assert.deepEqual(actual, expected);
	});

	it(".retryCount=3", function () {
		var actual = kill._normalizeOptions({
			retryCount: 3
		});

		var expected = {
			retryInterval: [500, 500, 500],
			retryCount: 3,
			timeout: 2000,
			signal: ["SIGINT", "SIGINT", "SIGINT", "SIGINT"],
			checkInterval: 50,
			usePGID: true
		};

		assert.deepEqual(actual, expected);
	});

	it(".retryCount=0", function () {
		var actual = kill._normalizeOptions({
			retryCount: 0
		});

		var expected = {
			retryInterval: [],
			retryCount: 0,
			timeout: 2000,
			signal: ["SIGINT"],
			checkInterval: 50,
			usePGID: true
		};

		assert.deepEqual(actual, expected);
	});

	it(".timeout=1000 > default retryInterval", function () {
		var actual = kill._normalizeOptions({
			timeout: 1000
		});

		var expected = {
			retryInterval: [500],
			retryCount: 1,
			timeout: 1000,
			signal: ["SIGINT", "SIGINT"],
			checkInterval: 50,
			usePGID: true
		};

		assert.deepEqual(actual, expected);
	});

	it(".timeout=1000 <= default retryInterval", function () {
		var actual = kill._normalizeOptions({
			timeout: 500
		});

		var expected = {
			retryInterval: [],
			retryCount: 0,
			timeout: 500,
			signal: ["SIGINT"],
			checkInterval: 50,
			usePGID: true
		};

		assert.deepEqual(actual, expected);
	});

});

describe(".timeout", function () {
	it("timeout = 1000, delay = 0", function (done) {
		var child = childProcess.spawn("./kws-parent", { cwd: __dirname, shell: true });
		child.on("error", done);
		assert(isSpawned("kws-parent"));
		onMessage(child, "running", function () {
			var start = Date.now();
			kill(child.pid, { timeout: 1000 }, function (err) {
				var total = Date.now() - start;
				assertEqualsDelta(total, 0, 500);
				assert(!err);
				killCallback(done, err);
			});
		});
	});

	it("timeout = 1000, delay = 2000", function (done) {
		var child = childProcess.spawn("./kws-parent --delay 1100", { cwd: __dirname, shell: true });
		child.on("error", done);
		assert(isSpawned("kws-parent"));
		onMessage(child, "running", function () {
			var start = Date.now();
			kill(child.pid, { timeout: 1000 }, function (err) {
				var total = Date.now() - start;
				assertEqualsDelta(total, 1000, 500);
				assert(err);
				kill(child.pid, killCallback.bind(null, done));
			});
		});
	});

	it("no retries and checks after timeout", function (done) {
		var child = childProcess.spawn("./kws-parent --delay 2000", { cwd: __dirname, shell: true });
		child.on("error", done);
		assert(isSpawned("kws-parent"));
		onMessage(child, "running", function () {
			var _log = console.log;
			console.log = function () {};
			kill(child.pid, { timeout: 1000, debug: true }, function () {
				console.log = function (text) {
					if (text.startsWith("DEBUG")) {
						console.log = _log;
						done(new Error("Output after timeout: \"" + text + "\""));
					}
				};
				setTimeout(function () {
					console.log = _log;
					kill(child.pid, killCallback.bind(null, done));
				}, 1000);
			});
		});
	});
});

describe(".usePGID", function () {
	it("not detached child, overwrite .usePGID = false", function (done) {
		var child = childProcess.spawn("./kws-parent", { cwd: __dirname, shell: true });
		child.on("error", done);
		assert(isSpawned("kws-parent"));
		onMessage(child, "running", function () {
			// HACK: hook into debug output of kill()
			var _log = console.log;
			var killOutput = "";
			console.log = function () {
				killOutput += [].join.call(arguments, " "); + "\n";
			};
			kill(child.pid, { debug: true }, function (err) {
				console.log = _log;
				assert.notEqual(killOutput.indexOf(".usePGID = false"), -1);
				killCallback(done, err);
			});
		});
	});

	it("detached child", function (done) {
		var child = childProcess.spawn("./kws-parent", {
			cwd: __dirname,
			shell: true,
			detached: true
		});
		child.on("error", done);
		assert(isSpawned("kws-parent"));
		onMessage(child, "running", function () {
			// HACK: hook into debug output of kill()
			var _log = console.log;
			var killOutput = "";
			console.log = function () {
				killOutput += [].join.call(arguments, " "); + "\n";
			};
			kill(child.pid, { debug: true }, function (err) {
				console.log = _log;
				assert.equal(killOutput.indexOf(".usePGID = false"), -1);
				killCallback(done, err);
			});
		});
	});
});

describe(".checkInterval", function () {
	it(".checkInterval < .retryCount = 0", function (done) {
		var child = childProcess.spawn("./kws-parent --delay 1100", { cwd: __dirname, shell: true });
		child.on("error", done);
		assert(isSpawned("kws-parent"));
		onMessage(child, "running", function () {
			// HACK: hook into debug output of kill()
			var _log = console.log;
			var killOutput = "";
			console.log = function () {
				killOutput += [].join.call(arguments, " "); + "\n";
			};
			kill(child.pid, { debug: true, retryCount: 0, timeout: 3000, checkInterval: 500 }, function (err) {
				console.log = _log;
				assert.equal((killOutput.match(/Check/g) || []).length, 4);
				killCallback(done, err);
			});
		});
	});

	it(".checkInterval < .retryInterval", function (done) {
		var child = childProcess.spawn("./kws-parent --retries 1", { cwd: __dirname, shell: true });
		child.on("error", done);
		assert(isSpawned("kws-parent"));
		onMessage(child, "running", function () {
			// HACK: hook into debug output of kill()
			var _log = console.log;
			var killOutput = "";
			console.log = function () {
				killOutput += [].join.call(arguments, " "); + "\n";
			};
			kill(child.pid, { debug: true, retryCount: 1, timeout: 3000, checkInterval: 500, retryInterval: 1000 }, function (err) {
				console.log = _log;
				assert.equal((killOutput.match(/Check/g) || []).length, 4);
				killCallback(done, err);
			});
		});
	});

	it(".checkInterval < .retryInterval", function (done) {
		var child = childProcess.spawn("./kws-parent --retries 1", { cwd: __dirname, shell: true });
		child.on("error", done);
		assert(isSpawned("kws-parent"));
		onMessage(child, "running", function () {
			// HACK: hook into debug output of kill()
			var _log = console.log;
			var killOutput = "";
			console.log = function () {
				killOutput += [].join.call(arguments, " "); + "\n";
			};
			kill(child.pid, { debug: true, retryCount: 1, timeout: 3000, checkInterval: 1500, retryInterval: 1000 }, function (err) {
				console.log = _log;
				var checksBeforeRetry = (killOutput.slice(0, killOutput.indexOf("Retry")).match(/Check/g) || []).length
				assert.equal(checksBeforeRetry, 1);
				killCallback(done, err);
			});
		});
	});
});
