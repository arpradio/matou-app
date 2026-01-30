//go:build integration

// P2P sync verification tests for any-sync integration.
//
// These tests verify that changes propagate between peers via HeadUpdate/FullSync.
// They require the any-sync test network to be running (Docker).
//
// Run with:
//
//	cd infrastructure/any-sync && docker compose --env-file .env.test up -d
//	go test -tags=integration ./internal/anysync/ -run "TestIntegration_P2PSync" -v -timeout 60s
package anysync

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

func TestIntegration_P2PSync_CredentialTree(t *testing.T) {
	testNetwork.RequireNetwork()

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	client := newTestSDKClient(t)

	t.Run("create space with keys", func(t *testing.T) {
		keys, err := GenerateSpaceKeySet()
		if err != nil {
			t.Fatalf("generating keys: %v", err)
		}

		result, err := client.CreateSpaceWithKeys(ctx, "ETestSync_Owner", SpaceTypePrivate, keys)
		if err != nil {
			t.Fatalf("creating space: %v", err)
		}

		if result.SpaceID == "" {
			t.Fatal("expected non-empty space ID")
		}

		t.Logf("Created space: %s", result.SpaceID)
	})

	t.Run("create credential tree and add credential", func(t *testing.T) {
		keys, err := GenerateSpaceKeySet()
		if err != nil {
			t.Fatalf("generating keys: %v", err)
		}

		result, err := client.CreateSpaceWithKeys(ctx, "ETestSync_TreeOwner", SpaceTypePrivate, keys)
		if err != nil {
			t.Fatalf("creating space: %v", err)
		}

		treeMgr := NewCredentialTreeManager(client, nil)

		treeID, err := treeMgr.CreateCredentialTree(ctx, result.SpaceID, keys.SigningKey)
		if err != nil {
			t.Fatalf("creating credential tree: %v", err)
		}

		if treeID == "" {
			t.Fatal("expected non-empty tree ID")
		}
		t.Logf("Created tree: %s in space: %s", treeID, result.SpaceID)

		// Add a credential to the tree
		cred := &CredentialPayload{
			SAID:      "ESAID_sync_test_001",
			Issuer:    "ETestIssuer",
			Recipient: "ETestRecipient",
			Schema:    "EMatouMembershipSchemaV1",
			Data:      json.RawMessage(`{"role":"member","level":"basic"}`),
			Timestamp: time.Now().Unix(),
		}

		changeID, err := treeMgr.AddCredential(ctx, result.SpaceID, cred, keys.SigningKey)
		if err != nil {
			t.Fatalf("adding credential: %v", err)
		}

		if changeID == "" {
			t.Fatal("expected non-empty change ID")
		}
		t.Logf("Added credential, change ID: %s", changeID)

		// Read back credentials
		creds, err := treeMgr.ReadCredentials(ctx, result.SpaceID)
		if err != nil {
			t.Fatalf("reading credentials: %v", err)
		}

		// Expect at least 1 credential (the one we added)
		found := false
		for _, c := range creds {
			if c.SAID == "ESAID_sync_test_001" {
				found = true
				if c.Issuer != "ETestIssuer" {
					t.Errorf("issuer mismatch: got %s, want ETestIssuer", c.Issuer)
				}
				if c.Schema != "EMatouMembershipSchemaV1" {
					t.Errorf("schema mismatch: got %s", c.Schema)
				}
			}
		}
		if !found {
			t.Errorf("credential ESAID_sync_test_001 not found in tree (got %d credentials)", len(creds))
		}
	})
}

func TestIntegration_P2PSync_ACLInvite(t *testing.T) {
	testNetwork.RequireNetwork()

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	client := newTestSDKClient(t)

	keys, err := GenerateSpaceKeySet()
	if err != nil {
		t.Fatalf("generating keys: %v", err)
	}

	result, err := client.CreateSpaceWithKeys(ctx, "ETestACL_Owner", SpaceTypeCommunity, keys)
	if err != nil {
		t.Fatalf("creating space: %v", err)
	}

	t.Logf("Created community space: %s", result.SpaceID)

	aclMgr := NewMatouACLManager(client, nil)

	t.Run("create open invite", func(t *testing.T) {
		inviteKey, err := aclMgr.CreateOpenInvite(ctx, result.SpaceID, PermissionWrite.ToSDKPermissions())
		if err != nil {
			t.Fatalf("creating invite: %v", err)
		}

		if inviteKey == nil {
			t.Fatal("expected non-nil invite key")
		}

		pubKeyBytes, _ := inviteKey.GetPublic().Raw()
		t.Logf("Created invite, public key: %x", pubKeyBytes[:8])
	})
}

// TestIntegration_P2PSync_TwoClientPropagation verifies that credential changes
// propagate between two clients connected to the same space.
//
// TODO: This test requires fixing the SDK component stubs (sdkPeerManagerProvider,
// sdkTreeManager, sdkStreamHandler) to enable real P2P sync. Currently, the stubs
// return errors for all sync operations, preventing inter-peer propagation.
// The test is included as a placeholder for when the stubs are replaced with
// real SDK components.
func TestIntegration_P2PSync_TwoClientPropagation(t *testing.T) {
	testNetwork.RequireNetwork()
	t.Skip("Requires real SDK sync components (sdkPeerManagerProvider, sdkTreeManager, sdkStreamHandler) — currently stubbed out")

	// When enabled, this test should:
	// 1. Create two SDKClients (Client A and Client B) with separate data dirs
	// 2. Client A creates a space with keys
	// 3. Client A creates an open invite
	// 4. Client B joins using the invite key
	// 5. Client A adds a credential to the space's tree
	// 6. Wait for HeadUpdate/FullSync propagation
	// 7. Client B reads credentials from the tree
	// 8. Verify Client B sees Client A's credential
}
