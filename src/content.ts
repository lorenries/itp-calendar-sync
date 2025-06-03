import { ITPEvent } from './types';

function extractEvents(): ITPEvent[] {
  const events: ITPEvent[] = [];
  
  // Use a more compatible selector approach
  const allSessions = document.querySelectorAll('.sessionListItem');
  const rsvpedSessions = Array.from(allSessions).filter(session => 
    session.querySelector('.sessionRSVPed') !== null
  );
  
  rsvpedSessions.forEach((session) => {
    try {
      const date = session.getAttribute('data-date') || '';
      
      const titleElement = session.querySelector('.sessionLeftColumn h3 a');
      const title = titleElement?.textContent?.trim() || '';
      const url = titleElement?.getAttribute('href') || '';
      
      const sessionInfoElement = session.querySelector('.sessionInfo');
      const sessionInfoText = sessionInfoElement?.textContent || '';
      
      const timeMatch = sessionInfoText.match(/(\d{1,2}(?::\d{2})?(?:am|pm)?-\d{1,2}(?::\d{2})?(?:am|pm)?)/i);
      const time = timeMatch ? timeMatch[1] : '';
      
      const leadersMatch = sessionInfoText.match(/Leaders:\s*(.+?)(?:\n|$)/);
      const leaders = leadersMatch ? leadersMatch[1].trim() : '';
      
      const tagElements = session.querySelectorAll('.sessionTags a');
      const tags = Array.from(tagElements).map(tag => tag.textContent?.trim() || '');
      
      if (title && date && time) {
        events.push({
          title,
          date,
          time,
          leaders,
          tags,
          url: url.startsWith('http') ? url : `https://itp.nyu.edu/camp/2025/${url}`
        });
      }
    } catch (error) {
      console.error('Error extracting event:', error);
    }
  });
  
  return events;
}

function sendEventsToBackground(events: ITPEvent[]) {
  chrome.runtime.sendMessage({
    type: 'EVENTS_EXTRACTED',
    events: events
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);
  if (message.type === 'EXTRACT_EVENTS') {
    const events = extractEvents();
    console.log('Extracted events:', events);
    sendResponse({ events });
    return true;
  }
});

// Add some debugging info
console.log('ITP Camp Calendar Sync content script loaded');
console.log('Current URL:', window.location.href);
console.log('Session elements found:', document.querySelectorAll('.sessionListItem').length);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      const events = extractEvents();
      if (events.length > 0) {
        sendEventsToBackground(events);
      }
    }, 1000);
  });
} else {
  setTimeout(() => {
    const events = extractEvents();
    if (events.length > 0) {
      sendEventsToBackground(events);
    }
  }, 1000);
}