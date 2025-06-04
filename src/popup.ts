import { SyncResult } from "./types";

interface PopupElements {
  syncButton: HTMLButtonElement;
  status: HTMLDivElement;
  eventsFound: HTMLElement;
  eventsSynced: HTMLElement;
  nyanContainer: HTMLElement;
  nyanRainbow: HTMLElement;
  nyanCat: HTMLElement;
  signOutButton: HTMLButtonElement;
}

class PopupController {
  private elements: PopupElements;
  private nyanTimer: number | null = null;
  private nyanProgress = 0;

  constructor() {
    this.elements = {
      syncButton: document.getElementById("syncButton") as HTMLButtonElement,
      status: document.getElementById("status") as HTMLDivElement,
      eventsFound: document.getElementById("eventsFound") as HTMLElement,
      eventsSynced: document.getElementById("eventsSynced") as HTMLElement,
      nyanContainer: document.getElementById("nyanContainer") as HTMLElement,
      nyanRainbow: document.getElementById("nyanRainbow") as HTMLElement,
      nyanCat: document.getElementById("nyanCat") as HTMLElement,
      signOutButton: document.getElementById("signOutButton") as HTMLButtonElement,
    };

    this.init();
  }

  init() {
    this.elements.syncButton.addEventListener("click", () => this.handleSync());
    this.elements.signOutButton.addEventListener("click", () => this.handleLogout());
    this.loadSyncStatus();
  }

  async loadSyncStatus() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_SYNC_STATUS",
      });
      this.elements.eventsSynced.textContent =
        response.syncedEventsCount.toString();

      // Check if user has a valid token and show/hide auth status
      await this.updateAuthStatus();

      // Also try to get current events from active tab
      await this.loadCurrentEvents();
    } catch (error) {
      console.error("Failed to load sync status:", error);
    }
  }

  async loadCurrentEvents() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      // Only try to load events if we're on the dashboard
      if (tab.url?.includes("itp.nyu.edu/camp/2025/dashboard")) {
        const events = await this.getEventsFromActiveTab();
        this.elements.eventsFound.textContent = events.length.toString();

        // Calculate unsynced events
        const syncResponse = await chrome.runtime.sendMessage({
          type: "GET_SYNC_STATUS",
        });
        const syncedEvents = syncResponse.syncedEventsCount || 0;
        const unsyncedCount = Math.max(0, events.length - syncedEvents);

        // Update button text to show unsynced count
        if (unsyncedCount > 0) {
          this.elements.syncButton.textContent = `Sync ${unsyncedCount} New Events`;
        } else if (events.length > 0) {
          this.elements.syncButton.textContent = 'All Events Synced';
        } else {
          this.elements.syncButton.textContent = "Sync Events";
        }
      } else {
        this.elements.eventsFound.textContent = "?";
        this.elements.syncButton.textContent = "Visit Dashboard First";
      }
    } catch (error) {
      console.error("Failed to load current events:", error);
      this.elements.eventsFound.textContent = "?";
    }
  }

  showStatus(message: string, type: "success" | "error" | "info") {
    this.elements.status.textContent = message;
    this.elements.status.className = `status ${type}`;
    this.elements.status.style.display = "block";
  }

  hideStatus() {
    this.elements.status.style.display = "none";
  }

  setLoading(loading: boolean) {
    if (loading) {
      this.elements.syncButton.disabled = true;
      this.elements.syncButton.innerHTML = "Syncing...";
      this.startNyanCat();
    } else {
      this.elements.syncButton.disabled = false;
      this.elements.syncButton.innerHTML = "Sync Events";
      this.stopNyanCat();
    }
  }

  startNyanCat() {
    this.elements.nyanContainer.style.display = "block";
    this.nyanProgress = 80;
    this.updateNyanProgress();

    // Start random progress updates
    this.nyanTimer = window.setInterval(
      () => {
        // Randomly jump progress between 5-25 pixels
        const jump = Math.random() * 20 + 5;
        this.nyanProgress = Math.min(this.nyanProgress + jump, 180); // Max 180px (200px - cat width)
        this.updateNyanProgress();

        // If we reach the end, reset to beginning for continuous animation
        if (this.nyanProgress >= 180) {
          this.nyanProgress = 0;
        }
      },
      200 + Math.random() * 300,
    ); // Random interval between 200-500ms
  }

  stopNyanCat() {
    this.elements.nyanContainer.style.display = "none";
    if (this.nyanTimer) {
      clearInterval(this.nyanTimer);
      this.nyanTimer = null;
    }
    this.nyanProgress = 0;
    this.updateNyanProgress();
  }

  updateNyanProgress() {
    this.elements.nyanRainbow.style.width = `${this.nyanProgress}px`;
    this.elements.nyanCat.style.left = `${this.nyanProgress}px`;
  }

  async updateAuthStatus() {
    try {
      const token = await chrome.identity.getAuthToken({ interactive: false });
      if (token.token) {
        this.elements.signOutButton.style.display = "block";
      } else {
        this.elements.signOutButton.style.display = "none";
      }
    } catch (error) {
      // No token available, hide sign out button
      this.elements.signOutButton.style.display = "none";
    }
  }

  async getEventsFromActiveTab(): Promise<any[]> {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab.id) {
      return [];
    }

    if (!tab.url?.includes("itp.nyu.edu/camp/2025/dashboard")) {
      return [];
    }

    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "EXTRACT_EVENTS",
      });
      return response.events || [];
    } catch (error) {
      try {
        // If content script isn't loaded, try to inject it
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"],
        });

        // Wait a moment then try again
        await new Promise((resolve) => setTimeout(resolve, 500));
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: "EXTRACT_EVENTS",
        });
        return response.events || [];
      } catch (secondError) {
        console.error("Failed to extract events:", secondError);
        return [];
      }
    }
  }

  async handleSync() {
    // Check if we need to navigate to dashboard first
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url?.includes('itp.nyu.edu/camp/2025/dashboard')) {
      // Navigate to dashboard
      await chrome.tabs.update(tab.id!, {
        url: 'https://itp.nyu.edu/camp/2025/dashboard'
      });
      
      // Listen for tab update to refresh popup state
      const updateListener = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(updateListener);
          // Refresh popup state after a short delay to ensure page is loaded
          setTimeout(() => {
            this.loadSyncStatus();
          }, 1000);
        }
      };
      chrome.tabs.onUpdated.addListener(updateListener);
      return;
    }

    this.hideStatus();
    this.setLoading(true);

    try {
      const events = await this.getEventsFromActiveTab();

      if (events.length === 0) {
        this.showStatus("No RSVPed events found on this page", "info");
        this.elements.eventsFound.textContent = "0";
        return;
      }

      this.elements.eventsFound.textContent = events.length.toString();

      const result: SyncResult = await chrome.runtime.sendMessage({
        type: "SYNC_EVENTS",
        events: events,
      });

      if (result.success) {
        if (result.eventsCreated === 0) {
          this.showStatus("All events are already synced!", "info");
        } else {
          this.showStatus(
            `Successfully synced ${result.eventsCreated} new event${result.eventsCreated === 1 ? "" : "s"}!`,
            "success",
          );
        }
      } else {
        const errorMessage =
          result.errors.length > 0
            ? result.errors[0]
            : "Sync failed with unknown error";
        this.showStatus(`Sync failed: ${errorMessage}`, "error");
      }

      await this.loadSyncStatus();
      await this.loadCurrentEvents();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      this.showStatus(`Error: ${errorMessage}`, "error");
    } finally {
      this.setLoading(false);
    }
  }

  async handleLogout() {
    try {
      // Get the current token to revoke it
      let currentToken = null;
      try {
        const token = await chrome.identity.getAuthToken({ interactive: false });
        currentToken = token.token;
      } catch (e) {
        console.log("No current token found");
      }
      
      // Revoke the token on Google's servers if we have one
      if (currentToken) {
        try {
          await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${currentToken}`);
          console.log("Token revoked on Google servers");
        } catch (e) {
          console.log("Failed to revoke token on Google servers:", e);
        }
      }
      
      // Remove cached token locally
      if (currentToken) {
        await chrome.identity.removeCachedAuthToken({ token: currentToken });
      }
      
      // Clear all cached tokens
      await chrome.identity.clearAllCachedAuthTokens();
      
      this.showStatus("Logged out successfully", "info");
      // Reset synced events count since auth is cleared
      this.elements.eventsSynced.textContent = "0";
      // Hide sign out button since user is now logged out
      this.elements.signOutButton.style.display = "none";
    } catch (error) {
      console.error("Logout failed:", error);
      this.showStatus("Logout failed", "error");
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new PopupController();
});
