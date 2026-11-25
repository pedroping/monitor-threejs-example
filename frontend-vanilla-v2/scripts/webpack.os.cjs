// Webpack override used by build-os.mjs instead of portfolio/webpack.config.js.
// The portfolio's own config inlines the whole build machine environment
// (PATH, HOME, npm_config_*, ...) into the bundle; this one only exposes the
// EmailJS keys the app actually reads.
const webpack = require(require.resolve("webpack", { paths: [process.cwd()] }));

const KEYS = ["SERVICE_KEY", "TEMPLATE_KEY", "PUBLIC_KEY"];

module.exports = (config) => {
  const env = {};
  for (const key of KEYS) if (process.env[key]) env[key] = process.env[key];
  config.plugins.push(new webpack.DefinePlugin({ "process.env": JSON.stringify(env) }));
  return config;
};
