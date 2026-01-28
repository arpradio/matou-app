// Package anysync provides any-sync integration for MATOU.
// This file defines ACL policy types for bridging KERI credentials to any-sync ACL.
package anysync

import (
	"fmt"
)

// ACLPermission represents a permission level in any-sync ACL
type ACLPermission string

const (
	// PermissionNone indicates no access
	PermissionNone ACLPermission = "none"
	// PermissionRead indicates read-only access
	PermissionRead ACLPermission = "read"
	// PermissionWrite indicates read and write access
	PermissionWrite ACLPermission = "write"
	// PermissionAdmin indicates full admin access including ACL management
	PermissionAdmin ACLPermission = "admin"
	// PermissionOwner indicates space ownership
	PermissionOwner ACLPermission = "owner"
)

// ACLPolicy defines access control rules for a space
type ACLPolicy struct {
	// PolicyType identifies the type of policy
	PolicyType string `json:"policyType"`
	// OwnerAID is the KERI AID of the space owner
	OwnerAID string `json:"ownerAid"`
	// RequiredSchema is the KERI credential schema required for access (if any)
	RequiredSchema string `json:"requiredSchema,omitempty"`
	// DefaultPermission is the permission for members meeting the policy requirements
	DefaultPermission ACLPermission `json:"defaultPermission"`
	// OwnerPermission is the permission for the owner
	OwnerPermission ACLPermission `json:"ownerPermission"`
}

const (
	// PolicyTypePrivate indicates a private space (single owner)
	PolicyTypePrivate = "private"
	// PolicyTypeCommunity indicates a community space (membership-gated)
	PolicyTypeCommunity = "community"
	// PolicyTypePublic indicates a public space (read-only access for all)
	PolicyTypePublic = "public"
)

// PrivateACL creates an ACL policy for a private space
// Only the owner has access to the space
func PrivateACL(ownerAID string) *ACLPolicy {
	return &ACLPolicy{
		PolicyType:        PolicyTypePrivate,
		OwnerAID:          ownerAID,
		RequiredSchema:    "", // No credential required (owner only)
		DefaultPermission: PermissionNone,
		OwnerPermission:   PermissionOwner,
	}
}

// CommunityACL creates an ACL policy for a community space
// Access is gated by holding a specific KERI credential
func CommunityACL(orgAID string, requiredSchema string) *ACLPolicy {
	return &ACLPolicy{
		PolicyType:        PolicyTypeCommunity,
		OwnerAID:          orgAID,
		RequiredSchema:    requiredSchema,
		DefaultPermission: PermissionWrite, // Members can write
		OwnerPermission:   PermissionOwner,
	}
}

// PublicACL creates an ACL policy for a public space
// Anyone can read, but only the owner can write
func PublicACL(ownerAID string) *ACLPolicy {
	return &ACLPolicy{
		PolicyType:        PolicyTypePublic,
		OwnerAID:          ownerAID,
		RequiredSchema:    "",
		DefaultPermission: PermissionRead, // Anyone can read
		OwnerPermission:   PermissionOwner,
	}
}

// ACLEntry represents an entry in the any-sync ACL
type ACLEntry struct {
	// PeerID is the any-sync peer ID (not KERI AID)
	PeerID string `json:"peerId"`
	// AID is the KERI AID mapped to this peer
	AID string `json:"aid,omitempty"`
	// Permission is the granted permission level
	Permission ACLPermission `json:"permission"`
	// CredentialSAID is the SAID of the credential granting access (if any)
	CredentialSAID string `json:"credentialSaid,omitempty"`
	// AddedAt is when the entry was added
	AddedAt int64 `json:"addedAt"`
}

// ACLManager handles ACL operations for spaces
// It bridges KERI credentials to any-sync ACL
type ACLManager struct {
	client *Client
}

// NewACLManager creates a new ACL manager
func NewACLManager(client *Client) *ACLManager {
	return &ACLManager{client: client}
}

// ValidateAccess checks if an AID has access to a space based on ACL policy
// This is enforced at the application layer, not by any-sync directly
func (m *ACLManager) ValidateAccess(policy *ACLPolicy, aid string, hasCredential bool, credentialSchema string) (ACLPermission, error) {
	// Owner always has full access
	if aid == policy.OwnerAID {
		return policy.OwnerPermission, nil
	}

	switch policy.PolicyType {
	case PolicyTypePrivate:
		// Only owner has access to private spaces
		return PermissionNone, nil

	case PolicyTypeCommunity:
		// Community access requires the specified credential
		if policy.RequiredSchema != "" {
			if !hasCredential {
				return PermissionNone, fmt.Errorf("access requires credential with schema %s", policy.RequiredSchema)
			}
			if credentialSchema != policy.RequiredSchema {
				return PermissionNone, fmt.Errorf("credential schema %s does not match required schema %s", credentialSchema, policy.RequiredSchema)
			}
		}
		return policy.DefaultPermission, nil

	case PolicyTypePublic:
		// Anyone can read public spaces
		return PermissionRead, nil

	default:
		return PermissionNone, fmt.Errorf("unknown policy type: %s", policy.PolicyType)
	}
}

// GrantAccess adds a user to a space's ACL after validating their credential
// The credential is validated at the KERI/application layer before calling this
func (m *ACLManager) GrantAccess(spaceID string, peerID string, aid string, permission ACLPermission) error {
	// Convert permission to string array for the client
	var permissions []string
	switch permission {
	case PermissionRead:
		permissions = []string{"read"}
	case PermissionWrite:
		permissions = []string{"read", "write"}
	case PermissionAdmin:
		permissions = []string{"read", "write", "admin"}
	case PermissionOwner:
		permissions = []string{"read", "write", "admin", "owner"}
	default:
		return fmt.Errorf("cannot grant 'none' permission")
	}

	// Add to any-sync ACL
	return m.client.AddToACL(nil, spaceID, peerID, permissions)
}

// RevokeAccess removes a user from a space's ACL
func (m *ACLManager) RevokeAccess(spaceID string, peerID string) error {
	// In any-sync, revoking access typically means adding a revocation record
	// For now, this is a placeholder
	fmt.Printf("[ACL] Revoking access for peer %s from space %s\n", peerID, spaceID)
	return nil
}

// ACLPolicyForSpaceType returns the appropriate ACL policy for a space type
func ACLPolicyForSpaceType(spaceType string, ownerAID string, orgAID string) *ACLPolicy {
	switch spaceType {
	case SpaceTypePrivate:
		return PrivateACL(ownerAID)
	case SpaceTypeCommunity:
		return CommunityACL(orgAID, "EMatouMembershipSchemaV1")
	default:
		// Default to private
		return PrivateACL(ownerAID)
	}
}
