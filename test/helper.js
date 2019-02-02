#!/usr/bin/env node

var program = require("commander");
var childProcess = require("child_process");

module.exports = function (isChild) {
	program
		.option("--die [delay]", "Die after delay")
		.option("--children [n]", "Spawn children")

	program.parse(process.argv);

	if (program.die) {
		setTimeout(function () {}, program.die);
	} else {
		setInterval(function () {}, 60 * 1000);
	}

	if (program.children) {
		var children = [];
		for (var i = 0; i < program.children; i++) {
			var child = childProcess.spawn("./kws-child", { cwd: __dirname, shell: true });
			children.push(child);
		}
		console.log("children-spawned");
	}
};

