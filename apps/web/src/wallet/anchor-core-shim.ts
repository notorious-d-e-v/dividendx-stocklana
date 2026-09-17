// @anchor-lang/core's browser build is named-only, while its generated ESM currently imports a default namespace.
// @ts-ignore The package omits declarations for its browser bundle; its named surface matches the typed ESM bundle.
import * as anchorCore from '../../../../node_modules/@anchor-lang/core/dist/browser/index.js';

// @ts-ignore See the browser-bundle note above.
export * from '../../../../node_modules/@anchor-lang/core/dist/browser/index.js';
export default anchorCore;
