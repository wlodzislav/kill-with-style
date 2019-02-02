var kill = require("../index");
var childProcess = require("child_process");

describe("children without signal handlers", function () {
	it("not detached", function (done) {
		var child = childProcess.spawn("./helper", {
			cwd: __dirname
		});
		child.on("close", done);
		kill(child.pid, function (err) {
			if (err) { done(err); }
		});
	});

	it("detached", function (done) {
		var child = childProcess.spawn("./helper", {
			cwd: __dirname,
			detached: true
		});

		child.on("close", done);
		kill(child.pid, function (err) {
			if (err) { done(err); }
		});
	});

	it("inside shell", function (done) {
		var child = childProcess.spawn("./helper", {
			cwd: __dirname,
			shell: true
		});
		child.on("close", done);
		kill(child.pid, function (err) {
			if (err) { done(err); }
		});
	});
});
