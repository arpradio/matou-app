package keri

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
)

// Client provides access to KERI operations via kli in a Docker container
type Client struct {
	containerName string
	orgName       string
	orgPasscode   string
	orgAlias      string
}

// Config holds KERI client configuration
type Config struct {
	ContainerName string
	OrgName       string
	OrgPasscode   string
	OrgAlias      string
}

// AIDInfo contains information about an AID
type AIDInfo struct {
	Prefix    string   `json:"prefix"`
	Alias     string   `json:"alias"`
	PublicKey string   `json:"publicKey,omitempty"`
	Witnesses []string `json:"witnesses,omitempty"`
}

// CredentialData contains ACDC credential attributes
type CredentialData struct {
	CommunityName      string   `json:"communityName"`
	Role               string   `json:"role"`
	VerificationStatus string   `json:"verificationStatus"`
	Permissions        []string `json:"permissions"`
	JoinedAt           string   `json:"joinedAt"`
	ExpiresAt          string   `json:"expiresAt,omitempty"`
}

// CredentialResult contains the result of credential operations
type CredentialResult struct {
	SAID      string         `json:"said"`
	Issuer    string         `json:"issuer"`
	Recipient string         `json:"recipient"`
	Schema    string         `json:"schema"`
	Data      CredentialData `json:"data"`
}

// NewClient creates a new KERI client
func NewClient(cfg *Config) (*Client, error) {
	if cfg == nil {
		return nil, fmt.Errorf("config is required")
	}
	if cfg.ContainerName == "" {
		cfg.ContainerName = "matou-keria"
	}
	if cfg.OrgName == "" {
		return nil, fmt.Errorf("org name is required")
	}
	if cfg.OrgPasscode == "" {
		return nil, fmt.Errorf("org passcode is required")
	}
	if cfg.OrgAlias == "" {
		cfg.OrgAlias = "matou-org"
	}

	return &Client{
		containerName: cfg.ContainerName,
		orgName:       cfg.OrgName,
		orgPasscode:   cfg.OrgPasscode,
		orgAlias:      cfg.OrgAlias,
	}, nil
}

// runKLI executes a kli command inside the KERIA container
func (c *Client) runKLI(args ...string) (string, error) {
	cmdArgs := append([]string{"exec", c.containerName, "kli"}, args...)
	cmd := exec.Command("docker", cmdArgs...)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		return "", fmt.Errorf("kli command failed: %s: %w", stderr.String(), err)
	}

	return strings.TrimSpace(stdout.String()), nil
}

// GetOrgInfo returns information about the organization AID
func (c *Client) GetOrgInfo() (*AIDInfo, error) {
	output, err := c.runKLI(
		"status",
		"--name", c.orgName,
		"--passcode", c.orgPasscode,
		"--alias", c.orgAlias,
	)
	if err != nil {
		return nil, fmt.Errorf("getting org status: %w", err)
	}

	// Parse the kli status output
	info := &AIDInfo{
		Alias: c.orgAlias,
	}

	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "Identifier:") {
			info.Prefix = strings.TrimSpace(strings.TrimPrefix(line, "Identifier:"))
		}
		if strings.HasPrefix(line, "Public Keys:") {
			info.PublicKey = strings.TrimSpace(strings.TrimPrefix(line, "Public Keys:"))
		}
	}

	return info, nil
}

// IsContainerRunning checks if the KERIA container is running
func (c *Client) IsContainerRunning() bool {
	cmd := exec.Command("docker", "inspect", "-f", "{{.State.Running}}", c.containerName)
	output, err := cmd.Output()
	if err != nil {
		return false
	}
	return strings.TrimSpace(string(output)) == "true"
}

// HealthCheck verifies KERIA is accessible and the org AID exists
func (c *Client) HealthCheck() error {
	if !c.IsContainerRunning() {
		return fmt.Errorf("KERIA container %s is not running", c.containerName)
	}

	_, err := c.GetOrgInfo()
	if err != nil {
		return fmt.Errorf("org AID not accessible: %w", err)
	}

	return nil
}

// GetPermissionsForRole returns the permissions for a given role
func GetPermissionsForRole(role string) []string {
	permissions := map[string][]string{
		"Member":             {"read", "comment"},
		"Verified Member":    {"read", "comment", "vote"},
		"Trusted Member":     {"read", "comment", "vote", "propose"},
		"Expert Member":      {"read", "comment", "vote", "propose", "review"},
		"Contributor":        {"read", "comment", "vote", "contribute"},
		"Moderator":          {"read", "comment", "vote", "moderate"},
		"Admin":              {"read", "comment", "vote", "propose", "moderate", "admin"},
		"Operations Steward": {"read", "comment", "vote", "propose", "moderate", "admin", "issue_membership", "revoke_membership", "approve_registrations"},
	}

	if perms, ok := permissions[role]; ok {
		return perms
	}
	return []string{"read"}
}

// ValidRoles returns the list of valid membership roles
func ValidRoles() []string {
	return []string{
		"Member",
		"Verified Member",
		"Trusted Member",
		"Expert Member",
		"Contributor",
		"Moderator",
		"Admin",
		"Operations Steward",
	}
}

// IsValidRole checks if a role is valid
func IsValidRole(role string) bool {
	for _, r := range ValidRoles() {
		if r == role {
			return true
		}
	}
	return false
}

// IssueCredential creates and issues a membership credential
// Note: Full ACDC credential issuance requires schema registration and OOBI exchange
// This is a simplified implementation for the MVP
func (c *Client) IssueCredential(recipientAID string, role string, data *CredentialData) (*CredentialResult, error) {
	if !IsValidRole(role) {
		return nil, fmt.Errorf("invalid role: %s", role)
	}

	if recipientAID == "" {
		return nil, fmt.Errorf("recipient AID is required")
	}

	// Get org info to include issuer
	orgInfo, err := c.GetOrgInfo()
	if err != nil {
		return nil, fmt.Errorf("getting org info: %w", err)
	}

	// Prepare credential data
	if data == nil {
		data = &CredentialData{}
	}
	data.CommunityName = "MATOU"
	data.Role = role
	if data.VerificationStatus == "" {
		if role == "Admin" || role == "Operations Steward" {
			data.VerificationStatus = "community_verified"
		} else {
			data.VerificationStatus = "unverified"
		}
	}
	data.Permissions = GetPermissionsForRole(role)

	// Note: In a full implementation, we would:
	// 1. Register the schema SAID with KERIA
	// 2. Exchange OOBIs with the recipient
	// 3. Use kli vc create to issue the credential
	//
	// For MVP, we create a credential record that can be verified locally
	result := &CredentialResult{
		SAID:      generateMockSAID(orgInfo.Prefix, recipientAID, role),
		Issuer:    orgInfo.Prefix,
		Recipient: recipientAID,
		Schema:    "EMatouMembershipSchemaV1",
		Data:      *data,
	}

	return result, nil
}

// generateMockSAID generates a placeholder SAID for MVP
// In production, this would be computed from the actual credential content
func generateMockSAID(issuer, recipient, role string) string {
	// Create a deterministic but unique identifier
	combined := fmt.Sprintf("%s:%s:%s", issuer[:8], recipient[:8], role)
	return fmt.Sprintf("E%s", hashString(combined))
}

// hashString creates a simple hash for demonstration
func hashString(s string) string {
	h := uint64(0)
	for _, c := range s {
		h = h*31 + uint64(c)
	}
	return fmt.Sprintf("%016x", h)
}

// VerifyCredential verifies a credential's authenticity
// Note: Full verification requires checking the credential chain against KELs
func (c *Client) VerifyCredential(credentialJSON string) (bool, error) {
	var cred CredentialResult
	if err := json.Unmarshal([]byte(credentialJSON), &cred); err != nil {
		return false, fmt.Errorf("invalid credential format: %w", err)
	}

	// Basic validation
	if cred.SAID == "" {
		return false, fmt.Errorf("credential SAID is missing")
	}
	if cred.Issuer == "" {
		return false, fmt.Errorf("credential issuer is missing")
	}
	if cred.Recipient == "" {
		return false, fmt.Errorf("credential recipient is missing")
	}

	// Verify issuer matches our org
	orgInfo, err := c.GetOrgInfo()
	if err != nil {
		return false, fmt.Errorf("getting org info: %w", err)
	}

	if cred.Issuer != orgInfo.Prefix {
		return false, fmt.Errorf("credential not issued by this organization")
	}

	// In production, we would:
	// 1. Verify the credential signature
	// 2. Check the issuer's KEL for key validity at issuance time
	// 3. Verify the credential hasn't been revoked
	// 4. Validate against the schema

	return true, nil
}
