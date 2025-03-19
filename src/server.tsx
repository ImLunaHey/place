import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { proxy } from 'hono/proxy';
import { env } from 'hono/adapter';
import { Jetstream } from '@skyware/jetstream';
import { canvasHeight, canvasWidth } from './config';
import { XRPC, CredentialManager, XRPCResponse } from '@atcute/client';
import { AppBskyFeedGetPostThread, AppBskyFeedPost } from '@atcute/client/lexicons';

const manager = new CredentialManager({ service: 'https://public.api.bsky.app' });
const rpc = new XRPC({ handler: manager });

// Parse a command from a Bluesky reply
const parseCommand = (actor: string, replyText: string): { actor: string; x: number; y: number; colour: string } | null => {
  console.info(`Parsing command: ${replyText}`);
  try {
    // Format: pixel x,y #RRGGBB
    const regex = /pixel\s*(\d+),\s*(\d+)\s*(#[0-9A-Fa-f]{6})/;
    const match = replyText.match(regex);
    console.info(`Match: ${match}`);
    if (!match) return null;
    const x = parseInt(match[1], 10);
    const y = parseInt(match[2], 10);
    const colour = match[3].toUpperCase();

    // Validate coordinates
    if (x >= 0 && x < canvasWidth && y >= 0 && y < canvasHeight) {
      console.info(`Parsed command: ${replyText}`, { x, y, colour });
      return { actor, x, y, colour };
    }
  } catch {
    // Ignore errors
  }

  return null;
};

const jetstream = new Jetstream();
jetstream.start();

const gamePost = 'at://did:plc:k6acu4chiwkixvdedcmdgmal/app.bsky.feed.post/3lkqdcmcync2n';

const commands = new Set<{ actor: string; x: number; y: number; colour: string; timestamp: string }>();

const processInitalState = async (res: XRPCResponse<AppBskyFeedGetPostThread.Output>) => {
  if (res.data.thread.$type !== 'app.bsky.feed.defs#threadViewPost') throw new Error('Invalid thread');
  const replies = res.data.thread.replies;
  if (!replies) throw new Error('No replies found');

  console.info(`Found ${replies.length} replies`);

  for (const reply of replies) {
    if (reply.$type !== 'app.bsky.feed.defs#threadViewPost') continue;
    const record = reply.post.record as AppBskyFeedPost.Record;
    const actor = reply.post.author.did;
    const command = parseCommand(actor, record.text);
    if (!command) continue;
    commands.add({
      ...command,
      timestamp: new Date(record.createdAt).toISOString(),
    });
  }
};

rpc
  .get('app.bsky.feed.getPostThread', {
    params: {
      uri: gamePost,
    },
  })
  .then(processInitalState);

jetstream.onCreate('app.bsky.feed.post', (event) => {
  if (event.commit.operation !== 'create') return;
  if (event.commit.record.reply?.root.uri !== gamePost) return;
  console.info(`New reply: ${event.commit.record.text}`);
  const actor = event.did;
  const command = parseCommand(actor, event.commit.record.text);
  if (!command) return;

  commands.add({
    ...command,
    timestamp: new Date(event.commit.record.createdAt).toISOString(),
  });
  console.log('New game move:', command);
});

const app = new Hono();

app.get('/data', (c) => {
  return c.json(Array.from(commands.values()));
});

// Catch-all route for static files and dev server proxy
app.get('/*', (c, next) => {
  const { NODE_ENV } = env(c);
  if (NODE_ENV === 'production') {
    return serveStatic({
      root: './dist',
    })(c, next);
  }

  return proxy(`http://localhost:5173${c.req.path}`);
});

serve({
  fetch: app.fetch,
  port: 8787,
});

console.info('Server is running on port 8787');
