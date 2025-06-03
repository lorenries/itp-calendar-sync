import { SyncResult } from "./types";

interface PopupElements {
  syncButton: HTMLButtonElement;
  status: HTMLDivElement;
  eventsFound: HTMLElement;
  eventsSynced: HTMLElement;
  nyanContainer: HTMLElement;
  nyanRainbow: HTMLElement;
  nyanCat: HTMLElement;
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
    };

    this.init();
  }

  init() {
    this.elements.syncButton.addEventListener("click", () => this.handleSync());
    this.loadSyncStatus();
  }

  async loadSyncStatus() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_SYNC_STATUS",
      });
      this.elements.eventsSynced.textContent =
        response.syncedEventsCount.toString();
    } catch (error) {
      console.error("Failed to load sync status:", error);
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

  async getEventsFromActiveTab(): Promise<any[]> {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab.id) {
      throw new Error("No active tab found");
    }

    if (!tab.url?.includes("itp.nyu.edu/camp/2025/dashboard")) {
      throw new Error("Please navigate to the ITP Camp dashboard first");
    }

    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "EXTRACT_EVENTS",
      });
      return response.events || [];
    } catch (error) {
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
    }
  }

  async handleSync() {
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
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      this.showStatus(`Error: ${errorMessage}`, "error");
    } finally {
      this.setLoading(false);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new PopupController();
});
