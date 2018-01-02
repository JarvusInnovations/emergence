const logger = require('./logger');
const semver = require('semver');
const _ = require('underscore');
const axios = require('axios');
const child_process = require('child_process');

/**
 * Represents and provides an interface to an executable habitat binary
 * available in the host environment
 */
class Habitat {

    constructor (command = 'hab', supervisorApi = 'http://localhost:9631') {
        this.command = command;
        this.supervisorApi = axios.create({ baseURL: supervisorApi });

        this.version = null;
        this.build = null;
    }

    /**
     * Get the version of the hab binary
     * @returns {?string} Version reported by habitat binary, or null if not available
     */
    async getVersion () {
        if (this.version === null) {
            try {
                const output = await this.exec({ version: true });
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
     * @returns {boolean} True if habitat version satisfies provided range
     */
    async satisfiesVersion (range) {
        return semver.satisfies(await this.getVersion(), range);
    }

    /**
     * @returns {Object[]|false} Array of service status objects or false if the supervisor is unavailable
     */
    async getSupervisorStatus () {
        try {
            const output = (await this.exec('svc', 'status')).split(/\n/);

            if (output.length == 1) {
                return [];
            }

            let columns;
            const services = [];
            for (let line of output) {
                line = line.split(/\s{2,}/);

                if (!columns) {
                    columns = line;
                    continue;
                }

                services.push(_.object(columns, line));
            }

            return services;
        } catch (err) {
            return false;
        }
    }

    /**
     * Gets axios instance for supervisor API
     * @returns {Object} axios
     */
    getSupervisorApi () {
        return this.supervisorApi;
    }

    /**
     * Gets array of services via supervisor API
     * @returns {Object[]} Array of services
     */
    async getServices () {
        const response = await habitat.getSupervisorApi().get('services');
        return response.data;
    }

    /**
     * Executes habitat with given arguments
     * @param {string|string[]} args - Arguments to execute
     * @param {?Object} execOptions - Extra execution options
     * @returns {Promise}
     */
    async exec (...args) {
        const commandArgs = [];
        const commandEnv = {};
        const execOptions = {};


        // scan through all arguments
        let arg;

        while (arg = args.shift()) {
            switch (typeof arg) {
                case 'string':
                case 'number':
                    commandArgs.push(arg.toString());
                    break;
                case 'object':

                    // extract any exec options
                    if ('$nullOnError' in arg) {
                        execOptions.nullOnError = arg.$nullOnError;
                        delete arg.$nullOnError;
                    }

                    if ('$env' in arg) {
                        for (let key in arg.$env) {
                            commandEnv[key] = arg.$options[key];
                        }
                        delete arg.$env;
                    }

                    if ('$preserveEnv' in arg) {
                        execOptions.preserveEnv = arg.$preserveEnv;
                        delete arg.$preserveEnv;
                    }

                    if ('$options' in arg) {
                        for (let key in arg.$options) {
                            execOptions[key] = arg.$options[key];
                        }
                    }

                    if (arg.passthrough) {
                        execOptions.spawn = true;
                        execOptions.passthrough = true;
                        delete arg.passthrough;
                    }

                    if (arg.wait) {
                        execOptions.wait = true;
                        delete arg.wait;
                    }


                    // any remaiing elements are args/options
                    for (let key in arg) {
                        const value = arg[key];

                        if (key.length == 1) {
                            if (value === true) {
                                commandArgs.push('-'+key);
                            } else if (value !== false) {
                                commandArgs.push('-'+key, value);
                            }
                        } else {
                            if (value === true) {
                                commandArgs.push('--'+key);
                            } else if (value !== false) {
                                commandArgs.push('--'+key, value);
                            }
                        }
                    }

                    break;
                default:
                    throw 'unhandled exec argument';
            }
        }


        // prepare options
        if (execOptions.preserveEnv !== false) {
            Object.setPrototypeOf(commandEnv, process.env);
        }

        execOptions.env = commandEnv;


        // execute git command
        logger.debug(this.command, commandArgs.join(' '));

        if (execOptions.spawn) {
            const process = child_process.spawn(this.command, commandArgs, execOptions);

            if (execOptions.passthrough) {
                process.stdout.on('data', data => data.toString().trim().split(/\n/).forEach(line => logger.info(line)));
                process.stderr.on('data', data => data.toString().trim().split(/\n/).forEach(line => logger.error(line)));
            }

            if (execOptions.wait) {
                return new Promise((resolve, reject) => {
                    process.on('exit', code => {
                        if (code == 0) {
                            resolve();
                        } else {
                            reject(code);
                        }
                    });
                });
            }

            return process;
        } else if (execOptions.shell) {
            return new Promise((resolve, reject) => {
                child_process.exec(`${this.command} ${commandArgs.join(' ')}`, execOptions, (error, stdout, stderr) => {
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
                child_process.execFile(this.command, commandArgs, execOptions, (error, stdout, stderr) => {
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

const habitat = new Habitat();

module.exports = function () {
    return habitat.exec.apply(habitat, arguments);
};

Object.setPrototypeOf(module.exports, habitat);
