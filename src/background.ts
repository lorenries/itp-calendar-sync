import { ITPEvent, CalendarEvent, SyncResult, StoredEvent } from "./types";

class CalendarSync {
  private accessToken: string | undefined;

  async authenticate(): Promise<boolean> {
    try {
      const token = await chrome.identity.getAuthToken({ interactive: true });
      this.accessToken = token.token;
      return true;
    } catch (error) {
      console.error("Authentication failed:", error);
      return false;
    }
  }

  async getTokenHash(): Promise<string> {
    if (!this.accessToken) {
      console.log("No access token available for hash generation");
      throw new Error("No access token available");
    }

    try {
      // Create a simple hash of the token for storage key
      const encoder = new TextEncoder();
      const data = encoder.encode(this.accessToken);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const hash = hashHex.substring(0, 16); // Use first 16 chars
      console.log("Generated token hash:", hash);
      return hash;
    } catch (error) {
      console.error("Error generating token hash:", error);
      throw error;
    }
  }

  async getStoredEvents(): Promise<StoredEvent[]> {
    try {
      console.log("Getting stored events...");
      const tokenHash = await this.getTokenHash();
      console.log("Using storage key:", `syncedEvents:${tokenHash}`);
      const result = await chrome.storage.local.get(
        `syncedEvents:${tokenHash}`,
      );
      console.log("Storage result:", result);
      const events = result[`syncedEvents:${tokenHash}`] || [];
      console.log("Found stored events:", events.length);
      return events;
    } catch (error) {
      console.log("Could not get stored events, returning empty array:", error);
      return [];
    }
  }

  async saveStoredEvent(event: StoredEvent): Promise<void> {
    try {
      console.log("Saving stored event:", event.itpEventId);
      const storedEvents = await this.getStoredEvents();

      // Check if event with same itpEventId already exists
      const existingIndex = storedEvents.findIndex(
        (e) => e.itpEventId === event.itpEventId,
      );

      if (existingIndex !== -1) {
        // Update existing event instead of adding duplicate
        storedEvents[existingIndex] = event;
        console.log("Updated existing event");
      } else {
        // Add new event
        storedEvents.push(event);
        console.log("Added new event");
      }

      const tokenHash = await this.getTokenHash();
      console.log("Saving to storage key:", `syncedEvents:${tokenHash}`);
      await chrome.storage.local.set({
        [`syncedEvents:${tokenHash}`]: storedEvents,
      });
      console.log("Event saved successfully");
    } catch (error) {
      console.error("Error saving stored event:", error);
      throw error;
    }
  }

  parseTimeToDateTime(
    dateString: string,
    timeString: string,
  ): { start: string; end: string } {
    // Parse date in Eastern timezone to avoid timezone shifting
    const dateParts = dateString.split("-");
    const year = parseInt(dateParts[0]);
    const month = parseInt(dateParts[1]) - 1; // Month is 0-indexed
    const day = parseInt(dateParts[2]);

    // Enhanced regex to handle formats like "3:30-5pm", "3-5pm", "6-7pm"
    const timeMatch = timeString.match(
      /(\d{1,2})(?::(\d{2}))?\s*(?:-|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i,
    );

    if (!timeMatch) {
      // Fallback for unrecognized time formats
      const fallbackStart = new Date(year, month, day, 12, 0, 0);
      const fallbackEnd = new Date(year, month, day, 13, 0, 0);

      return {
        start: this.toEasternISO(fallbackStart),
        end: this.toEasternISO(fallbackEnd),
      };
    }

    const [, startHour, startMin = "0", endHour, endMin = "0", period] =
      timeMatch;

    let startHour24 = parseInt(startHour);
    let endHour24 = parseInt(endHour);

    // Apply period (am/pm) to both start and end times
    if (period.toLowerCase() === "pm") {
      // End time is definitely PM
      if (endHour24 !== 12) {
        endHour24 += 12;
      }

      // Start time logic for PM period - assume both are PM unless crossing noon
      if (startHour24 !== 12) {
        startHour24 += 12;
      }
    } else {
      // period is AM
      if (startHour24 === 12) startHour24 = 0;
      if (endHour24 === 12) endHour24 = 0;
    }

    const startDate = new Date(
      year,
      month,
      day,
      startHour24,
      parseInt(startMin),
      0,
    );
    const endDate = new Date(year, month, day, endHour24, parseInt(endMin), 0);

    return {
      start: this.toEasternISO(startDate),
      end: this.toEasternISO(endDate),
    };
  }

  toEasternISO(date: Date): string {
    // Create Eastern timezone ISO string
    const easternOffset = -4; // EDT is UTC-4 in summer, UTC-5 in winter
    const utc = date.getTime() + date.getTimezoneOffset() * 60000;
    const easternTime = new Date(utc + easternOffset * 3600000);

    // Format as ISO string with timezone
    const year = easternTime.getFullYear();
    const month = String(easternTime.getMonth() + 1).padStart(2, "0");
    const day = String(easternTime.getDate()).padStart(2, "0");
    const hours = String(easternTime.getHours()).padStart(2, "0");
    const minutes = String(easternTime.getMinutes()).padStart(2, "0");

    return `${year}-${month}-${day}T${hours}:${minutes}:00-04:00`;
  }

  convertToCalendarEvent(itpEvent: ITPEvent): CalendarEvent {
    const { start, end } = this.parseTimeToDateTime(
      itpEvent.date,
      itpEvent.time,
    );

    const description = [
      itpEvent.leaders ? `Leaders: ${itpEvent.leaders}` : "",
      itpEvent.tags.length > 0 ? `Tags: ${itpEvent.tags.join(" ")}` : "",
      itpEvent.url ? `\nMore info: ${itpEvent.url}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    return {
      summary: itpEvent.title,
      start: {
        dateTime: start,
        timeZone: "America/New_York",
      },
      end: {
        dateTime: end,
        timeZone: "America/New_York",
      },
      description,
      source: itpEvent.url
        ? {
            title: "ITP Camp 2025",
            url: itpEvent.url,
          }
        : undefined,
    };
  }

  async createCalendarEvent(
    calendarEvent: CalendarEvent,
  ): Promise<string | null> {
    if (!this.accessToken) {
      throw new Error("Not authenticated");
    }

    try {
      console.log(
        "Creating calendar event:",
        JSON.stringify(calendarEvent, null, 2),
      );

      const response = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(calendarEvent),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        let errorDetails = response.statusText;

        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.error && errorJson.error.message) {
            errorDetails = errorJson.error.message;
          }
        } catch (e) {
          // If not JSON, use the raw text
          errorDetails = errorText || response.statusText;
        }

        throw new Error(
          `Failed to create event (${response.status}): ${errorDetails}`,
        );
      }

      const result = await response.json();
      return result.id;
    } catch (error) {
      console.error("Error creating calendar event:", error);
      throw error;
    }
  }

  async deleteCalendarEvent(calendarEventId: string): Promise<boolean> {
    if (!this.accessToken) {
      throw new Error("Not authenticated");
    }

    try {
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${calendarEventId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        },
      );

      if (response.status === 410) {
        // Event already deleted or doesn't exist - treat as success
        console.log(`Event ${calendarEventId} already deleted (410 Gone)`);
        return true;
      }

      if (response.status === 404) {
        // Event not found - treat as success since it's already gone
        console.log(`Event ${calendarEventId} not found (404)`);
        return true;
      }

      if (!response.ok) {
        throw new Error(
          `Failed to delete event: ${response.status} ${response.statusText}`,
        );
      }

      return true;
    } catch (error) {
      console.error("Error deleting calendar event:", error);
      throw error;
    }
  }

  async removeStoredEvent(eventId: string): Promise<void> {
    const storedEvents = await this.getStoredEvents();
    const filteredEvents = storedEvents.filter((e) => e.itpEventId !== eventId);
    const tokenHash = await this.getTokenHash();
    await chrome.storage.local.set({
      [`syncedEvents:${tokenHash}`]: filteredEvents,
    });
  }

  generateEventId(event: ITPEvent): string {
    return `itp-${event.date}-${event.title.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}`;
  }

  async syncSingleEvent(event: ITPEvent): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      eventsFound: 1,
      eventsCreated: 0,
      errors: [],
    };

    if (!(await this.authenticate())) {
      result.errors.push("Authentication failed");
      return result;
    }

    const eventId = this.generateEventId(event);
    const storedEvents = await this.getStoredEvents();
    const existingEvent = storedEvents.find((e) => e.itpEventId === eventId);

    if (existingEvent) {
      result.errors.push("Event already exists in calendar");
      return result;
    }

    try {
      const calendarEvent = this.convertToCalendarEvent(event);
      const calendarEventId = await this.createCalendarEvent(calendarEvent);

      if (calendarEventId) {
        await this.saveStoredEvent({
          itpEventId: eventId,
          calendarEventId,
          lastSynced: new Date().toISOString(),
        });
        result.eventsCreated = 1;
        result.success = true;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      result.errors.push(`Failed to sync "${event.title}": ${errorMessage}`);
    }

    return result;
  }

  async deleteSingleEvent(event: ITPEvent): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      eventsFound: 1,
      eventsCreated: 0,
      errors: [],
    };

    if (!(await this.authenticate())) {
      result.errors.push("Authentication failed");
      return result;
    }

    const eventId = this.generateEventId(event);
    const storedEvents = await this.getStoredEvents();
    const existingEvent = storedEvents.find((e) => e.itpEventId === eventId);

    if (!existingEvent) {
      result.errors.push("Event not found in calendar");
      return result;
    }

    try {
      const deleted = await this.deleteCalendarEvent(
        existingEvent.calendarEventId,
      );

      if (deleted) {
        await this.removeStoredEvent(eventId);
        result.success = true;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      result.errors.push(`Failed to delete "${event.title}": ${errorMessage}`);
    }

    return result;
  }

  async syncEvents(events: ITPEvent[]): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      eventsFound: events.length,
      eventsCreated: 0,
      errors: [],
    };

    if (!(await this.authenticate())) {
      result.errors.push("Authentication failed");
      return result;
    }

    const storedEvents = await this.getStoredEvents();
    const existingEventIds = new Set(storedEvents.map((e) => e.itpEventId));

    for (const event of events) {
      const eventId = this.generateEventId(event);

      if (existingEventIds.has(eventId)) {
        console.log(
          `Event "${event.title}" already exists in calendar, skipping.`,
        );
        continue;
      }

      try {
        const calendarEvent = this.convertToCalendarEvent(event);
        const calendarEventId = await this.createCalendarEvent(calendarEvent);

        if (calendarEventId) {
          await this.saveStoredEvent({
            itpEventId: eventId,
            calendarEventId,
            lastSynced: new Date().toISOString(),
          });
          result.eventsCreated++;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        result.errors.push(`Failed to sync "${event.title}": ${errorMessage}`);
      }
    }

    result.success = result.errors.length === 0;
    return result;
  }
}

const calendarSync = new CalendarSync();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SYNC_EVENTS") {
    calendarSync
      .syncEvents(message.events)
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({
          success: false,
          eventsFound: 0,
          eventsCreated: 0,
          errors: [error.message],
        }),
      );
    return true;
  }

  if (message.type === "CREATE_SINGLE_EVENT") {
    calendarSync
      .syncSingleEvent(message.event)
      .then((result) => {
        console.log("Single event sync result:", result);
        // Send result back to content script for inline notification
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: "SHOW_INLINE_NOTIFICATION",
              success: result.success,
              message: result.success
                ? `✅ Added "${message.event.title}" to your calendar!`
                : `❌ Failed to add event: ${result.errors[0] || "Unknown error"}`,
            });
          }
        });
        sendResponse(result);
      })
      .catch((error) => {
        console.error("Single event sync failed:", error);
        // Send error back to content script for inline notification
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: "SHOW_INLINE_NOTIFICATION",
              success: false,
              message: `❌ Failed to add event: ${error.message}`,
            });
          }
        });
        sendResponse({
          success: false,
          eventsFound: 1,
          eventsCreated: 0,
          errors: [error.message],
        });
      });
    return true;
  }

  if (message.type === "DELETE_SINGLE_EVENT") {
    calendarSync
      .deleteSingleEvent(message.event)
      .then((result) => {
        console.log("Single event delete result:", result);
        // Send result back to content script for inline notification
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: "SHOW_INLINE_NOTIFICATION",
              success: result.success,
              message: result.success
                ? `🗑️ Removed "${message.event.title}" from your calendar!`
                : `❌ Failed to remove event: ${result.errors[0] || "Unknown error"}`,
            });
          }
        });
        sendResponse(result);
      })
      .catch((error) => {
        console.error("Single event delete failed:", error);
        // Send error back to content script for inline notification
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: "SHOW_INLINE_NOTIFICATION",
              success: false,
              message: `❌ Failed to remove event: ${error.message}`,
            });
          }
        });
        sendResponse({
          success: false,
          eventsFound: 1,
          eventsCreated: 0,
          errors: [error.message],
        });
      });
    return true;
  }

  if (message.type === "GET_SYNC_STATUS") {
    calendarSync
      .getStoredEvents()
      .then((events) => sendResponse({ syncedEventsCount: events.length }))
      .catch(() => sendResponse({ syncedEventsCount: 0 }));
    return true;
  }
});
