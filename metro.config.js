const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('wasm');
// SQLite's web worker needs SharedArrayBuffer. Production hosting needs these headers too.
config.server.enhanceMiddleware = (middleware) => (request, response, next) => {
  response.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  middleware(request, response, next);
};
module.exports = config;
