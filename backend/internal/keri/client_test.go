package keri

import (
	"testing"
)

func TestGetPermissionsForRole(t *testing.T) {
	tests := []struct {
		role            string
		expectedMinPerm int
		hasPermission   string
	}{
		{"Member", 2, "read"},
		{"Verified Member", 3, "vote"},
		{"Admin", 6, "admin"},
		{"Operations Steward", 9, "issue_membership"},
		{"Unknown", 1, "read"},
	}

	for _, tt := range tests {
		t.Run(tt.role, func(t *testing.T) {
			perms := GetPermissionsForRole(tt.role)
			if len(perms) < tt.expectedMinPerm {
				t.Errorf("expected at least %d permissions, got %d", tt.expectedMinPerm, len(perms))
			}

			found := false
			for _, p := range perms {
				if p == tt.hasPermission {
					found = true
					break
				}
			}
			if !found {
				t.Errorf("expected permission %s not found in %v", tt.hasPermission, perms)
			}
		})
	}
}

func TestValidRoles(t *testing.T) {
	roles := ValidRoles()
	if len(roles) != 8 {
		t.Errorf("expected 8 roles, got %d", len(roles))
	}

	expected := []string{
		"Member",
		"Verified Member",
		"Operations Steward",
	}

	for _, e := range expected {
		found := false
		for _, r := range roles {
			if r == e {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("expected role %s not found", e)
		}
	}
}

func TestIsValidRole(t *testing.T) {
	tests := []struct {
		role  string
		valid bool
	}{
		{"Member", true},
		{"Admin", true},
		{"Operations Steward", true},
		{"SuperAdmin", false},
		{"", false},
		{"member", false}, // case sensitive
	}

	for _, tt := range tests {
		t.Run(tt.role, func(t *testing.T) {
			if got := IsValidRole(tt.role); got != tt.valid {
				t.Errorf("IsValidRole(%s) = %v, want %v", tt.role, got, tt.valid)
			}
		})
	}
}

func TestNewClient(t *testing.T) {
	tests := []struct {
		name    string
		cfg     *Config
		wantErr bool
	}{
		{
			name:    "nil config",
			cfg:     nil,
			wantErr: true,
		},
		{
			name: "missing org name",
			cfg: &Config{
				OrgPasscode: "test-passcode",
			},
			wantErr: true,
		},
		{
			name: "missing passcode",
			cfg: &Config{
				OrgName: "test-org",
			},
			wantErr: true,
		},
		{
			name: "valid config",
			cfg: &Config{
				OrgName:     "test-org",
				OrgPasscode: "test-passcode",
			},
			wantErr: false,
		},
		{
			name: "valid config with all fields",
			cfg: &Config{
				ContainerName: "custom-container",
				OrgName:       "test-org",
				OrgPasscode:   "test-passcode",
				OrgAlias:      "custom-alias",
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client, err := NewClient(tt.cfg)
			if (err != nil) != tt.wantErr {
				t.Errorf("NewClient() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && client == nil {
				t.Error("NewClient() returned nil client without error")
			}
		})
	}
}

func TestCredentialDataValidation(t *testing.T) {
	cfg := &Config{
		OrgName:     "test-org",
		OrgPasscode: "test-passcode",
	}
	client, err := NewClient(cfg)
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}

	// Test invalid role
	_, err = client.IssueCredential("EAID123456789", "InvalidRole", nil)
	if err == nil {
		t.Error("IssueCredential() should fail with invalid role")
	}

	// Test empty recipient
	_, err = client.IssueCredential("", "Member", nil)
	if err == nil {
		t.Error("IssueCredential() should fail with empty recipient")
	}
}
