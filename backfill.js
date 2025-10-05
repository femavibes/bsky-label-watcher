#!/usr/bin/env node

const { AtpAgent } = require('@atproto/api');

async function backfill(label) {
  const agent = new AtpAgent({ service: 'https://bsky.social' });
  
  // Login
  await agent.login({
    identifier: process.env.LIST_ACCOUNT_DID || process.env.LABELER_DID,
    password: process.env.LIST_ACCOUNT_APP_PASSWORD || process.env.LABELER_APP_PASSWORD
  });

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
  
  // Find the list for this label
  const lists = await agent.app.bsky.graph.getLists({ actor: agent.session.did });
  const targetList = lists.data.lists.find(list => list.name.toLowerCase().includes(label.toLowerCase()));
  
  if (!targetList) {
    console.log(`No list found for label: ${label}`);
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