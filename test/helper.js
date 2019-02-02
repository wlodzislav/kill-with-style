#!/usr/bin/env node

var program = require("commander");
var childProcess = require("child_process");

module.exports = function (isChild) {
	program
		.option("--die [delay]", "Die after delay")
		.option("--children [n]", "Spawn children")
		.option("--log", "Log to text/log.txt")

	program.parse(process.argv);

	if (program.die) {
		setTimeout(function () {}, program.die);
	} else {
		setInterval(function () {}, 60 * 1000);
	}

	if (program.children) {
		var children = [];
		var n = +(program.children.indexOf(",") != -1 ? program.children.split(",")[0] : program.children);
		var subN = +(program.children.indexOf(",") != -1 ? program.children.split(",")[1] : 0);
		for (var i = 0; i < n; i++) {
			var cmd = "./kws-child";
			if (subN) {
				cmd += " --children " + subN;
			}
			if (program.log) {
				cmd += " --log";
			}
			var child = childProcess.spawn(cmd, { cwd: __dirname, shell: true });
			child.stdout.on("data", function (data) {
				console.log("CHILD(pid=" + child.pid + "): " + data.toString());
			});
			children.push(child);
		}
		console.log("spawned-children");
	}

	console.log("running");

	function onSignal(signal) {
		return function () {
			console.log("signal=" + signal);
			if (program.log) {
				var message = "Killed " + (isChild ? "child" : "parent") + " pid=" + process.pid + " with signal=" + signal + "\n";
				require("fs").appendFileSync(__dirname + "/log.txt", message, "utf8");
			}
			process.exit();
		};
	}

	process.on("SIGINT", onSignal("SIGINT"));
	process.on("SIGTERM", onSignal("SIGTERM"));
};

