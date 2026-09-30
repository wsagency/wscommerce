import type { ChildProcess } from "node:child_process";
/** Close only a child this harness owns. workerd can ignore SIGTERM while draining pending requests. */
export async function terminateChild(child: ChildProcess, graceMs = 1000): Promise<void> {
	if (child.exitCode !== null || child.signalCode !== null) return;
	await new Promise<void>((resolve, reject) => {
		const escalation = setTimeout(() => child.kill("SIGKILL"), graceMs);
		const deadline = setTimeout(() => {
			cleanup();
			reject(new Error("Owned test child did not exit after forced shutdown"));
		}, graceMs + 5000);
		const cleanup = () => {
			clearTimeout(escalation);
			clearTimeout(deadline);
			child.removeListener("exit", exited);
		};
		const exited = () => {
			cleanup();
			resolve();
		};
		child.once("exit", exited);
		child.kill("SIGTERM");
	});
}
