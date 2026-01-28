package api

import (
	"net/http"
	"strings"
)

// CORSMiddleware adds CORS headers for frontend development
// Allows requests from localhost development servers
func CORSMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")

		// Allow requests from known development origins
		allowedOrigins := []string{
			"http://localhost:9000",  // Quasar dev server
			"http://localhost:9300",  // Electron dev server
			"http://127.0.0.1:9000",
			"http://127.0.0.1:9300",
		}

		for _, allowed := range allowedOrigins {
			if origin == allowed {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				break
			}
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

		// Allow requests from known development origins
		allowedOrigins := []string{
			"http://localhost:9000",
			"http://localhost:9300",
			"http://127.0.0.1:9000",
			"http://127.0.0.1:9300",
		}

		for _, allowed := range allowedOrigins {
			if origin == allowed {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				break
			}
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
	if origin != "" && (strings.HasPrefix(origin, "http://localhost:") || strings.HasPrefix(origin, "http://127.0.0.1:")) {
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
