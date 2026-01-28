// Package anysync provides any-sync integration for MATOU.
// interface.go defines the common interface for any-sync clients.
package anysync

import (
	"context"

	"github.com/anyproto/any-sync/util/crypto"
)

// AnySyncClient is the common interface implemented by both
// Client (local mode) and SDKClient (full network mode)
type AnySyncClient interface {
	// CreateSpace creates a new space
	CreateSpace(ctx context.Context, ownerAID string, spaceType string, signingKey crypto.PrivKey) (*SpaceCreateResult, error)

	// DeriveSpace creates a deterministic space
	DeriveSpace(ctx context.Context, ownerAID string, spaceType string, signingKey crypto.PrivKey) (*SpaceCreateResult, error)

	// DeriveSpaceID returns the deterministic space ID without creating
	DeriveSpaceID(ctx context.Context, ownerAID string, spaceType string, signingKey crypto.PrivKey) (string, error)

	// AddToACL adds a peer to a space's access control list
	AddToACL(ctx context.Context, spaceID string, peerID string, permissions []string) error

	// SyncDocument syncs a document to a space
	SyncDocument(ctx context.Context, spaceID string, docID string, data []byte) error

	// GetNetworkID returns the any-sync network ID
	GetNetworkID() string

	// GetCoordinatorURL returns the coordinator address
	GetCoordinatorURL() string

	// GetPeerID returns the client's peer ID
	GetPeerID() string

	// Close shuts down the client
	Close() error
}
