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
	http.HandleFunc("/admin", handleAdminForbidden)
	http.HandleFunc("/admin/", handleAdminForbidden)
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

func handleAdminForbidden(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusForbidden)
	json.NewEncoder(w).Encode(map[string]string{
		"status": "forbidden",
	})
}

func handleRoot(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"service": serviceName,
		"version": serviceVersion,
	})
}
