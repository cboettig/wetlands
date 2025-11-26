// EventSource polyfill for Node.js
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const EventSourceModule = require('eventsource');
const EventSource = EventSourceModule.EventSource;
export default EventSource;
