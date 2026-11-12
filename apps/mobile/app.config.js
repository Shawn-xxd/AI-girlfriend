const { resolveMobileConfig } = require('./config/build-config.cjs');
module.exports = ({ config }) => resolveMobileConfig(config, process.env);
