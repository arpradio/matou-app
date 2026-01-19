package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/matou-dao/backend/internal/anysync"
	"github.com/matou-dao/backend/internal/api"
	"github.com/matou-dao/backend/internal/config"
	"github.com/matou-dao/backend/internal/keri"
)

func main() {
	fmt.Println("🚀 MATOU DAO Backend Server")
	fmt.Println("============================")
	fmt.Println()

	// Load configuration
	fmt.Println("Loading configuration...")
	cfg, err := config.Load("", "config/bootstrap.yaml")
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	fmt.Printf("✅ Configuration loaded\n")
	fmt.Printf("   Organization: %s\n", cfg.Bootstrap.Organization.Name)
	fmt.Printf("   Org AID: %s\n", cfg.GetOrgAID())
	fmt.Printf("   Admin AID: %s\n", cfg.GetAdminAID())
	fmt.Println()

	// Initialize any-sync client
	fmt.Println("Initializing any-sync client...")
	anysyncClient, err := anysync.NewClient("../infrastructure/any-sync/etc/client.yml")
	if err != nil {
		log.Fatalf("Failed to create any-sync client: %v", err)
	}

	fmt.Printf("✅ any-sync client initialized\n")
	fmt.Printf("   Network ID: %s\n", anysyncClient.GetNetworkID())
	fmt.Printf("   Coordinator: %s\n", anysyncClient.GetCoordinatorURL())
	fmt.Println()

	// Initialize KERI client
	fmt.Println("Initializing KERI client...")
	keriPasscode := os.Getenv("MATOU_ORG_PASSCODE")
	if keriPasscode == "" {
		// Try loading from file
		if data, err := os.ReadFile("config/.org-passcode"); err == nil {
			keriPasscode = string(data)
		}
	}

	var keriClient *keri.Client
	var credHandler *api.CredentialsHandler

	if keriPasscode != "" {
		keriClient, err = keri.NewClient(&keri.Config{
			ContainerName: os.Getenv("KERIA_CONTAINER"),
			OrgName:       "matou-org",
			OrgPasscode:   keriPasscode,
			OrgAlias:      "matou-org",
		})
		if err != nil {
			fmt.Printf("⚠️  KERI client initialization failed: %v\n", err)
			fmt.Println("   Credential endpoints will be disabled")
		} else {
			fmt.Printf("✅ KERI client initialized\n")
			credHandler = api.NewCredentialsHandler(keriClient)
		}
	} else {
		fmt.Println("⚠️  KERI passcode not configured")
		fmt.Println("   Set MATOU_ORG_PASSCODE or create config/.org-passcode")
		fmt.Println("   Credential endpoints will be disabled")
	}
	fmt.Println()

	// Create HTTP server
	mux := http.NewServeMux()

	// Health check endpoint
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, `{"status":"healthy","organization":"%s","admin":"%s"}`,
			cfg.GetOrgAID(), cfg.GetAdminAID())
	})

	// Info endpoint
	mux.HandleFunc("/info", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, `{
			"organization": {
				"name": "%s",
				"aid": "%s",
				"alias": "%s"
			},
			"admin": {
				"aid": "%s",
				"alias": "%s"
			},
			"anysync": {
				"networkId": "%s",
				"coordinator": "%s"
			}
		}`,
			cfg.Bootstrap.Organization.Name,
			cfg.GetOrgAID(),
			cfg.Bootstrap.Organization.Alias,
			cfg.GetAdminAID(),
			cfg.Bootstrap.Admin.Alias,
			anysyncClient.GetNetworkID(),
			anysyncClient.GetCoordinatorURL(),
		)
	})

	// Register credential endpoints if KERI client is available
	if credHandler != nil {
		credHandler.RegisterRoutes(mux)
	}

	// Start server
	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	fmt.Printf("🌐 Starting HTTP server on %s\n", addr)
	fmt.Println()
	fmt.Println("Endpoints:")
	fmt.Println("  GET  /health                    - Health check")
	fmt.Println("  GET  /info                      - System information")
	if credHandler != nil {
		fmt.Println("  GET  /api/v1/credentials/roles  - List available roles")
		fmt.Println("  POST /api/v1/credentials/issue  - Issue a credential")
		fmt.Println("  POST /api/v1/credentials/verify - Verify a credential")
	}
	fmt.Println()

	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
