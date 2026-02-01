// Package identity manages the local user's identity in per-user mode.
// The backend only operates on behalf of one user at a time.
package identity

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// UserIdentity holds the local user's AID and mnemonic with thread-safe access.
// It persists to {dataDir}/identity.json so it survives restarts.
type UserIdentity struct {
	mu       sync.RWMutex
	aid      string
	mnemonic string
	peerID   string
	dataDir  string

	// Runtime config fields (set by frontend after fetching org config)
	orgAID           string
	communitySpaceID string
	privateSpaceID   string
}

// persistedIdentity is the JSON structure written to disk.
type persistedIdentity struct {
	AID              string `json:"aid"`
	Mnemonic         string `json:"mnemonic"`
	PeerID           string `json:"peerId,omitempty"`
	OrgAID           string `json:"orgAid,omitempty"`
	CommunitySpaceID string `json:"communitySpaceId,omitempty"`
	PrivateSpaceID   string `json:"privateSpaceId,omitempty"`
}

// New creates a new UserIdentity bound to the given data directory.
// If an identity file exists on disk, it is loaded automatically.
func New(dataDir string) *UserIdentity {
	ui := &UserIdentity{dataDir: dataDir}
	ui.load()
	return ui
}

// SetIdentity sets the user's AID and mnemonic and persists to disk.
func (u *UserIdentity) SetIdentity(aid, mnemonic string) error {
	u.mu.Lock()
	defer u.mu.Unlock()

	u.aid = aid
	u.mnemonic = mnemonic
	return u.persist()
}

// SetPeerID stores the derived peer ID.
func (u *UserIdentity) SetPeerID(peerID string) error {
	u.mu.Lock()
	defer u.mu.Unlock()

	u.peerID = peerID
	return u.persist()
}

// SetOrgConfig stores org-level runtime config fields.
func (u *UserIdentity) SetOrgConfig(orgAID, communitySpaceID string) error {
	u.mu.Lock()
	defer u.mu.Unlock()

	u.orgAID = orgAID
	u.communitySpaceID = communitySpaceID
	return u.persist()
}

// SetPrivateSpaceID stores the user's private space ID.
func (u *UserIdentity) SetPrivateSpaceID(spaceID string) error {
	u.mu.Lock()
	defer u.mu.Unlock()

	u.privateSpaceID = spaceID
	return u.persist()
}

// GetAID returns the current AID (empty if not configured).
func (u *UserIdentity) GetAID() string {
	u.mu.RLock()
	defer u.mu.RUnlock()
	return u.aid
}

// GetMnemonic returns the stored mnemonic (empty if not configured).
func (u *UserIdentity) GetMnemonic() string {
	u.mu.RLock()
	defer u.mu.RUnlock()
	return u.mnemonic
}

// GetPeerID returns the stored peer ID.
func (u *UserIdentity) GetPeerID() string {
	u.mu.RLock()
	defer u.mu.RUnlock()
	return u.peerID
}

// GetOrgAID returns the org AID from runtime config.
func (u *UserIdentity) GetOrgAID() string {
	u.mu.RLock()
	defer u.mu.RUnlock()
	return u.orgAID
}

// GetCommunitySpaceID returns the community space ID from runtime config.
func (u *UserIdentity) GetCommunitySpaceID() string {
	u.mu.RLock()
	defer u.mu.RUnlock()
	return u.communitySpaceID
}

// GetPrivateSpaceID returns the user's private space ID.
func (u *UserIdentity) GetPrivateSpaceID() string {
	u.mu.RLock()
	defer u.mu.RUnlock()
	return u.privateSpaceID
}

// IsConfigured returns true if an AID and mnemonic have been set.
func (u *UserIdentity) IsConfigured() bool {
	u.mu.RLock()
	defer u.mu.RUnlock()
	return u.aid != "" && u.mnemonic != ""
}

// Clear removes the identity and deletes the persisted file.
func (u *UserIdentity) Clear() error {
	u.mu.Lock()
	defer u.mu.Unlock()

	u.aid = ""
	u.mnemonic = ""
	u.peerID = ""
	u.orgAID = ""
	u.communitySpaceID = ""
	u.privateSpaceID = ""

	path := u.filePath()
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("removing identity file: %w", err)
	}
	return nil
}

// filePath returns the path to the identity JSON file.
func (u *UserIdentity) filePath() string {
	return filepath.Join(u.dataDir, "identity.json")
}

// persist writes the current state to disk. Caller must hold u.mu.
func (u *UserIdentity) persist() error {
	data := persistedIdentity{
		AID:              u.aid,
		Mnemonic:         u.mnemonic,
		PeerID:           u.peerID,
		OrgAID:           u.orgAID,
		CommunitySpaceID: u.communitySpaceID,
		PrivateSpaceID:   u.privateSpaceID,
	}

	bytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return fmt.Errorf("marshaling identity: %w", err)
	}

	if err := os.MkdirAll(u.dataDir, 0755); err != nil {
		return fmt.Errorf("creating data directory: %w", err)
	}

	if err := os.WriteFile(u.filePath(), bytes, 0600); err != nil {
		return fmt.Errorf("writing identity file: %w", err)
	}

	return nil
}

// load reads identity from disk if available. Does not return errors
// because missing identity is normal (first boot).
func (u *UserIdentity) load() {
	bytes, err := os.ReadFile(u.filePath())
	if err != nil {
		return // File doesn't exist yet — normal for first boot
	}

	var data persistedIdentity
	if err := json.Unmarshal(bytes, &data); err != nil {
		fmt.Printf("Warning: failed to parse identity.json: %v\n", err)
		return
	}

	u.aid = data.AID
	u.mnemonic = data.Mnemonic
	u.peerID = data.PeerID
	u.orgAID = data.OrgAID
	u.communitySpaceID = data.CommunitySpaceID
	u.privateSpaceID = data.PrivateSpaceID
}
