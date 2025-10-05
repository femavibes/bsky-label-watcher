#!/usr/bin/env node

const { AtpAgent } = require('@atproto/api');

// Load .env file if it exists (takes priority over docker-compose env vars)
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not available in production, use environment variables
}

async function backfill(label, timeoutMinutes = 0.5) {
  const agent = new AtpAgent({ service: 'https://bsky.social' });
  
  // Login with fallback priority: .env file > docker-compose env > defaults
  const identifier = process.env.LIST_ACCOUNT_DID || process.env.LABELER_DID;
  const password = process.env.LIST_ACCOUNT_APP_PASSWORD || process.env.LABELER_APP_PASSWORD;
  
  if (!identifier || !password) {
    console.error('Missing credentials. Set LABELER_DID and LABELER_APP_PASSWORD');
    process.exit(1);
  }
  
  await agent.login({ identifier, password });

  console.log(`Backfilling label: ${label}`);
  
  // Get historical labels from websocket starting from cursor=0
  const WebSocket = require('ws');
  const { decodeFirst } = require('@atcute/cbor');
  
  const wsUrl = `${process.env.LABELER_SOCKET_URL.replace('wss://', 'wss://').replace('http://', 'ws://')}?cursor=0`;
  console.log(`Connecting to: ${wsUrl}`);
  
  const users = new Set();
  
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let messageCount = 0;
    
    ws.on('message', (data) => {
      try {
        const [header, remainder] = decodeFirst(new Uint8Array(data));
        const [body] = decodeFirst(remainder);
        
        if (body.labels) {
          for (const l of body.labels) {
            if (l.val === label && !l.neg) {
              let userDid;
              if (l.uri.startsWith('at://')) {
                const uri = new URL(l.uri.replace('at://', 'https://'));
                userDid = uri.hostname;
              } else {
                userDid = l.uri;
              }
              users.add(userDid);
            }
          }
        }
        
        messageCount++;
        if (messageCount % 100 === 0) {
          console.log(`Processed ${messageCount} messages, found ${users.size} users with ${label}`);
        }
      } catch (e) {
        // Skip invalid messages
      }
    });
    
    ws.on('close', () => {
      console.log(`Websocket closed. Found ${users.size} total users with ${label}`);
      resolve();
    });
    
    ws.on('error', reject);
    
    // Close after specified timeout to avoid infinite processing
    const timeoutMs = timeoutMinutes * 60 * 1000;
    console.log(`Will timeout after ${timeoutMinutes} minutes`);
    setTimeout(() => {
      ws.close();
    }, timeoutMs);
  });

  const userArray = Array.from(users);
  console.log(`Found ${userArray.length} users with label ${label}`);
  
  // Get labeler service definition to find exact list name
  const labelerDid = process.env.LABELER_DID;
  const serviceDoc = await agent.app.bsky.labeler.getServices({
    dids: [labelerDid],
    detailed: true,
  });
  
  const labelDef = serviceDoc.data.views[0]?.policies?.labelValueDefinitions?.find(d => d.identifier === label);
  if (!labelDef) {
    console.log(`Label "${label}" not found in labeler definition`);
    return;
  }
  
  const expectedListName = labelDef.locales[0].name;
  console.log(`Looking for list named: ${expectedListName}`);
  
  // Find the list for this label
  const lists = await agent.app.bsky.graph.getLists({ actor: agent.session.did });
  const targetList = lists.data.lists.find(list => list.name === expectedListName);
  
  if (!targetList) {
    console.log(`No list found with name: ${expectedListName}`);
    return;
  }
  
  console.log(`Using list: ${targetList.name}`);
  
  // Check existing list members to avoid duplicates
  console.log('Checking existing list members...');
  const existingMembers = new Set();
  let cursor;
  
  do {
    const response = await agent.app.bsky.graph.getList({ 
      list: targetList.uri, 
      limit: 100,
      cursor 
    });
    
    for (const item of response.data.items) {
      existingMembers.add(item.subject.did);
    }
    
    cursor = response.data.cursor;
  } while (cursor);
  
  console.log(`Found ${existingMembers.size} existing members`);
  
  // Add users to list (skip if already exists)
  let added = 0;
  let skipped = 0;
  
  for (const userDid of userArray) {
    if (existingMembers.has(userDid)) {
      console.log(`Skipping ${userDid} (already in list)`);
      skipped++;
      continue;
    }
    
    try {
      await agent.app.bsky.graph.listitem.create(
        { repo: agent.session.did },
        {
          subject: userDid,
          list: targetList.uri,
          createdAt: new Date().toISOString(),
        }
      );
      console.log(`Added ${userDid}`);
      added++;
    } catch (e) {
      console.error(`Failed to add ${userDid}:`, e.message);
    }
  }
  
  console.log(`Backfill complete: ${added} users added, ${skipped} users skipped (already in list)`);
}

const label = process.argv[2];
const timeoutMinutes = parseFloat(process.argv[3]) || 0.5; // Default 0.5 minutes (30 seconds)

if (!label) {
  console.log('Usage: node backfill.js <label> [timeout_minutes]');
  console.log('Example: node backfill.js nimby 2    # 2 minutes timeout');
  console.log('Example: node backfill.js carbrain   # 30 seconds default');
  process.exit(1);
}

backfill(label, timeoutMinutes).catch(console.error);