/**
 * Debug test for IPEX message delivery
 *
 * Tests if IPEX apply messages are delivered between two agents on the same KERIA instance.
 * This isolates the message delivery issue from the full registration flow.
 */
import { test, expect } from '@playwright/test';

const FRONTEND_URL = 'http://localhost:9002';

test.describe('IPEX Message Debug', () => {
  test('test IPEX apply between two browser contexts', async ({ browser }) => {
    test.setTimeout(300000); // 5 minutes

    // Create two separate browser contexts (simulating two different users)
    const adminContext = await browser.newContext();
    const userContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const userPage = await userContext.newPage();

    // Setup console logging
    adminPage.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('KERI') || text.includes('IPEX') || text.includes('notification') ||
          text.includes('OOBI') || text.includes('Error') || msg.type() === 'error') {
        console.log(`[Admin] ${text}`);
      }
    });
    userPage.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('KERI') || text.includes('IPEX') || text.includes('notification') ||
          text.includes('OOBI') || text.includes('Error') || msg.type() === 'error') {
        console.log(`[User] ${text}`);
      }
    });

    try {
      // Step 1: Create Admin AID in admin context
      console.log('\n=== Step 1: Create Admin AID ===');
      await adminPage.goto(FRONTEND_URL);

      // Run test script in admin page
      const adminResult = await adminPage.evaluate(async () => {
        const { SignifyClient, Tier, randomPasscode, ready } = await import('signify-ts');

        await ready();

        const bran = randomPasscode();
        const client = new SignifyClient(
          'http://localhost:3901',
          bran,
          Tier.low,
          'http://localhost:3903'
        );

        try {
          await client.connect();
          console.log('[KERI] Connected to existing agent');
        } catch {
          await client.boot();
          await client.connect();
          console.log('[KERI] Booted and connected new agent');
        }

        // Create AID without witnesses (faster for testing)
        const result = await client.identifiers().create('admin-test');
        const op = await result.op();
        await client.operations().wait(op, { signal: AbortSignal.timeout(60000) });

        const aid = await client.identifiers().get('admin-test');
        console.log(`[KERI] Admin AID created: ${aid.prefix}`);

        // Add end role
        const agentId = client.agent?.pre;
        const endRoleResult = await client.identifiers().addEndRole('admin-test', 'agent', agentId);
        await client.operations().wait(await endRoleResult.op(), { signal: AbortSignal.timeout(30000) });
        console.log('[KERI] Admin end role added');

        // Get OOBI
        const oobiResult = await client.oobis().get('admin-test', 'agent');
        const oobi = oobiResult.oobis?.[0] || '';
        console.log(`[KERI] Admin OOBI: ${oobi}`);

        return {
          bran,
          prefix: aid.prefix,
          oobi,
          agentId
        };
      });

      console.log(`Admin AID: ${adminResult.prefix}`);
      console.log(`Admin OOBI: ${adminResult.oobi}`);

      // Step 2: Create User AID in user context
      console.log('\n=== Step 2: Create User AID ===');
      await userPage.goto(FRONTEND_URL);

      const userResult = await userPage.evaluate(async (adminOobi: string) => {
        const { SignifyClient, Tier, randomPasscode, ready } = await import('signify-ts');

        await ready();

        const bran = randomPasscode();
        const client = new SignifyClient(
          'http://localhost:3901',
          bran,
          Tier.low,
          'http://localhost:3903'
        );

        try {
          await client.connect();
          console.log('[KERI] Connected to existing agent');
        } catch {
          await client.boot();
          await client.connect();
          console.log('[KERI] Booted and connected new agent');
        }

        // Create AID without witnesses (faster)
        const result = await client.identifiers().create('user-test');
        const op = await result.op();
        await client.operations().wait(op, { signal: AbortSignal.timeout(60000) });

        const aid = await client.identifiers().get('user-test');
        console.log(`[KERI] User AID created: ${aid.prefix}`);

        // Add end role
        const agentId = client.agent?.pre;
        const endRoleResult = await client.identifiers().addEndRole('user-test', 'agent', agentId);
        await client.operations().wait(await endRoleResult.op(), { signal: AbortSignal.timeout(30000) });
        console.log('[KERI] User end role added');

        // Get User OOBI
        const oobiResult = await client.oobis().get('user-test', 'agent');
        const oobi = oobiResult.oobis?.[0] || '';
        console.log(`[KERI] User OOBI: ${oobi}`);

        // Resolve Admin OOBI
        console.log(`[KERI] Resolving admin OOBI: ${adminOobi}`);
        const resolveOp = await client.oobis().resolve(adminOobi, 'admin-contact');
        await client.operations().wait(resolveOp, { signal: AbortSignal.timeout(30000) });
        console.log('[KERI] Admin OOBI resolved');

        return {
          bran,
          prefix: aid.prefix,
          oobi,
        };
      }, adminResult.oobi);

      console.log(`User AID: ${userResult.prefix}`);
      console.log(`User OOBI: ${userResult.oobi}`);

      // Step 3: User sends IPEX apply to Admin
      console.log('\n=== Step 3: User sends IPEX apply to Admin ===');

      const sendResult = await userPage.evaluate(async (adminPrefix: string) => {
        const { SignifyClient, Tier, ready } = await import('signify-ts');
        await ready();

        // Reconnect (page evaluation doesn't persist state well)
        const storedBran = localStorage.getItem('test_bran');
        if (!storedBran) throw new Error('No stored bran');

        const client = new SignifyClient(
          'http://localhost:3901',
          storedBran,
          Tier.low,
          'http://localhost:3903'
        );
        await client.connect();

        const SCHEMA_SAID = 'EOVL3N0K_tYc9U-HXg7r2jDPo4Gnq3ebCjDqbJzl6fsT';

        console.log(`[KERI] Creating IPEX apply for recipient: ${adminPrefix}`);
        const [apply, sigs, end] = await client.ipex().apply({
          senderName: 'user-test',
          recipient: adminPrefix,
          schemaSaid: SCHEMA_SAID,
          message: JSON.stringify({
            type: 'registration',
            name: 'Test User',
            bio: 'Testing IPEX messaging',
          }),
          attributes: { name: 'Test User' },
        });

        console.log('[KERI] Submitting IPEX apply...');
        const response = await client.ipex().submitApply('user-test', apply, sigs, [adminPrefix]);
        console.log('[KERI] IPEX apply response:', JSON.stringify(response));

        return {
          success: true,
          applySaid: apply.sad?.d || 'unknown',
          response
        };
      }, adminResult.prefix);

      console.log(`IPEX apply sent: ${sendResult.applySaid}`);

      // Step 4: Wait a moment for message propagation
      console.log('\n=== Step 4: Wait for message propagation (10 seconds) ===');
      await adminPage.waitForTimeout(10000);

      // Step 5: Admin checks notifications
      console.log('\n=== Step 5: Admin checks notifications ===');

      const notificationsResult = await adminPage.evaluate(async () => {
        const { SignifyClient, Tier, ready } = await import('signify-ts');
        await ready();

        const storedBran = localStorage.getItem('test_bran');
        if (!storedBran) throw new Error('No stored bran');

        const client = new SignifyClient(
          'http://localhost:3901',
          storedBran,
          Tier.low,
          'http://localhost:3903'
        );
        await client.connect();

        // Check all notifications
        const notifications = await client.notifications().list();
        console.log('[KERI] All notifications:', JSON.stringify(notifications, null, 2));

        // Check escrows
        try {
          const escrows = await client.escrows().listReply('/exn/ipex/apply');
          console.log('[KERI] Escrows (ipex/apply):', JSON.stringify(escrows, null, 2));
        } catch (e) {
          console.log('[KERI] Escrows error:', e);
        }

        // Filter for IPEX apply
        const applyNotes = notifications.notes?.filter((n: any) =>
          n.a?.r === '/exn/ipex/apply' && !n.r
        ) || [];

        return {
          totalNotes: notifications.notes?.length || 0,
          applyNotes: applyNotes.length,
          notes: notifications.notes || [],
        };
      });

      console.log(`Total notifications: ${notificationsResult.totalNotes}`);
      console.log(`IPEX apply notifications: ${notificationsResult.applyNotes}`);
      console.log(`All notes: ${JSON.stringify(notificationsResult.notes, null, 2)}`);

      // Step 6: Check if Admin needs to resolve User OOBI first
      console.log('\n=== Step 6: Admin resolves User OOBI and rechecks ===');

      const afterOobiResult = await adminPage.evaluate(async (userOobi: string) => {
        const { SignifyClient, Tier, ready } = await import('signify-ts');
        await ready();

        const storedBran = localStorage.getItem('test_bran');
        if (!storedBran) throw new Error('No stored bran');

        const client = new SignifyClient(
          'http://localhost:3901',
          storedBran,
          Tier.low,
          'http://localhost:3903'
        );
        await client.connect();

        // Resolve User OOBI
        console.log(`[KERI] Resolving user OOBI: ${userOobi}`);
        try {
          const resolveOp = await client.oobis().resolve(userOobi, 'user-contact');
          await client.operations().wait(resolveOp, { signal: AbortSignal.timeout(30000) });
          console.log('[KERI] User OOBI resolved');
        } catch (e) {
          console.log('[KERI] User OOBI resolution error:', e);
        }

        // Wait a moment
        await new Promise(r => setTimeout(r, 5000));

        // Check notifications again
        const notifications = await client.notifications().list();
        console.log('[KERI] Notifications after OOBI resolution:', JSON.stringify(notifications, null, 2));

        const applyNotes = notifications.notes?.filter((n: any) =>
          n.a?.r === '/exn/ipex/apply' && !n.r
        ) || [];

        return {
          totalNotes: notifications.notes?.length || 0,
          applyNotes: applyNotes.length,
          notes: notifications.notes || [],
        };
      }, userResult.oobi);

      console.log(`After OOBI resolution - Total notifications: ${afterOobiResult.totalNotes}`);
      console.log(`After OOBI resolution - IPEX apply notifications: ${afterOobiResult.applyNotes}`);

      // Assertions
      expect(sendResult.success).toBe(true);

      // If OOBI resolution is required, we should see notifications after step 6
      if (afterOobiResult.applyNotes > 0) {
        console.log('\n✓ SUCCESS: IPEX apply notification received after admin resolved user OOBI');
      } else if (notificationsResult.applyNotes > 0) {
        console.log('\n✓ SUCCESS: IPEX apply notification received without needing OOBI resolution');
      } else {
        console.log('\n✗ ISSUE: No IPEX apply notification received');
      }

    } finally {
      await adminContext.close();
      await userContext.close();
    }
  });
});
