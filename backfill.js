#!/usr/bin/env node

const { AtpAgent } = require('@atproto/api');

// Load .env file if it exists (takes priority over docker-compose env vars)
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not available in production, use environment variables
}

async function backfill(label) {
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
  
  // Get historical labels from your labeler
  const response = await fetch(`https://labeler.urbanism.plus/xrpc/com.atproto.label.queryLabels?uriPatterns=*&labelValues=${label}&limit=1000`);
  const data = await response.json();
  
  const users = data.labels?.map(l => {
    if (l.uri.startsWith('at://')) {
      const uri = new URL(l.uri.replace('at://', 'https://'));
      return uri.hostname;
    }
    return l.uri;
  }) || [];

  console.log(`Found ${users.length} users with label ${label}`);
  
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
  
  // Add users to list
  let added = 0;
  for (const userDid of users) {
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
      if (e.message?.includes('already exists')) {
        console.log(`${userDid} already in list`);
      } else {
        console.error(`Failed to add ${userDid}:`, e.message);
      }
    }
  }
  
  console.log(`Backfill complete: ${added} users added`);
}

const label = process.argv[2];
if (!label) {
  console.log('Usage: node backfill.js <label>');
  process.exit(1);
}

backfill(label).catch(console.error);