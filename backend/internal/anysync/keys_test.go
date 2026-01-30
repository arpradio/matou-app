package anysync

import (
	"os"
	"testing"
)

func TestGenerateSpaceKeySet(t *testing.T) {
	keys, err := GenerateSpaceKeySet()
	if err != nil {
		t.Fatalf("GenerateSpaceKeySet failed: %v", err)
	}

	if keys.SigningKey == nil {
		t.Error("expected non-nil signing key")
	}
	if keys.MasterKey == nil {
		t.Error("expected non-nil master key")
	}
	if keys.ReadKey == nil {
		t.Error("expected non-nil read key")
	}
	if keys.MetadataKey == nil {
		t.Error("expected non-nil metadata key")
	}

	// Verify they are distinct Ed25519 keys
	sigPub := keys.SigningKey.GetPublic().PeerId()
	masterPub := keys.MasterKey.GetPublic().PeerId()
	metaPub := keys.MetadataKey.GetPublic().PeerId()

	if sigPub == masterPub {
		t.Error("signing key and master key should be different")
	}
	if sigPub == metaPub {
		t.Error("signing key and metadata key should be different")
	}
	if masterPub == metaPub {
		t.Error("master key and metadata key should be different")
	}

	// Verify read key can encrypt/decrypt
	plaintext := []byte("test credential data")
	ciphertext, err := keys.ReadKey.Encrypt(plaintext)
	if err != nil {
		t.Fatalf("encrypt failed: %v", err)
	}
	decrypted, err := keys.ReadKey.Decrypt(ciphertext)
	if err != nil {
		t.Fatalf("decrypt failed: %v", err)
	}
	if string(decrypted) != string(plaintext) {
		t.Errorf("decrypted text mismatch: got %q, want %q", decrypted, plaintext)
	}
}

func TestDeriveSpaceKeySet_Deterministic(t *testing.T) {
	mnemonic := "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"

	keys1, err := DeriveSpaceKeySet(mnemonic, 0)
	if err != nil {
		t.Fatalf("first derivation failed: %v", err)
	}

	keys2, err := DeriveSpaceKeySet(mnemonic, 0)
	if err != nil {
		t.Fatalf("second derivation failed: %v", err)
	}

	// Signing keys should be identical
	sig1 := keys1.SigningKey.GetPublic().PeerId()
	sig2 := keys2.SigningKey.GetPublic().PeerId()
	if sig1 != sig2 {
		t.Errorf("signing keys should be deterministic: got %s and %s", sig1, sig2)
	}

	// Master keys should be identical
	master1 := keys1.MasterKey.GetPublic().PeerId()
	master2 := keys2.MasterKey.GetPublic().PeerId()
	if master1 != master2 {
		t.Errorf("master keys should be deterministic: got %s and %s", master1, master2)
	}

	// Metadata keys should be identical
	meta1 := keys1.MetadataKey.GetPublic().PeerId()
	meta2 := keys2.MetadataKey.GetPublic().PeerId()
	if meta1 != meta2 {
		t.Errorf("metadata keys should be deterministic: got %s and %s", meta1, meta2)
	}

	// Read keys are random, so they should differ
	raw1, _ := keys1.ReadKey.Raw()
	raw2, _ := keys2.ReadKey.Raw()
	if string(raw1) == string(raw2) {
		t.Log("note: read keys happen to match (unlikely but possible)")
	}
}

func TestDeriveSpaceKeySet_DifferentIndices(t *testing.T) {
	mnemonic := "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"

	keys0, err := DeriveSpaceKeySet(mnemonic, 0)
	if err != nil {
		t.Fatalf("derivation at index 0 failed: %v", err)
	}

	keys1, err := DeriveSpaceKeySet(mnemonic, 1)
	if err != nil {
		t.Fatalf("derivation at index 1 failed: %v", err)
	}

	sig0 := keys0.SigningKey.GetPublic().PeerId()
	sig1 := keys1.SigningKey.GetPublic().PeerId()
	if sig0 == sig1 {
		t.Error("different space indices should produce different signing keys")
	}
}

func TestDeriveSpaceKeySet_InvalidMnemonic(t *testing.T) {
	_, err := DeriveSpaceKeySet("invalid words that are not valid", 0)
	if err == nil {
		t.Error("expected error for invalid mnemonic")
	}
}

func TestPersistAndLoadSpaceKeySet(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "keys_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Generate keys
	original, err := GenerateSpaceKeySet()
	if err != nil {
		t.Fatalf("GenerateSpaceKeySet failed: %v", err)
	}

	spaceID := "test-space-abc123"

	// Persist
	if err := PersistSpaceKeySet(tmpDir, spaceID, original); err != nil {
		t.Fatalf("PersistSpaceKeySet failed: %v", err)
	}

	// Load
	loaded, err := LoadSpaceKeySet(tmpDir, spaceID)
	if err != nil {
		t.Fatalf("LoadSpaceKeySet failed: %v", err)
	}

	// Compare signing keys
	origSig := original.SigningKey.GetPublic().PeerId()
	loadedSig := loaded.SigningKey.GetPublic().PeerId()
	if origSig != loadedSig {
		t.Errorf("signing key mismatch after round-trip: %s != %s", origSig, loadedSig)
	}

	// Compare master keys
	origMaster := original.MasterKey.GetPublic().PeerId()
	loadedMaster := loaded.MasterKey.GetPublic().PeerId()
	if origMaster != loadedMaster {
		t.Errorf("master key mismatch after round-trip: %s != %s", origMaster, loadedMaster)
	}

	// Compare metadata keys
	origMeta := original.MetadataKey.GetPublic().PeerId()
	loadedMeta := loaded.MetadataKey.GetPublic().PeerId()
	if origMeta != loadedMeta {
		t.Errorf("metadata key mismatch after round-trip: %s != %s", origMeta, loadedMeta)
	}

	// Compare read keys by encrypting/decrypting
	plaintext := []byte("round-trip test")
	ciphertext, err := original.ReadKey.Encrypt(plaintext)
	if err != nil {
		t.Fatalf("encrypt with original read key failed: %v", err)
	}
	decrypted, err := loaded.ReadKey.Decrypt(ciphertext)
	if err != nil {
		t.Fatalf("decrypt with loaded read key failed: %v", err)
	}
	if string(decrypted) != string(plaintext) {
		t.Errorf("read key round-trip failed: got %q, want %q", decrypted, plaintext)
	}
}

func TestLoadSpaceKeySet_NotFound(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "keys_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	_, err = LoadSpaceKeySet(tmpDir, "nonexistent-space")
	if err == nil {
		t.Error("expected error for non-existent key file")
	}
}
