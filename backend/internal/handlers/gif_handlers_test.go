package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGIFHandler_EmptyKey(t *testing.T) {
	h := NewGIFHandler("")

	// Test Trending with empty key
	req := httptest.NewRequest(http.MethodGet, "/api/gifs/trending", nil)
	w := httptest.NewRecorder()
	h.Trending(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	if w.Body.String() != "[]\n" {
		t.Fatalf("expected empty array, got %s", w.Body.String())
	}

	// Test Search with empty key
	reqSearch := httptest.NewRequest(http.MethodGet, "/api/gifs/search?q=cat", nil)
	wSearch := httptest.NewRecorder()
	h.Search(wSearch, reqSearch)

	if wSearch.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", wSearch.Code)
	}
	if wSearch.Body.String() != "[]\n" {
		t.Fatalf("expected empty array, got %s", wSearch.Body.String())
	}
}

func TestGIFHandler_MethodNotAllowed(t *testing.T) {
	h := NewGIFHandler("test-key")

	req := httptest.NewRequest(http.MethodPost, "/api/gifs/trending", nil)
	w := httptest.NewRecorder()
	h.Trending(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected status 405, got %d", w.Code)
	}
}
