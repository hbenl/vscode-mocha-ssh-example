# Running mocha tests remotely via ssh with Mocha Test Explorer

This is a sample project for running mocha tests remotely via ssh with [Mocha Test Explorer](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-mocha-test-adapter).
It uses the ssh [launcher script](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-mocha-test-adapter#running-tests-remotely) from https://github.com/hbenl/mocha-explorer-launcher-scripts.

To run the tests in this sample project, you will need a machine that has `node` and `rsync` installed and that you can ssh into without being prompted for a password. Change the `SSH_HOST`, `SSH_USER` and `SSH_WORKSPACE_PATH` environment variables in `.vscode/settings.json` (`SSH_WORKSPACE_PATH` should point to an empty directory on the remote host where this workspace will be copied to), then you should be able to run the tests using Mocha Test Explorer.
If it doesn't work, have a look at the [diagnostic log](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-mocha-test-adapter#user-content-troubleshooting) to see why it fails.
