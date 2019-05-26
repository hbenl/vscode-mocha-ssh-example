const { spawn, execSync } = require('child_process');
const { readFileSync } = require('fs');
const { inspect } = require('util');
const { mochaWorker, receiveConnection, writeMessage, readMessages } = require('vscode-test-adapter-remoting-util');

// TODO:
// test with a path with spaces

const localWorkspace = __dirname;
const remoteHost = 'host';
const remoteUser = 'user';
const remoteWorkspace = `/home/${remoteUser}/tmp/vscode-mocha-ssh`;
const port = 8123;

function convertPaths(srcPath, dstPath) {
	return function(path) {
		if (path.startsWith(srcPath)) {
			return dstPath + path.substring(srcPath.length)
		} else {
			return path;
		}
	}
}
const localToRemote = convertPaths(localWorkspace, remoteWorkspace);
const remoteToLocal = convertPaths(remoteWorkspace, localWorkspace);

process.once('message', workerArgsJson => {

	const origWorkerArgs = JSON.parse(workerArgsJson);
	const localWorker = origWorkerArgs.workerScript;

	process.send('Received workerArgs');

	const workerArgs = mochaWorker.convertWorkerArgs(origWorkerArgs, localToRemote);
	workerArgs.mochaPath = localToRemote(origWorkerArgs.mochaPath);

	let nodeDebugArgs = [];
	let sshDebugArgs = [];
	if (workerArgs.debuggerPort) {
		nodeDebugArgs = [ `--inspect-brk=0.0.0.0:${workerArgs.debuggerPort}` ]
		sshDebugArgs = [ '-L', `${workerArgs.debuggerPort}:localhost:${workerArgs.debuggerPort}` ];
	}

	process.send('Syncing workspace');
	const rsyncOutput = execSync(`rsync -r "${localWorkspace}"/ "${remoteUser}@${remoteHost}:${remoteWorkspace}"`);
	process.send(`Output from rsync: ${rsyncOutput.toString()}`);

	process.send('Starting worker via ssh');
	const childProcess = spawn(
		'ssh',
		[
			`${remoteUser}@${remoteHost}`,
			'-R', `${port}:localhost:${port}`,
			...sshDebugArgs,
			'node',
			...nodeDebugArgs,
			'-', `"{\\\"role\\\":\\\"client\\\",\\\"port\\\":${port}}"`
		],
		{ stdio: [ 'pipe', 'inherit', 'inherit', 'ipc' ] }
	);

	childProcess.on('error', err => process.send(`Error from ssh: ${inspect(err)}`));
	childProcess.on('exit', (code, signal) => {
		process.send(`ssh launcher process exited with code ${code} and signal ${signal}`);
		if ((workerArgs.action === 'loadTests') && (code || signal)) {
			process.send({ type: 'finished', errorMessage: `The ssh launcher process finished with code ${code} and signal ${signal}.\nThe diagnostic log may contain more information, enable it with the "mochaExplorer.logpanel" or "mochaExplorer.logfile" settings.` });
		}
	});

	process.send('Sending worker script');
	childProcess.stdin.write(
		readFileSync(localWorker),
		() => process.send('Finished sending worker script')
	);
	childProcess.stdin.end();

	process.send('Connecting to worker process');
	receiveConnection(port).then(socket => {

		process.send('Connected - sending workerArgs to worker process');

		writeMessage(socket, workerArgs);

		process.send('Finished sending workerArgs to worker process');

		readMessages(socket, msg => {
			if (workerArgs.action === 'loadTests') {
				process.send(mochaWorker.convertTestLoadMessage(msg, remoteToLocal));
			} else {
				process.send(mochaWorker.convertTestRunMessage(msg, remoteToLocal));
			}
		});
	});
});
