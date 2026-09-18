import handler from '../packages/hosted-broker/dist/src/http.js';

export const maxDuration = 60;
export default { fetch: handler };
