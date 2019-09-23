exports.command = 'kernel <command>';
exports.desc = 'Run and manage kernel';
exports.builder = yargs => yargs.commandDir('kernel', { exclude: /\.test\.js$/ });
