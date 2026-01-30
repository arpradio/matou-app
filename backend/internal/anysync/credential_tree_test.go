package anysync

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/anyproto/any-sync/commonspace/mock_commonspace"
	"github.com/anyproto/any-sync/commonspace/object/tree/objecttree"
	"github.com/anyproto/any-sync/commonspace/object/tree/objecttree/mock_objecttree"
	"github.com/anyproto/any-sync/commonspace/object/tree/treestorage"
	"github.com/anyproto/any-sync/commonspace/objecttreebuilder/mock_objecttreebuilder"
	"github.com/anyproto/any-sync/util/crypto"
	"go.uber.org/mock/gomock"
)

func TestCredentialPayload_JSONRoundTrip(t *testing.T) {
	original := &CredentialPayload{
		SAID:      "ESAID_test_12345",
		Issuer:    "EIssuer_org_abc",
		Recipient: "ERecipient_user_xyz",
		Schema:    "EMatouMembershipSchemaV1",
		Data:      json.RawMessage(`{"role":"member","level":"gold"}`),
		Timestamp: time.Now().Unix(),
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var restored CredentialPayload
	if err := json.Unmarshal(data, &restored); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if restored.SAID != original.SAID {
		t.Errorf("SAID mismatch: got %s, want %s", restored.SAID, original.SAID)
	}
	if restored.Issuer != original.Issuer {
		t.Errorf("Issuer mismatch: got %s, want %s", restored.Issuer, original.Issuer)
	}
	if restored.Recipient != original.Recipient {
		t.Errorf("Recipient mismatch: got %s, want %s", restored.Recipient, original.Recipient)
	}
	if restored.Schema != original.Schema {
		t.Errorf("Schema mismatch: got %s, want %s", restored.Schema, original.Schema)
	}
	if string(restored.Data) != string(original.Data) {
		t.Errorf("Data mismatch: got %s, want %s", restored.Data, original.Data)
	}
	if restored.Timestamp != original.Timestamp {
		t.Errorf("Timestamp mismatch: got %d, want %d", restored.Timestamp, original.Timestamp)
	}
}

func TestCredentialTreeManager_CreateTree(t *testing.T) {
	ctrl := gomock.NewController(t)

	signingKey, _, err := crypto.GenerateRandomEd25519KeyPair()
	if err != nil {
		t.Fatalf("generating key: %v", err)
	}

	mockSpace := mock_commonspace.NewMockSpace(ctrl)
	mockTreeBuilder := mock_objecttreebuilder.NewMockTreeBuilder(ctrl)
	mockTree := mock_objecttree.NewMockObjectTree(ctrl)

	client := &testACLClient{space: mockSpace}

	storagePayload := treestorage.TreeStorageCreatePayload{
		Heads: []string{"head-1"},
	}

	mockSpace.EXPECT().TreeBuilder().Return(mockTreeBuilder)
	mockTreeBuilder.EXPECT().CreateTree(gomock.Any(), gomock.Any()).DoAndReturn(
		func(ctx context.Context, payload objecttree.ObjectTreeCreatePayload) (treestorage.TreeStorageCreatePayload, error) {
			// Verify payload fields
			if payload.SpaceId != "test-space" {
				t.Errorf("expected SpaceId 'test-space', got %s", payload.SpaceId)
			}
			if payload.ChangeType != CredentialChangeType {
				t.Errorf("expected ChangeType %s, got %s", CredentialChangeType, payload.ChangeType)
			}
			if !payload.IsEncrypted {
				t.Error("expected IsEncrypted=true")
			}
			if len(payload.Seed) != 32 {
				t.Errorf("expected 32-byte seed, got %d bytes", len(payload.Seed))
			}
			return storagePayload, nil
		},
	)
	mockTreeBuilder.EXPECT().PutTree(gomock.Any(), storagePayload, nil).Return(mockTree, nil)
	// Id() called once by CreateCredentialTree and once by GetTreeID
	mockTree.EXPECT().Id().Return("tree-cid-12345").Times(2)

	mgr := NewCredentialTreeManager(client, nil)
	treeID, err := mgr.CreateCredentialTree(context.Background(), "test-space", signingKey)
	if err != nil {
		t.Fatalf("CreateCredentialTree error: %v", err)
	}

	if treeID != "tree-cid-12345" {
		t.Errorf("expected tree ID 'tree-cid-12345', got %s", treeID)
	}

	// Verify tree is cached
	if mgr.GetTreeID("test-space") != "tree-cid-12345" {
		t.Error("tree not cached after creation")
	}
}

func TestCredentialTreeManager_CreateTree_GetSpaceError(t *testing.T) {
	client := &testACLClient{
		getSpaceErr: fmt.Errorf("space not found"),
	}

	signingKey, _, _ := crypto.GenerateRandomEd25519KeyPair()
	mgr := NewCredentialTreeManager(client, nil)

	_, err := mgr.CreateCredentialTree(context.Background(), "missing-space", signingKey)
	if err == nil {
		t.Fatal("expected error when GetSpace fails")
	}
}

func TestCredentialTreeManager_CreateTree_CreateTreeError(t *testing.T) {
	ctrl := gomock.NewController(t)

	signingKey, _, _ := crypto.GenerateRandomEd25519KeyPair()
	mockSpace := mock_commonspace.NewMockSpace(ctrl)
	mockTreeBuilder := mock_objecttreebuilder.NewMockTreeBuilder(ctrl)

	client := &testACLClient{space: mockSpace}

	mockSpace.EXPECT().TreeBuilder().Return(mockTreeBuilder)
	mockTreeBuilder.EXPECT().CreateTree(gomock.Any(), gomock.Any()).Return(
		treestorage.TreeStorageCreatePayload{}, fmt.Errorf("creation failed"),
	)

	mgr := NewCredentialTreeManager(client, nil)
	_, err := mgr.CreateCredentialTree(context.Background(), "test-space", signingKey)
	if err == nil {
		t.Fatal("expected error when CreateTree fails")
	}
}

func TestCredentialTreeManager_AddCredential(t *testing.T) {
	ctrl := gomock.NewController(t)

	signingKey, _, _ := crypto.GenerateRandomEd25519KeyPair()
	mockSpace := mock_commonspace.NewMockSpace(ctrl)
	mockTreeBuilder := mock_objecttreebuilder.NewMockTreeBuilder(ctrl)
	mockTree := mock_objecttree.NewMockObjectTree(ctrl)

	client := &testACLClient{space: mockSpace}

	cred := &CredentialPayload{
		SAID:      "ESAID_abc123",
		Issuer:    "EIssuer_org",
		Recipient: "ERecipient_user",
		Schema:    "EMatouMembershipSchemaV1",
		Data:      json.RawMessage(`{"status":"active"}`),
		Timestamp: time.Now().Unix(),
	}

	// First call creates the tree
	storagePayload := treestorage.TreeStorageCreatePayload{Heads: []string{"head-1"}}
	mockSpace.EXPECT().TreeBuilder().Return(mockTreeBuilder)
	mockTreeBuilder.EXPECT().CreateTree(gomock.Any(), gomock.Any()).Return(storagePayload, nil)
	mockTreeBuilder.EXPECT().PutTree(gomock.Any(), storagePayload, nil).Return(mockTree, nil)
	mockTree.EXPECT().Id().Return("tree-cid-12345")

	// Then AddContent is called
	mockTree.EXPECT().Lock()
	mockTree.EXPECT().Unlock()
	mockTree.EXPECT().AddContent(gomock.Any(), gomock.Any()).DoAndReturn(
		func(ctx context.Context, content objecttree.SignableChangeContent) (objecttree.AddResult, error) {
			if content.DataType != CredentialChangeType {
				t.Errorf("expected DataType %s, got %s", CredentialChangeType, content.DataType)
			}
			if !content.ShouldBeEncrypted {
				t.Error("expected ShouldBeEncrypted=true")
			}
			// Verify the data can be unmarshaled back
			var p CredentialPayload
			if err := json.Unmarshal(content.Data, &p); err != nil {
				t.Errorf("data not valid JSON: %v", err)
			}
			if p.SAID != "ESAID_abc123" {
				t.Errorf("SAID mismatch in content: %s", p.SAID)
			}
			return objecttree.AddResult{
				OldHeads: []string{"head-1"},
				Heads:    []string{"head-2"},
			}, nil
		},
	)

	mgr := NewCredentialTreeManager(client, nil)
	changeID, err := mgr.AddCredential(context.Background(), "test-space", cred, signingKey)
	if err != nil {
		t.Fatalf("AddCredential error: %v", err)
	}

	if changeID != "head-2" {
		t.Errorf("expected change ID 'head-2', got %s", changeID)
	}
}

func TestCredentialTreeManager_AddCredential_AddContentError(t *testing.T) {
	ctrl := gomock.NewController(t)

	signingKey, _, _ := crypto.GenerateRandomEd25519KeyPair()
	mockSpace := mock_commonspace.NewMockSpace(ctrl)
	mockTreeBuilder := mock_objecttreebuilder.NewMockTreeBuilder(ctrl)
	mockTree := mock_objecttree.NewMockObjectTree(ctrl)

	client := &testACLClient{space: mockSpace}

	storagePayload := treestorage.TreeStorageCreatePayload{Heads: []string{"head-1"}}
	mockSpace.EXPECT().TreeBuilder().Return(mockTreeBuilder)
	mockTreeBuilder.EXPECT().CreateTree(gomock.Any(), gomock.Any()).Return(storagePayload, nil)
	mockTreeBuilder.EXPECT().PutTree(gomock.Any(), storagePayload, nil).Return(mockTree, nil)
	mockTree.EXPECT().Id().Return("tree-cid-12345")

	mockTree.EXPECT().Lock()
	mockTree.EXPECT().Unlock()
	mockTree.EXPECT().AddContent(gomock.Any(), gomock.Any()).Return(
		objecttree.AddResult{}, fmt.Errorf("encryption failed"),
	)

	cred := &CredentialPayload{SAID: "test", Issuer: "test", Schema: "test", Timestamp: 1}

	mgr := NewCredentialTreeManager(client, nil)
	_, err := mgr.AddCredential(context.Background(), "test-space", cred, signingKey)
	if err == nil {
		t.Fatal("expected error when AddContent fails")
	}
}

func TestCredentialTreeManager_ReadCredentials(t *testing.T) {
	ctrl := gomock.NewController(t)

	mockTree := mock_objecttree.NewMockObjectTree(ctrl)

	// Pre-populate the trees map
	mgr := NewCredentialTreeManager(nil, nil)
	mgr.trees.Store("test-space", mockTree)

	cred1 := &CredentialPayload{
		SAID:      "ESAID_1",
		Issuer:    "EIssuer_org",
		Recipient: "EUser_1",
		Schema:    "EMatouMembershipSchemaV1",
		Data:      json.RawMessage(`{"role":"member"}`),
		Timestamp: 1000,
	}
	cred2 := &CredentialPayload{
		SAID:      "ESAID_2",
		Issuer:    "EIssuer_org",
		Recipient: "EUser_2",
		Schema:    "EMatouMembershipSchemaV1",
		Data:      json.RawMessage(`{"role":"admin"}`),
		Timestamp: 2000,
	}

	data1, _ := json.Marshal(cred1)
	data2, _ := json.Marshal(cred2)

	mockTree.EXPECT().Lock()
	mockTree.EXPECT().Unlock()
	mockTree.EXPECT().IterateRoot(gomock.Any(), gomock.Any()).DoAndReturn(
		func(convert objecttree.ChangeConvertFunc, iterate objecttree.ChangeIterateFunc) error {
			// Simulate two changes in the tree
			changes := []*objecttree.Change{
				{Id: "change-1", Data: data1},
				{Id: "change-2", Data: data2},
			}

			for _, change := range changes {
				model, err := convert(change, change.Data)
				if err != nil {
					return err
				}
				change.Model = model
				if !iterate(change) {
					break
				}
			}
			return nil
		},
	)

	creds, err := mgr.ReadCredentials(context.Background(), "test-space")
	if err != nil {
		t.Fatalf("ReadCredentials error: %v", err)
	}

	if len(creds) != 2 {
		t.Fatalf("expected 2 credentials, got %d", len(creds))
	}

	if creds[0].SAID != "ESAID_1" {
		t.Errorf("expected first credential SAID 'ESAID_1', got %s", creds[0].SAID)
	}
	if creds[0].Recipient != "EUser_1" {
		t.Errorf("expected first credential recipient 'EUser_1', got %s", creds[0].Recipient)
	}

	if creds[1].SAID != "ESAID_2" {
		t.Errorf("expected second credential SAID 'ESAID_2', got %s", creds[1].SAID)
	}
	if string(creds[1].Data) != `{"role":"admin"}` {
		t.Errorf("expected second credential data '{\"role\":\"admin\"}', got %s", creds[1].Data)
	}
}

func TestCredentialTreeManager_ReadCredentials_NoTree(t *testing.T) {
	mgr := NewCredentialTreeManager(nil, nil)

	_, err := mgr.ReadCredentials(context.Background(), "nonexistent-space")
	if err == nil {
		t.Fatal("expected error when no tree exists")
	}
}

func TestCredentialTreeManager_ReadCredentials_EmptyTree(t *testing.T) {
	ctrl := gomock.NewController(t)

	mockTree := mock_objecttree.NewMockObjectTree(ctrl)

	mgr := NewCredentialTreeManager(nil, nil)
	mgr.trees.Store("test-space", mockTree)

	mockTree.EXPECT().Lock()
	mockTree.EXPECT().Unlock()
	mockTree.EXPECT().IterateRoot(gomock.Any(), gomock.Any()).DoAndReturn(
		func(convert objecttree.ChangeConvertFunc, iterate objecttree.ChangeIterateFunc) error {
			// Empty tree — root change with no data
			rootChange := &objecttree.Change{Id: "root", Data: nil}
			model, err := convert(rootChange, nil)
			if err != nil {
				return err
			}
			rootChange.Model = model
			iterate(rootChange)
			return nil
		},
	)

	creds, err := mgr.ReadCredentials(context.Background(), "test-space")
	if err != nil {
		t.Fatalf("ReadCredentials error: %v", err)
	}

	if len(creds) != 0 {
		t.Errorf("expected 0 credentials for empty tree, got %d", len(creds))
	}
}

func TestCredentialTreeManager_GetTreeID(t *testing.T) {
	ctrl := gomock.NewController(t)

	mockTree := mock_objecttree.NewMockObjectTree(ctrl)
	mockTree.EXPECT().Id().Return("tree-cid-abc")

	mgr := NewCredentialTreeManager(nil, nil)
	mgr.trees.Store("space-1", mockTree)

	if id := mgr.GetTreeID("space-1"); id != "tree-cid-abc" {
		t.Errorf("expected 'tree-cid-abc', got %s", id)
	}

	if id := mgr.GetTreeID("nonexistent"); id != "" {
		t.Errorf("expected empty string for nonexistent space, got %s", id)
	}
}

func TestCredentialChangeType(t *testing.T) {
	if CredentialChangeType != "matou.credential.v1" {
		t.Errorf("expected 'matou.credential.v1', got %s", CredentialChangeType)
	}
}
