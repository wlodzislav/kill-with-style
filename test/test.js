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

if (isSpawned("kws-parent") || isSpawned("kws-child")) {
	console.log(chalk.red("Try to kill kws-* processes from the previous run"));
	killBash("kws-");
	if (isSpawned("kws-parent") || isSpawned("kws-child")) {
		console.error(chalk.red("Error: Can't run tests, kill all kws-* processes manually"));
		process.exit(1);
	}
}

function killCallback(done, err) {
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

function assertEqualsDelta(actualArr, expectedArr, delta) {
	var isEqual = actualArr.every(function (v, i) {
		return inDelta(v, expectedArr[i], delta);
	});
	if (!isEqual) {
		throw new Error("Expected " + JSON.stringify(actualArr) + " every value to be equal " + JSON.stringify(expectedArr) + " in +-" + delta);
	}
}

afterEach(function () {
	killBash("kws-");
});

beforeEach(function () {
	if(isSpawned("kws-parent") || isSpawned("kws-child")) {
		console.error(chalk.red("Error: Can't run tests, kill all kws-* processes manually"));
		process.exit(1);
	}
});

describe("children without signal handlers", function () {
	it("not detached", function (done) {
		var child = childProcess.spawn("./kws-parent", {
			cwd: __dirname
		});
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
		var child = childProcess.spawn("./kws-parent", {
			cwd: __dirname,
			shell: true
		});
		child.on("error", done);
		assert(isSpawned("kws-parent"));

		onMessage(child, "running", function () {
			kill(child.pid, killCallback.bind(null, done));
		});
	});

	it("with children", function (done) {
		var child = childProcess.spawn("./kws-parent --children 2", {
			cwd: __dirname,
			shell: true
		});
		child.on("error", done);
		assert(isSpawned("kws-parent"));
		onMessage(child, "spawned-children", function () {
			assert.equal(spawnedNumber("kws-child"), 2);
			kill(child.pid, killCallback.bind(null, done));
		});
	});

	it("children with children", function (done) {
		var child = childProcess.spawn("./kws-parent --children 2,1", {
			cwd: __dirname,
			shell: true
		});
		child.on("error", done);
		assert(isSpawned("kws-parent"));
		waitFor(function () {
			return spawnedNumber("kws-child") == 4;
		}, function () {
			kill(child.pid, killCallback.bind(null, done));
		});
	});
});

describe(".signal", function () {
	it(".signal=SIGTERM", function (done) {
		var child = childProcess.spawn("./kws-parent", {
			cwd: __dirname,
			shell: true,
			stdio: ['pipe', 'pipe', 'pipe']
		});
		child.on("error", done);
		assert(isSpawned("kws-parent"));
		onMessage(child, "signal", function (signal) {
			assert.equal(signal, "SIGTERM")
			done();
		});
		onMessage(child, "running", function () {
			kill(child.pid, { signal: "SIGTERM"}, killCallback);
		});
	});
});

describe(".retryCount", function () {
	it("retryCount = 3, retries = 4", function (done) {
		var child = childProcess.spawn("./kws-parent --retries 4", {
			cwd: __dirname,
			shell: true,
			stdio: ['pipe', 'pipe', 'pipe']
		});
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
		var child = childProcess.spawn("./kws-parent --retries 3", {
			cwd: __dirname,
			shell: true,
			stdio: ['pipe', 'pipe', 'pipe']
		});
		child.on("error", done);
		assert(isSpawned("kws-parent"));
		var retries = 0;
		onMessage(child, "retry", function () {
			retries += 1;
		});
		onMessage(child, "running", function () {
			kill(child.pid, { retryCount: 3}, function (err) {
				assert.equal(retries, 3);
				killCallback(done, err);
			});
		});
	});
});

describe(".retryInterval", function () {
	it("retryInterval = 1000", function (done) {
		var child = childProcess.spawn("./kws-parent --retries 3", {
			cwd: __dirname,
			shell: true,
			stdio: ['pipe', 'pipe', 'pipe']
		});
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
		var child = childProcess.spawn("./kws-parent --retries 3", {
			cwd: __dirname,
			shell: true,
			stdio: ['pipe', 'pipe', 'pipe']
		});
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

describe(".usePGID", function () {
	it("not detached child, overwrite .usePGID = false", function (done) {
		var child = childProcess.spawn("./kws-parent", {
			cwd: __dirname,
			shell: true
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

