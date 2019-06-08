# Running mocha tests remotely via ssh with Mocha Test Explorer

This is an example project for running mocha tests remotely via ssh with
[Mocha Test Explorer](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-mocha-test-adapter).
It uses functionality from the
[vscode-test-adapter-remoting-util](https://github.com/hbenl/vscode-test-adapter-remoting-util)
package, which also contains more documentation on how to setup remote testing for your project.

To run the tests in this example project, you will need a machine that has node and rsync installed
and that you can ssh into without being prompted for a password. Change the `remoteHost`,
`remoteUser` and `remoteWorkspace` constants in the [launcher script](./ssh-launcher.js)
(`remoteWorkspace` should point to an empty directory on the remote host where this workspace will
be copied to), then you should be able to run the tests using Mocha Test Explorer.
If it doesn't work, have a look at the
[diagnostic log](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-mocha-test-adapter#user-content-troubleshooting)
to see why it fails.
