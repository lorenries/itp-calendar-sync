import { ITPEvent } from "./types";

function extractSessionData(): ITPEvent | null {
  try {
    // Extract session title from h1
    const titleElement = document.querySelector("h1");
    const title = titleElement?.textContent?.trim() || "";

    // Extract date and time from session info
    const dateTimeElement = document.querySelector(".sessionDateTime");
    const dateTimeText = dateTimeElement?.textContent || "";

    // Parse "Date: June 11, 2025 12:30-1:30pm"
    const dateTimeMatch = dateTimeText.match(
      /Date:\s*([^,]+),\s*(\d{4})\s+(.+)/,
    );
    if (!dateTimeMatch) {
      console.error("Could not parse date/time:", dateTimeText);
      return null;
    }

    const [, monthDay, year, time] = dateTimeMatch;

    // Convert "June 11" to ISO date format
    const dateObj = new Date(`${monthDay}, ${year}`);
    const date = dateObj.toISOString().split("T")[0]; // YYYY-MM-DD format

    // Extract session leaders
    const leadersElement = document.querySelector(
      ".sessionLeaders #sessionLeaders",
    );
    const leaders = leadersElement?.textContent?.trim() || "";

    // Extract tags
    const tagElements = document.querySelectorAll(".sessionTags a");
    const tags = Array.from(tagElements).map(
      (tag) => tag.textContent?.trim() || "",
    );

    // Get current URL for reference
    const url = window.location.href;

    if (title && date && time) {
      return {
        title,
        date,
        time: time.trim(),
        leaders,
        tags,
        url,
      };
    }

    return null;
  } catch (error) {
    console.error("Error extracting session data:", error);
    return null;
  }
}

let isProcessingRSVP = false;

function addRSVPClickListeners() {
  // Monitor for RSVP button clicks
  const rsvpButtons = document.querySelectorAll(
    ".addRSVP:not([data-calendar-listener])",
  );

  rsvpButtons.forEach((button) => {
    // Mark button as having listener to prevent duplicates
    button.setAttribute("data-calendar-listener", "true");

    button.addEventListener("click", async () => {
      if (isProcessingRSVP) {
        console.log("RSVP already being processed, ignoring duplicate click");
        return;
      }

      isProcessingRSVP = true;
      console.log("RSVP button clicked, waiting for AJAX to complete...");

      // Wait for AJAX request to complete and page to update
      setTimeout(async () => {
        try {
          // Check if RSVP was successful by looking for cancel button
          const cancelButton = document.querySelector(
            '.cancelRSVP:not([style*="display: none"])',
          );

          if (cancelButton) {
            console.log("RSVP successful, creating calendar event...");
            const sessionData = extractSessionData();

            if (sessionData) {
              // Send to background script for calendar creation
              chrome.runtime.sendMessage({
                type: "CREATE_SINGLE_EVENT",
                event: sessionData,
              });
            }
          }
        } finally {
          // Reset processing flag after a delay
          setTimeout(() => {
            isProcessingRSVP = false;
          }, 1000);
        }
      }, 2000); // Wait 2 seconds for AJAX to complete
    });
  });
}

let isProcessingCancel = false;

function addCancelRSVPClickListeners() {
  // Monitor for cancel RSVP button clicks
  const cancelButtons = document.querySelectorAll(
    ".cancelRSVP:not([data-calendar-listener])",
  );

  cancelButtons.forEach((button) => {
    // Mark button as having listener to prevent duplicates
    button.setAttribute("data-calendar-listener", "true");

    button.addEventListener("click", async () => {
      if (isProcessingCancel) {
        console.log(
          "Cancel RSVP already being processed, ignoring duplicate click",
        );
        return;
      }

      isProcessingCancel = true;
      console.log(
        "Cancel RSVP button clicked, waiting for AJAX to complete...",
      );

      // Wait for AJAX request to complete and page to update
      setTimeout(async () => {
        try {
          // Check if cancellation was successful by looking for RSVP buttons
          const rsvpButton = document.querySelector(
            '.addRSVP:not([style*="display: none"])',
          );

          if (rsvpButton) {
            console.log(
              "RSVP cancellation successful, removing calendar event...",
            );
            const sessionData = extractSessionData();

            if (sessionData) {
              // Send to background script for calendar event deletion
              chrome.runtime.sendMessage({
                type: "DELETE_SINGLE_EVENT",
                event: sessionData,
              });
            }
          }
        } finally {
          // Reset processing flag after a delay
          setTimeout(() => {
            isProcessingCancel = false;
          }, 1000);
        }
      }, 2000); // Wait 2 seconds for AJAX to complete
    });
  });
}

function initializeEventListeners() {
  addRSVPClickListeners();
  addCancelRSVPClickListeners();
}

// Initialize when page loads
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(initializeEventListeners, 1000);
  });
} else {
  setTimeout(initializeEventListeners, 1000);
}

// Re-initialize if page content changes (for dynamic updates)
const observer = new MutationObserver(() => {
  initializeEventListeners();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

function showInlineNotification(message: string, isSuccess: boolean) {
  // Remove any existing notifications
  const existingNotification = document.getElementById(
    "itp-calendar-notification",
  );
  if (existingNotification) {
    existingNotification.remove();
  }

  // Create notification element
  const notification = document.createElement("div");
  notification.id = "itp-calendar-notification";
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: white;
    color: black;
    border: 2px solid black;
    padding: 15px;
    z-index: 10000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    font-weight: 500;
    max-width: 350px;
    word-wrap: break-word;
    display: flex;
    align-items: center;
    gap: 12px;
  `;

  // Create Nyan Cat icon
  const nyanIcon = document.createElement("img");
  nyanIcon.src = chrome.runtime.getURL("images/icon_nyan.png");
  nyanIcon.style.cssText = `
    height: 18px;
    width: auto;
    flex-shrink: 0;
  `;

  // Create message text
  const messageText = document.createElement("span");
  messageText.textContent = message;

  // Add elements to notification
  notification.appendChild(nyanIcon);
  notification.appendChild(messageText);

  // Add to page
  document.body.appendChild(notification);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    notification.remove();
  }, 5000);

  // Add click to dismiss
  notification.addEventListener("click", () => {
    notification.remove();
  });
}

// Listen for inline notification messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SHOW_INLINE_NOTIFICATION") {
    showInlineNotification(message.message, message.success);
    sendResponse({ received: true });
  }
});

console.log("ITP Camp session content script loaded");
console.log("Current session URL:", window.location.href);
