const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Zustand 5 exposes an ESM build that still contains `import.meta.env`.
// Expo's web export is loaded as a classic script, so prefer the package's
// CommonJS entry to keep the generated bundle browser-compatible.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
