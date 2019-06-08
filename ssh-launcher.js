const { spawn, execSync } = require('child_process');
const { readFileSync } = require('fs');
const { inspect } = require('util');
const { mochaWorker, convertPath, receiveConnection, writeMessage, readMessages } = require('vscode-test-adapter-remoting-util');

// how to access the remote environment - make sure you can login using `ssh ${remoteUser}@${remoteHost}` without having to enter a password
const remoteHost = 'host';
const remoteUser = 'user';

// the paths of the local and remote environment
const localWorkspace = __dirname;
const remoteWorkspace = `/home/${remoteUser}/tmp/vscode-mocha-ssh`;

// this port will be used for the communication channel between the launcher and worker scripts
const port = 8123;

// any string that is sent to Mocha Test Explorer is added to the diagnostic log (if it is enabled)
const log = msg => process.send(msg);

// these functions convert the paths between the local and remote environments
const localToRemotePath = path => convertPath(path, localWorkspace, remoteWorkspace);
const remoteToLocalPath = path => convertPath(path, remoteWorkspace, localWorkspace);

// receive the first message of the worker protocol from the Mocha Test Explorer
process.once('message', async origWorkerArgs => {

	log('Received workerArgs');

	// convert the paths in the `WorkerArgs` for the remote environment
	const workerArgs = mochaWorker.convertWorkerArgs(origWorkerArgs, localToRemotePath);

	// if the tests should be run in the debugger, we need to pass extra arguments to node to enable the debugger
	// and to ssh to tunnel the debugger connection
	let nodeDebugArgs = [];
	let sshDebugArgs = [];
	if (workerArgs.debuggerPort) {
		nodeDebugArgs = [ `--inspect-brk=${workerArgs.debuggerPort}` ]
		sshDebugArgs = [ '-L', `${workerArgs.debuggerPort}:localhost:${workerArgs.debuggerPort}` ];
	}

	// copy the workspace folder to the remote environment using rsync
	log('Syncing workspace');
	const rsyncOutput = execSync(`rsync -r ${localWorkspace}/ ${remoteUser}@${remoteHost}:${remoteWorkspace}`);
	log(`Output from rsync: ${rsyncOutput.toString()}`);

	// start a child process that will run the worker script via ssh
	log('Starting worker via ssh');
	const childProcess = spawn(
		'ssh',
		[
			`${remoteUser}@${remoteHost}`,

			// tunnel the TCP connection for the worker protocol
			'-R', `${port}:localhost:${port}`,

			// optionally tunnel the TCP connection for the debugger protocol
			...sshDebugArgs,

			'node',

			// optionally enable the node debugger
			...nodeDebugArgs,

			// this tells node that it should receive the worker script on `stdin`
			'-',

			// this tells the worker script to connect to localhost:${port} for the worker protocol
			`"{\\\"role\\\":\\\"client\\\",\\\"port\\\":${port}}"`
		],

		// we use 'inherit' to forward the messages on `stdout` and `stderr` from the child process
		// to this process, so they can be received by Mocha Test Explorer. `stdin` is set to 'pipe'
		// so we can use it to send the worker script
		{ stdio: [ 'pipe', 'inherit', 'inherit' ] }
	);

	// report error events from the child process to the diagnostic log of Mocha Test Explorer
	childProcess.on('error', err => log(`Error from ssh: ${inspect(err)}`));

	// write a log message when the child process exits
	childProcess.on('exit', (code, signal) => {
		log(`The ssh process exited with code ${code} and signal ${signal}.`);

		// if the child process should have loaded the tests but exited abnormally,
		// we send an `ErrorInfo` object so that the error is shown in the Test Explorer UI
		if ((workerArgs.action === 'loadTests') && (code || signal)) {
			process.send({ type: 'finished', errorMessage: `The ssh process exited with code ${code} and signal ${signal}.\nThe diagnostic log may contain more information, enable it with the "mochaExplorer.logpanel" or "mochaExplorer.logfile" settings.` });
		}
	});

	// send the worker script to the child process
	log('Sending worker script');
	childProcess.stdin.write(
		readFileSync(origWorkerArgs.workerScript),
		() => log('Finished sending worker script')
	);
	childProcess.stdin.end();

	// establish the TCP/IP connection to the worker
	log('Waiting for worker process to connect');
	const socket = await receiveConnection(port);

	// forward the `WorkerArgs` that we received earlier from Mocha Test Explorer to the worker
	log('Sending workerArgs to worker process');
	await writeMessage(socket, workerArgs);

	log('Finished initialising worker');

	// receive the results from the worker, translate any paths in them and forward them to Mocha Test Explorer
	readMessages(socket, msg => {
		if (workerArgs.action === 'loadTests') {
			process.send(mochaWorker.convertTestLoadMessage(msg, remoteToLocalPath));
		} else {
			process.send(mochaWorker.convertTestRunMessage(msg, remoteToLocalPath));
		}
	});
});
