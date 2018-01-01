const logger = require('./logger');
const semver = require('semver');
const child_process = require('child_process');

/**
 * Represents and provides an interface to an executable habitat binary
 * available in the host environment
 */
class Habitat {

    constructor (command = 'hab') {
        this.command = command;
        this.version = null;
        this.build = null;
    }

    /**
     * Get the version of the hab binary
     * @return {?string} Version reported by habitat binary, or null if not available
     */
    async getVersion () {
        if (this.version === null) {
            try {
                const output = await this.exec('--version');
                [, this.version, this.build] = /^hab ([^\/]+)\/(\d+)$/.exec(output);
            } catch (err) {
                this.version = false;
            }
        }

        return this.version || null;
    }

    /**
     * Check if habitat version is satisfied
     * @param {string} range - The version or range habitat should satisfy (see https://github.com/npm/node-semver#ranges)
     * @return {boolean} True if habitat version satisfies provided range
     */
    async satisfiesVersion (range) {
        return semver.satisfies(await this.getVersion(), range);
    }

    /**
     * Executes habitat with given arguments
     * @param {string|string[]} args - Arguments to execute
     * @param {?Object} execOptions - Extra execution options
     * @returns {Promise}
     */
    async exec (args, execOptions = {}) {

        // prepage arguments
        if (typeof args == 'string') {
            args = [args];
        }


        // prepare options
        if (execOptions.passthrough) {
            execOptions.spawn = true;
        }


        // execute git command
        logger.debug(this.command, args.join(' '));

        if (execOptions.spawn) {
            const process = child_process.spawn(this.command, args, execOptions);

            if (execOptions.passthrough) {
                process.stdout.on('data', data => data.toString().trim().split(/\n/).forEach(line => logger.info(line)));
                process.stderr.on('data', data => data.toString().trim().split(/\n/).forEach(line => logger.error(line)));
            }

            return process;
        } else if (execOptions.shell) {
            return new Promise((resolve, reject) => {
                child_process.exec(`${this.command} ${args.join(' ')}`, execOptions, (error, stdout, stderr) => {
                    if (error) {
                        if (execOptions.nullOnError) {
                            return resolve(null);
                        } else {
                            error.stderr = stderr;
                            return reject(error);
                        }
                    }

                    resolve(stdout.trim());
                });
            });
        } else {
            return new Promise((resolve, reject) => {
                child_process.execFile(this.command, args, execOptions, (error, stdout, stderr) => {
                    if (error) {
                        if (execOptions.nullOnError) {
                            return resolve(null);
                        } else {
                            error.stderr = stderr;
                            return reject(error);
                        }
                    }

                    resolve(stdout.trim());
                });
            });
        }
    }
}

module.exports = new Habitat();
