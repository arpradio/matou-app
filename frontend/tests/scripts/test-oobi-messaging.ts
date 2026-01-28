/**
 * Test script to verify if messages can be received without bi-directional OOBI resolution.
 *
 * This tests the hypothesis that:
 * 1. User sends message to Admin (user has resolved admin's OOBI)
 * 2. Admin has NOT resolved user's OOBI
 * 3. Does Admin receive the notification?
 *
 * Run with: npx tsx tests/scripts/test-oobi-messaging.ts
 */

import { SignifyClient, Tier, randomPasscode, ready } from 'signify-ts';

const KERIA_URL = 'http://localhost:3901';
const KERIA_BOOT_URL = 'http://localhost:3903';

async function waitOperation(client: SignifyClient, op: any, timeout = 60000): Promise<any> {
  return client.operations().wait(op, { signal: AbortSignal.timeout(timeout) });
}

async function createClient(name: string): Promise<{ client: SignifyClient; bran: string }> {
  const bran = randomPasscode();
  const client = new SignifyClient(KERIA_URL, bran, Tier.low, KERIA_BOOT_URL);

  try {
    await client.connect();
    console.log(`[${name}] Connected to existing agent`);
  } catch {
    await client.boot();
    await client.connect();
    console.log(`[${name}] Booted and connected new agent`);
  }

  return { client, bran };
}

async function createAID(client: SignifyClient, name: string, alias: string): Promise<string> {
  // Create AID with witness for proper message routing
  const witnessIds = [
    'BBilc4-L3tFUnfM_wJr4S4OJanAv_VmF_dJNN6vkf2Ha',  // wan
    'BLskRTInXnMxWaGqcpSyMgo0nYbalW99cGZESrz3zapM',  // wil
    'BIKKuvBwpmDVA4Ds-EpL5bt9OqPzWPja2LigFYZN2YfX',  // wes
  ];
  const witnessEndpoints = [
    'http://localhost:5642',
    'http://localhost:5643',
    'http://localhost:5644',
  ];

  const result = await client.identifiers().create(alias, {
    toad: 2,
    wits: witnessIds,
  });
  let op = await result.op();
  op = await waitOperation(client, op);

  const aid = await client.identifiers().get(alias);
  console.log(`[${name}] AID created: ${aid.prefix}`);

  // Add end role for agent
  const agentId = client.agent?.pre;
  if (agentId) {
    const endRoleResult = await client.identifiers().addEndRole(alias, 'agent', agentId);
    await waitOperation(client, await endRoleResult.op(), 30000);
    console.log(`[${name}] End role added`);
  }

  return aid.prefix;
}

async function getOOBI(client: SignifyClient, name: string, alias: string): Promise<string> {
  const oobiResult = await client.oobis().get(alias, 'agent');
  const oobi = oobiResult.oobis?.[0] || '';
  console.log(`[${name}] OOBI: ${oobi}`);
  return oobi;
}

async function resolveOOBI(client: SignifyClient, name: string, oobi: string, contactAlias: string): Promise<void> {
  console.log(`[${name}] Resolving OOBI for ${contactAlias}...`);
  const op = await client.oobis().resolve(oobi, contactAlias);
  await waitOperation(client, op, 30000);
  console.log(`[${name}] OOBI resolved for ${contactAlias}`);
}

async function sendEXNMessage(
  client: SignifyClient,
  name: string,
  senderAlias: string,
  recipientPrefix: string,
  route: string,
  payload: Record<string, unknown>
): Promise<void> {
  console.log(`[${name}] Sending EXN message to ${recipientPrefix}...`);

  const [exn, sigs, atc] = await client.exchanges().send(
    senderAlias,
    'test-topic',
    { i: recipientPrefix },
    route,
    payload,
    {},
    [recipientPrefix]
  );

  console.log(`[${name}] EXN message sent. SAID: ${exn.d}`);
}

async function checkNotifications(client: SignifyClient, name: string): Promise<any[]> {
  const response = await client.notifications().list();
  const notes = response.notes || [];
  console.log(`[${name}] Total notifications: ${notes.length}`);

  for (const note of notes) {
    console.log(`[${name}]   - Route: ${note.a?.r}, Read: ${note.r}, SAID: ${note.a?.d}`);
  }

  return notes;
}

async function checkEscrows(client: SignifyClient, name: string): Promise<void> {
  try {
    const escrows = await client.escrows().listReply();
    console.log(`[${name}] Reply escrows: ${escrows.length}`);
    for (const escrow of escrows) {
      console.log(`[${name}]   - ${JSON.stringify(escrow)}`);
    }
  } catch (e) {
    console.log(`[${name}] Escrow check error: ${e}`);
  }
}

async function main() {
  console.log('=== OOBI Messaging Test ===\n');
  console.log('Testing: Can recipient receive message without resolving sender OOBI?\n');

  await ready();

  // Step 1: Create two clients (Admin and User)
  console.log('--- Step 1: Create clients ---');
  const { client: adminClient } = await createClient('Admin');
  const { client: userClient } = await createClient('User');

  // Step 2: Create AIDs
  console.log('\n--- Step 2: Create AIDs ---');
  const adminPrefix = await createAID(adminClient, 'Admin', 'admin-test');
  const userPrefix = await createAID(userClient, 'User', 'user-test');

  // Step 3: Get OOBIs
  console.log('\n--- Step 3: Get OOBIs ---');
  const adminOOBI = await getOOBI(adminClient, 'Admin', 'admin-test');
  const userOOBI = await getOOBI(userClient, 'User', 'user-test');

  // Step 4: User resolves Admin OOBI (one-way resolution)
  console.log('\n--- Step 4: User resolves Admin OOBI (ONE-WAY) ---');
  await resolveOOBI(userClient, 'User', adminOOBI, 'admin-contact');

  // NOTE: Admin does NOT resolve User OOBI
  console.log('\n--- Admin has NOT resolved User OOBI ---');

  // Step 5: User sends message to Admin
  console.log('\n--- Step 5: User sends EXN message to Admin ---');
  await sendEXNMessage(userClient, 'User', 'user-test', adminPrefix, '/matou/registration/apply', {
    type: 'registration',
    name: 'Test User',
    bio: 'Testing OOBI messaging',
    senderOOBI: userOOBI,
    timestamp: new Date().toISOString(),
  });

  // Step 6: Wait for message propagation
  console.log('\n--- Step 6: Wait 5 seconds for message propagation ---');
  await new Promise(r => setTimeout(r, 5000));

  // Step 7: Admin checks notifications (BEFORE resolving user OOBI)
  console.log('\n--- Step 7: Admin checks notifications (BEFORE resolving user OOBI) ---');
  const notesBefore = await checkNotifications(adminClient, 'Admin');
  await checkEscrows(adminClient, 'Admin');

  const registrationNotesBefore = notesBefore.filter(n => n.a?.r === '/matou/registration/apply');
  console.log(`\n[Admin] Registration notifications BEFORE OOBI resolution: ${registrationNotesBefore.length}`);

  // Step 8: Admin resolves User OOBI
  console.log('\n--- Step 8: Admin resolves User OOBI ---');
  await resolveOOBI(adminClient, 'Admin', userOOBI, 'user-contact');

  // Step 9: Wait for potential escrow processing
  console.log('\n--- Step 9: Wait 5 seconds for escrow processing ---');
  await new Promise(r => setTimeout(r, 5000));

  // Step 10: Admin checks notifications again (AFTER resolving user OOBI)
  console.log('\n--- Step 10: Admin checks notifications (AFTER resolving user OOBI) ---');
  const notesAfter = await checkNotifications(adminClient, 'Admin');
  await checkEscrows(adminClient, 'Admin');

  const registrationNotesAfter = notesAfter.filter(n => n.a?.r === '/matou/registration/apply');
  console.log(`\n[Admin] Registration notifications AFTER OOBI resolution: ${registrationNotesAfter.length}`);

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Notifications BEFORE admin resolved user OOBI: ${registrationNotesBefore.length}`);
  console.log(`Notifications AFTER admin resolved user OOBI: ${registrationNotesAfter.length}`);

  if (registrationNotesBefore.length > 0) {
    console.log('\n✓ Messages ARE received without bi-directional OOBI resolution');
  } else if (registrationNotesAfter.length > 0) {
    console.log('\n✓ Messages ARE received AFTER admin resolves user OOBI');
    console.log('  → Messages may be in escrow until sender is known');
  } else {
    console.log('\n✗ No messages received even after OOBI resolution');
    console.log('  → Need to investigate further');
  }
}

main().catch(console.error);
