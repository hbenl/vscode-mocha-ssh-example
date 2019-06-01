const { spawn, execSync } = require('child_process');
const { readFileSync } = require('fs');
const { inspect } = require('util');
const { mochaWorker, convertPath, receiveConnection, writeMessage, readMessages } = require('vscode-test-adapter-remoting-util');

const localWorkspace = __dirname;
const remoteHost = 'host';
const remoteUser = 'user';
const remoteWorkspace = `/home/${remoteUser}/tmp/vscode-mocha-ssh`;
const port = 8123;

const log = msg => process.send(msg);
const localToRemotePath = path => convertPath(path, localWorkspace, remoteWorkspace);
const remoteToLocalPath = path => convertPath(path, remoteWorkspace, localWorkspace);

process.once('message', async origWorkerArgs => {

	log('Received workerArgs');

	const workerArgs = mochaWorker.convertWorkerArgs(origWorkerArgs, localToRemotePath);

	let nodeDebugArgs = [];
	let sshDebugArgs = [];
	if (workerArgs.debuggerPort) {
		nodeDebugArgs = [ `--inspect-brk=${workerArgs.debuggerPort}` ]
		sshDebugArgs = [ '-L', `${workerArgs.debuggerPort}:localhost:${workerArgs.debuggerPort}` ];
	}

	log('Syncing workspace');
	const rsyncOutput = execSync(`rsync -r ${localWorkspace}/ ${remoteUser}@${remoteHost}:${remoteWorkspace}`);
	log(`Output from rsync: ${rsyncOutput.toString()}`);

	log('Starting worker via ssh');
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
		{ stdio: [ 'pipe', 'inherit', 'inherit' ] }
	);

	childProcess.on('error', err => log(`Error from ssh: ${inspect(err)}`));
	childProcess.on('exit', (code, signal) => {
		log(`The ssh process exited with code ${code} and signal ${signal}.`);
		if ((workerArgs.action === 'loadTests') && (code || signal)) {
			process.send({ type: 'finished', errorMessage: `The ssh process exited with code ${code} and signal ${signal}.\nThe diagnostic log may contain more information, enable it with the "mochaExplorer.logpanel" or "mochaExplorer.logfile" settings.` });
		}
	});

	log('Sending worker script');
	childProcess.stdin.write(
		readFileSync(origWorkerArgs.workerScript),
		() => log('Finished sending worker script')
	);
	childProcess.stdin.end();

	log('Connecting to worker process');
	const socket = await receiveConnection(port);

	log('Sending workerArgs to worker process');
	await writeMessage(socket, workerArgs);

	log('Finished initialising worker');

	readMessages(socket, msg => {
		if (workerArgs.action === 'loadTests') {
			process.send(mochaWorker.convertTestLoadMessage(msg, remoteToLocalPath));
		} else {
			process.send(mochaWorker.convertTestRunMessage(msg, remoteToLocalPath));
		}
	});
});
