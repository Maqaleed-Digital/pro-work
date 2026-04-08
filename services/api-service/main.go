package main

import (
	"encoding/json"
	"net/http"
	"os"
)

const serviceName = "api-service"
const serviceVersion = "v0.1.0"

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	http.HandleFunc("/health", handleHealth)
	http.HandleFunc("/ready", handleReady)
	http.HandleFunc("/admin", handleAdmin)
	http.HandleFunc("/admin/", handleAdmin)
	http.HandleFunc("/auth/identity", handleIdentity)
	http.HandleFunc("/", handleRoot)

	http.ListenAndServe(":"+port, nil)
}

func validToken(r *http.Request) bool {
	token := os.Getenv("API_OPERATOR_TOKEN")
	if token == "" {
		return false
	}
	auth := r.Header.Get("Authorization")
	return auth == "Bearer "+token
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

func handleAdmin(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if !validToken(r) {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"status": "unauthorized"})
		return
	}
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"service": serviceName,
		"access":  "admin",
	})
}

func handleIdentity(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if !validToken(r) {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"status": "unauthorized"})
		return
	}
	json.NewEncoder(w).Encode(map[string]string{
		"subject": "operator",
		"role":    "admin",
		"service": serviceName,
	})
}

func handleRoot(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"service": serviceName,
		"version": serviceVersion,
	})
}
