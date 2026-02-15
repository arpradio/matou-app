package api

import (
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
)

// isBundledOrigin returns true if the origin is a valid bundled-app origin
// (Electron file://, Capacitor, or any localhost/127.0.0.1).
func isBundledOrigin(origin string) bool {
	if origin == "" {
		return false
	}
	if strings.HasPrefix(origin, "file://") ||
		strings.HasPrefix(origin, "capacitor://") ||
		strings.HasPrefix(origin, "app://") ||
		strings.HasPrefix(origin, "http://localhost:") ||
		strings.HasPrefix(origin, "http://127.0.0.1:") {
		return true
	}
	return false
}

func isAllowedOrigin(origin string) bool {
	mode := os.Getenv("MATOU_CORS_MODE")
	if mode == "bundled" {
		return isBundledOrigin(origin)
	}

	// --- Development mode ---
	// Explicit dev origins
	devOrigins := map[string]bool{
		"http://localhost:9000": true, // Quasar dev
		"http://localhost:9300": true, // Electron dev
		"http://127.0.0.1:9000": true,
		"http://127.0.0.1:9300": true,
	}

	if devOrigins[origin] {
		return true
	}

	// Allow any localhost port
	if strings.HasPrefix(origin, "http://localhost:") ||
		strings.HasPrefix(origin, "http://127.0.0.1:") {
		return true
	}

	// Allow LAN origins in a standard /24 subnet (192.168.x.x)
	// This avoids accidentally allowing 10.x.x.x or 172.16.x.x
	if isLANOrigin(origin) {
		return true
	}

	return false
}

func isLANOrigin(origin string) bool {
	// Expected format: http://192.168.X.Y:PORT
	if !strings.HasPrefix(origin, "http://192.168.") {
		return false
	}

	// Optional: deeper validation
	// Extract host portion
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}

	ip := net.ParseIP(u.Hostname())
	if ip == nil {
		return false
	}

	// Check if it's in 192.168.0.0/16
	_, lanNet, _ := net.ParseCIDR("192.168.0.0/16")
	return lanNet.Contains(ip)
}

// CORSMiddleware adds CORS headers for frontend development and bundled apps.
// Controlled by MATOU_CORS_MODE env var: "dev" (default) or "bundled".
func CORSMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")

		if isAllowedOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}

		// Allow common headers and methods
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, Authorization, X-Requested-With")
		w.Header().Set("Access-Control-Max-Age", "86400")

		// Handle preflight requests
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// CORSHandler wraps a handler function with CORS support
func CORSHandler(handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")

		if isAllowedOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}

		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, Authorization, X-Requested-With")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		handler(w, r)
	}
}

// NewCORSMux creates a new ServeMux wrapped with CORS middleware
func NewCORSMux() *CORSMux {
	return &CORSMux{
		mux: http.NewServeMux(),
	}
}

// CORSMux is a ServeMux wrapper that adds CORS headers
type CORSMux struct {
	mux *http.ServeMux
}

// HandleFunc registers a handler with CORS support
func (m *CORSMux) HandleFunc(pattern string, handler http.HandlerFunc) {
	m.mux.HandleFunc(pattern, CORSHandler(handler))
}

// Handle registers a handler with CORS support
func (m *CORSMux) Handle(pattern string, handler http.Handler) {
	m.mux.Handle(pattern, CORSMiddleware(handler))
}

// ServeHTTP implements http.Handler
func (m *CORSMux) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Add CORS headers to all responses
	origin := r.Header.Get("Origin")
	if isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, Authorization, X-Requested-With")
	}

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	m.mux.ServeHTTP(w, r)
}
