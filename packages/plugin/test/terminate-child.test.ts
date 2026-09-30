import { spawn } from "node:child_process";
import { once } from "node:events";
import { expect, it } from "vitest";
import { terminateChild } from "./sandbox/terminate-child.js";
it("finishes cleanup of an owned child that ignores graceful termination", async () => {
	const child = spawn(
		process.execPath,
		[
			"-e",
			"process.on('SIGTERM', () => {}); process.stdout.write('ready'); setInterval(() => {}, 1000);",
		],
		{ stdio: ["ignore", "pipe", "pipe"] },
	);
	await once(child.stdout, "data");
	try {
		await terminateChild(child, 50);
		expect(child.signalCode).toBe("SIGKILL");
		await terminateChild(child, 50);
	} finally {
		child.kill("SIGKILL");
	}
});
