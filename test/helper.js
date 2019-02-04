#!/usr/bin/env node

var program = require("commander");
var childProcess = require("child_process");

module.exports = function (isChild) {
	program
		.option("--die [delay]", "Die after delay")
		.option("--children [n]", "Spawn children")
		.option("--log", "Log to text/log.txt")
		.option("--detached", "Detach children")
		.option("--retries [n]", "Retries needed to kill process")
		.option("--delay [n]", "Delay exit by ms")
		.option("--kill-children", "Kill own children")

	program.parse(process.argv);

	if (program.die) {
		setTimeout(function () {}, program.die);
	} else {
		setInterval(function () {}, 60 * 1000);
	}

	var children = [];
	if (program.children) {
		var nestedChildren = program.children.indexOf(",") != -1;
		var n = 0;
		var subN = 0;
		if (nestedChildren) {
			n = +program.children.slice(0, program.children.indexOf(","));
			subN = program.children.slice(program.children.indexOf(",") + 1);
		} else {
			n = +program.children;
		}

		for (var i = 0; i < n; i++) {
			var cmd = "./kws-child";
			if (subN) {
				cmd += " --children " + subN;
			}
			if (program.log) {
				cmd += " --log";
			}
			if (program.detached) {
				cmd += " --detached";
			}
			var child = childProcess.spawn(cmd, {
				cwd: __dirname,
				shell: true,
				detached: true
			});
			child.stderr.on("data", function (data) {
				console.log("stderr(pid=" + child.pid + "): " + data.toString());
				process.exit(1);
			});
			child.stdout.on("data", function (data) {
				console.log("stdout(pid=" + child.pid + "): " + data.toString());
			});
			children.push(child);
		}
		console.log("spawned-children");
	}

	console.log("running");

	var firstTry = true;
	function onSignal(signal) {
		return function () {
			console.log("signal=" + signal + "," + Date.now());
			if (!firstTry) {
				console.log("retry");
			}
			firstTry = false;
			if (program.retries) {
				program.retries -= 1;
				return;
			}
			if (program.log) {
				var message = "Killed " + (isChild ? "child" : "parent") + " pid=" + process.pid + " with signal=" + signal + "\n";
				require("fs").appendFileSync(__dirname + "/log.txt", message, "utf8");
			}
			if (program.killChildren) {
				children.forEach(function (c) {
					process.kill(c.pid);
				});
			}
			if (program.delay) {
				setTimeout(function () {
					console.log("die");
					process.exit();
				}, program.delay);
			} else {
				console.log("die");
				process.exit();
			}
		};
	}

	process.on("SIGINT", onSignal("SIGINT"));
	process.on("SIGTERM", onSignal("SIGTERM"));
};

