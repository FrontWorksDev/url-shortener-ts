import { Hono } from 'hono';
import type { EntryStore } from './store';
import { memoryStore } from './store.memory';

const createApp = (store: EntryStore) => {
  const app = new Hono();

  app.get('/', (c) => {
    return c.text('Hello Hono!');
  });

  return app;
};

export default createApp(memoryStore());
