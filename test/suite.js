const os = require('os');
const assert = require('assert');

describe("Tests run remotely", function() {

	it("should really run on the remote host", function() {
		// change 'host' to the hostname for your remote machine
		assert.strictEqual(os.hostname(), 'host');
	});

	it("should be able to access configured environment variables", function() {
		// this environment variable is set using the `mochaExplorer.env` setting
		assert.strictEqual(process.env['TEST_ENVVAR'], 'TEST_VALUE');
	});

	it("should be able to use mocha's require feature", function() {
		// this global variable is set in `required.js`, which is loaded using the `mochaExplorer.require` setting
		assert.strictEqual(global['TEST_VAR'], 'TEST_VALUE');
	});
});
