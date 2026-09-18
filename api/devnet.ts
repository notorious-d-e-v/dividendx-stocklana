import { handleDevnetRequest } from '../packages/hosted-devnet/dist/src/http.js';

export const maxDuration = 60;
export default { fetch(request: Request): Promise<Response> { return handleDevnetRequest(request); } };
