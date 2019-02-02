var assert = require("assert");
var kill = require("../index");
var childProcess = require("child_process");

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
	console.error("Error: Can't run tests, kill all kws-* processes manually");
	process.exit(1);
}

function killCallback(done) {
	done = done || function () {};
	return function (err) {
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
	};
}

function afterSpawned(parent, callback) {
	parent.stdout.on("data", function (data) {
		data = data.toString();
		if (data.indexOf("running") != -1) {
			callback();
		}
	});
}

function afterSpawnedChildren(parent, callback) {
	parent.stdout.on("data", function (data) {
		data = data.toString();
		if (data.indexOf("spawned-children") != -1) {
			callback();
		}
	});
}

function getKillSignal(parent, callback) {
	parent.stdout.on("data", function (data) {
		data = data.toString();
		if (data.indexOf("signal") != -1) {
			callback(data.toString().match(/signal=(.*)/)[1]);
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

describe("children without signal handlers", function () {
	afterEach(function () {
		killBash("kws-");
	});

	it("not detached", function (done) {
		var child = childProcess.spawn("./kws-parent", {
			cwd: __dirname
		});
		child.on("error", done);
		assert(isSpawned("kws-parent"));

		afterSpawned(child, function () {
			kill(child.pid, killCallback(done));
		});
	});

	it("detached", function (done) {
		var child = childProcess.spawn("./kws-parent", {
			cwd: __dirname,
			detached: true
		});
		child.on("error", done);
		assert(isSpawned("kws-parent"));

		afterSpawned(child, function () {
			kill(child.pid, killCallback(done));
		});
	});

	it("inside shell", function (done) {
		var child = childProcess.spawn("./kws-parent", {
			cwd: __dirname,
			shell: true
		});
		child.on("error", done);
		assert(isSpawned("kws-parent"));

		afterSpawned(child, function () {
			kill(child.pid, killCallback(done));
		});
	});

	it("with children", function (done) {
		var child = childProcess.spawn("./kws-parent --children 2", {
			cwd: __dirname,
			shell: true
		});
		child.on("error", done);
		assert(isSpawned("kws-parent"));
		afterSpawnedChildren(child, function () {
			assert.equal(spawnedNumber("kws-child"), 2);
			kill(child.pid, killCallback(done));
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
			kill(child.pid, killCallback(done));
		});
	});
});

describe("children with signal handlers", function () {
	it(".signal=SIGINT", function (done) {
		var child = childProcess.spawn("./kws-parent", {
			cwd: __dirname,
			shell: true,
			stdio: ['pipe', 'pipe', 'pipe']
		});
		child.on("error", done);
		assert(isSpawned("kws-parent"));
		getKillSignal(child, function (signal) {
			assert.equal(signal, "SIGINT")
			done();
		});
		afterSpawned(child, function () {
			kill(child.pid, { signal: "SIGINT"}, killCallback());
		});
	});
});
