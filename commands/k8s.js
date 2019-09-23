exports.command = 'k8s <command>';
exports.desc = 'Manage integration with k8s cluster';
exports.builder = yargs => yargs.commandDir('k8s', { exclude: /\.test\.js$/ });
