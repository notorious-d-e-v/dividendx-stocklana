import { handleObservationCron } from '../../packages/hosted-devnet/dist/src/http.js';

export const maxDuration = 300;
export default { fetch(request: Request): Promise<Response> { return handleObservationCron(request); } };
