package main

import (
	"encoding/json"
	"net/http"
	"os"
)

const serviceName = "api-service"
const serviceVersion = "v0.1.0"

const (
	RolePublic   = 0
	RoleViewer   = 1
	RoleOperator = 2
	RoleAdmin    = 3
)

func tokenRole(r *http.Request) int {
	auth := r.Header.Get("Authorization")
	if auth == "" {
		return RolePublic
	}
	adminToken := os.Getenv("API_ADMIN_TOKEN")
	if adminToken != "" && auth == "Bearer "+adminToken {
		return RoleAdmin
	}
	operatorToken := os.Getenv("API_OPERATOR_TOKEN")
	if operatorToken != "" && auth == "Bearer "+operatorToken {
		return RoleOperator
	}
	viewerToken := os.Getenv("API_VIEWER_TOKEN")
	if viewerToken != "" && auth == "Bearer "+viewerToken {
		return RoleViewer
	}
	return RolePublic
}

func requireRole(w http.ResponseWriter, r *http.Request, minRole int) bool {
	role := tokenRole(r)
	if role < minRole {
		w.Header().Set("Content-Type", "application/json")
		if role == RolePublic {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"status": "unauthorized"})
		} else {
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]string{"status": "forbidden"})
		}
		return false
	}
	return true
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	http.HandleFunc("/health", handleHealth)
	http.HandleFunc("/ready", handleReady)
	http.HandleFunc("/auth/identity", handleIdentity)
	http.HandleFunc("/ops/ping", handleOpsPing)
	http.HandleFunc("/admin", handleAdmin)
	http.HandleFunc("/admin/", handleAdmin)
	http.HandleFunc("/", handleRoot)

	http.ListenAndServe(":"+port, nil)
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"service": serviceName,
		"version": serviceVersion,
	})
}

func handleReady(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "ready",
		"service": serviceName,
		"version": serviceVersion,
	})
}

func handleIdentity(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if !requireRole(w, r, RoleViewer) {
		return
	}
	role := tokenRole(r)
	roleName := "viewer"
	if role >= RoleAdmin {
		roleName = "admin"
	} else if role >= RoleOperator {
		roleName = "operator"
	}
	json.NewEncoder(w).Encode(map[string]string{
		"subject": "operator",
		"role":    roleName,
		"service": serviceName,
	})
}

func handleOpsPing(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if !requireRole(w, r, RoleOperator) {
		return
	}
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"service": serviceName,
		"access":  "operator",
	})
}

func handleAdmin(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if !requireRole(w, r, RoleAdmin) {
		return
	}
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"service": serviceName,
		"access":  "admin",
	})
}

func handleRoot(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"service": serviceName,
		"version": serviceVersion,
	})
}
